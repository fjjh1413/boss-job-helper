self.window = self;
importScripts("shared.js", "analyzer.js", "storage.js", "agent-state.js");

const AGENT_STATE_KEY = "bossJobHelperAgentState";
const RUNNER_URL = "runner.html";
const DEFAULT_DELAY_MS = BossJobConfig.DEFAULT_DELAY_MS;
const DEFAULT_MAX_RETRIES = 2;

let stateWriteQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "后台 Agent 操作失败。" }));
  return true;
});

chrome.runtime.onStartup.addListener(() => {
  recoverRunner().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  recoverRunner().catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getAgentState()
    .then((state) => {
      if (state.runnerTabId === tabId && (JobAgentState.isRunning(state.status) || JobAgentState.isPaused(state.status))) {
        return updateState((current) => ({
          ...current,
          status: "error",
          phase: "error",
          message: "Agent Runner 标签页被关闭，任务无法继续，请重新启动。",
          userAction: "restart_agent"
        }));
      }
      if (state.tabId !== tabId && state.detailTabId !== tabId) return null;
      if (!JobAgentState.isRunning(state.status)) return null;
      return updateState((current) => ({
        ...current,
        status: "paused_user",
        phase: "paused_user",
        tabId: null,
        detailTabId: null,
        message: "BOSS 工作标签页已关闭，任务已暂停。点击继续后会重新打开搜索页。",
        userAction: "reopen_boss"
      }));
    })
    .catch(() => {});
});

async function handleMessage(message, sender) {
  if (!message || !message.type) throw new Error("无效的 Agent 消息。 ");

  switch (message.type) {
    case "AGENT_START":
      return { state: await startAgent(message.criteria || {}, message.candidateProfile || {}) };
    case "AGENT_PAUSE":
      return { state: await pauseAgent() };
    case "AGENT_STOP":
      return { state: await stopAgent() };
    case "AGENT_STATUS":
    case "AGENT_RUNNER_STATE":
      return { state: await getAgentState() };
    case "AGENT_RUNNER_READY":
      return { state: await runnerReady(sender) };
    case "AGENT_STATE_PATCH":
      await assertRunner(sender);
      return { state: await updateState((state) => {
        const patch = safeStatePatch(message.patch);
        const next = { ...state, ...patch };
        if (patch.search) next.search = JobAgentState.markSearchProgress(state, patch.search).search;
        return next;
      }) };
    case "AGENT_APPEND_JOBS":
      await assertRunner(sender);
      return { state: await appendJobs(message.jobs, message.search) };
    case "AGENT_RECORD_RESULT":
      await assertRunner(sender);
      return { state: await recordJobResult(message.result) };
    case "AGENT_RUNNER_COMPLETE":
      await assertRunner(sender);
      return { state: await completeAgent() };
    case "AGENT_RUNNER_HEARTBEAT":
      await assertRunner(sender);
      return { state: await updateState((state) => ({ ...state, runnerLastSeen: new Date().toISOString() })) };
    default:
      throw new Error(`不支持的 Agent 消息：${message.type}`);
  }
}

async function startAgent(rawCriteria, rawCandidateProfile) {
  const current = await getAgentState();
  if (JobAgentState.isRunning(current.status)) return current;

  if (JobAgentState.isPaused(current.status)) {
    const resumed = await updateState((state) => ({
      ...state,
      status: "preflight",
      phase: "preflight",
      userAction: null,
      stopRequested: false,
      message: "正在恢复暂停的 Agent 任务。"
    }));
    if (resumed.runnerTabId) {
      chrome.tabs.sendMessage(resumed.runnerTabId, { type: "AGENT_RUNNER_RESUME" }, () => {
        void chrome.runtime.lastError;
      });
      return resumed;
    }
    return launchRunner(resumed);
  }

  const criteria = normalizeCriteria(rawCriteria);
  const criteriaError = validateCriteria(criteria);
  if (criteriaError) throw new Error(criteriaError);

  const candidateProfile = normalizeCandidateProfile(rawCandidateProfile);
  let state = JobAgentState.createRunState(criteria, candidateProfile);
  state = await updateState(() => state);

  return launchRunner(state);
}

