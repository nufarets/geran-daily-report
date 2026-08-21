import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchTelegramHistory } from "./telegram.mjs";
import {
  findAndMergeChronicle,
  findFirstStrikeUavMessage,
  parseGeranChronology,
  parseLaunchPlaces,
  parseOfficialPpo,
  renderMarkdownReport,
} from "./domain.mjs";

const REPORT_TIME_ZONE = "Europe/Moscow";
const REPORTS_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "reports");

const CHANNELS = Object.freeze({
  chronology: "geranium_chronicles",
  official: "kpszsu",
  launchFallbacks: ["ua_ppo_monitor", "Ukrainian_Intelligence", "StrategicaviationT"],
});

function zonedDateParts(date = new Date(), timeZone = REPORT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function moscowInstant(isoDate, hour, minute) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function messagesWithin(messages, from, to) {
  const start = from.getTime();
  const end = to.getTime();
  return messages.filter((message) => {
    const value = Date.parse(message.datetime);
    return Number.isFinite(value) && value >= start && value <= end;
  });
}

function messageSourceUrl(message) {
  if (typeof message?.sourceUrl === "string" && message.sourceUrl.trim()) {
    return message.sourceUrl.trim();
  }
  return message?.channel && message?.messageId
    ? `https://t.me/${message.channel}/${message.messageId}`
    : null;
}

function parseLaunchEvidence(messages) {
  const sorted = [...messages].sort((left, right) => {
    const timeDifference = Date.parse(left.datetime) - Date.parse(right.datetime);
    if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
    return Number(left.messageId ?? 0) - Number(right.messageId ?? 0);
  });
  let places = [];
  const sourceUrls = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const nextPlaces = parseLaunchPlaces(sorted.slice(0, index + 1));
    const previousPlaces = new Set(places);
    if (nextPlaces.some((place) => !previousPlaces.has(place))) {
      const sourceUrl = messageSourceUrl(sorted[index]);
      if (sourceUrl) sourceUrls.push(sourceUrl);
    }
    places = nextPlaces;
  }
  return { places, sourceUrls: [...new Set(sourceUrls)] };
}

async function fetchSource(fetchHistory, handle, from, to) {
  return fetchHistory(handle, {
    from,
    to,
    maxPages: 48,
  });
}

async function fetchFallbackLaunchMessages(fetchHistory, from, to) {
  const results = await Promise.allSettled(
    CHANNELS.launchFallbacks.map((handle) => fetchSource(fetchHistory, handle, from, to)),
  );
  const messages = [];
  const unavailable = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === "fulfilled") messages.push(...result.value);
    else unavailable.push(CHANNELS.launchFallbacks[index]);
  }
  if (unavailable.length) {
    console.warn(`Недоступны резервные источники: ${unavailable.join(", ")}`);
  }
  return messages;
}

async function writeReport(reportsDirectory, reportDate, markdown) {
  await mkdir(reportsDirectory, { recursive: true });
  const datedPath = path.join(reportsDirectory, `${reportDate}.md`);
  const latestPath = path.join(reportsDirectory, "latest.md");
  await writeFile(datedPath, markdown, "utf8");
  await writeFile(latestPath, markdown, "utf8");
  return { datedPath, latestPath };
}

export async function generateDailyReport({
  reportDate = process.env.REPORT_DATE || zonedDateParts(),
  force = process.env.FORCE_UPDATE === "1",
  now,
  fetchHistory = fetchTelegramHistory,
  reportsDirectory = REPORTS_DIRECTORY,
} = {}) {
  const previousDate = shiftIsoDate(reportDate, -1);
  const datedPath = path.join(reportsDirectory, `${reportDate}.md`);
  if (!force && await exists(datedPath)) {
    return { status: "already-published", reportDate, markdown: await readFile(datedPath, "utf8") };
  }

  const searchFrom = moscowInstant(previousDate, 12, 20);
  const searchTo = now instanceof Date
    ? now
    : process.env.REPORT_DATE
      ? moscowInstant(reportDate, 12, 30)
      : new Date();

  const [chronicleMessages, officialMessages] = await Promise.all([
    fetchSource(fetchHistory, CHANNELS.chronology, searchFrom, searchTo),
    fetchSource(fetchHistory, CHANNELS.official, searchFrom, searchTo),
  ]);

  const firstDetection = findFirstStrikeUavMessage(officialMessages, {
    windowStart: searchFrom,
    windowEnd: searchTo,
  });
  const chronicle = findAndMergeChronicle(chronicleMessages, {
    startDate: previousDate,
    endDate: reportDate,
  });

  if (!chronicle) {
    console.log(`Итоговая хроника ${previousDate}–${reportDate} ещё не опубликована.`);
    return { status: "waiting-for-chronicle", reportDate };
  }

  const chronology = parseGeranChronology(chronicle.text, {
    startDate: previousDate,
    endDate: reportDate,
    startTime: firstDetection?.timeLabel || "12:20",
  });
  const officialPpo = parseOfficialPpo(officialMessages, { reportDate });

  let launchPlaces = officialPpo?.launchPlaces || [];
  let launchSource = "official";
  let launchSourceUrls = [];
  if (!launchPlaces.length) {
    const launchCutoff = moscowInstant(reportDate, 7, 30);
    const fallbackMessages = await fetchFallbackLaunchMessages(fetchHistory, searchFrom, searchTo);
    const evidence = parseLaunchEvidence(messagesWithin(fallbackMessages, searchFrom, launchCutoff));
    launchPlaces = evidence.places;
    launchSourceUrls = evidence.sourceUrls;
    launchSource = "monitoring";
  }

  const model = {
    startDate: previousDate,
    endDate: reportDate,
    firstDetection,
    chronology,
    ppo: officialPpo,
    launchPlaces,
    launchSource,
    sourceUrls: [
      ...(chronicle.sourceUrls || []),
      ...(firstDetection?.sourceUrl ? [firstDetection.sourceUrl] : []),
      ...(officialPpo?.sourceUrls || (officialPpo?.sourceUrl ? [officialPpo.sourceUrl] : [])),
      ...launchSourceUrls,
    ],
  };
  const markdown = renderMarkdownReport(model);
  const paths = await writeReport(reportsDirectory, reportDate, markdown);
  return { status: "published", reportDate, markdown, paths, model };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateDailyReport()
    .then((result) => console.log(`Статус: ${result.status}`))
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
