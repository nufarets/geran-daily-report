import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value;
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
    retries: 0,
    timeoutMs: 8_000,
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
  return { messages, unavailable };
}

async function writeReport(reportsDirectory, reportDate, markdown) {
  await mkdir(reportsDirectory, { recursive: true });
  const datedPath = path.join(reportsDirectory, `${reportDate}.md`);
  const latestPath = path.join(reportsDirectory, "latest.md");
  await writeFile(datedPath, markdown, "utf8");

  const reportDates = (await readdir(reportsDirectory))
    .map((name) => /^(\d{4}-\d{2}-\d{2})\.md$/u.exec(name)?.[1])
    .filter(Boolean)
    .sort();
  const latestReportDate = reportDates.at(-1) ?? reportDate;
  const latestMarkdown = latestReportDate === reportDate
    ? markdown
    : await readFile(path.join(reportsDirectory, `${latestReportDate}.md`), "utf8");
  await writeFile(latestPath, latestMarkdown, "utf8");
  return { datedPath, latestPath, latestUpdated: latestReportDate === reportDate };
}

export async function generateDailyReport({
  reportDate = process.env.REPORT_DATE || zonedDateParts(),
  force = process.env.FORCE_UPDATE === "1",
  now,
  fetchHistory = fetchTelegramHistory,
  reportsDirectory = REPORTS_DIRECTORY,
} = {}) {
  if (!isValidIsoDate(reportDate)) {
    throw new TypeError("reportDate must be a real date in YYYY-MM-DD format");
  }
  const runtimeNow = now instanceof Date ? now : new Date();
  if (!Number.isFinite(runtimeNow.getTime())) throw new TypeError("now must be a valid Date");
  const runtimeReportDate = zonedDateParts(runtimeNow);
  if (reportDate > runtimeReportDate) {
    throw new RangeError("reportDate must not be in the future in Europe/Moscow");
  }

  const previousDate = shiftIsoDate(reportDate, -1);
  const datedPath = path.join(reportsDirectory, `${reportDate}.md`);
  if (!force && await exists(datedPath)) {
    return { status: "already-published", reportDate, markdown: await readFile(datedPath, "utf8") };
  }

  const searchFrom = moscowInstant(previousDate, 12, 20);
  const cycleEnd = moscowInstant(reportDate, 12, 20);
  const sourceSearchTo = reportDate < runtimeReportDate
    ? moscowInstant(shiftIsoDate(reportDate, 1), 12, 20)
    : runtimeNow;
  const cycleSearchTo = new Date(Math.min(sourceSearchTo.getTime(), cycleEnd.getTime()));

  const [chronicleMessages, officialMessages] = await Promise.all([
    fetchSource(fetchHistory, CHANNELS.chronology, searchFrom, sourceSearchTo),
    fetchSource(fetchHistory, CHANNELS.official, searchFrom, sourceSearchTo),
  ]);

  const firstDetection = findFirstStrikeUavMessage(officialMessages, {
    windowStart: searchFrom,
    windowEnd: cycleSearchTo,
  });
  const chronicle = findAndMergeChronicle(chronicleMessages, {
    startDate: previousDate,
    endDate: reportDate,
    now: runtimeNow,
    continuationGraceMs: 5 * 60 * 1000,
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
    const fallback = await fetchFallbackLaunchMessages(fetchHistory, searchFrom, cycleSearchTo);
    const evidence = parseLaunchEvidence(messagesWithin(fallback.messages, searchFrom, cycleSearchTo));
    if (fallback.unavailable.length > 0) {
      console.log("Резервные источники пусков доступны не полностью; публикация отложена.");
      return { status: "waiting-for-launch-sources", reportDate };
    }
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
    .then((result) => {
      console.log(`Статус: ${result.status}`);
      if (process.env.REQUIRE_PUBLICATION === "1" && result.status.startsWith("waiting-")) {
        throw new Error(`Отчёт не опубликован: ${result.status}`);
      }
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
