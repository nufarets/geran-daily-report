import test from "node:test";
import assert from "node:assert/strict";

import {
  findAndMergeChronicle,
  findFirstStrikeUavMessage,
  normalizeLaunchPlace,
  parseGeranChronology,
  parseLaunchPlaces,
  parseOfficialPpo,
  renderMarkdownReport,
} from "../src/domain.mjs";

const chroniclePartOne = `
Хроника ударов по территории Украины 17 августа 2026 – 18 августа 2026 года.
Хронология
17 августа 2026 года.
• 10:00 Чернигов – взрыв. Герань-4.
• 12:10 В районе Шахты «Днепровская» - взрыв. Реактивная Герань.
• 14:30 Николаев – взрыв. Герань-4.
• 15:40 Кривой Рог – взрыв. Герань-4.
• 17:45-17:50 Одесса – взрывы. Реактивные Герани.
• 17:58 Одесса – взрыв. Герань-4
• 19:01 Мена Черниговской области – взрыв. Герань-4.
• 19:05 Cумы – взрыв. Герань.
• 19:17 Окрестности Чернигова – взрыв. Герань-4.
• 20:05 Кривой Рог – взрыв. Герань-4.
• 20:15 Запорожская область – взрывы. Герани.
• 20:24 Одесса – взрыв. Герань-4.
• 20:35 Запорожская область – взрывы. Герани.
• 21:00 Балаклея Харьковской области – взрыв. Герань.
• 21:35 Боромля Сумской области – взрыв. Герань.
• 22:02 Одесса – взрыв. Герань.
• 22:45 Окрестности Одессы – взрыв. Герань-4.
• 22:55 Окрестности Павлограда Днепропетровской области – взрыв. Герань.
• 23:15 Городня Черниговской области – взрывы. Герань-4.
18 августа 2026 года.
• 00:30 Черное море – взрыв. Герань.
• 00:35-00:45 Запорожье – взрывы. Герани.
• 01:20 Бровары Киевской области – взрыв. Герань-4.
`;

const chroniclePartTwo = `
• 01:25 Коломак Харьковской области – взрыв. Герань.
• 01:55-02:15 Каменское Днепропетровской области – взрывы.
Герани.
• 03:15 Каменское Днепропетровской области – взрыв. Герань-4.
• 03:20-03:40 Киев – взрывы. Реактивные Герани.
• 06:27 Окрестности Киева – взрывы. Реактивные Герани.
• 06:37 Бровары Киевской области – взрыв. Герань-4.
`;

test("finds the first wave message after 12:20 and ignores reconnaissance or isolated reactive UAVs", () => {
  const messages = [
    {
      channel: "kpszsu",
      messageId: 1,
      datetime: "2026-08-17T09:25:00Z",
      text: "Разведывательный БпЛА в Запорожской области",
    },
    {
      channel: "kpszsu",
      messageId: 2,
      datetime: "2026-08-17T09:29:35Z",
      text: "🛵 Реактивний БпЛА з Донеччини на Харківщину, курс західний.",
    },
    {
      channel: "kpszsu",
      messageId: 3,
      datetime: "2026-08-17T09:46:00Z",
      text: "🛸🛵 БпЛА на Запоріжжя зі сходу.",
      sourceUrl: "https://t.me/kpszsu/3",
    },
    {
      channel: "kpszsu",
      messageId: 4,
      datetime: "2026-08-17T10:00:00Z",
      text: "Ударні БпЛА на Сумщині",
    },
  ];

  const result = findFirstStrikeUavMessage(messages, {
    windowStart: "2026-08-17T09:20:00Z",
    windowEnd: "2026-08-18T05:10:00Z",
  });

  assert.equal(result.messageId, 3);
  assert.equal(result.timeLabel, "12:46");
  assert.equal(result.regionLabel, "Запорожская область");
  assert.equal(result.sourceUrl, "https://t.me/kpszsu/3");
});

test("finds and joins a split daily chronicle", () => {
  const messages = [
    {
      channel: "geranium_chronicles",
      messageId: 80122,
      datetime: "2026-08-18T05:02:00Z",
      text: chroniclePartOne,
      sourceUrl: "https://t.me/geranium_chronicles/80122",
    },
    {
      channel: "geranium_chronicles",
      messageId: 80123,
      datetime: "2026-08-18T05:03:00Z",
      text: chroniclePartTwo,
      sourceUrl: "https://t.me/geranium_chronicles/80123",
    },
    {
      channel: "geranium_chronicles",
      messageId: 80124,
      datetime: "2026-08-18T05:04:00Z",
      text: "В Запорожской области за период нанесено не менее 20 ударов.",
    },
  ];

  const result = findAndMergeChronicle(messages, {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
  });

  assert.deepEqual(result.messages.map((message) => message.messageId), [80122, 80123]);
  assert.match(result.text, /14:30 Николаев/u);
  assert.match(result.text, /06:37 Бровары/u);
  assert.equal(result.sourceUrls.length, 2);
});

