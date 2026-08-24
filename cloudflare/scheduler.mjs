const DEFAULTS = Object.freeze({
  owner: "nufarets",
  repo: "geran-daily-report",
  ref: "main",
  workflow: "publish-report.yml",
});

const GITHUB_API_VERSION = "2026-03-10";
const MOSCOW_TIME_ZONE = "Europe/Moscow";

function moscowParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function schedulerMoment(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) throw new TypeError("scheduled time must be valid");
  const parts = moscowParts(value);
  return {
    reportDate: parts.year + "-" + parts.month + "-" + parts.day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function isDispatchMoment({ hour, minute }) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute % 5 !== 0) return false;
  const minutes = hour * 60 + minute;
  return minutes >= 8 * 60 + 10 && minutes <= 12 * 60 + 10;
}

function githubHeaders(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: "Bearer " + token,
    "user-agent": "geran-daily-report-scheduler/1.0",
    "x-github-api-version": GITHUB_API_VERSION,
  };
}

async function responseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function dispatchIfReportMissing({
  env,
  scheduledTime = new Date(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const moment = schedulerMoment(scheduledTime);
  if (!isDispatchMoment(moment)) {
    return { status: "outside-window", reportDate: moment.reportDate };
  }

  const owner = env?.GITHUB_OWNER || DEFAULTS.owner;
  const repo = env?.GITHUB_REPO || DEFAULTS.repo;
  const ref = env?.GITHUB_REF || DEFAULTS.ref;
  const workflow = env?.GITHUB_WORKFLOW || DEFAULTS.workflow;
  const token = env?.GITHUB_ACTIONS_TOKEN;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("GITHUB_ACTIONS_TOKEN secret is required");
  }

  const reportPath = "reports/" + encodeURIComponent(moment.reportDate + ".md");
  const contentsUrl =
    "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + reportPath
    + "?ref=" + encodeURIComponent(ref);
  const reportResponse = await fetchImpl(contentsUrl, {
    headers: githubHeaders(token.trim()),
  });

  if (reportResponse.status === 200) {
    return { status: "already-published", reportDate: moment.reportDate };
  }
  if (reportResponse.status !== 404) {
    const body = await responseBody(reportResponse);
    throw new Error(
      "GitHub report check failed (" + reportResponse.status + "): " + JSON.stringify(body),
    );
  }

  const finalAttempt = moment.hour === 12 && moment.minute === 10;
  const dispatchUrl =
    "https://api.github.com/repos/" + owner + "/" + repo + "/actions/workflows/"
    + encodeURIComponent(workflow) + "/dispatches";
  const dispatchResponse = await fetchImpl(dispatchUrl, {
    method: "POST",
    headers: {
      ...githubHeaders(token.trim()),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        report_date: moment.reportDate,
        force_update: "false",
        external_retry: finalAttempt ? "false" : "true",
      },
    }),
  });
  const body = await responseBody(dispatchResponse);
  if (dispatchResponse.status !== 200 && dispatchResponse.status !== 204) {
    throw new Error(
      "GitHub workflow dispatch failed (" + dispatchResponse.status + "): " + JSON.stringify(body),
    );
  }

  return {
    status: "dispatched",
    reportDate: moment.reportDate,
    finalAttempt,
    runUrl: body && typeof body === "object" ? body.html_url ?? null : null,
  };
}

export default {
  async scheduled(controller, env) {
    const result = await dispatchIfReportMissing({
      env,
      scheduledTime: new Date(controller.scheduledTime),
    });
    console.log(JSON.stringify(result));
  },
};
