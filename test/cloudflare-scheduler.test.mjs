import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchIfReportMissing,
  isDispatchMoment,
  schedulerMoment,
} from "../cloudflare/scheduler.mjs";

function response(status, body = "") {
  const payload = status === 204 ? null : typeof body === "string" ? body : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("converts UTC cron time to the Moscow report date and dispatch window", () => {
  assert.deepEqual(schedulerMoment("2026-08-24T05:10:00Z"), {
    reportDate: "2026-08-24",
    hour: 8,
    minute: 10,
  });
  assert.equal(isDispatchMoment({ hour: 8, minute: 10 }), true);
  assert.equal(isDispatchMoment({ hour: 12, minute: 10 }), true);
  assert.equal(isDispatchMoment({ hour: 8, minute: 5 }), false);
  assert.equal(isDispatchMoment({ hour: 12, minute: 15 }), false);
});

test("does nothing outside the Moscow retry window", async () => {
  let fetchCalls = 0;
  const result = await dispatchIfReportMissing({
    env: {},
    scheduledTime: "2026-08-24T05:05:00Z",
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error("must not fetch");
    },
  });
  assert.deepEqual(result, { status: "outside-window", reportDate: "2026-08-24" });
  assert.equal(fetchCalls, 0);
});

test("does not dispatch when the dated report already exists", async () => {
  const requests = [];
  const result = await dispatchIfReportMissing({
    env: { GITHUB_ACTIONS_TOKEN: "secret" },
    scheduledTime: "2026-08-24T05:10:00Z",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response(200, { path: "reports/2026-08-24.md" });
    },
  });
  assert.equal(result.status, "already-published");
  assert.equal(requests.length, 1);
  assert.doesNotMatch(JSON.stringify(requests[0].options.headers), /secret/u);
});

test("dispatches an idempotent soft retry when the report is missing", async () => {
  const requests = [];
  const result = await dispatchIfReportMissing({
    env: { GITHUB_ACTIONS_TOKEN: "top-secret-token" },
    scheduledTime: "2026-08-24T05:15:00Z",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (requests.length === 1) return response(404, { message: "Not Found" });
      return response(200, {
        workflow_run_id: 123,
        html_url: "https://github.com/nufarets/geran-daily-report/actions/runs/123",
      });
    },
  });

  assert.equal(result.status, "dispatched");
  assert.equal(result.finalAttempt, false);
  assert.equal(result.runUrl, "https://github.com/nufarets/geran-daily-report/actions/runs/123");
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /actions\/workflows\/publish-report\.yml\/dispatches$/u);
  assert.equal(requests[1].options.headers.authorization, "Bearer top-secret-token");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    ref: "main",
    inputs: {
      report_date: "2026-08-24",
      force_update: "false",
      external_retry: "true",
    },
  });
});

test("marks the 12:10 dispatch as the final hard attempt", async () => {
  const requests = [];
  const result = await dispatchIfReportMissing({
    env: { GITHUB_ACTIONS_TOKEN: "secret" },
    scheduledTime: "2026-08-24T09:10:00Z",
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return requests.length === 1 ? response(404) : response(204);
    },
  });

  assert.equal(result.finalAttempt, true);
  assert.equal(JSON.parse(requests[1].options.body).inputs.external_retry, "false");
});

test("fails closed when the report check or workflow dispatch is unavailable", async () => {
  await assert.rejects(dispatchIfReportMissing({
    env: { GITHUB_ACTIONS_TOKEN: "secret" },
    scheduledTime: "2026-08-24T05:10:00Z",
    fetchImpl: async () => response(503, { message: "unavailable" }),
  }), /report check failed \(503\)/u);

  let calls = 0;
  await assert.rejects(dispatchIfReportMissing({
    env: { GITHUB_ACTIONS_TOKEN: "secret" },
    scheduledTime: "2026-08-24T05:10:00Z",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response(404)
        : response(403, { message: "Resource not accessible by personal access token" });
    },
  }), /workflow dispatch failed \(403\)/u);
});
