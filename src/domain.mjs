/**
 * Pure domain helpers for the daily Geran report.
 *
 * Telegram messages accepted by this module have this shape (extra fields are
 * preserved/ignored):
 *   { id, channel, messageId, datetime, text, sourceUrl }
 */

const DEFAULT_TIME_ZONE = "Europe/Moscow";

const RUSSIAN_MONTHS = Object.freeze([
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
]);

export const CITY_TO_REGION = Object.freeze({
  Николаев: "Николаевская область",
  "Кривой Рог": "Днепропетровская область",
  Павлоград: "Днепропетровская область",
  Каменское: "Днепропетровская область",
  Одесса: "Одесская область",
  АЧМ: "Одесская область",
  Мена: "Черниговская область",
  Чернигов: "Черниговская область",
  Городня: "Черниговская область",
  Сумы: "Сумская область",
  Боромля: "Сумская область",
  Запорожье: "Запорожская область",
  Балаклея: "Харьковская область",
  Коломак: "Харьковская область",
  Бровары: "Киевская область",
  Киев: "Киевская область",
  Килия: "Одесская область",
  Тростянец: "Сумская область",
  Народичи: "Житомирская область",
  Измаил: "Одесская область",
  Лозовая: "Харьковская область",
  Жмеринка: "Винницкая область",
  Ильичевск: "Одесская область",
  Харьков: "Харьковская область",
  Днепр: "Днепропетровская область",
  Днепропетровск: "Днепропетровская область",
  Полтава: "Полтавская область",
  Херсон: "Херсонская область",
  Житомир: "Житомирская область",
  Черкассы: "Черкасская область",
  Кропивницкий: "Кировоградская область",
  Кировоград: "Кировоградская область",
  Хмельницкий: "Хмельницкая область",
  Винница: "Винницкая область",
  Ровно: "Ровенская область",
  Луцк: "Волынская область",
  Львов: "Львовская область",
  Тернополь: "Тернопольская область",
  "Ивано-Франковск": "Ивано-Франковская область",
  Черновцы: "Черновицкая область",
  Ужгород: "Закарпатская область",
  Донецк: "Донецкая область",
  Краматорск: "Донецкая область",
  Славянск: "Донецкая область",
  Мариуполь: "Донецкая область",
  Луганск: "Луганская область",
});

const REGION_DEFINITIONS = Object.freeze([
  ["Николаевская область", /(?:николаев|миколаїв|миколаев)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Днепропетровская область", /(?:днепропетров|дніпропетров)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Одесская область", /(?:одесс|одесь)к\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Черниговская область", /(?:чернигов|чернігів)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Сумская область", /сумск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Запорожская область", /(?:запорож|запоріз)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Харьковская область", /(?:харьков|харків)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Киевская область", /(?:киев|київ)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Полтавская область", /полтавск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Черкасская область", /черкасск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Житомирская область", /житомирск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Кировоградская область", /(?:кировоград|кіровоград)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Хмельницкая область", /хмельницк\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Винницкая область", /(?:винниц|вінниц)к\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Ровенская область", /(?:ровен|рівнен)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Волынская область", /(?:волын|волин)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Львовская область", /(?:львов|львів)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Тернопольская область", /тернопол\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Ивано-Франковская область", /(?:ивано|івано)[-–— ]франковск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Черновицкая область", /(?:черновиц|чернівец)к\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Закарпатская область", /закарпатск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Херсонская область", /херсонск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Донецкая область", /(?:(?:донец|донець)к\p{L}*|донбасс)(?:\s+(?:област\p{L}*|обл\.?))?/giu],
  ["Луганская область", /(?:луган|лугань)ск\p{L}*(?:\s+(?:област\p{L}*|обл\.?))?/giu],
]);

const REGION_SHORT_PATTERNS = Object.freeze([
  ["Запорожская область", /(?:запорож|запоріж|запоріз)/iu],
  ["Николаевская область", /(?:николаев|миколаїв|миколаев)/iu],
  ["Днепропетровская область", /(?:днепропетров|дніпропетров)/iu],
  ["Одесская область", /(?:одесс|одесщ|одеськ)/iu],
  ["Черниговская область", /(?:чернигов|чернігів|черніг)/iu],
  ["Сумская область", /(?:сумщ|сумск|сумськ|\bсумы\b|\bсуми\b)/iu],
  ["Харьковская область", /(?:харьков|харків)/iu],
  ["Киевская область", /(?:киев|київ)/iu],
  ["Полтавская область", /полтав/iu],
  ["Черкасская область", /черкас/iu],
  ["Житомирская область", /житомир/iu],
  ["Кировоградская область", /(?:кировоград|кіровоград)/iu],
  ["Хмельницкая область", /хмельниц/iu],
  ["Винницкая область", /(?:винниц|вінниц)/iu],
  ["Херсонская область", /херсон/iu],
  ["Донецкая область", /(?:донец|донець|донбасс)/iu],
  ["Луганская область", /луган/iu],
]);