async function launchRunner(state) {
  try {
    const previousRunnerTabId = state.runnerTabId;
    if (previousRunnerTabId) {
      await updateState((currentState) => currentState.runnerTabId === previousRunnerTabId
        ? { ...currentState, runnerTabId: null }
        : currentState);
      try {
        await chrome.tabs.remove(previousRunnerTabId);
      } catch (error) {
      }
    }

    const runner = await chrome.tabs.create({ url: chrome.runtime.getURL(RUNNER_URL), active: false });
    return updateState((currentState) => ({
      ...currentState,
      runnerTabId: runner.id || null,
      message: "Agent Runner 已启动，等待执行。"
    }));
  } catch (error) {
    return updateState((currentState) => ({
      ...currentState,
      status: "error",
      phase: "error",
      message: `无法启动 Agent Runner：${error.message || "未知错误"}`
    }));
  }
}

async function stopAgent() {
  const state = await updateState((current) => {
    if (!JobAgentState.isRunning(current.status) && !JobAgentState.isPaused(current.status)) return current;
    return { ...current, status: "stopped", phase: "stopped", message: "正在停止 Agent。", stopRequested: true };
  });

  if (state.runnerTabId) {
    chrome.tabs.sendMessage(state.runnerTabId, { type: "AGENT_RUNNER_STOP" }, () => {
      void chrome.runtime.lastError;
    });
  }
  return state;
}

async function pauseAgent() {
  const state = await updateState((current) => {
    if (!JobAgentState.isRunning(current.status)) return current;
    return {
      ...current,
      status: "paused_user",
      phase: "paused_user",
      message: "任务已暂停，可在处理完当前页面后继续。",
      userAction: "resume_agent",
      stopRequested: false
    };
  });

  if (state.runnerTabId) {
    chrome.tabs.sendMessage(state.runnerTabId, { type: "AGENT_RUNNER_PAUSE" }, () => {
      void chrome.runtime.lastError;
    });
  }
  return state;
}

async function runnerReady(sender) {
  const state = await getAgentState();
  if (!state.runId) throw new Error("当前没有等待执行的 Agent 任务。 ");
  if (state.runnerTabId && sender.tab?.id !== state.runnerTabId) throw new Error("Agent Runner 身份不匹配。 ");
  return updateState((current) => ({
    ...current,
    runnerTabId: sender.tab?.id || current.runnerTabId,
    status: current.status === "stopped" ? current.status : current.status === "preflight" ? "preflight" : current.status,
    runnerLastSeen: new Date().toISOString(),
    message: current.message || "Agent Runner 已就绪。"
  }));
}

async function appendJobs(jobs, searchPatch) {
  return updateState((current) => {
    const appended = JobAgentState.appendJobs(current, jobs || []);
    return JobAgentState.markSearchProgress(appended, searchPatch || {});
  });
}

async function recordJobResult(result) {
  return updateState((current) => JobAgentState.recordJobResult(current, result || {}));
}

async function completeAgent() {
  return updateState((current) => ({
    ...current,
    status: "completed",
    phase: "completed",
     message: `采集完成：发现${current.counts.discovered}条，详情成功${current.counts.detailsCompleted || 0}条，保存${current.counts.saved}条，失败${current.counts.failed}条，跳过${current.counts.skipped}条。`,
    currentJob: null,
    completedAt: new Date().toISOString()
  }));
}

async function assertRunner(sender) {
  const state = await getAgentState();
  if (!sender.tab?.id || sender.tab.id !== state.runnerTabId) throw new Error("只有当前 Agent Runner 可以修改任务状态。 ");
}

function normalizeCriteria(raw) {
  return {
    keyword: cleanText(raw.keyword),
    city: cleanText(raw.city),
    minSalaryK: toPositiveNumber(raw.minSalaryK),
    maxSalaryK: toPositiveNumber(raw.maxSalaryK),
    delayMs: clampInteger(raw.delayMs, 1200, 10000, DEFAULT_DELAY_MS),
    maxRetries: clampInteger(raw.maxRetries, 0, 5, DEFAULT_MAX_RETRIES)
  };
}