test("parses and groups only Geran events after the first detection", () => {
  const chronology = parseGeranChronology(`${chroniclePartOne}\n${chroniclePartTwo}`, {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    startTime: "12:46",
  });

  assert.equal(chronology.events.some((event) => event.timeLabel === "10:00"), false);
  assert.equal(chronology.events.some((event) => event.timeLabel === "12:10"), false);
  assert.deepEqual(
    chronology.regions.map((region) => region.name),
    [
      "Николаевская область",
      "Днепропетровская область",
      "Одесская область",
      "Черниговская область",
      "Сумская область",
      "Запорожская область",
      "Харьковская область",
      "Киевская область",
    ],
  );

  const dnipropetrovsk = chronology.regions.find((region) => region.name === "Днепропетровская область");
  assert.deepEqual(dnipropetrovsk.locations, [
    { name: "Кривой Рог", times: ["15:40", "20:05"] },
    { name: "Павлоград", times: ["22:55"] },
    { name: "Каменское", times: ["01:55-02:15", "03:15"] },
  ]);

  const zaporizhzhia = chronology.regions.find((region) => region.name === "Запорожская область");
  assert.deepEqual(zaporizhzhia.locations, [
    { name: "взрыв в области", times: ["20:15", "20:35"] },
    { name: "Запорожье", times: ["00:35-00:45"] },
  ]);

  const odesa = chronology.regions.find((region) => region.name === "Одесская область");
  assert.deepEqual(odesa.locations.at(-1), { name: "АЧМ", times: ["00:30"] });
});

test("assigns every location to its own region in compound real-world subjects", () => {
  const chronology = parseGeranChronology(`
17 августа 2026 года.
• 13:00 Окрестности Килии Одесской области и Тростянец Сумской области – взрывы. Герани.
• 14:00 Кривой Рог и Народичи Житомирской области – взрывы. Герани.
• 15:00 Черное море и Измаил Одесской области – взрывы. Герани.
• 16:00 Лозовая Харьковской – взрыв. Герань-4.
• 17:00 Харьковская область – взрывы. Герани.
`, {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    startTime: "12:20",
  });

  assert.deepEqual(chronology.regions, [
    {
      name: "Одесская область",
      locations: [
        { name: "Килия", times: ["13:00"] },
        { name: "АЧМ", times: ["15:00"] },
        { name: "Измаил", times: ["15:00"] },
      ],
    },
    {
      name: "Сумская область",
      locations: [{ name: "Тростянец", times: ["13:00"] }],
    },
    {
      name: "Днепропетровская область",
      locations: [{ name: "Кривой Рог", times: ["14:00"] }],
    },
    {
      name: "Житомирская область",
      locations: [{ name: "Народичи", times: ["14:00"] }],
    },
    {
      name: "Харьковская область",
      locations: [
        { name: "Лозовая", times: ["16:00"] },
        { name: "взрыв в области", times: ["17:00"] },
      ],
    },
  ]);
});

test("maps frequently unqualified regional capitals to their regions", () => {
  const chronology = parseGeranChronology(`
17 августа 2026 года.
• 13:00 Харьков – взрыв. Герань.
• 14:00 Полтава – взрыв. Герань-4.
• 15:00 Днепр – взрывы. Реактивные Герани.
• 16:00 Львов – взрыв. Герань.
`, {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    startTime: "12:20",
  });

  assert.deepEqual(
    chronology.regions.map((region) => [region.name, region.locations[0].name]),
    [
      ["Харьковская область", "Харьков"],
      ["Полтавская область", "Полтава"],
      ["Днепропетровская область", "Днепр"],
      ["Львовская область", "Львов"],
    ],
  );
});

test("normalizes inflected locality names found in live chronicles", () => {
  const chronology = parseGeranChronology(`
20 августа 2026 года.
• 13:55 Окрестности Жмеринки Винницкой области – взрыв. Герань-4.
• 15:00 Окрестности Ильичевска Одесской области – взрыв. Герань-4.
`, {
    startDate: "2026-08-20",
    endDate: "2026-08-21",
    startTime: "12:20",
  });

  assert.deepEqual(chronology.regions, [
    {
      name: "Винницкая область",
      locations: [{ name: "Жмеринка", times: ["13:55"] }],
    },
    {
      name: "Одесская область",
      locations: [{ name: "Ильичевск", times: ["15:00"] }],
    },
  ]);
});

test("treats a region-only Donbass subject as Donetsk region", () => {
  const chronology = parseGeranChronology(`
17 августа 2026 года.
• 13:00 Донбасс – взрывы. Герани.
`, {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    startTime: "12:20",
  });

  assert.deepEqual(chronology.regions, [
    {
      name: "Донецкая область",
      locations: [{ name: "взрыв в области", times: ["13:00"] }],
    },
  ]);
});