const CITY_DEFINITIONS = Object.freeze([
  ["Кривой Рог", "Днепропетровская область", /(?<!\p{L})крив(?:ой|ого)\s+рог(?:а|е)?(?!\p{L})/giu],
  ["Павлоград", "Днепропетровская область", /(?<!\p{L})павлоград(?:а|е)?(?!\p{L})/giu],
  ["Каменское", "Днепропетровская область", /(?<!\p{L})каменск(?:ое|ого|ом)(?!\p{L})/giu],
  ["Николаев", "Николаевская область", /(?<!\p{L})(?:николаев|миколаїв|миколаев)(?:а|е|у)?(?!\p{L})/giu],
  ["Одесса", "Одесская область", /(?<!\p{L})одесс(?:а|ы|е|у|ой)(?!\p{L})/giu],
  ["АЧМ", "Одесская область", /(?<!\p{L})(?:ачм|акватори\p{L}*\s+(?:ч[её]рного|чорного)\s+моря|ч[её]рное\s+море)(?!\p{L})/giu],
  ["Мена", "Черниговская область", /(?<!\p{L})мен(?:а|ы|е)(?!\p{L})/giu],
  ["Чернигов", "Черниговская область", /(?<!\p{L})(?:чернигов|чернігів)(?:а|е|у)?(?!\p{L})/giu],
  ["Городня", "Черниговская область", /(?<!\p{L})городн(?:я|и|е)(?!\p{L})/giu],
  ["Сумы", "Сумская область", /(?<!\p{L})[сc]ум(?:ы|и|ах)?(?!\p{L})/giu],
  ["Боромля", "Сумская область", /(?<!\p{L})боромл(?:я|и|е)(?!\p{L})/giu],
  ["Запорожье", "Запорожская область", /(?<!\p{L})(?:запорожье|запорожья|запорожье|запоріжжя)(?!\p{L})/giu],
  ["Балаклея", "Харьковская область", /(?<!\p{L})балакле(?:я|и|е)(?!\p{L})/giu],
  ["Коломак", "Харьковская область", /(?<!\p{L})коломак(?:а|е|у)?(?!\p{L})/giu],
  ["Бровары", "Киевская область", /(?<!\p{L})бровар(?:ы|ов|ах|и)(?!\p{L})/giu],
  ["Киев", "Киевская область", /(?<!\p{L})(?:киев|київ)(?:а|е|у)?(?!\p{L})/giu],
  ["Килия", "Одесская область", /(?<!\p{L})кили(?:я|и|е|ю)(?!\p{L})/giu],
  ["Тростянец", "Сумская область", /(?<!\p{L})тростян(?:ец|ець|ца|це)(?!\p{L})/giu],
  ["Народичи", "Житомирская область", /(?<!\p{L})народич(?:и|ей|ах)(?!\p{L})/giu],
  ["Измаил", "Одесская область", /(?<!\p{L})измаил(?:а|е|у)?(?!\p{L})/giu],
  ["Лозовая", "Харьковская область", /(?<!\p{L})лозов(?:ая|ой|ую)(?!\p{L})/giu],
  ["Жмеринка", "Винницкая область", /(?<!\p{L})жмеринк(?:а|и|е|у|ой)(?!\p{L})/giu],
  ["Ильичевск", "Одесская область", /(?<!\p{L})ильич[её]вск(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Харьков", "Харьковская область", /(?<!\p{L})(?:харьков|харків)(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Днепр", "Днепропетровская область", /(?<!\p{L})(?:днепр|дніпро)(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Днепропетровск", "Днепропетровская область", /(?<!\p{L})(?:днепропетровск|дніпропетровськ)(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Полтава", "Полтавская область", /(?<!\p{L})полтав(?:а|ы|е|у|ой)(?!\p{L})/giu],
  ["Херсон", "Херсонская область", /(?<!\p{L})херсон(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Житомир", "Житомирская область", /(?<!\p{L})житомир(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Черкассы", "Черкасская область", /(?<!\p{L})черкасс(?:ы|ах|ами)?(?!\p{L})/giu],
  ["Кропивницкий", "Кировоградская область", /(?<!\p{L})кропивницк(?:ий|ого|ом|ому)(?!\p{L})/giu],
  ["Кировоград", "Кировоградская область", /(?<!\p{L})(?:кировоград|кіровоград)(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Хмельницкий", "Хмельницкая область", /(?<!\p{L})хмельницк(?:ий|ого|ом|ому)(?!\p{L})/giu],
  ["Винница", "Винницкая область", /(?<!\p{L})(?:винниц|вінниц)(?:а|ы|е|у|ей|я|і)(?!\p{L})/giu],
  ["Ровно", "Ровенская область", /(?<!\p{L})(?:ровно|рівне)(?!\p{L})/giu],
  ["Луцк", "Волынская область", /(?<!\p{L})луцк(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Львов", "Львовская область", /(?<!\p{L})(?:львов|львів)(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Тернополь", "Тернопольская область", /(?<!\p{L})тернопол(?:ь|я|е|ю|ем)(?!\p{L})/giu],
  ["Ивано-Франковск", "Ивано-Франковская область", /(?<!\p{L})(?:ивано|івано)[-–— ]франковск(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Черновцы", "Черновицкая область", /(?<!\p{L})(?:черновц|чернівц)(?:ы|ах|ями|і)(?!\p{L})/giu],
  ["Ужгород", "Закарпатская область", /(?<!\p{L})ужгород(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Донецк", "Донецкая область", /(?<!\p{L})(?:донецк|донецьк)(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Краматорск", "Донецкая область", /(?<!\p{L})краматорск(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Славянск", "Донецкая область", /(?<!\p{L})(?:славянск|слов[’']?янськ)(?:а|е|у|ом)?(?!\p{L})/giu],
  ["Мариуполь", "Донецкая область", /(?<!\p{L})мариупол(?:ь|я|е|ю|ем)(?!\p{L})/giu],
  ["Луганск", "Луганская область", /(?<!\p{L})луганск(?:а|е|у|ом)?(?!\p{L})/giu],
]);

const LAUNCH_PLACE_DEFINITIONS = Object.freeze([
  ["Курск", /(?<!\p{L})(?:хал[иі]но|курск|курськ)(?!\p{L})/giu],
  ["Ростов", /(?<!\p{L})(?:м[иі]л+ер+(?:о|е)во|ростов)(?!\p{L})/giu],
  ["Брянск", /(?<!\p{L})(?:навля|набля|навл[ія]|брянск)(?!\p{L})/giu],
  ["Смоленск", /(?<!\p{L})(?:шаталово|шаталвоо|шатлово|смоленск)(?!\p{L})/giu],
  ["Крым", /(?<!\p{L})(?:кача|кач[иі]|крым|крим)(?!\p{L})/giu],
  ["Орел", /(?<!\p{L})(?:цимбулов[оа]?|ор[её]л)(?!\p{L})/giu],
  ["Чауда", /(?<!\p{L})чауда(?!\p{L})/giu],
  ["Гвардейское", /(?<!\p{L})(?:гвардейское|гвардійське|гвардейск(?:ое)?)(?!\p{L})/giu],
  ["Приморско-Ахтарск", /(?<!\p{L})приморс(?:ко|ько)[-–— ]ахтарс(?:к|ьк)(?:а|у|ом)?(?!\p{L})/giu],
  ["Донецк", /(?<!\p{L})(?:донецк|донецьк)(?!\p{L})/giu],
  ["Ейск", /(?<!\p{L})(?:ейск|єйськ)(?!\p{L})/giu],
  ["Сеща", /(?<!\p{L})сеща(?!\p{L})/giu],
]);

const ALLOWED_MONITOR_CHANNELS = new Set([
  "ua_ppo_monitor",
  "ukrainian_intelligence",
  "strategicaviationt",
]);

function messageText(message) {
  return typeof message?.text === "string" ? message.text : "";
}

function messageDateValue(message) {
  return (
    message?.datetime ??
    message?.dateTime ??
    message?.publishedAt ??
    message?.timestamp ??
    message?.date ??
    null
  );
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function messageDate(message) {
  return toDate(messageDateValue(message));
}

function sourceUrlFor(message) {
  if (typeof message?.sourceUrl === "string" && message.sourceUrl.trim()) {
    return message.sourceUrl.trim();
  }
  const channel = normalizeChannel(message?.channel);
  const messageId = message?.messageId ?? message?.id;
  return channel && messageId != null ? `https://t.me/${channel}/${messageId}` : null;
}

function normalizeChannel(channel) {
  if (typeof channel !== "string") return "";
  return channel
    .trim()
    .replace(/^https?:\/\/(?:www\.)?t\.me\/(?:s\/)?/iu, "")
    .replace(/^@/u, "")
    .split(/[/?#]/u)[0]
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function compareMessages(left, right) {
  const leftDate = messageDate(left)?.getTime();
  const rightDate = messageDate(right)?.getTime();
  if (leftDate != null && rightDate != null && leftDate !== rightDate) return leftDate - rightDate;
  const leftId = Number(left?.messageId ?? left?.id);
  const rightId = Number(right?.messageId ?? right?.id);
  if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
  return 0;
}

function localParts(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function timeLabelFor(date, timeZone = DEFAULT_TIME_ZONE) {
  return localParts(date, timeZone).time;
}

function dateKeyForMessage(message, timeZone = DEFAULT_TIME_ZONE) {
  const date = messageDate(message);
  return date ? localParts(date, timeZone).date : null;
}

function firstRegionMention(text) {
  let best = null;
  for (const [region, pattern] of REGION_SHORT_PATTERNS) {
    const match = pattern.exec(text);
    pattern.lastIndex = 0;
    if (match && (!best || match.index < best.index)) best = { region, index: match.index };
  }
  return best?.region ?? null;
}

const EXPLICIT_STRIKE_UAV_PATTERN =
  /(?:ударн\p{L}*\s+(?:бпла|бпл[аa]|безп[іи]лотн\p{L}*)|shahed|шахед|геран\p{L}*)/iu;
const RECONNAISSANCE_UAV_PATTERN =
  /(?:разведыватель|разв[еі]д(?:ывательн|очн|ка)|розв[іи]дувальн|орлан|supercam|zala)/iu;

function textClauses(text) {
  return String(text ?? "")
    .split(/(?:[.!?;]+|\r?\n+)/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function strikeUavClauses(text) {
  return textClauses(text).filter((clause) => (
    EXPLICIT_STRIKE_UAV_PATTERN.test(clause)
    || (/🛵/u.test(clause) && !RECONNAISSANCE_UAV_PATTERN.test(clause))
  ));
}

function isStrikeUavText(text) {
  return strikeUavClauses(text).length > 0;
}

function firstStrikeRegionMention(text) {
  for (const clause of strikeUavClauses(text)) {
    const region = firstRegionMention(clause);
    if (region) return region;
  }
  return null;
}

function isIsolatedReactiveUavText(text) {
  const strikeClauses = strikeUavClauses(text);
  return strikeClauses.length === 1
    && /^(?:⚠️?\s*)?🛵\s*(?:1\s+)?реактивн(?:ий|ый)\s+бпла(?!\p{L})/iu.test(strikeClauses[0]);
}

/**
 * Return the first strike-UAV kpszsu message inside an explicit time window.
 */
export function findFirstStrikeUavMessage(
  messages,
  { windowStart, windowEnd, timeZone = DEFAULT_TIME_ZONE } = {},
) {
  const start = toDate(windowStart);
  const end = toDate(windowEnd);
  const candidates = (Array.isArray(messages) ? messages : [])
    .filter((message) => {
      const channel = normalizeChannel(message?.channel);
      if (channel && channel !== "kpszsu") return false;
      const date = messageDate(message);
      if (!date || (start && date < start) || (end && date > end)) return false;
      const text = messageText(message);
      return isStrikeUavText(text) && !isIsolatedReactiveUavText(text);
    })
    .sort(compareMessages);

  const message = candidates[0];
  if (!message) return null;
  const datetime = messageDate(message);
  return {
    ...message,
    datetime: messageDateValue(message) ?? datetime.toISOString(),
    timeLabel: timeLabelFor(datetime, timeZone),
    regionLabel: firstStrikeRegionMention(messageText(message)),
    sourceUrl: sourceUrlFor(message),
  };
}

function isoDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value ?? ""));
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

function humanDate(value) {
  const parts = isoDateParts(value);
  return parts ? `${parts.day} ${RUSSIAN_MONTHS[parts.month - 1]} ${parts.year}` : "";
}

function textMentionsDate(text, value) {
  const parts = isoDateParts(value);
  if (!parts) return false;
  const day = String(parts.day).padStart(2, "0");
  const month = String(parts.month).padStart(2, "0");
  const numeric = new RegExp(`(?:^|[^\\d])0?${parts.day}[./-]0?${parts.month}[./-]${parts.year}(?:[^\\d]|$)`, "u");
  const words = new RegExp(`(?:^|[^\\d])0?${parts.day}\\s+${RUSSIAN_MONTHS[parts.month - 1]}\\s+${parts.year}`, "iu");
  return numeric.test(text) || words.test(text) || text.includes(`${day}.${month}.${parts.year}`);
}

function looksLikeTimedChronicle(text) {
  const timedLines = text.match(/(?:^|\n)\s*[•·▪]?\s*\d{1,2}\s*[:.]\s*\d{2}/gu) ?? [];
  return timedLines.length > 0;
}

function chroniclePartLooksIncomplete(text) {
  if (
    /(?:продолжение|продовження)\s+(?:следует|будет|в\s+следующем|у\s+наступному)|(?:часть|частина)\s*1\s*(?:\/|из|з)\s*2/iu.test(text)
  ) {
    return true;
  }

  // Telegram text messages are limited to roughly 4096 code points. A part
  // close to that boundary which ends inside a chronology record is a strong
  // structural signal that the client split the report into another message.
  if ([...text].length < 4000 || !looksLikeTimedChronicle(text)) return false;
  const lastLine = text.trim().split(/\r?\n/u).at(-1)?.trim() ?? "";
  if (/[-–—,:;]$/u.test(lastLine)) return true;
  const timedTail = /^\s*[•·▪]?\s*\d{1,2}\s*[:.]\s*\d{2}/u.test(lastLine);
  const hasFinishedPayload =
    /(?:геран|гербер|умпк|искандер|бандерол|ракет|отрк|рсзо|циркон|кинжал|молни|ланцет|торнадо)/iu.test(lastLine);
  return timedTail && !hasFinishedPayload;
}

function messagesAreAdjacent(previous, current) {
  const previousId = Number(previous?.messageId ?? previous?.id);
  const currentId = Number(current?.messageId ?? current?.id);
  if (Number.isFinite(previousId) && Number.isFinite(currentId)) {
    return currentId > previousId && currentId - previousId <= 2;
  }
  const previousDate = messageDate(previous);
  const currentDate = messageDate(current);
  return Boolean(
    previousDate &&
      currentDate &&
      currentDate >= previousDate &&
      currentDate.getTime() - previousDate.getTime() <= 30 * 60 * 1000
  );
}

/** Find the requested daily chronicle and glue its adjacent Telegram parts. */
export function findAndMergeChronicle(
  messages,
  { startDate, endDate, now, continuationGraceMs = 0 } = {},
) {
  const sorted = (Array.isArray(messages) ? messages : [])
    .filter((message) => {
      const channel = normalizeChannel(message?.channel);
      return !channel || channel === "geranium_chronicles";
    })
    .sort(compareMessages);

  const anchorIndex = sorted.findIndex((message) => {
    const text = messageText(message);
    return (
      /хроник\p{L}*\s+ударов/iu.test(text) &&
      (!startDate || textMentionsDate(text, startDate)) &&
      (!endDate || textMentionsDate(text, endDate))
    );
  });
  if (anchorIndex < 0) return null;

  const selected = [sorted[anchorIndex]];
  for (let index = anchorIndex + 1; index < sorted.length && selected.length < 4; index += 1) {
    const previous = selected[selected.length - 1];
    const candidate = sorted[index];
    if (!messagesAreAdjacent(previous, candidate)) break;
    const text = messageText(candidate);
    const continuation =
      looksLikeTimedChronicle(text) ||
      (endDate && textMentionsDate(text, endDate) && /хронолог|\d{1,2}\s*[:.]\s*\d{2}/iu.test(text));
    if (!continuation) break;
    selected.push(candidate);
  }

  if (chroniclePartLooksIncomplete(messageText(selected.at(-1)))) return null;
  if (selected.length === 1 && continuationGraceMs > 0) {
    const publishedAt = messageDate(selected[0])?.getTime();
    const checkedAt = now instanceof Date ? now.getTime() : Date.parse(now ?? "");
    if (
      Number.isFinite(publishedAt)
      && Number.isFinite(checkedAt)
      && checkedAt >= publishedAt
      && checkedAt - publishedAt < continuationGraceMs
    ) {
      return null;
    }
  }

  return {
    text: selected.map(messageText).filter(Boolean).join("\n"),
    sourceUrls: unique(selected.map(sourceUrlFor)),
    messages: selected,
  };
}

function parseRussianDateHeading(line) {
  const words = /(?:^|\s)(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s+года?/iu.exec(line);
  if (words) {
    const month = RUSSIAN_MONTHS.indexOf(words[2].toLowerCase());
    if (month >= 0) return `${words[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(words[1])).padStart(2, "0")}`;
  }
  const numeric = /(?:^|\s)(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s|$)/u.exec(line);
  return numeric
    ? `${numeric[3]}-${String(Number(numeric[2])).padStart(2, "0")}-${String(Number(numeric[1])).padStart(2, "0")}`
    : null;
}

const CLOCK = String.raw`\d{1,2}\s*[:.]\s*\d{2}`;
const CLOCK_OR_RANGE = String.raw`${CLOCK}(?:\s*[-–—]\s*${CLOCK})?`;
const TIME_EXPRESSION = new RegExp(
  String.raw`^\s*[•·▪️▫◾\-*]?\s*(${CLOCK_OR_RANGE}(?:(?:\s*,\s*|\s+и\s+)${CLOCK_OR_RANGE})*)\s+(.+)$`,
  "iu",
);

function normalizeClock(value) {
  return value
    .replace(/\s*[.]\s*/gu, ":")
    .replace(/\s*[:]\s*/gu, ":")
    .replace(/\s*[-–—]\s*/gu, "-")
    .replace(/^(\d):/u, "0$1:")
    .replace(/-(\d):/gu, "-0$1:")
    .trim();
}

function splitTimeExpression(value) {
  return value
    .split(/\s*,\s*|\s+и\s+/iu)
    .map(normalizeClock)
    .filter(Boolean);
}

function minuteOfClock(value, takeEnd = false) {
  const clocks = [...String(value).matchAll(/(\d{1,2}):(\d{2})/gu)];
  const match = takeEnd ? clocks.at(-1) : clocks[0];
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function buildChronicleRecords(text, startDate, endDate) {
  const records = [];
  let date = startDate ?? null;
  let previousMinute = null;
  let current = null;

  const flush = () => {
    if (current) records.push(current);
    current = null;
  };

  for (const rawLine of String(text ?? "").replace(/\r\n?/gu, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const headingDate = parseRussianDateHeading(line);
    if (headingDate) {
      flush();
      date = headingDate;
      previousMinute = null;
      continue;
    }
    const match = TIME_EXPRESSION.exec(line);
    if (match) {
      flush();
      const times = splitTimeExpression(match[1]);
      const minute = minuteOfClock(times[0]);
      if (
        date === startDate &&
        endDate &&
        previousMinute != null &&
        minute != null &&
        previousMinute - minute > 6 * 60
      ) {
        date = endDate;
      }
      previousMinute = minute;
      current = { date: date ?? startDate ?? null, times, body: match[2], raw: line };
      continue;
    }
    if (current && !/^(?:хронолог|результат|на фото|вчера|сегодня)/iu.test(line)) {
      current.body += ` ${line.replace(/^\s*[•·▪️▫◾]\s*/u, "")}`;
      current.raw += `\n${line}`;
    }
  }
  flush();
  return records;
}

function geranMentioned(text) {
  return /(?<!\p{L})геран(?:ь|и|ей|ями|ях)?(?:-\d+)?(?!\p{L})/iu.test(text);
}

function regionMentions(text) {
  const found = [];
  for (const [name, pattern] of REGION_DEFINITIONS) {
    for (const match of text.matchAll(pattern)) found.push({ name, index: match.index, text: match[0] });
  }
  return found.sort((left, right) => left.index - right.index);
}

function cityMentions(text) {
  const found = [];
  for (const [name, region, pattern] of CITY_DEFINITIONS) {
    for (const match of text.matchAll(pattern)) found.push({ name, region, index: match.index, text: match[0] });
  }
  return found.sort((left, right) => left.index - right.index);
}

function cleanFallbackLocation(subject, removedText) {
  let value = subject;
  for (const part of removedText) value = value.replace(part, " ");
  return value
    .replace(/(?<!\p{L})(?:окрестност\p{L}*|пригород\p{L}*|район(?:е|а)?|н\.?\s*п\.?)(?!\p{L})/giu, " ")
    .replace(/(?<!\p{L})(?:области?|область|и|в|на|возле|около)(?!\p{L})/giu, " ")
    .replace(/[«»"'(),]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function splitSubject(subject) {
  const parts = [];
  const separator = /\s+(?:и|а\s+также)\s+|,\s*/giu;
  let start = 0;
  for (const match of subject.matchAll(separator)) {
    const text = subject.slice(start, match.index).trim();
    if (text) parts.push(text);
    start = match.index + match[0].length;
  }
  const tail = subject.slice(start).trim();
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts : [subject];
}

function nearestSegmentRegion(segments, index) {
  if (segments[index].regions.length > 0) return segments[index].regions[0].name;
  for (let cursor = index + 1; cursor < segments.length; cursor += 1) {
    if (segments[cursor].regions.length > 0) return segments[cursor].regions[0].name;
  }
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (segments[cursor].regions.length > 0) return segments[cursor].regions[0].name;
  }
  return null;
}

function locationsForSubject(subject) {
  const segments = splitSubject(subject).map((text) => ({
    text,
    regions: regionMentions(text),
    cities: cityMentions(text),
  }));
  const locations = [];
  const seen = new Set();

  const addLocation = (region, location) => {
    const key = `${region}\0${location}`;
    if (!seen.has(key)) {
      seen.add(key);
      locations.push({ region, location });
    }
  };

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const explicitRegion = segment.regions.length === 1 ? segment.regions[0].name : null;
    for (const city of segment.cities) {
      addLocation(explicitRegion ?? city.region, city.name);
    }

    const fallback = cleanFallbackLocation(segment.text, [
      ...segment.regions.map((region) => region.text),
      ...segment.cities.map((city) => city.text),
    ]);
    if (fallback && /\p{L}/u.test(fallback) && !/^(?:области?|область)$/iu.test(fallback)) {
      addLocation(nearestSegmentRegion(segments, index) ?? "Неопределённая область", fallback);
      continue;
    }

    if (segment.cities.length === 0) {
      for (const region of segment.regions) addLocation(region.name, "взрыв в области");
    }
  }

  if (locations.length === 0) {
    const fallback = cleanFallbackLocation(subject, []);
    if (fallback) locations.push({ region: "Неопределённая область", location: fallback });
  }

  return locations;
}

function isRecordInsideWindow(record, { startDate, endDate, startTime }) {
  if (startDate && record.date && record.date < startDate) return false;
  if (endDate && record.date && record.date > endDate) return false;
  if (startDate && record.date === startDate && startTime) {
    const cutoff = minuteOfClock(normalizeClock(startTime));
    const eventEnd = Math.max(...record.times.map((time) => minuteOfClock(time, true) ?? -1));
    if (cutoff != null && eventEnd < cutoff) return false;
  }
  return true;
}

function splitChronicleEventBody(body) {
  const conventional = /^(.+?)\s+[–—-]\s+(.+)$/u.exec(body);
  if (conventional) return [conventional[1], conventional[2]];

  // In live chronicles the separator is sometimes written without a space on
  // either side. Locate the closest dash before the event word so dashes in a
  // time range, a city (Ивано-Франковск), or «Герань-4» are not separators.
  const eventWord = /(?<!\p{L})(?:взрыв|удар|прил[её]т|пожар)\p{L}*/iu.exec(body);
  if (!eventWord) return null;
  let separatorIndex = -1;
  for (let index = 0; index < eventWord.index; index += 1) {
    if (body[index] === "-" || body[index] === "–" || body[index] === "—") {
      separatorIndex = index;
    }
  }
  if (separatorIndex <= 0) return null;
  const subject = body.slice(0, separatorIndex).trim();
  const details = body.slice(separatorIndex + 1).trim();
  return subject && details ? [subject, details] : null;
}

/**
 * Parse Geran-only chronology lines and group them as region -> location -> times.
 */
export function parseGeranChronology(
  text,
  { startDate, endDate, startTime = "00:00" } = {},
) {
  const records = buildChronicleRecords(text, startDate, endDate);
  const events = [];

  for (const record of records) {
    const separator = splitChronicleEventBody(record.body);
    if (!separator) continue;
    const [subject, details] = separator;
    if (!geranMentioned(details) || !isRecordInsideWindow(record, { startDate, endDate, startTime })) {
      continue;
    }
    for (const { region, location } of locationsForSubject(subject.trim())) {
      events.push({
        date: record.date,
        region,
        location,
        times: [...record.times],
        timeLabel: record.times.join(", "),
        text: record.raw,
      });
    }
  }

  const regions = [];
  const regionIndex = new Map();
  for (const event of events) {
    let region = regionIndex.get(event.region);
    if (!region) {
      region = { name: event.region, locations: [] };
      regionIndex.set(event.region, region);
      regions.push(region);
    }
    let location = region.locations.find((item) => item.name === event.location);
    if (!location) {
      location = { name: event.location, times: [] };
      region.locations.push(location);
    }
    location.times = unique([...location.times, ...event.times]);
  }

  return { events, regions };
}

function extractNumber(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

function launchMatches(text) {
  const matches = [];
  for (const [canonical, pattern] of LAUNCH_PLACE_DEFINITIONS) {
    for (const match of text.matchAll(pattern)) matches.push({ canonical, index: match.index });
  }
  matches.sort((left, right) => left.index - right.index);
  return unique(matches.map((match) => match.canonical));
}

export function normalizeLaunchPlace(value) {
  const text = String(value ?? "")
    .replace(/\([^)]*\)/gu, " ")
    .replace(/\s+[–—-]\s+(?:рф|росси\p{L}*|тот\p{L}*)\.?$/iu, "")
    .trim();
  const known = launchMatches(text);
  if (known.length > 0) return known[0];
  return text
    .replace(/^(?:из|с|з)\s+(?:район\p{L}*\s+)?/iu, "")
    .replace(/[.,;:]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function officialStatsFromText(text) {
  const launched = extractNumber(text, [
    /(?:атакува\p{L}*|атакова\p{L}*|запущен\p{L}*|запущено)\s+(\d{1,4})(?:-?(?:ма|ми))?\s+(?:ударн\p{L}*\s+)?(?:бпла|безпілотник\p{L}*)/iu,
    /(\d{1,4})(?:-?(?:ма|ми))?\s+ударн\p{L}*\s+(?:бпла|безпілотник\p{L}*)/iu,
  ]);
  const neutralized = extractNumber(text, [
    /(?:збито|сбито)\s*\/\s*(?:подавлено|локац(?:ійно|ионно)\s+втрачен\p{L}*)\s+(\d{1,4})/iu,
    /(?:знешкоджено|нейтрализовано|збито|сбито)\s+(\d{1,4})\s+(?:ворож\p{L}*\s+)?(?:бпла|безпілотник\p{L}*)/iu,
  ]);
  const ongoing = /атак\p{L}*[^.!?\n]{0,80}(?:триває|продолжается)/iu.test(text)
    ? true
    : /атак\p{L}*\s+(?:завершен\p{L}*|завершено)/iu.test(text)
      ? false
      : null;
  return { launched, neutralized, ongoing };
}

/** Parse the official kpszsu morning air-defence summary for reportDate. */
export function parseOfficialPpo(
  messages,
  { reportDate, timeZone = DEFAULT_TIME_ZONE } = {},
) {
  const candidates = (Array.isArray(messages) ? messages : []).filter((message) => {
    const channel = normalizeChannel(message?.channel);
    if (channel && channel !== "kpszsu") return false;
    const localDate = dateKeyForMessage(message, timeZone);
    if (reportDate && localDate && localDate !== reportDate) return false;
    const stats = officialStatsFromText(messageText(message));
    return stats.launched != null || stats.neutralized != null;
  });
  if (candidates.length === 0) return null;

  let launched = null;
  let neutralized = null;
  let ongoing = null;
  const launchPlaces = [];
  for (const message of candidates.sort(compareMessages)) {
    const text = messageText(message);
    const stats = officialStatsFromText(text);
    if (stats.launched != null) launched = stats.launched;
    if (stats.neutralized != null) neutralized = stats.neutralized;
    if (stats.ongoing != null) ongoing = stats.ongoing;
    launchPlaces.push(...launchMatches(text));
  }

  return {
    launched,
    neutralized,
    shotDownOrLost: neutralized,
    ongoing,
    statusOngoing: ongoing,
    launchPlaces: unique(launchPlaces),
    sourceUrl: sourceUrlFor(candidates.at(-1)),
    sourceUrls: unique(candidates.map(sourceUrlFor)),
    messages: candidates,
  };
}

function isActualLaunchText(text) {
  const negative =
    /(?:угроз\p{L}*|загроз\p{L}*|возможн\p{L}*|можлив\p{L}*|вероятн\p{L}*|ймовірн\p{L}*|подготовк\p{L}*|підготовк\p{L}*|ожида\p{L}*|очіку\p{L}*|не|ні)\s+(?:\S+\s+){0,5}(?:пуск|запуск)|(?:пуск|запуск)\p{L}*(?:\s+\S+){0,5}\s+(?:не|ні)\s+(?:было|було|підтверджен\p{L}*|подтвержден\p{L}*|зафиксирован\p{L}*|зафіксован\p{L}*)/iu;
  if (negative.test(text)) return false;
  return /(?:^|[^\p{L}])(?:пуск(?:и|ов|ів|у|а)?|запущен\p{L}*|запущено|стартува\p{L}*)(?!\p{L})/iu.test(text);
}

function hasStrikeUavMarker(text) {
  return /(?:геран\p{L}*|гербер\p{L}*|shahed|шах(?:ед)?\p{L}*|ударн\p{L}*\s+(?:бпла|безп[іи]лотн\p{L}*))/iu.test(text);
}

function confirmedStrikeLaunchClauses(text) {
  const clauses = textClauses(text);
  const confirmed = [];
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    if (!isActualLaunchText(clause) || !hasStrikeUavMarker(clause)) continue;
    confirmed.push(clause);

    // Some monitors put the confirmed locations on separate following lines.
    // Carry over only location-only clauses; a new launch/UAV statement starts
    // a separate semantic clause and must be evaluated on its own.
    for (let nextIndex = index + 1; nextIndex < clauses.length; nextIndex += 1) {
      const next = clauses[nextIndex];
      if (isActualLaunchText(next) || hasStrikeUavMarker(next)) break;
      if (launchMatches(next).length === 0) break;
      confirmed.push(next);
      index = nextIndex;
    }
  }
  return confirmed;
}

function isLaunchReplySupplement(message, previousLaunch) {
  const text = messageText(message);
  if (!/^\s*\+/u.test(text) || !/(?:\d+\s*)?(?:груп\p{L}*|борт\p{L}*|шт\.?)/iu.test(text)) {
    return false;
  }
  if (launchMatches(text).length === 0 || !previousLaunch) return false;

  const explicitReplyId =
    message?.replyToMessageId ??
    message?.replyToId ??
    message?.replyTo?.messageId ??
    message?.replyToMessage?.messageId;
  const previousId = Number(previousLaunch?.messageId ?? previousLaunch?.id);
  if (explicitReplyId != null) return Number(explicitReplyId) === previousId;

  const currentId = Number(message?.messageId ?? message?.id);
  if (Number.isFinite(currentId) && Number.isFinite(previousId)) {
    return currentId > previousId && currentId - previousId <= 2;
  }
  const currentDate = messageDate(message);
  const previousDate = messageDate(previousLaunch);
  return Boolean(
    currentDate &&
      previousDate &&
      currentDate >= previousDate &&
      currentDate.getTime() - previousDate.getTime() <= 30 * 60 * 1000
  );
}

/** Extract/deduplicate launch places from the three monitoring channels. */
export function parseLaunchPlaces(messages, { windowStart, windowEnd } = {}) {
  const start = toDate(windowStart);
  const end = toDate(windowEnd);
  const matches = [];
  const previousLaunchByChannel = new Map();
  const sorted = [...(Array.isArray(messages) ? messages : [])].sort(compareMessages);
  for (const message of sorted) {
    const channel = normalizeChannel(message?.channel);
    if (channel && !ALLOWED_MONITOR_CHANNELS.has(channel)) continue;
    const date = messageDate(message);
    if (start && date && date < start) continue;
    if (end && date && date > end) continue;
    const text = messageText(message);
    const previousLaunch = previousLaunchByChannel.get(channel || "_");
    const confirmedClauses = confirmedStrikeLaunchClauses(text);
    const confirmedLaunch = confirmedClauses.length > 0;
    const replySupplement = isLaunchReplySupplement(message, previousLaunch);
    if (!confirmedLaunch && !replySupplement) continue;
    const placeText = confirmedLaunch ? confirmedClauses.join("\n") : text;
    for (const canonical of launchMatches(placeText)) matches.push(canonical);
    if (confirmedLaunch) previousLaunchByChannel.set(channel || "_", message);
  }
  return unique(matches);
}

export const parseMonitoringLaunchPlaces = parseLaunchPlaces;

function displayDate(value) {
  const parts = isoDateParts(value);
  return parts
    ? `${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")}.${parts.year}`
    : String(value ?? "");
}

function regionInPrepositionalCase(value) {
  return String(value ?? "")
    .replace(/ская область$/u, "ской области")
    .replace(/цкая область$/u, "цкой области")
    .replace(/ая область$/u, "ой области")
    .replace(/яя область$/u, "ей области");
}

/**
 * Render model:
 * { startDate, endDate, firstDetection, chronology, ppo, launchPlaces,
 *   launchSource: "official" | "monitoring", sourceUrls }
 */
export function renderMarkdownReport(model = {}) {
  const chronology = model.chronology ?? {};
  const regions = chronology.regions ?? model.regions ?? [];
  const ppo = model.ppo ?? model.officialPpo ?? null;
  const launchPlaces = unique([
    ...(Array.isArray(model.launchPlaces) ? model.launchPlaces : []),
    ...(!model.launchPlaces && Array.isArray(ppo?.launchPlaces) ? ppo.launchPlaces : []),
  ]);
  const lines = [`${displayDate(model.startDate)}-${displayDate(model.endDate)}`, "", "Хронология"];

  if (model.firstDetection?.timeLabel) {
    const region = model.firstDetection.regionLabel
      ? ` в ${regionInPrepositionalCase(model.firstDetection.regionLabel)}`
      : "";
    lines.push(
      "",
      `Первые группы БПЛА обнаружены${region} в ${model.firstDetection.timeLabel}`,
    );
  }

  for (const region of regions) {
    lines.push("", region.name, "");
    for (const location of region.locations ?? []) {
      const times = Array.isArray(location.times) ? location.times.join(", ") : location.timeLabel;
      if (times && location.name) lines.push(`${times} - ${location.name}  `);
    }
  }

  const ongoing = ppo?.ongoing ?? ppo?.statusOngoing ?? model.ongoing;
  if (ongoing === true) lines.push("", "На данный момент налет продолжается");

  const launched = ppo?.launched;
  const neutralized = ppo?.neutralized ?? ppo?.shotDownOrLost ?? ppo?.shotDown;
  if (launched != null || neutralized != null || launchPlaces.length > 0) {
    lines.push("", "Сводки ППО", "");
    const countRows = [];
    if (launched != null) countRows.push(`Запущено ${launched} БПЛА`);
    if (neutralized != null) countRows.push(`Сбито/локационно потеряно ${neutralized}`);
    countRows.forEach((row, index) => {
      lines.push(index < countRows.length - 1 ? `${row}  ` : row);
    });
    if (launchPlaces.length > 0) {
      if (launched != null || neutralized != null) lines.push("");
      const official = model.launchSource === "official" || (!model.launchSource && Boolean(ppo));
      const label = official
        ? "Точки пусков по версии Повітряних сил"
        : "Точки пусков по данным мониторинговых каналов";
      lines.push(`${label}: ${launchPlaces.join(", ")}`);
    }
  }

  if (model.includeSources !== false && Array.isArray(model.sourceUrls) && model.sourceUrls.length > 0) {
    const links = unique(model.sourceUrls).map((url, index) => `[${index + 1}](${url})`);
    lines.push("", `Источники: ${links.join(", ")}`);
  }

  return `${lines.join("\n").replace(/\n{3,}/gu, "\n\n").trim()}\n`;
}
