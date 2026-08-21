const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "div", "dl", "dt", "dd",
  "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "ol", "p", "pre", "section", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

const NAMED_ENTITIES = new Map(Object.entries({
  amp: "&",
  apos: "'",
  copy: "©",
  emsp: "\u2003",
  ensp: "\u2002",
  gt: ">",
  hellip: "…",
  laquo: "«",
  lrm: "\u200e",
  lt: "<",
  mdash: "—",
  nbsp: "\u00a0",
  ndash: "–",
  quot: "\"",
  raquo: "»",
  reg: "®",
  rlm: "\u200f",
  shy: "\u00ad",
  thinsp: "\u2009",
  trade: "™",
  zwj: "\u200d",
  zwnj: "\u200c",
}));

function decodeCodePoint(raw, radix) {
  const value = Number.parseInt(raw, radix);
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return "\ufffd";
  }
  return String.fromCodePoint(value);
}

function decodeHtmlEntities(value) {
  return String(value ?? "").replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/giu,
    (entity, decimal, hexadecimal, named) => {
      if (decimal) return decodeCodePoint(decimal, 10);
      if (hexadecimal) return decodeCodePoint(hexadecimal, 16);
      return NAMED_ENTITIES.get(named.toLowerCase()) ?? entity;
    },
  );
}

function findTagEnd(html, start) {
  let quote = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === "\"" || character === "'") {
      // A quote opens an attribute value only when it follows '='. Telegram
      // occasionally emits malformed reply tags such as `href="..." "="">`.
      // Treating every stray quote as an opener makes the scanner consume the
      // following message and assign its footer timestamp to the previous one.
      let previous = index - 1;
      while (previous > start && /\s/u.test(html[previous])) previous -= 1;
      if (html[previous] === "=") quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function parseAttributes(openingTag) {
  const attributes = {};
  const tagName = openingTag.match(/^<\s*[\w:-]+/u)?.[0] ?? "";
  const body = openingTag.slice(tagName.length, openingTag.endsWith(">") ? -1 : undefined);
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of body.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function parseHtmlNodes(input) {
  const html = String(input ?? "");
  const nodes = [];
  const stack = [];
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start === -1) break;

    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      cursor = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const end = findTagEnd(html, start);
    if (end === -1) break;
    const raw = html.slice(start, end + 1);

    if (/^<\s*\//u.test(raw)) {
      const name = raw.match(/^<\s*\/\s*([\w:-]+)/u)?.[1]?.toLowerCase();
      if (name) {
        let matchIndex = -1;
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          if (stack[index].name === name) {
            matchIndex = index;
            break;
          }
        }
        if (matchIndex !== -1) {
          for (let index = stack.length - 1; index >= matchIndex; index -= 1) {
            stack[index].innerEnd = start;
            stack[index].end = end + 1;
          }
          stack.length = matchIndex;
        }
      }
      cursor = end + 1;
      continue;
    }

    if (/^<\s*[!?]/u.test(raw)) {
      cursor = end + 1;
      continue;
    }

    const name = raw.match(/^<\s*([\w:-]+)/u)?.[1]?.toLowerCase();
    if (!name) {
      cursor = end + 1;
      continue;
    }

    const node = {
      name,
      attributes: parseAttributes(raw),
      start,
      innerStart: end + 1,
      innerEnd: end + 1,
      end: end + 1,
      parent: stack.at(-1) ?? null,
    };
    nodes.push(node);

    const selfClosing = /\/\s*>$/u.test(raw) || VOID_TAGS.has(name);
    if (!selfClosing) stack.push(node);
    cursor = end + 1;
  }

  for (const node of stack) {
    node.innerEnd = html.length;
    node.end = html.length;
  }
  return { html, nodes };
}

function classTokens(node) {
  return String(node?.attributes?.class ?? "").split(/\s+/u).filter(Boolean);
}

function hasClass(node, className) {
  return classTokens(node).includes(className);
}

function belongsToMessage(node, messageNode) {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.attributes["data-post"]) return ancestor === messageNode;
  }
  return false;
}

function isInsideReplyPreview(node, messageNode) {
  for (let ancestor = node.parent; ancestor && ancestor !== messageNode; ancestor = ancestor.parent) {
    if (classTokens(ancestor).some((token) => (
      token === "tgme_widget_message_reply"
      || token.startsWith("tgme_widget_message_reply_")
      || token === "tgme_widget_message_quote"
      || token.startsWith("tgme_widget_message_quote_")
    ))) return true;
  }
  return false;
}