test("parses official PVO counts, status and normalized launch places", () => {
  const result = parseOfficialPpo(
    [
      {
        channel: "kpszsu",
        messageId: 73277,
        datetime: "2026-08-18T05:00:00Z",
        sourceUrl: "https://t.me/kpszsu/73277",
        text: `У ніч на 18 серпня противник атакував 147 ударними БпЛА типу Shahed із напрямків: Халіно, Орел, Міллерово, Приморсько-Ахтарськ, Донецьк, Кача, Чауда, Гвардійське.\nЗа попередніми даними збито/подавлено 111 ворожих БпЛА. Атака ворожих БпЛА триває.`,
      },
    ],
    { reportDate: "2026-08-18" },
  );

  assert.equal(result.launched, 147);
  assert.equal(result.neutralized, 111);
  assert.equal(result.ongoing, true);
  assert.deepEqual(result.launchPlaces, [
    "Курск",
    "Орел",
    "Ростов",
    "Приморско-Ахтарск",
    "Донецк",
    "Крым",
    "Чауда",
    "Гвардейское",
  ]);
});

test("returns null when the official PVO summary is not available", () => {
  assert.equal(
    parseOfficialPpo(
      [
        {
          channel: "kpszsu",
          datetime: "2026-08-18T04:00:00Z",
          text: "🛵 Ударні БпЛА на Київщині. Атака триває.",
        },
      ],
      { reportDate: "2026-08-18" },
    ),
    null,
  );
});

test("uses only confirmed launches from the allowed monitoring channels and deduplicates", () => {
  const places = parseLaunchPlaces([
    {
      channel: "StrategicaviationT",
      messageId: 30,
      datetime: "2026-08-18T00:00:00Z",
      text: "Пуски ударных БПЛА: Навля, Шаталвоо, Кача, Чауда и Гвардейское.",
    },
    {
      channel: "ua_ppo_monitor",
      messageId: 20,
      datetime: "2026-08-17T23:00:00Z",
      text: "Зафиксированы пуски Гераней из районов Халино и Приморско-Ахтарска.",
    },
    {
      channel: "Ukrainian_Intelligence",
      messageId: 25,
      datetime: "2026-08-17T23:30:00Z",
      text: "Возможны пуски из Навля и Шаталово.",
    },
    {
      channel: "ua_ppo_monitor",
      messageId: 21,
      datetime: "2026-08-17T23:01:00Z",
      text: "+ Міллерево 2 групи",
    },
    {
      channel: "ua_ppo_monitor",
      messageId: 10,
      datetime: "2026-08-17T22:00:00Z",
      text: "Зафиксированы пуски ракет из Цимбулово.",
    },
    { channel: "some_other_channel", text: "Пуски из Цимбулово." },
  ]);

  assert.deepEqual(places, [
    "Курск",
    "Приморско-Ахтарск",
    "Ростов",
    "Брянск",
    "Смоленск",
    "Крым",
    "Чауда",
    "Гвардейское",
  ]);
  assert.equal(normalizeLaunchPlace("Цимбулово"), "Орел");
  assert.equal(normalizeLaunchPlace("Приморсько-Ахтарськ – рф."), "Приморско-Ахтарск");
});

test("renders the example report and omits unavailable PVO counts", () => {
  const chronology = parseGeranChronology(`${chroniclePartOne}\n${chroniclePartTwo}`, {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    startTime: "12:46",
  });
  const markdown = renderMarkdownReport({
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    firstDetection: { timeLabel: "12:46", regionLabel: "Запорожская область" },
    chronology,
    ppo: null,
    launchPlaces: ["Курск", "Ростов", "Чауда", "Приморско-Ахтарск"],
    launchSource: "monitoring",
    sourceUrls: ["https://t.me/a/1", "https://t.me/a/1", "https://t.me/b/2"],
  });

  assert.match(markdown, /^17\.08\.2026-18\.08\.2026\n/u);
  assert.match(markdown, /Первые группы БПЛА обнаружены в Запорожской области в 12:46/u);
  assert.match(markdown, /Днепропетровская область\n\n15:40, 20:05 - Кривой Рог {2}\n22:55 - Павлоград {2}\n/u);
  assert.doesNotMatch(markdown, /Запущено/u);
  assert.doesNotMatch(markdown, /Сбито\/локационно/u);
  assert.match(
    markdown,
    /Точки пусков по данным мониторинговых каналов: Курск, Ростов, Чауда, Приморско-Ахтарск/u,
  );
  assert.match(markdown, /Источники: \[1\]\(https:\/\/t\.me\/a\/1\), \[2\]\(https:\/\/t\.me\/b\/2\)/u);
});
