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

test("keeps an explicit strike-UAV alert even when the same message mentions reconnaissance", () => {
  const result = findFirstStrikeUavMessage([
    {
      channel: "kpszsu",
      messageId: 10,
      datetime: "2026-08-17T09:31:00Z",
      text: "Разведывательный БПЛА остаётся в воздухе. На Сумщині ударні БПЛА направляються до цілі.",
    },
  ], {
    windowStart: "2026-08-17T09:20:00Z",
    windowEnd: "2026-08-18T05:10:00Z",
  });

  assert.equal(result.messageId, 10);
  assert.equal(result.timeLabel, "12:31");
  assert.equal(result.regionLabel, "Сумская область");
});

test("uses an emoji strike clause alongside a separate reconnaissance alert", () => {
  const result = findFirstStrikeUavMessage([
    {
      channel: "kpszsu",
      messageId: 11,
      datetime: "2026-08-17T09:32:00Z",
      text: "Розвідувальний БпЛА на Сумщині. 🛵 БпЛА на Харківщині.",
    },
  ], {
    windowStart: "2026-08-17T09:20:00Z",
    windowEnd: "2026-08-18T05:10:00Z",
  });

  assert.equal(result.messageId, 11);
  assert.equal(result.regionLabel, "Харьковская область");
});

test("recognizes the reactive UAV group regardless of scooter, motorcycle, or absent emoji", () => {
  for (const prefix of ["🛵 ", "🏍 ", "🏍️ ", ""]) {
    const result = findFirstStrikeUavMessage([
      { channel: "kpszsu", messageId: 79677, datetime: "2026-09-23T09:15:06Z", text: "🏍 Реактивні БпЛА на Київ." },
      { channel: "kpszsu", messageId: 79679, datetime: "2026-09-23T10:05:14Z", text: `${prefix}Група реактивних БпЛА із Дніпропетровщини курсом на Полтавщину.` },
      { channel: "kpszsu", messageId: 79693, datetime: "2026-09-23T12:26:11Z", text: "🛵 Дніпропетровщина: група БпЛА курсом на Павлоград." },
    ], { windowStart: "2026-09-23T09:20:00Z", windowEnd: "2026-09-24T05:10:00Z" });
    assert.equal(result.messageId, 79679, prefix);
    assert.equal(result.timeLabel, "13:05");
  }
});

test("recognizes motorcycle UAV alerts without treating reconnaissance or an isolated reactive UAV as a wave", () => {
  const result = findFirstStrikeUavMessage([
    { channel: "kpszsu", messageId: 1, datetime: "2026-09-23T09:25:00Z", text: "🏍 Розвідувальний БпЛА на Сумщині." },
    { channel: "kpszsu", messageId: 2, datetime: "2026-09-23T09:30:00Z", text: "🏍️ Реактивний БпЛА курсом на Київ." },
    { channel: "kpszsu", messageId: 3, datetime: "2026-09-23T10:00:00Z", text: "🏍 Київщина: БпЛА курсом на Васильків/Фастів." },
  ], { windowStart: "2026-09-23T09:20:00Z", windowEnd: "2026-09-24T05:10:00Z" });
  assert.equal(result.messageId, 3);
  assert.equal(result.timeLabel, "13:00");
});

