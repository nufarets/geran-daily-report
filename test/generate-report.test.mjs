import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { generateDailyReport } from "../src/generate-report.mjs";

const REPORT_DATE = "2026-08-18";
const RUN_AT = new Date("2026-08-18T05:10:00.000Z");

const chroniclePartOne = `
Хроника ударов по территории Украины 17 августа 2026 – 18 августа 2026 года.
Хронология
17 августа 2026 года.
• 10:00 Чернигов – взрыв. Герань-4.
• 14:30 Николаев – взрыв. Герань-4.
• 15:40 Кривой Рог – взрыв. Герань-4.
• 17:45-17:50 Одесса – взрывы. Реактивные Герани.
• 19:01 Мена Черниговской области – взрыв. Герань-4.
• 20:15 Запорожская область – взрывы. Герани.
18 августа 2026 года.
• 00:30 Черное море – взрыв. Герань.
`;

const chroniclePartTwo = `
• 01:20 Бровары Киевской области – взрыв. Герань-4.
• 03:20-03:40 Киев – взрывы. Реактивные Герани.
• 06:37 Бровары Киевской области – взрыв. Герань-4.
`;

function message(channel, messageId, datetime, text) {
  return {
    id: `${channel}/${messageId}`,
    channel,
    messageId,
    datetime,
    text,
    sourceUrl: `https://t.me/${channel}/${messageId}`,
  };
}

function chronologyMessages() {
  return [
    message("geranium_chronicles", 80122, "2026-08-18T05:02:00.000Z", chroniclePartOne),
    message("geranium_chronicles", 80123, "2026-08-18T05:03:00.000Z", chroniclePartTwo),
  ];
}

function firstDetectionMessage() {
  return message(
    "kpszsu",
    73220,
    "2026-08-17T09:46:00.000Z",
    "🛵 Група ударних БпЛА на Запоріжжі",
  );
}

function officialPpoMessage() {
  return message(
    "kpszsu",
    73277,
    "2026-08-18T05:00:00.000Z",
    "У ніч на 18 серпня противник атакував 147 ударними БпЛА типу Shahed із напрямків: Халіно, Міллерово, Чауда, Гвардійське, Приморсько-Ахтарськ. За попередніми даними збито/подавлено 111 ворожих БпЛА. Атака ворожих БпЛА триває.",
  );
}

function injectedFetch(fixtures, calls = []) {
  const fetchHistory = async (handle, options) => {
    calls.push({ handle, options });
    return fixtures[handle] ?? [];
  };
  return { fetchHistory, calls };
}

async function temporaryReportsDirectory(testContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "geran-report-test-"));
  testContext.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("rebuilds September 22 from archived sources with UAV-only totals and the correct day boundary", async (t) => {
  const messages = JSON.parse(await readFile(new URL("./fixtures/2026-09-22.json", import.meta.url), "utf8"));
  const reportsDirectory = await temporaryReportsDirectory(t);
  const result = await generateDailyReport({
    reportDate: "2026-09-22",
    now: new Date("2026-09-22T05:10:00Z"),
    reportsDirectory,
    fetchHistory: async (channel) => messages.filter((message) => message.channel === channel),
  });

  assert.equal(result.status, "published");
  assert.equal(result.model.ppo.launched, 212);
  assert.equal(result.model.ppo.neutralized, 177);
  assert.equal(result.model.firstDetection.timeLabel, "12:20");
  assert.deepEqual(result.model.chronology.events[0].times, ["12:30"]);
  for (const event of result.model.chronology.events) {
    assert.equal(event.date, event.timeLabel < "12:20" ? "2026-09-22" : "2026-09-21");
  }
  assert.match(result.markdown, /18:33/u);
  assert.match(result.markdown, /20:50-20:55/u);
  assert.match(result.markdown, /07:10/u);
  assert.match(result.markdown, /07:31/u);
  assert.equal(result.model.chronology.events.length, 49);
  assert.equal(result.model.sourceUrls.filter(url => url.includes("geranium_chronicles")).length, 4);
  assert.doesNotMatch(result.markdown, /07:35|08:00|08:30|08:57|10:38|12:05/u);
  assert.match(result.markdown, /Сбито\/локационно потеряно 177/u);
  assert.equal(await readFile(path.join(reportsDirectory, "latest.md"), "utf8"), result.markdown);
});

