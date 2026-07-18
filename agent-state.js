(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.JobAgentState = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const RUNNING_STATUSES = new Set([
    "preflight",
    "collecting_list",
    "queue_ready",
    "opening_detail",
    "waiting_detail",
    "extracting",
    "saving",
    "filtering",
    "retrying"
  ]);
  const PAUSED_STATUSES = new Set(["paused_user", "paused_auth", "paused_captcha"]);
  const TERMINAL_STATUSES = new Set(["stopped", "completed", "error"]);

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeDetailLink(value) {
    const raw = cleanText(value);
    if (!raw) return "";

    try {
      const url = new URL(raw, "https://www.zhipin.com/");
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || !(host === "zhipin.com" || host.endsWith(".zhipin.com"))) return "";
      const match = url.pathname.match(/^\/job_detail\/[^/?#]+/);
      return match ? `${url.origin}${match[0]}` : "";
    } catch (error) {
      return "";
    }
  }

  function jobKey(job) {
    const link = normalizeDetailLink(job?.link || job?.url);
    if (link) return link;
    return [job?.title, job?.company, job?.city, job?.salary].map(cleanText).join("|");
  }

  function cloneJob(job) {
    const value = { ...(job || {}) };
    const link = normalizeDetailLink(value.link || value.url);
    if (link) value.link = link;
    delete value.url;
    return value;
  }

  function cloneState(state) {
    const source = state || {};
    return {
      ...source,
      criteria: { ...(source.criteria || {}) },
      candidateProfile: { ...(source.candidateProfile || {}) },
      queue: Array.isArray(source.queue) ? source.queue.slice() : [],
      seenKeys: Array.isArray(source.seenKeys) ? source.seenKeys.slice() : [],
      currentJob: source.currentJob ? { ...source.currentJob } : null,
      counts: { ...(source.counts || {}) },
      failures: Array.isArray(source.failures) ? source.failures.slice() : [],
      search: {
        ...(source.search || {}),
        visitedPageUrls: Array.isArray(source.search?.visitedPageUrls) ? source.search.visitedPageUrls.slice() : []
      }
    };
  }

  function createRunState(criteria = {}, candidateProfile = {}, now = new Date().toISOString()) {
    return {
      runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "preflight",
      phase: "preflight",
      criteria: { ...criteria },
      candidateProfile: { ...candidateProfile },
      queue: [],
      seenKeys: [],
      cursor: 0,
      currentJob: null,
      counts: {
        discovered: 0,
        queued: 0,
        processed: 0,
        detailsCompleted: 0,
        saved: 0,
        failed: 0,
        skipped: 0,
        missingFields: 0,
        responseCaptured: 0,
        domFallback: 0
      },
      failures: [],
      search: {
        page: 1,
        scrollRounds: 0,
        stagnantRounds: 0,
        exhausted: false,
        currentUrl: "",
        nextPageUrl: "",
        visitedPageUrls: [],
        diagnostics: null
      },
      retryCount: 0,
      userAction: null,
      tabId: null,
      createdAt: now,
      updatedAt: now
    };
  }

  function appendJobs(state, jobs, now = new Date().toISOString()) {
    const next = cloneState(state);
    const seen = new Set(next.seenKeys || []);
    const incoming = Array.isArray(jobs) ? jobs : [];

    incoming.forEach((job) => {
      const value = cloneJob(job);
      const key = jobKey(value);
      if (!key || seen.has(key)) return;
      seen.add(key);
      next.queue.push(value);
    });

    next.seenKeys = [...seen];
    next.counts.discovered = next.queue.length;
    next.counts.queued = next.queue.length;
    next.currentJob = next.queue[next.cursor] || null;
    next.updatedAt = now;
    return next;
  }

  function recordJobResult(state, result, now = new Date().toISOString()) {
    const next = cloneState(state);
    const outcome = result || {};
    const current = next.queue[next.cursor] || {};
    const status = ["saved", "skipped", "failed"].includes(outcome.status) ? outcome.status : "failed";

    next.cursor += 1;
    next.counts.processed += 1;
    next.counts.detailsCompleted = Number(next.counts.detailsCompleted) || 0;
    if (outcome.detailCompleted) next.counts.detailsCompleted += 1;
    next.counts.responseCaptured = Number(next.counts.responseCaptured) || 0;
    next.counts.domFallback = Number(next.counts.domFallback) || 0;
    if (outcome.collectionMethod === "response") next.counts.responseCaptured += 1;
    if (outcome.collectionMethod === "dom") next.counts.domFallback += 1;
    next.counts[status] += 1;
    next.counts.missingFields += Array.isArray(outcome.missingFields) ? outcome.missingFields.length : 0;

    if (status === "failed" || status === "skipped") {
      next.failures.push({
        key: jobKey(outcome.job || current),
        title: cleanText((outcome.job || current).title),
        link: normalizeDetailLink((outcome.job || current).link),
        status,
        stage: cleanText(outcome.stage),
        reason: cleanText(outcome.reason) || "未提供原因",
        retryCount: Number(outcome.retryCount) || 0,
        at: now
      });
    }

    next.currentJob = next.queue[next.cursor] || null;
    next.updatedAt = now;
    return next;
  }

  function markSearchProgress(state, patch = {}, now = new Date().toISOString()) {
    const next = cloneState(state);
    const visitedPageUrls = [...new Set([
      ...(Array.isArray(next.search?.visitedPageUrls) ? next.search.visitedPageUrls : []),
      ...(Array.isArray(patch.visitedPageUrls) ? patch.visitedPageUrls : [])
    ].map(cleanText).filter(Boolean))];
    next.search = {
      ...next.search,
      ...patch,
      page: Math.max(Number(next.search?.page) || 1, Number(patch.page) || 1),
      visitedPageUrls
    };
    next.updatedAt = now;
    return next;
  }

  function isRunning(status) {
    return RUNNING_STATUSES.has(status);
  }

  function isPaused(status) {
    return PAUSED_STATUSES.has(status);
  }

  function isTerminal(status) {
    return TERMINAL_STATUSES.has(status);
  }

  return {
    RUNNING_STATUSES: [...RUNNING_STATUSES],
    PAUSED_STATUSES: [...PAUSED_STATUSES],
    TERMINAL_STATUSES: [...TERMINAL_STATUSES],
    createRunState,
    appendJobs,
    recordJobResult,
    markSearchProgress,
    normalizeDetailLink,
    isRunning,
    isPaused,
    isTerminal
  };
});