function normalizeCandidateProfile(raw) {
  const profile = raw && typeof raw === "object" ? raw : {};
  return {
    education: cleanText(profile.education).slice(0, 40),
    yearsOfExperience: cleanText(profile.yearsOfExperience).slice(0, 40),
    skills: cleanText(profile.skills).slice(0, 1000),
    targetRoles: cleanText(profile.targetRoles).slice(0, 300),
    preferredCities: cleanText(profile.preferredCities).slice(0, 300),
    preferredSalary: cleanText(profile.preferredSalary).slice(0, 100),
    workTypes: cleanText(profile.workTypes).slice(0, 200),
    mustHave: cleanText(profile.mustHave).slice(0, 600),
    flexibleOn: cleanText(profile.flexibleOn).slice(0, 600)
  };
}

function validateCriteria(criteria) {
  if (!criteria.keyword) return "请先输入职位关键词。";
  if (criteria.minSalaryK && criteria.maxSalaryK && criteria.minSalaryK > criteria.maxSalaryK) return "最低月薪不能大于最高月薪。";
  return "";
}

function cleanText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function safeStatePatch(patch) {
  const input = patch && typeof patch === "object" ? patch : {};
  const allowed = ["status", "phase", "message", "tabId", "detailTabId", "currentJob", "userAction", "runnerLastSeen", "retryCount"];
  const result = Object.fromEntries(allowed.filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]]));
  if (input.search && typeof input.search === "object") {
    const search = {};
    if (Object.hasOwn(input.search, "page")) search.page = Math.max(1, Number(input.search.page) || 1);
    if (Object.hasOwn(input.search, "scrollRounds")) search.scrollRounds = Math.max(0, Number(input.search.scrollRounds) || 0);
    if (Object.hasOwn(input.search, "stagnantRounds")) search.stagnantRounds = Math.max(0, Number(input.search.stagnantRounds) || 0);
    if (Object.hasOwn(input.search, "exhausted")) search.exhausted = Boolean(input.search.exhausted);
    if (Object.hasOwn(input.search, "currentUrl")) search.currentUrl = cleanText(input.search.currentUrl);
    if (Object.hasOwn(input.search, "nextPageUrl")) search.nextPageUrl = cleanText(input.search.nextPageUrl);
    if (Array.isArray(input.search.visitedPageUrls)) search.visitedPageUrls = input.search.visitedPageUrls.map(cleanText).filter(Boolean);
    result.search = search;
  }
  return result;
}

async function recoverRunner() {
  const state = await getAgentState();
  if (!state.runId || !JobAgentState.isRunning(state.status)) return;

  if (state.runnerTabId) {
    try {
      await chrome.tabs.get(state.runnerTabId);
      return;
    } catch (error) {
    }
  }

  const runner = await chrome.tabs.create({ url: chrome.runtime.getURL(RUNNER_URL), active: false });
  await updateState((current) => ({ ...current, runnerTabId: runner.id || null, message: "正在恢复未完成的 Agent 任务。" }));
}

async function getAgentState() {
  const data = await chrome.storage.local.get(AGENT_STATE_KEY);
  return decorateState(data[AGENT_STATE_KEY] || { status: "idle", message: "Agent 空闲。", counts: {} });
}

function updateState(mutator) {
  const operation = stateWriteQueue.then(async () => {
    const current = await getAgentState();
    const next = await mutator(current);
    const state = decorateState({ ...next, updatedAt: new Date().toISOString() });
    await chrome.storage.local.set({ [AGENT_STATE_KEY]: state });
    return state;
  });
  stateWriteQueue = operation.catch(() => {});
  return operation;
}

function decorateState(state) {
  const counts = {
    discovered: 0,
    queued: 0,
    processed: 0,
    detailsCompleted: 0,
    saved: 0,
    failed: 0,
    skipped: 0,
    missingFields: 0,
    ...(state.counts || {})
  };
  return {
    ...state,
    counts,
    queued: counts.queued,
    processed: counts.processed,
    detailsCompleted: counts.detailsCompleted,
    saved: counts.saved,
    failed: counts.failed,
    skipped: counts.skipped,
    errors: (state.failures || []).slice(-10).map((item) => item.reason),
    currentTitle: state.currentJob?.title || "",
    runnerTabId: state.runnerTabId ?? null
  };
}