test("rejects invalid or future report dates before touching sources or paths", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  let fetchCalls = 0;
  const fetchHistory = async () => {
    fetchCalls += 1;
    return [];
  };

  await assert.rejects(generateDailyReport({
    reportDate: "../outside",
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  }), /YYYY-MM-DD/u);
  await assert.rejects(generateDailyReport({
    reportDate: "2026-08-19",
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  }), /future/u);
  assert.equal(fetchCalls, 0);
});

test("rebuilds September 23 with both chronicle parts, correct dates, and unchanged PPO counts", async (t) => {
  const messages = JSON.parse(await readFile(new URL("./fixtures/2026-09-23.json", import.meta.url), "utf8"));
  const reportsDirectory = await temporaryReportsDirectory(t);
  const result = await generateDailyReport({
    reportDate: "2026-09-23", now: new Date("2026-09-23T05:10:00Z"), reportsDirectory,
    fetchHistory: async channel => messages.filter(message => message.channel === channel),
  });
  assert.equal(result.status, "published");
  assert.equal(result.model.firstDetection.timeLabel, "12:54");
  assert.equal(result.model.ppo.launched, 161);
  assert.equal(result.model.ppo.neutralized, 119);
  assert.deepEqual(result.model.sourceUrls.filter(url => url.includes("geranium_chronicles")), [
    "https://t.me/geranium_chronicles/86246", "https://t.me/geranium_chronicles/86249",
    "https://t.me/geranium_chronicles/86250", "https://t.me/geranium_chronicles/86251",
  ]);
  assert.equal(result.model.chronology.events[0].timeLabel, "13:10-13:15");
  for (const event of result.model.chronology.events) {
    assert.equal(event.date, event.timeLabel < "12:54" ? "2026-09-23" : "2026-09-22");
  }
  assert.doesNotMatch(result.markdown, /07:31|07:35|07:42|12:15|12:40/u);
  assert.match(result.markdown, /00:05/u);
  assert.match(result.markdown, /01:22-01:50/u);
  assert.match(result.markdown, /06:47/u);
  assert.match(result.markdown, /07:05/u);
  assert.equal(await readFile(path.join(reportsDirectory, "latest.md"), "utf8"), result.markdown);
});

test("publishes an incorrectly dated daytime chronicle, including historical reruns", async (t) => {
  const messages = JSON.parse(await readFile(new URL("./fixtures/2026-09-23.json", import.meta.url), "utf8"));
  const partial = messages.filter(message => message.channel !== "geranium_chronicles" || message.messageId === 86246);
  for (const now of ["2026-09-23T05:10:00Z", "2026-09-24T05:10:00Z"]) {
    const reportsDirectory = await temporaryReportsDirectory(t);
    const result = await generateDailyReport({
      reportDate: "2026-09-23", now: new Date(now), reportsDirectory,
      fetchHistory: async channel => partial.filter(message => message.channel === channel),
    });
    assert.equal(result.status, "published");
    assert.equal(result.model.chronology.events[0].timeLabel, "13:10-13:15");
    assert.ok(result.model.chronology.events.every(event => event.date === "2026-09-22"));
    assert.ok(result.model.chronology.uncertainEvents.some(event => event.timeLabel === "07:35"));
    assert.equal(result.model.ppo.launched, 161);
    assert.equal(result.model.ppo.neutralized, 119);
    assert.match(result.markdown, /События с неуточнённой датой/u);
    assert.equal(await readFile(path.join(reportsDirectory, "2026-09-23.md"), "utf8"), result.markdown);
    assert.equal(await readFile(path.join(reportsDirectory, "latest.md"), "utf8"), result.markdown);
  }
});

test("publishes PPO and all uncertain chronology entries even when no event date can be resolved", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const { fetchHistory } = injectedFetch({
    geranium_chronicles: [message("geranium_chronicles", 80122, "2026-08-18T05:00:00Z",
      "Хроника ударов 17 августа 2026 – 18 августа 2026 года.\n18 августа 2026 года.\n09:00 Киев – взрыв. Герань.")],
    kpszsu: [firstDetectionMessage(), officialPpoMessage()],
  });
  const result = await generateDailyReport({ reportDate: REPORT_DATE, now: RUN_AT, fetchHistory, reportsDirectory });
  assert.equal(result.status, "published");
  assert.equal(result.model.chronology.events.length, 0);
  assert.equal(result.model.chronology.uncertainEvents.length, 1);
  assert.match(result.markdown, /09:00 - Киев/u);
  assert.match(result.markdown, /Запущено 147 БПЛА/u);
  assert.match(result.markdown, /Сбито\/локационно потеряно 111/u);
  assert.match(result.markdown, /https:\/\/t\.me\/geranium_chronicles\/80122/u);
  assert.equal(await readFile(path.join(reportsDirectory, "latest.md"), "utf8"), result.markdown);
});