function htmlToText(value) {
  let html = String(value ?? "")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<br\b[^>]*\/?>/giu, "\n")
    .replace(/<hr\b[^>]*\/?>/giu, "\n")
    .replace(/<\/?([a-z][\w:-]*)\b[^>]*>/giu, (tag, name) => (BLOCK_TAGS.has(name.toLowerCase()) ? "\n" : ""))
    .replace(/<[^>]*>/gu, "");

  html = decodeHtmlEntities(html)
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u00a0\u2002\u2003\u2009]/gu, " ")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/gu, "")
    .trim();
  return html;
}

function parseIdentity(raw) {
  const match = String(raw ?? "").trim().match(/^@?([^/?#\s]+)\/(\d+)$/u);
  if (!match) return null;
  const messageId = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(messageId) || messageId < 1) return null;
  return { channel: match[1], messageId };
}

function parseTelegramRecords(input) {
  const { html, nodes } = parseHtmlNodes(input);
  const messageNodes = nodes.filter((node) => (
    hasClass(node, "tgme_widget_message")
    && node.attributes["data-post"]
    && parseIdentity(node.attributes["data-post"])
  ));

  return messageNodes.map((messageNode) => {
    const identity = parseIdentity(messageNode.attributes["data-post"]);
    const ownedNodes = nodes.filter((node) => (
      node !== messageNode
      && node.start >= messageNode.innerStart
      && node.end <= messageNode.innerEnd
      && belongsToMessage(node, messageNode)
    ));

    const textNodes = ownedNodes.filter((node) => (
      hasClass(node, "tgme_widget_message_text")
      && !isInsideReplyPreview(node, messageNode)
      && !ownedNodes.some((candidate) => (
        candidate !== node
        && hasClass(candidate, "tgme_widget_message_text")
        && node.start >= candidate.innerStart
        && node.end <= candidate.innerEnd
      ))
    ));
    const text = textNodes
      .map((node) => htmlToText(html.slice(node.innerStart, node.innerEnd)))
      .filter(Boolean)
      .join("\n")
      .trim();

    const timeNodes = ownedNodes.filter((node) => node.name === "time" && node.attributes.datetime);
    const matchingTimeNodes = timeNodes.filter((node) => {
      for (let ancestor = node.parent; ancestor && ancestor !== messageNode; ancestor = ancestor.parent) {
        if (ancestor.name !== "a" || typeof ancestor.attributes.href !== "string") continue;
        const match = ancestor.attributes.href.match(/\/([^/?#]+)\/(\d+)(?:[/?#]|$)/u);
        if (
          match
          && match[1].toLowerCase() === identity.channel.toLowerCase()
          && Number.parseInt(match[2], 10) === identity.messageId
        ) return true;
      }
      return false;
    });
    const datetime = (matchingTimeNodes.at(-1) ?? timeNodes.at(-1))?.attributes.datetime ?? null;
    const replyNode = ownedNodes.find((node) => (
      hasClass(node, "tgme_widget_message_reply")
      && typeof node.attributes.href === "string"
    ));
    const replyMatch = replyNode?.attributes.href?.match(/\/([^/?#]+)\/(\d+)(?:[/?#]|$)/u);
    const replyToMessageId = replyMatch ? Number.parseInt(replyMatch[2], 10) : null;
    const id = `${identity.channel}/${identity.messageId}`;

    return {
      id,
      channel: identity.channel,
      messageId: identity.messageId,
      datetime,
      text,
      sourceUrl: `https://t.me/${id}`,
      ...(Number.isSafeInteger(replyToMessageId) ? { replyToMessageId } : {}),
    };
  });
}

/**
 * Parse public Telegram channel preview HTML into textual messages.
 * Reply previews and media-only messages are deliberately omitted.
 */
export function parseTelegramPreview(html) {
  return parseTelegramRecords(html).filter((message) => message.text);
}

function normalizeHandle(value) {
  let handle = String(value ?? "").trim();
  if (/^https?:\/\//iu.test(handle)) {
    let url;
    try {
      url = new URL(handle);
    } catch {
      throw new TypeError(`Invalid Telegram handle: ${value}`);
    }
    const parts = url.pathname.split("/").filter(Boolean);
    handle = parts[0]?.toLowerCase() === "s" ? parts[1] : parts[0];
  }
  handle = String(handle ?? "").replace(/^@/u, "").replace(/^s\//u, "").replace(/\/$/u, "");
  if (!/^[a-z\d_]+$/iu.test(handle)) throw new TypeError(`Invalid Telegram handle: ${value}`);
  return handle;
}

function parseBoundary(value, label, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`Invalid ${label} date`);
  return timestamp;
}

function messageTimestamp(message) {
  const timestamp = Date.parse(message.datetime ?? "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecognizableTerminalPage(html, channel) {
  const historyContainer = /<(?:section|div)\b[^>]*\bclass\s*=\s*(?:"[^"]*\btgme_channel_history\b[^"]*"|'[^']*\btgme_channel_history\b[^']*')[^>]*>/iu;
  const channelUrl = new RegExp(
    String.raw`https?:\/\/t\.me\/(?:s\/)?${escapeRegExp(channel)}(?=[/"'?#<\s])`,
    "iu",
  );
  return historyContainer.test(html) && channelUrl.test(html);
}

async function responseText(response, url) {
  if (typeof response === "string") return response;
  if (!response || typeof response.text !== "function") {
    throw new TypeError(`Invalid response while fetching ${url}`);
  }
  if (response.ok === false) {
    const status = response.status ? ` (${response.status})` : "";
    throw new Error(`Telegram request failed${status}: ${url}`);
  }
  return response.text();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPage(fetchImpl, url, { retries, timeoutMs }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "geran-daily-report/1.0 (+public Telegram preview)",
        },
        ...(controller ? { signal: controller.signal } : {}),
      });
      return await responseText(response, url);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(250 * (2 ** attempt));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError;
}

/**
 * Fetch a bounded slice of a public Telegram channel, following ?before= cursors.
 * Results are de-duplicated and sorted chronologically (oldest first).
 */
export async function fetchTelegramHistory(handle, options = {}) {
  const channel = normalizeHandle(handle);
  const fromTimestamp = parseBoundary(options.from, "from", Number.NEGATIVE_INFINITY);
  const toTimestamp = parseBoundary(options.to, "to", Number.POSITIVE_INFINITY);
  if (fromTimestamp > toTimestamp) throw new RangeError("from must not be later than to");

  const maxPages = options.maxPages ?? 50;
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new RangeError("maxPages must be a positive integer");

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(retries) || retries < 0) throw new RangeError("retries must be a non-negative integer");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");

  const expectedChannel = channel.toLowerCase();
  const messagesById = new Map();
  const usedCursors = new Set();
  let before = null;
  let completedFiniteRange = !Number.isFinite(fromTimestamp);

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`https://t.me/s/${channel}`);
    if (before !== null) url.searchParams.set("before", String(before));
    const requestUrl = url.toString();
    const html = await fetchPage(fetchImpl, requestUrl, { retries, timeoutMs });
    const allPageRecords = parseTelegramRecords(html);
    const pageRecords = allPageRecords
      .filter((message) => message.channel.toLowerCase() === expectedChannel);
    if (!pageRecords.length) {
      // Telegram's real end-of-history response is an empty, recognizable
      // channel history page. Only accept it after at least one cursor hop;
      // an empty first response or generic/challenge HTML must fail closed.
      if (
        before !== null
        && allPageRecords.length === 0
        && isRecognizableTerminalPage(html, channel)
      ) {
        completedFiniteRange = true;
        break;
      }
      throw new Error(`Telegram preview returned no message records for ${channel}`);
    }

    const invalidTimestamp = pageRecords.find((message) => messageTimestamp(message) === null);
    if (invalidTimestamp) {
      throw new Error(`Telegram message ${invalidTimestamp.id} has no valid timestamp`);
    }

    for (const message of pageRecords) {
      const timestamp = messageTimestamp(message);
      if (
        message.text
        && timestamp !== null
        && timestamp >= fromTimestamp
        && timestamp <= toTimestamp
        && !messagesById.has(message.id)
      ) {
        messagesById.set(message.id, message);
      }
    }

    const pageTimestamps = pageRecords.map(messageTimestamp).filter((timestamp) => timestamp !== null);
    if (Number.isFinite(fromTimestamp) && Math.min(...pageTimestamps) <= fromTimestamp) {
      completedFiniteRange = true;
      break;
    }

    const oldestMessageId = Math.min(...pageRecords.map((message) => message.messageId));
    if (!Number.isSafeInteger(oldestMessageId)) {
      throw new Error(`Telegram preview returned an invalid cursor for ${channel}`);
    }
    if (usedCursors.has(oldestMessageId) || oldestMessageId === before) {
      throw new Error(`Telegram pagination stalled at message ${oldestMessageId} for ${channel}`);
    }
    usedCursors.add(oldestMessageId);
    before = oldestMessageId;
  }

  if (!completedFiniteRange) {
    throw new Error(`Telegram history for ${channel} exceeded maxPages=${maxPages} before reaching from`);
  }

  return [...messagesById.values()].sort((left, right) => {
    const timeDifference = messageTimestamp(left) - messageTimestamp(right);
    if (timeDifference) return timeDifference;
    return left.messageId - right.messageId;
  });
}
