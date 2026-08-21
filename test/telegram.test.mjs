import assert from "node:assert/strict";
import test from "node:test";

import { fetchTelegramHistory, parseTelegramPreview } from "../src/telegram.mjs";

function message({ id, datetime, text = "", reply = "", media = false }) {
  return `
    <div class="tgme_widget_message_wrap js-widget_message_wrap">
      <div data-post='fixture_channel/${id}' class="tgme_widget_message js-widget_message">
        <div class="tgme_widget_message_bubble">
          ${reply ? `
            <a class="tgme_widget_message_reply" href="https://t.me/another/1">
              <div class="tgme_widget_message_reply_body">
                <div class="tgme_widget_message_reply_author">Quoted author</div>
                <div class="tgme_widget_message_reply_text">${reply}</div>
                <div class="tgme_widget_message_text">nested quoted text</div>
              </div>
            </a>` : ""}
          ${media ? '<a class="tgme_widget_message_photo_wrap" style="background-image:url(photo.jpg)"></a>' : ""}
          ${text ? `<div dir="auto" class="js-message_text tgme_widget_message_text">${text}</div>` : ""}
          <div class="tgme_widget_message_footer">
            <a href="https://t.me/fixture_channel/${id}">
              <time datetime="${datetime}">time</time>
            </a>
          </div>
        </div>
      </div>
    </div>`;
}

function page(...messages) {
  return `<!doctype html><html><body>${messages.join("\n")}</body></html>`;
}

test("parseTelegramPreview extracts public text without reply previews or media", () => {
  const html = page(
    message({
      id: 80122,
      datetime: "2026-08-18T04:02:03+00:00",
      reply: "Previous &amp; unrelated message",
      media: true,
      text: "Хронология<br><br><b>Киевская область:</b><br>06:27 – <a href=\"https://example.test\">Киев</a> &amp; Бровары &#x1F4CD;",
    }),
    message({
      id: 80121,
      datetime: "2026-08-18T03:59:00+00:00",
      media: true,
    }),
  );

  assert.deepEqual(parseTelegramPreview(html), [{
    id: "fixture_channel/80122",
    channel: "fixture_channel",
    messageId: 80122,
    datetime: "2026-08-18T04:02:03+00:00",
    text: "Хронология\n\nКиевская область:\n06:27 – Киев & Бровары 📍",
    sourceUrl: "https://t.me/fixture_channel/80122",
    replyToMessageId: 1,
  }]);
});

test("fetchTelegramHistory paginates backwards, de-duplicates and sorts within an inclusive range", async () => {
  const pages = new Map([
    ["", page(
      message({ id: 105, datetime: "2026-08-18T10:05:00Z", text: "too late" }),
      message({ id: 104, datetime: "2026-08-18T10:04:00Z", text: "four" }),
      message({ id: 103, datetime: "2026-08-18T10:03:00Z", text: "three" }),
    )],
    ["103", page(
      message({ id: 103, datetime: "2026-08-18T10:03:00Z", text: "duplicate three" }),
      message({ id: 102, datetime: "2026-08-18T10:02:00Z", text: "two" }),
      message({ id: 101, datetime: "2026-08-18T10:01:00Z", text: "too early" }),
    )],
  ]);
  const requested = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const before = parsed.searchParams.get("before") ?? "";
    requested.push({ pathname: parsed.pathname, before });
    return { ok: true, text: async () => pages.get(before) ?? page() };
  };

  const result = await fetchTelegramHistory("@fixture_channel", {
    from: "2026-08-18T10:02:00Z",
    to: new Date("2026-08-18T10:04:00Z"),
    fetchImpl,
    maxPages: 5,
  });

  assert.deepEqual(requested, [
    { pathname: "/s/fixture_channel", before: "" },
    { pathname: "/s/fixture_channel", before: "103" },
  ]);
  assert.deepEqual(result.map(({ messageId, text }) => ({ messageId, text })), [
    { messageId: 102, text: "two" },
    { messageId: 103, text: "three" },
    { messageId: 104, text: "four" },
  ]);
});

test("fetchTelegramHistory uses media-only records as page cursors but never returns them", async () => {
  const requestedCursors = [];
  const fetchImpl = async (url) => {
    const before = new URL(url).searchParams.get("before") ?? "";
    requestedCursors.push(before);
    if (!before) {
      return {
        ok: true,
        text: async () => page(
          message({ id: 10, datetime: "2026-08-18T10:10:00Z", text: "ten" }),
          message({ id: 8, datetime: "2026-08-18T10:08:00Z", media: true }),
        ),
      };
    }
    return {
      ok: true,
      text: async () => page(message({ id: 7, datetime: "2026-08-18T10:07:00Z", text: "seven" })),
    };
  };

  const result = await fetchTelegramHistory("https://t.me/s/fixture_channel", {
    fetchImpl,
    maxPages: 2,
  });

  assert.deepEqual(requestedCursors, ["", "8"]);
  assert.deepEqual(result.map((entry) => entry.messageId), [7, 10]);
  assert.ok(result.every((entry) => entry.text && !("media" in entry)));
});

test("fetchTelegramHistory validates bounds and surfaces HTTP failures", async () => {
  await assert.rejects(
    fetchTelegramHistory("fixture_channel", {
      from: "2026-08-19T00:00:00Z",
      to: "2026-08-18T00:00:00Z",
      fetchImpl: async () => ({ ok: true, text: async () => page() }),
    }),
    /from must not be later than to/u,
  );

  await assert.rejects(
    fetchTelegramHistory("fixture_channel", {
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => "unavailable" }),
      maxPages: 1,
      retries: 0,
    }),
    /503/u,
  );
});