test("publishes a chronicle with late additions and multiple midnight rollovers", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const { fetchHistory } = injectedFetch({
    geranium_chronicles: [message("geranium_chronicles", 80122, "2026-08-18T05:00:00Z",
      `Хроника ударов 17 августа 2026 – 18 августа 2026 года.
17 августа 2026 года.
23:50 Киев – взрыв. Герань.
18 августа 2026 года.
00:05 Киев – взрыв. Герань.
17 августа 2026 года.
23:55 Киев – взрыв. Герань.
18 августа 2026 года.
00:15 Киев – взрыв. Герань.`)],
    kpszsu: [firstDetectionMessage(), officialPpoMessage()],
  });
  const result = await generateDailyReport({ reportDate: REPORT_DATE, now: RUN_AT, fetchHistory, reportsDirectory });
  assert.equal(result.status, "published");
  assert.deepEqual(result.model.chronology.events.map(event => [event.date, event.timeLabel]), [
    ["2026-08-17", "23:50"], ["2026-08-17", "23:55"],
    ["2026-08-18", "00:05"], ["2026-08-18", "00:15"],
  ]);
  assert.equal(await readFile(path.join(reportsDirectory, `${REPORT_DATE}.md`), "utf8"), result.markdown);
});

test("rebuilds September 24 with the early reactive-UAV alert and normalized cities", async (t) => {
  const messages = JSON.parse(await readFile(new URL("./fixtures/2026-09-24.json", import.meta.url), "utf8"));
  const reportsDirectory = await temporaryReportsDirectory(t);
  const result = await generateDailyReport({
    reportDate: "2026-09-24", now: new Date("2026-09-24T05:10:00Z"), reportsDirectory,
    fetchHistory: async channel => messages.filter(message => message.channel === channel),
  });
  assert.equal(result.status, "published");
  assert.equal(result.model.firstDetection.messageId, 79679);
  assert.equal(result.model.firstDetection.timeLabel, "13:05");
  assert.equal(result.model.ppo.launched, 282);
  assert.equal(result.model.ppo.neutralized, 219);
  // Preserve the source interval that overlaps the cutoff, and all later events.
  assert.equal(result.model.chronology.events[0].timeLabel, "11:50-14:00");
  assert.match(result.markdown, /14:07 - Гончаровское/u);
  assert.match(result.markdown, /14:07 - Благовещенское/u);
  assert.match(result.markdown, /14:15 - Бровары/u);
  assert.match(result.markdown, /15:15 - Ворзель/u);
  assert.match(result.markdown, /00:45 - Черновцы/u);
  assert.match(result.markdown, /04:20 - Буча/u);
  assert.match(result.markdown, /06:05 - Шепетовка/u);
  assert.match(result.markdown, /07:05 - Вознесенск/u);
  assert.doesNotMatch(result.markdown, /Неопределённая область|Черновцов|Шепетовки|Вознесенска/u);
  assert.equal(result.model.chronology.events.length, 30);
});

test("historical backfill finds a late chronicle but caps launch evidence at the next 12:20 boundary", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const lateChronicle = [message(
    "geranium_chronicles",
    80122,
    "2026-08-19T09:18:00.000Z",
    chroniclePartOne + "\n" + chroniclePartTwo,
  )];
  const fixtures = {
    geranium_chronicles: lateChronicle,
    kpszsu: [firstDetectionMessage()],
    ua_ppo_monitor: [
      message(
        "ua_ppo_monitor",
        901,
        "2026-08-18T09:15:00.000Z",
        "Подтверждены пуски Гераней из Халино.",
      ),
      message(
        "ua_ppo_monitor",
        902,
        "2026-08-18T09:25:00.000Z",
        "Подтверждены пуски Гераней из Миллерово.",
      ),
    ],
    Ukrainian_Intelligence: [],
    StrategicaviationT: [],
  };
  const { fetchHistory, calls } = injectedFetch(fixtures);

  const result = await generateDailyReport({
    reportDate: REPORT_DATE,
    now: new Date("2026-08-21T08:00:00.000Z"),
    fetchHistory,
    reportsDirectory,
  });

  assert.equal(result.status, "published");
  assert.deepEqual(result.model.launchPlaces, ["Курск"]);
  const callsByHandle = Object.fromEntries(calls.map((call) => [call.handle, call]));
  assert.equal(
    callsByHandle.geranium_chronicles.options.to.toISOString(),
    "2026-08-19T09:20:00.000Z",
  );
  assert.equal(callsByHandle.kpszsu.options.to.toISOString(), "2026-08-19T09:20:00.000Z");
  for (const handle of ["ua_ppo_monitor", "Ukrainian_Intelligence", "StrategicaviationT"]) {
    assert.equal(callsByHandle[handle].options.to.toISOString(), "2026-08-18T09:20:00.000Z");
  }
});