test("normalizes the declined place names in the September 24 report", () => {
  const chronology = parseGeranChronology(`24 сентября 2026 года.
• 00:45 Окрестности Черновцов – взрыв. Герань.
• 04:20 Окрестности Бучи Киевской области – взрывы. Герани.
• 06:05 Окрестности Шепетовки Хмельницкой области – взрыв. Герань.
• 07:05 Окрестности Вознесенска Николаевской области – взрыв. Герань.
• 07:10 Буча – взрыв. Герань.`, { startDate: "2026-09-23", endDate: "2026-09-24" });
  assert.deepEqual(chronology.regions, [
    { name: "Черновицкая область", locations: [{ name: "Черновцы", times: ["00:45"] }] },
    { name: "Киевская область", locations: [{ name: "Буча", times: ["04:20", "07:10"] }] },
    { name: "Хмельницкая область", locations: [{ name: "Шепетовка", times: ["06:05"] }] },
    { name: "Николаевская область", locations: [{ name: "Вознесенск", times: ["07:05"] }] },
  ]);
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

test("waits for a structurally incomplete split part but accepts a complete single post", () => {
  const title = "Хроника ударов по территории Украины 17 августа 2026 – 18 августа 2026 года.";
  const completeSinglePost = {
    channel: "geranium_chronicles",
    messageId: 81000,
    datetime: "2026-08-18T05:00:00Z",
    text: `${title}\n17 августа 2026 года.\n• 14:30 Николаев – взрыв. Герань-4.`,
  };
  assert.ok(findAndMergeChronicle([completeSinglePost], {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
  }));

  const truncatedAtTelegramLimit = {
    ...completeSinglePost,
    messageId: 81001,
    text: `${title}\n${"Описание опубликованных событий. ".repeat(125)}\n17 августа 2026 года.\n• 23:50 Одесса – взрывы.`,
  };
  assert.ok([...truncatedAtTelegramLimit.text].length >= 4000);
  assert.equal(findAndMergeChronicle([truncatedAtTelegramLimit], {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
  }), null);

  const continued = findAndMergeChronicle([
    truncatedAtTelegramLimit,
    {
      channel: "geranium_chronicles",
      messageId: 81002,
      datetime: "2026-08-18T05:01:00Z",
      text: "18 августа 2026 года.\n• 00:30 Черное море – взрыв. Герань.",
    },
  ], {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
  });
  assert.deepEqual(continued.messages.map((message) => message.messageId), [81001, 81002]);
});

test("joins nearby chronicle parts across media ID gaps of different sizes", () => {
  for (const gap of [3, 5, 10]) {
    const result = findAndMergeChronicle([
      { channel: "geranium_chronicles", messageId: 86246, datetime: "2026-09-23T04:03:57Z",
        text: "Хроника ударов 22 сентября 2026 – 23 сентября 2026 года.\n23 сентября 2026 года.\n• 23:55 Киев – взрыв. Герань." },
      { channel: "geranium_chronicles", messageId: 86246 + gap, datetime: "2026-09-23T04:05:05Z",
        text: "23 сентября 2026 года.\n• 00:05 Киев – взрыв. Герань." },
    ], { startDate: "2026-09-22", endDate: "2026-09-23" });
    assert.deepEqual(result.messages.map(m => m.messageId), [86246, 86246 + gap]);
  }
});

test("does not join another daily chronicle, unrelated video timecodes, or distant adjacent IDs", () => {
  const anchor = { channel: "geranium_chronicles", messageId: 86246, datetime: "2026-09-23T04:03:57Z",
    text: "Хроника ударов 22 сентября 2026 – 23 сентября 2026 года.\n22 сентября 2026 года.\n• 23:55 Киев – взрыв. Герань." };
  for (const candidate of [
    { datetime: "2026-09-23T04:05:05Z", text: "Хроника ударов 23 сентября 2026 – 24 сентября 2026 года.\n• 00:05 Киев – взрыв. Герань." },
    { datetime: "2026-09-23T04:05:05Z", text: "Видео\n0:06 - HMMWV\n0:15 - НРТК" },
    { datetime: "2026-09-24T04:05:05Z", text: "• 00:05 Киев – взрыв. Герань." },
  ]) {
    const result = findAndMergeChronicle([anchor, { channel: anchor.channel, messageId: 86247, ...candidate }],
      { startDate: "2026-09-22", endDate: "2026-09-23" });
    assert.deepEqual(result.messages.map(m => m.messageId), [86246]);
  }
});

test("gives a newly published single chronicle time for an unmarked continuation", () => {
  const title = "Хроника ударов по территории Украины 16 августа 2026 – 17 августа 2026 года.";
  const firstPart = {
    channel: "geranium_chronicles",
    messageId: 79983,
    datetime: "2026-08-17T04:01:08Z",
    text: `${title}\n16 августа 2026 года.\n• 23:50 Одесса – взрывы. Герани.\nhttps://t.me/lost_armour/10842`,
  };

  assert.equal(findAndMergeChronicle([firstPart], {
    startDate: "2026-08-16",
    endDate: "2026-08-17",
    now: "2026-08-17T04:03:00Z",
    continuationGraceMs: 5 * 60 * 1000,
  }), null);

  assert.ok(findAndMergeChronicle([firstPart], {
    startDate: "2026-08-16",
    endDate: "2026-08-17",
    now: "2026-08-17T04:07:00Z",
    continuationGraceMs: 5 * 60 * 1000,
  }));

  const merged = findAndMergeChronicle([
    firstPart,
    {
      channel: "geranium_chronicles",
      messageId: 79984,
      datetime: "2026-08-17T04:02:00Z",
      text: "17 августа 2026 года.\n• 00:25 Херсон – взрыв. Герань.",
    },
  ], {
    startDate: "2026-08-16",
    endDate: "2026-08-17",
    now: "2026-08-17T04:03:00Z",
    continuationGraceMs: 5 * 60 * 1000,
  });
  assert.deepEqual(merged.messages.map((message) => message.messageId), [79983, 79984]);
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

test("accepts live dash separators without spaces and preserves time or city hyphens", () => {
  const chronology = parseGeranChronology(`
17 августа 2026 года.
• 13:00 Николаев -взрыв. Герань.
• 14:00 Одесса- взрыв. Герань-4.
• 15:00 Харьков –взрыв. Герань.
• 16:00-16:10 Ивано-Франковск- мощный взрыв. Герань-4.
`, {
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    startTime: "12:20",
  });

  assert.deepEqual(
    chronology.events.map(({ timeLabel, location, region }) => ({ timeLabel, location, region })),
    [
      { timeLabel: "13:00", location: "Николаев", region: "Николаевская область" },
      { timeLabel: "14:00", location: "Одесса", region: "Одесская область" },
      { timeLabel: "15:00", location: "Харьков", region: "Харьковская область" },
      {
        timeLabel: "16:00-16:10",
        location: "Ивано-Франковск",
        region: "Ивано-Франковская область",
      },
    ],
  );
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

test("maps Kremenchuk and Reni from the 25–26 August chronicle without an undefined region", () => {
  const chronology = parseGeranChronology(`
25 августа 2026 года.
• 13:07-14:15 Окресности Кременчуга - взрывы. Герани.
26 августа 2026 года.
• 02:45-03:00 Рени - взрывы. Герани.
`, {
    startDate: "2026-08-25",
    endDate: "2026-08-26",
    startTime: "12:20",
  });

  assert.deepEqual(chronology.regions, [
    {
      name: "Полтавская область",
      locations: [{ name: "Кременчуг", times: ["13:07-14:15"] }],
    },
    {
      name: "Одесская область",
      locations: [{ name: "Рени", times: ["02:45-03:00"] }],
    },
  ]);
  assert.doesNotMatch(JSON.stringify(chronology), /Неопределённая область/u);
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

test("uses the UAV subtotal from the neutralized list, never the mixed-target total", () => {
  const result = parseOfficialPpo([{
    channel: "kpszsu",
    datetime: "2026-09-22T05:01:01Z",
    text: `ЗБИТО/ПОДАВЛЕНО 186 ЦІЛЕЙ ПРОТИВНИКА
У ніч на 22 вересня противник атакував:
- 4 крилатими ракетами;
- 8 "Бандероль"/"Дань-Т";
- 212 ударними БпЛА типу Shahed.
За попередніми даними збито/подавлено 186 цілей:

- 1 крилату ракету "Калібр";
- 8 "Бандероль"/"Дань-Т";
- 177 БпЛА типу Shahed, Гербера та дронів інших типів.
Зафіксовано влучання на 22 локаціях.`,
  }], { reportDate: "2026-09-22" });

  assert.equal(result.launched, 212);
  assert.equal(result.neutralized, 177);
});

test("does not substitute a target total or a launch/impact count for neutralized UAVs", () => {
  for (const summary of [
    "ЗБИТО/ПОДАВЛЕНО 186 ЦІЛЕЙ ПРОТИВНИКА",
    "Збито/подавлено 186 цілей:\n- 1 крилату ракету;\n- 8 Бандероль/Дань-Т.",
    "Збито/подавлено 186 цілей:\n- 1 крилату ракету.\nЗафіксовано влучання:\n- 35 БпЛА типу Shahed.",
  ]) {
    const result = parseOfficialPpo([{
      channel: "kpszsu",
      text: `Противник атакував:\n- 212 ударними БпЛА типу Shahed.\n${summary}`,
    }]);
    assert.equal(result.launched, 212);
    assert.equal(result.neutralized, null, summary);
  }
});

test("still accepts UAV counts stated directly and ignores a mixed-target headline", () => {
  for (const summary of [
    "ЗБИТО/ПОДАВЛЕНО 177 БПЛА",
    "Збито / подавлено 177 ворожих БпЛА типу Shahed та Гербера.",
    "Знешкоджено 177 ударних БпЛА.",
    "ЗБИТО/ПОДАВЛЕНО 186 ЦІЛЕЙ\nЗбито 1 крилату ракету. Збито 177 ворожих БпЛА.",
    "Сбито/локационно потеряно 177 БПЛА.",
  ]) {
    assert.equal(parseOfficialPpo([{ text: summary }])?.neutralized, 177, summary);
  }
});

test("selects the Shahed/Gerbera group even when another list item also calls Banderol a UAV", () => {
  assert.equal(parseOfficialPpo([{ text: `Збито/подавлено 186 цілей:
- 1 крилату ракету;
- 8 БпЛА типу "Бандероль"/"Дань-Т";
- 177 БпЛА типу Shahed, Гербера та дронів інших типів.` }])?.neutralized, 177);
  assert.equal(parseOfficialPpo([{ text: 'Збито 8 БпЛА типу "Бандероль"/"Дань-Т".' }]), null);
  assert.equal(parseOfficialPpo([{ text: "Збито/подавлено 147 ворожих БпЛА типу Shahed, Гербера, дронів інших типів та 1 «Бандероль»/«Дань-Т»." }])?.neutralized, 147);
});

test("does not treat a date range in the title as a day heading", () => {
  const chronology = parseGeranChronology(`
Хроника ударов по территории Украины 21 сентября 2026 – 22 сентября 2026 года.
• 08:30 Киев – взрыв. Герань.
• 23:55 Киев – взрыв. Герань.
• 00:15 Киев – взрыв. Герань.
`, { startDate: "2026-09-21", endDate: "2026-09-22", startTime: "12:20" });
  assert.deepEqual(chronology.events.map(({ date, timeLabel }) => [date, timeLabel]), [
    ["2026-09-21", "23:55"],
    ["2026-09-22", "00:15"],
  ]);
});

test("repairs a duplicated end-date heading only when two day sections cross midnight", () => {
  const chronology = parseGeranChronology(`
Хроника ударов по территории Украины 21 сентября 2026 – 22 сентября 2026 года.
22 сентября 2026 года.
• 07:35 Вознесенск Николаевской области – взрыв. Герань.
• 12:30 Николаев – взрыв. Герань.
• 23:55 Черновцы – взрыв. Герань.
22 сентября 2026 года.
• 00:15 Новоднестровск Черновицкой области – взрыв. Герань.
• 07:10 Винница – взрыв. Герань.
`, { startDate: "2026-09-21", endDate: "2026-09-22", startTime: "12:20" });

  assert.deepEqual(chronology.events.map(({ date, timeLabel }) => [date, timeLabel]), [
    ["2026-09-21", "12:30"],
    ["2026-09-21", "23:55"],
    ["2026-09-22", "00:15"],
    ["2026-09-22", "07:10"],
  ]);
});

test("keeps legitimate end-date-only and repeated same-day headings", () => {
  const chronology = parseGeranChronology(`
22 сентября 2026 года.
• 00:15 Киев – взрыв. Герань.
22 сентября 2026 года.
• 07:10 Винница – взрыв. Герань.
`, { startDate: "2026-09-21", endDate: "2026-09-22", startTime: "12:20" });
  assert.deepEqual(chronology.events.map(({ date, timeLabel }) => [date, timeLabel]), [
    ["2026-09-22", "00:15"],
    ["2026-09-22", "07:10"],
  ]);
});

test("assigns days across all fragments even when headings repeat or midnight has no heading", () => {
  const options = { startDate: "2026-09-22", endDate: "2026-09-23", startTime: "12:54" };
  for (const source of [
    "23 сентября 2026 года.\n• 07:35 Киев – взрыв. Герань.\n• 13:10 Киев – взрыв. Герань.\n23 сентября 2026 года.\n• 23:55 Киев – взрыв. Герань.\n23 сентября 2026 года.\n• 00:05 Киев – взрыв. Герань.",
    "23 сентября 2026 года.\n• 07:35 Киев – взрыв. Герань.\n• 13:10 Киев – взрыв. Герань.\n• 23:55 Киев – взрыв. Герань.\n• 00:05 Киев – взрыв. Герань.",
    "22 сентября 2026 года.\n• 07:35 Киев – взрыв. Герань.\n• 13:10 Киев – взрыв. Герань.\n• 23:55 Киев – взрыв. Герань.\n22 сентября 2026 года.\n• 00:05 Киев – взрыв. Герань.",
  ]) {
    const chronology = parseGeranChronology(source, options);
    assert.deepEqual(chronology.events.map(({ date, timeLabel }) => [date, timeLabel]), [
      ["2026-09-22", "13:10"], ["2026-09-22", "23:55"], ["2026-09-23", "00:05"],
    ]);
  }
});

test("keeps a midnight-spanning time range on its starting day", () => {
  const chronology = parseGeranChronology(`23 сентября 2026 года.
• 23:55-00:05 Киев – взрыв. Герань.
23 сентября 2026 года.
• 00:15 Киев – взрыв. Герань.`, { startDate: "2026-09-22", endDate: "2026-09-23" });
  assert.deepEqual(chronology.events.map(({ date, timeLabel }) => [date, timeLabel]), [
    ["2026-09-22", "23:55-00:05"], ["2026-09-23", "00:15"],
  ]);
});

test("does not publish a daily chronicle with multiple midnight rollovers", () => {
  const result = findAndMergeChronicle([{
    channel: "geranium_chronicles", messageId: 1, datetime: "2026-09-23T05:00:00Z",
    text: `Хроника ударов 22 сентября 2026 – 23 сентября 2026 года.
22 сентября 2026 года.
• 23:55 Киев – взрыв. Герань.
• 00:05 Киев – взрыв. Герань.
• 23:50 Киев – взрыв. Герань.
• 00:15 Киев – взрыв. Герань.`,
  }], { startDate: "2026-09-22", endDate: "2026-09-23" });
  assert.equal(result, null);
});

test("preserves events with the clock typos in the September 22 source", () => {
  const chronology = parseGeranChronology(`
21 сентября 2026 года.
• 18:33.Днепропетровск – взрыв. Герань.
• 20:50-20-55 Буча и окрестности Киева Киевской области – взрывы. Герани.
`, { startDate: "2026-09-21", endDate: "2026-09-22", startTime: "12:20" });
  assert.deepEqual(chronology.events.map(({ timeLabel, location }) => [timeLabel, location]), [
    ["18:33", "Днепропетровск"],
    ["20:50-20:55", "Буча"],
    ["20:50-20:55", "Киев"],
  ]);
});

test("renders consecutive official PVO counts with a Markdown hard line break", () => {
  const markdown = renderMarkdownReport({
    startDate: "2026-08-17",
    endDate: "2026-08-18",
    chronology: { regions: [] },
    ppo: { launched: 147, neutralized: 111 },
  });

  assert.match(markdown, /Запущено 147 БПЛА {2}\nСбито\/локационно потеряно 111/u);
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

test("rejects negated launches and places mentioned only in a rocket-launch clause", () => {
  const places = parseLaunchPlaces([
    {
      channel: "ua_ppo_monitor",
      messageId: 40,
      datetime: "2026-08-17T23:00:00Z",
      text: "Пуски Гераней из Миллерово не подтверждены.",
    },
    {
      channel: "StrategicaviationT",
      messageId: 41,
      datetime: "2026-08-17T23:05:00Z",
      text: "Пуски ракет из Цимбулово. Герани уже в воздухе.",
    },
    {
      channel: "StrategicaviationT",
      messageId: 411,
      datetime: "2026-08-17T23:06:00Z",
      text: "Пуски ракет из Цимбулово\nГерани уже в воздухе",
    },
    {
      channel: "Ukrainian_Intelligence",
      messageId: 42,
      datetime: "2026-08-17T23:10:00Z",
      text: "Подтверждены пуски Гераней из Халино. Пуски ракет из Цимбулово.",
    },
  ]);

  assert.deepEqual(places, ["Курск"]);
});

test("keeps confirmed launch locations listed on following lines", () => {
  const places = parseLaunchPlaces([
    {
      channel: "ua_ppo_monitor",
      messageId: 50,
      datetime: "2026-08-17T23:00:00Z",
      text: "Подтверждены пуски Гераней:\nХалино\nМиллерово",
    },
  ]);

  assert.deepEqual(places, ["Курск", "Ростов"]);
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
  assert.doesNotMatch(markdown, /Первые группы БПЛА обнаружены/u);
  assert.match(markdown, /Днепропетровская область {2}\n15:40, 20:05 - Кривой Рог {2}\n22:55 - Павлоград {2}\n/u);
  assert.doesNotMatch(markdown, /область\s*\n\s*\n\d{2}:\d{2}/u);
  assert.doesNotMatch(markdown, /Запущено/u);
  assert.doesNotMatch(markdown, /Сбито\/локационно/u);
  assert.match(
    markdown,
    /Точки пусков по данным мониторинговых каналов: Курск, Ростов, Чауда, Приморско-Ахтарск/u,
  );
  assert.match(markdown, /Источники: \[1\]\(https:\/\/t\.me\/a\/1\), \[2\]\(https:\/\/t\.me\/b\/2\)/u);
});
