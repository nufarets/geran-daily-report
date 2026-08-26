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