test("publishes the 17–18 report to dated/latest files and makes a repeated run idempotent", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const fixtures = {
    geranium_chronicles: chronologyMessages(),
    kpszsu: [firstDetectionMessage(), officialPpoMessage()],
  };
  const { fetchHistory, calls } = injectedFetch(fixtures);

  const result = await generateDailyReport({
    reportDate: REPORT_DATE,
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  });

  assert.equal(result.status, "published");
  assert.equal(result.reportDate, REPORT_DATE);
  assert.equal(result.paths.datedPath, path.join(reportsDirectory, "2026-08-18.md"));
  assert.equal(result.paths.latestPath, path.join(reportsDirectory, "latest.md"));
  assert.equal(await readFile(result.paths.datedPath, "utf8"), result.markdown);
  assert.equal(await readFile(result.paths.latestPath, "utf8"), result.markdown);
  assert.deepEqual(calls.map((call) => call.handle), ["geranium_chronicles", "kpszsu"]);
  for (const { options } of calls) {
    assert.equal(options.from.toISOString(), "2026-08-17T09:20:00.000Z");
    assert.equal(options.to.toISOString(), RUN_AT.toISOString());
    assert.equal(options.maxPages, 48);
    assert.equal(options.retries, 0);
    assert.equal(options.timeoutMs, 8_000);
  }

  assert.match(result.markdown, /^17\.08\.2026-18\.08\.2026\n/u);
  assert.doesNotMatch(result.markdown, /Первые группы БПЛА обнаружены/u);
  assert.match(result.markdown, /Николаевская область {2}\n14:30 - Николаев {2}\n/u);
  assert.match(result.markdown, /Запорожская область {2}\n20:15 - взрыв в области {2}\n/u);
  assert.match(result.markdown, /Запущено 147 БПЛА/u);
  assert.match(result.markdown, /Сбито\/локационно потеряно 111/u);
  assert.match(
    result.markdown,
    /Точки пусков по версии поветряных: Курск, Ростов, Чауда, Гвардейское, Приморско-Ахтарск/u,
  );
  assert.doesNotMatch(result.markdown, /На данный момент налет продолжается/u);
  assert.match(result.markdown, /Источники:/u);

  const callCountAfterPublish = calls.length;
  const repeated = await generateDailyReport({
    reportDate: REPORT_DATE,
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  });

  assert.equal(repeated.status, "already-published");
  assert.equal(repeated.markdown, result.markdown);
  assert.equal(calls.length, callCountAfterPublish, "already-published must not fetch Telegram again");
});

test("uses confirmed monitoring launch places when the official PVO summary is absent", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const fixtures = {
    geranium_chronicles: chronologyMessages(),
    kpszsu: [firstDetectionMessage()],
    ua_ppo_monitor: [
      message(
        "ua_ppo_monitor",
        501,
        "2026-08-17T20:30:00.000Z",
        "Зафиксированы пуски Гераней из районов Халино и Приморско-Ахтарска.",
      ),
    ],
    Ukrainian_Intelligence: [
      message(
        "Ukrainian_Intelligence",
        601,
        "2026-08-17T21:00:00.000Z",
        "Возможны пуски ракет и БПЛА из Цимбулово.",
      ),
      message(
        "Ukrainian_Intelligence",
        602,
        "2026-08-18T05:05:00.000Z",
        "Подтверждены пуски ударных БПЛА из Миллерово.",
      ),
    ],
    StrategicaviationT: [
      message(
        "StrategicaviationT",
        701,
        "2026-08-18T00:30:00.000Z",
        "Пуски ударных БПЛА: Навля, Шаталово, Кача и Чауда.",
      ),
    ],
  };
  const { fetchHistory, calls } = injectedFetch(fixtures);

  const result = await generateDailyReport({
    reportDate: REPORT_DATE,
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  });

  assert.equal(result.status, "published");
  assert.equal(result.model.ppo, null);
  assert.equal(result.model.launchSource, "monitoring");
  assert.deepEqual(result.model.launchPlaces, [
    "Курск",
    "Приморско-Ахтарск",
    "Брянск",
    "Смоленск",
    "Крым",
    "Чауда",
    "Ростов",
  ]);
  assert.deepEqual(new Set(calls.map((call) => call.handle)), new Set([
    "geranium_chronicles",
    "kpszsu",
    "ua_ppo_monitor",
    "Ukrainian_Intelligence",
    "StrategicaviationT",
  ]));
  assert.doesNotMatch(result.markdown, /Запущено \d+ БПЛА/u);
  assert.doesNotMatch(result.markdown, /Сбито\/локационно потеряно \d+/u);
  assert.match(
    result.markdown,
    /Точки пусков по данным мониторинговых каналов: Курск, Приморско-Ахтарск, Брянск, Смоленск, Крым, Чауда/u,
  );
  assert.doesNotMatch(result.markdown, /Орел/u, "a possible launch must not be included");
  assert.match(result.markdown, /https:\/\/t\.me\/ua_ppo_monitor\/501/u);
  assert.match(result.markdown, /https:\/\/t\.me\/StrategicaviationT\/701/u);
  assert.match(result.markdown, /https:\/\/t\.me\/Ukrainian_Intelligence\/602/u);
  assert.doesNotMatch(result.markdown, /https:\/\/t\.me\/Ukrainian_Intelligence\/601/u);
  assert.equal(await readFile(path.join(reportsDirectory, "2026-08-18.md"), "utf8"), result.markdown);
  assert.equal(await readFile(path.join(reportsDirectory, "latest.md"), "utf8"), result.markdown);
});

test("a historical backfill never replaces latest.md with an older report", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const newerMarkdown = "20.08.2026-21.08.2026\n\nБолее новый отчёт\n";
  await writeFile(path.join(reportsDirectory, "2026-08-21.md"), newerMarkdown, "utf8");
  await writeFile(path.join(reportsDirectory, "latest.md"), newerMarkdown, "utf8");
  const { fetchHistory } = injectedFetch({
    geranium_chronicles: chronologyMessages(),
    kpszsu: [firstDetectionMessage(), officialPpoMessage()],
  });

  const result = await generateDailyReport({
    reportDate: REPORT_DATE,
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  });

  assert.equal(result.status, "published");
  assert.equal(result.paths.latestUpdated, false);
  assert.equal(await readFile(path.join(reportsDirectory, "latest.md"), "utf8"), newerMarkdown);
  assert.equal(await readFile(path.join(reportsDirectory, "2026-08-18.md"), "utf8"), result.markdown);
});

test("waits instead of publishing a partial fallback when monitoring sources fail", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const fetchHistory = async (handle) => {
    if (handle === "geranium_chronicles") return chronologyMessages();
    if (handle === "kpszsu") return [firstDetectionMessage()];
    if (handle === "ua_ppo_monitor") {
      return [message(
        "ua_ppo_monitor",
        801,
        "2026-08-18T04:55:00.000Z",
        "Подтверждены пуски ударных БПЛА из Халино.",
      )];
    }
    throw new Error(`${handle} unavailable`);
  };

  const result = await generateDailyReport({
    reportDate: REPORT_DATE,
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  });

  assert.deepEqual(result, { status: "waiting-for-launch-sources", reportDate: REPORT_DATE });
  await assert.rejects(access(path.join(reportsDirectory, "2026-08-18.md")));
  await assert.rejects(access(path.join(reportsDirectory, "latest.md")));
});

test("waits without writing report files while the requested chronicle is missing", async (t) => {
  const reportsDirectory = await temporaryReportsDirectory(t);
  const { fetchHistory, calls } = injectedFetch({
    geranium_chronicles: [
      message(
        "geranium_chronicles",
        80100,
        "2026-08-18T04:00:00.000Z",
        "06:37 Бровары Киевской области - взрыв. Герань-4.",
      ),
    ],
    kpszsu: [firstDetectionMessage()],
  });

  const result = await generateDailyReport({
    reportDate: REPORT_DATE,
    now: RUN_AT,
    fetchHistory,
    reportsDirectory,
  });

  assert.deepEqual(result, { status: "waiting-for-chronicle", reportDate: REPORT_DATE });
  assert.deepEqual(calls.map((call) => call.handle), ["geranium_chronicles", "kpszsu"]);
  await assert.rejects(access(path.join(reportsDirectory, "2026-08-18.md")));
  await assert.rejects(access(path.join(reportsDirectory, "latest.md")));
});
