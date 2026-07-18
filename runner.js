(function () {
  "use strict";

  const CONFIG = window.BossJobConfig;
  const {
    CONTENT_SCRIPT_VERSION,
    PAGE_LOAD_TIMEOUT_MS,
    MESSAGE_TIMEOUT_MS,
    DEFAULT_DELAY_MS,
    SEARCH_COLLECTION_TIMEOUT_MS,
    CITY_CODE_MAP
  } = CONFIG;
  const buildSearchUrl = BossJobShared.buildSearchUrl;
  const sendRuntimeMessage = BossJobShared.sendRuntimeMessage;

  let running = false;
  let stopRequested = false;
  let pauseRequested = false;
  let statusTimer = null;
  let heartbeatTimer = null;
  let lastActivityKey = "";

  const STATUS_LABELS = {
    idle: "空闲",
    preflight: "准备中",
    collecting_list: "读取列表",
    queue_ready: "准备详情",
    opening_detail: "读取详情",
    waiting_detail: "等待详情",
    extracting: "提取 JD",
    filtering: "筛选岗位",
    saving: "保存分析",
    retrying: "重试中",
    paused_user: "已暂停",
    paused_auth: "等待登录",
    paused_captcha: "等待验证",
    stopping: "正在结束",
    stopped: "已结束",
    completed: "已完成",
    error: "异常停止"
  };

  const STAGE_ORDER = ["collecting_list", "queue_ready", "opening_detail", "saving", "completed"];

  document.addEventListener("DOMContentLoaded", () => {
    bindRunnerControls();
    startStatusPolling();
    startHeartbeat();
    run().catch((error) => {
      document.getElementById("runnerStatus").textContent = error.message || "Agent运行失败。";
    });
  });

  async function run() {
    if (running) return;
    running = true;

    try {
      const ready = await sendRuntimeMessage({ type: "AGENT_RUNNER_READY" });
      if (!ready.ok) throw new Error(ready.error || "Agent Runner 初始化失败。 ");

      let state = ready.state;
      renderRunnerState(state);
      if (!state || ["completed", "stopped", "error"].includes(state.status)) return;

      const searchTabId = await ensureSearchTab(state);
      if (!state.search?.exhausted) {
        state = await patchState({
          status: "collecting_list",
          phase: "collecting_list",
          tabId: searchTabId,
          message: "正在打开并完整读取搜索结果。"
        });

        await waitForTabComplete(searchTabId);
        await ensureContentScript(searchTabId);
        await collectSearchPage(searchTabId, state);
      } else {
        await ensureContentScript(searchTabId);
      }

      state = await getState();
      const detailTabId = searchTabId;
      await patchState({ detailTabId });
      state = await patchState({
        status: "queue_ready",
        phase: "queue_ready",
        message: `已发现${state.counts.queued}个岗位，开始逐个读取详情。`
      });

      while (true) {
        throwIfStopped();
        throwIfPaused();
        state = await getState();

        if (state.cursor < state.queue.length) {
          await processJob(state, searchTabId);
          continue;
        }

        if (!state.search.exhausted) {
          await advanceSearchPage(searchTabId, state);
          state = await getState();
          await collectSearchPage(searchTabId, state);
          continue;
        }

        break;
      }

      await sendRuntimeMessage({ type: "AGENT_RUNNER_COMPLETE" });
    } catch (error) {
      if (error && error.code === "AGENT_STOPPED") {
        await patchState({ status: "stopped", phase: "stopped", message: "Agent已停止。" });
      } else if (error && error.code === "AGENT_PAUSED") {
        await patchState({ status: error.status, phase: error.status, message: error.message, userAction: error.userAction || null });
      } else {
        const latest = await getState().catch(() => null);
        if (latest && JobAgentState.isPaused(latest.status) && latest.userAction === "reopen_boss") {
          renderRunnerState(latest);
        } else {
          await patchState({ status: "error", phase: "error", message: error.message || "Agent运行失败。" });
        }
      }
    } finally {
      running = false;
    }
  }

  async function collectSearchPage(tabId, state) {
    throwIfStopped();
    throwIfPaused();
    const criteria = state.criteria || {};
    const tab = await chrome.tabs.get(tabId);
    const currentUrl = tab.url || "";
    const delayMs = Number(criteria.delayMs) || DEFAULT_DELAY_MS;
    const response = await sendAgentTabMessage(tabId, {
      type: "AGENT_COLLECT_SEARCH_PAGE_V1",
      delayMs,
      maxScrollRounds: CONFIG.MAX_SCROLL_ROUNDS,
      collectionTimeoutMs: SEARCH_COLLECTION_TIMEOUT_MS
    }, Math.max(MESSAGE_TIMEOUT_MS, SEARCH_COLLECTION_TIMEOUT_MS + MESSAGE_TIMEOUT_MS));

    if (!response?.ok) {
      throw createAgentError(response?.error || "搜索结果采集失败。", "collect_list");
    }

    if (response.requiresUserAction) {
      const error = createAgentError(response.message || "需要用户处理页面验证。", "preflight");
      error.code = "AGENT_PAUSED";
      error.status = response.requiresUserAction === "captcha" ? "paused_captcha" : "paused_auth";
      error.userAction = response.requiresUserAction;
      throw error;
    }

    const pageState = await sendRuntimeMessage({
      type: "AGENT_APPEND_JOBS",
      jobs: response.jobs || [],
      search: {
        ...(response.search || {}),
        currentUrl: response.pageUrl || currentUrl,
        visitedPageUrls: [response.pageUrl || currentUrl].filter(Boolean)
      }
    });
    if (!pageState.ok) throw new Error(pageState.error || "岗位队列保存失败。 ");

    if (response.exhausted) {
      await patchState({
        status: "queue_ready",
        phase: "queue_ready",
        message: `当前搜索页已读完，已发现${pageState.state?.counts?.queued || 0}个岗位，开始进入详情面板。`
      });
      return;
    }

    if (!response.nextPageUrl) {
      throw createAgentError("搜索结果未能确认已经耗尽，任务已停止以避免漏采。", "collect_list");
    }

    const visitedPageUrls = pageState.state?.search?.visitedPageUrls || [];
    if (visitedPageUrls.includes(response.nextPageUrl)) {
      throw createAgentError("分页链接重复，无法确认是否还有新的搜索结果，任务已停止。", "collect_list");
    }

    await patchState({
      status: "queue_ready",
      phase: "queue_ready",
      retryCount: 0,
      message: `当前搜索页已读完，已发现${pageState.state?.counts?.queued || 0}个岗位，先采集当前页详情。`
    });
  }

  async function advanceSearchPage(tabId, state) {
    throwIfStopped();
    throwIfPaused();
    const nextPageUrl = state.search?.nextPageUrl || "";
    if (!nextPageUrl) throw createAgentError("缺少下一页链接，无法继续搜索。", "paginate");
    if ((state.search?.visitedPageUrls || []).includes(nextPageUrl)) {
      throw createAgentError("分页链接重复，任务已停止以避免重复采集。", "paginate");
    }

    await patchState({
      status: "collecting_list",
      phase: "collecting_list",
      message: "当前页详情已完成，正在打开下一页搜索结果。"
    });
    await chrome.tabs.update(tabId, { url: nextPageUrl, active: false });
    await waitForTabComplete(tabId);
    await ensureContentScript(tabId);
    await patchState({
      status: "collecting_list",
      phase: "collecting_list",
      search: {
        page: (state.search?.page || 1) + 1,
        currentUrl: nextPageUrl,
        nextPageUrl: "",
        visitedPageUrls: [nextPageUrl]
      },
      retryCount: 0,
      message: `正在读取第${(state.search?.page || 1) + 1}页搜索结果。`
    });
  }

  async function processJob(state, tabId) {
    const item = state.queue[state.cursor];
    if (!item || !item.link) {
      await recordResult(state, { status: "failed", stage: "validate_queue", reason: "岗位没有可用详情链接。" });
      return;
    }

    await patchState({
      status: "opening_detail",
      phase: "opening_detail",
      currentJob: item,
      message: `正在处理详情 ${state.cursor + 1}/${state.queue.length}：${item.title || "未识别岗位"}`
    });

    const configuredRetries = Number(state.criteria?.maxRetries);
    const maxRetries = Number.isFinite(configuredRetries) ? Math.max(0, Math.min(5, configuredRetries)) : 2;
    const retryBase = Number(state.retryCount) || 0;
    let lastFailure = { stage: "detail_flow", reason: "详情处理失败。" };

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const normalized = await collectAndNormalizeJob(item, state, tabId);
        const missingFields = getMissingFields(normalized);
        const localCriteria = {
          ...(state.criteria || {}),
          // BOSS already applies the keyword and built-in city filters on the search page.
          keyword: "",
          city: CITY_CODE_MAP[state.criteria?.city] ? "" : state.criteria?.city
        };
        const criteriaMatch = typeof JobAnalyzer.evaluateJobCriteria === "function"
          ? JobAnalyzer.evaluateJobCriteria(normalized, localCriteria)
          : { matched: true, reason: "" };
        normalized.criteriaMatch = criteriaMatch;
        if (!criteriaMatch.matched) {
          await patchState({ status: "filtering", phase: "filtering", message: `详情已采集，按本地条件跳过：${criteriaMatch.reason}` });
          await recordResult(state, {
            status: "skipped",
            job: normalized,
            detailCompleted: true,
            collectionMethod: normalized.collectionMethod,
            missingFields,
            reason: criteriaMatch.reason,
            stage: "local_filter",
            retryCount: attempt
          });
          return;
        }
        await patchState({ status: "saving", phase: "saving", message: `正在保存：${normalized.title}` });
        if (typeof JobStorage.upsertJob === "function") await JobStorage.upsertJob(normalized);
        else await JobStorage.saveJobs([normalized]);
        await recordResult(state, {
          status: "saved",
          job: normalized,
          detailCompleted: true,
          collectionMethod: normalized.collectionMethod,
          missingFields,
          retryCount: attempt
        });
        return;
      } catch (error) {
        if (error && (error.code === "AGENT_STOPPED" || error.code === "AGENT_PAUSED")) throw error;
        lastFailure = {
          stage: error.stage || "detail_flow",
          reason: error.message || "详情处理失败。"
        };
        if (attempt >= maxRetries) break;
        const retryNumber = attempt + 1;
        await patchState({
          status: "retrying",
          phase: "retrying",
          retryCount: retryBase + retryNumber,
          message: `岗位详情采集失败，准备第${retryNumber}次重试：${lastFailure.reason}`
        });
        await sleep(Math.min(10000, (Number(state.criteria?.delayMs) || DEFAULT_DELAY_MS) * (retryNumber + 1)));
      }
    }

    await recordResult(state, { status: "failed", ...lastFailure, retryCount: maxRetries });
  }

  async function collectAndNormalizeJob(item, state, tabId) {
    throwIfStopped();
    throwIfPaused();
    await sleep(Number(state.criteria?.delayMs) || DEFAULT_DELAY_MS);
    await ensureContentScript(tabId);

    await patchState({ status: "opening_detail", phase: "opening_detail", message: `正在读取右侧详情：${item.title || "未识别岗位"}` });
    const response = await sendAgentTabMessage(tabId, { type: "COLLECT_DETAIL_FOR_JOB_AGENT_V1", job: item }, Math.max(MESSAGE_TIMEOUT_MS, 12000));
    if (response?.requiresUserAction) {
      const error = createAgentError(response.message || "详情页需要用户处理。", "preflight");
      error.code = "AGENT_PAUSED";
      error.status = response.requiresUserAction === "captcha" ? "paused_captcha" : "paused_auth";
      error.userAction = response.requiresUserAction;
      throw error;
    }
    if (!response?.ok) throw createAgentError(response?.error || "详情页没有返回成功状态。", "extract_detail");

    const detailRaw = response.jobs?.[0];
    if (!detailRaw || !detailRaw.detailCompleted || !detailRaw.detailText) {
      throw createAgentError(response.warning || "详情页未提取到完整原始JD。", "validate_detail");
    }

    const identity = JobAnalyzer.isDetailRecordConsistent(item, detailRaw);
    if (!identity.ok) throw createAgentError(identity.reason, "validate_identity");

    const normalized = JobAnalyzer.normalizeJobRecord(mergeListAndDetailRaw(item, detailRaw), state.candidateProfile || {});
    normalized.collectionMethod = detailRaw.collectionMethod || response.collectionMethod || "dom";
    normalized.captureConfidence = Number(detailRaw.captureConfidence || response.captureConfidence) || (normalized.collectionMethod === "response" ? 0.995 : 0.96);
    normalized.responseUrl = detailRaw.responseUrl || response.responseUrl || "";
    await patchState({
      status: "extracting",
      phase: "extracting",
      message: normalized.collectionMethod === "response"
        ? `已捕获岗位详情接口响应：${normalized.title}`
        : `接口未返回完整详情，已回退右侧详情面板：${normalized.title}`
    });
    return normalized;
  }

  async function recordResult(state, result) {
    const response = await sendRuntimeMessage({ type: "AGENT_RECORD_RESULT", result });
    if (!response.ok) throw new Error(response.error || "岗位结果保存失败。 ");
  }

  function getMissingFields(job) {
    return ["title", "company", "city", "salary", "experience", "education", "link", "detailText", "jdSummary"].filter((field) => {
      const value = String(job?.[field] || "").trim();
      return !value || value === "未识别" || value === "未展示";
    });
  }

  function mergeListAndDetailRaw(listRaw, detailRaw) {
    const list = listRaw || {};
    const detail = detailRaw || {};
    return {
      ...list,
      ...detail,
      title: detail.title || list.title,
      company: detail.company || list.company,
      city: detail.city || list.city,
      salary: detail.salary || list.salary,
      experience: detail.experience || list.experience,
      education: detail.education || list.education,
      link: detail.link || list.link,
      cardText: list.cardText || "",
      detailText: detail.detailText || "",
      rawText: [list.rawText, detail.rawText].filter(Boolean).join("\n\n"),
      detailCompleted: Boolean(detail.detailCompleted),
      collectWarnings: [...(list.collectWarnings || []), ...(detail.collectWarnings || [])],
      sourceType: "detail"
    };
  }

  async function ensureSearchTab(state) {
    if (state.tabId) {
      try {
        await chrome.tabs.get(state.tabId);
        return state.tabId;
      } catch (error) {
      }
    }

    const tab = await chrome.tabs.create({ url: buildSearchUrl(state.criteria), active: true });
    if (!tab?.id) throw new Error("无法创建BOSS搜索标签页。 ");
    return tab.id;
  }

  async function ensureContentScript(tabId) {
    try {
      const response = await sendTabMessage(tabId, { type: "PING" }, 5000);
      if (response?.ok && response.version === CONTENT_SCRIPT_VERSION) return;
    } catch (error) {
    }

    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["bridge.js"], world: "MAIN" });
    } catch (error) {
      // Static document_start injection is the primary path; this covers already-open tabs.
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ["shared.js", "boss-response.js", "content.js"] });
  }

  async function sendAgentTabMessage(tabId, message, timeoutMs) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      throwIfStopped();
      throwIfPaused();
      try {
        return await sendTabMessage(tabId, message, timeoutMs);
      } catch (error) {
        lastError = error;
        if (!isRecoverableTabMessageError(error) || attempt === 2) break;

        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (!tab) throw createPageRecoveryPause("BOSS 工作标签页已关闭，任务已暂停。点击继续后会重新打开搜索页。", "page_lost");
        if (!/^https?:\/\/([^/]+\.)?zhipin\.com\//i.test(tab.url || "")) {
          throw createPageRecoveryPause("BOSS 工作页面已离开当前招聘站点，任务已暂停。点击继续后会重新打开搜索页。", "page_lost");
        }
        if (tab.status !== "complete") {
          await waitForTabComplete(tabId);
        }
        await sleep(450 * (attempt + 1));
        try {
          await ensureContentScript(tabId);
        } catch (recoveryError) {
          const currentTab = await chrome.tabs.get(tabId).catch(() => null);
          if (!currentTab) throw createPageRecoveryPause("BOSS 工作标签页已关闭，任务已暂停。点击继续后会重新打开搜索页。", "page_lost");
          throw recoveryError;
        }
      }
    }
    throw lastError;
  }

  function createPageRecoveryPause(message, stage) {
    const error = createAgentError(message, stage);
    error.code = "AGENT_PAUSED";
    error.status = "paused_user";
    error.userAction = "reopen_boss";
    return error;
  }

  function isRecoverableTabMessageError(error) {
    return /message channel closed|receiving end does not exist|could not establish connection|context invalidated|消息通道|无法建立连接/i.test(error?.message || "");
  }

  function waitForTabComplete(tabId) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => finish(new Error("页面加载超时。")), PAGE_LOAD_TIMEOUT_MS);
      const onUpdated = (updatedTabId, changeInfo, updatedTab) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        finish(null, updatedTab);
      };
      const finish = (error, tab) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        if (error) reject(error);
        else resolve(tab);
      };

      chrome.tabs.get(tabId, (tab) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          finish(new Error(runtimeError.message));
          return;
        }
        if (tab.status === "complete") {
          finish(null, tab);
          return;
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
      });
    });
  }

  function sendTabMessage(tabId, message, timeoutMs = MESSAGE_TIMEOUT_MS) {
    return withTimeout(
      new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }
          resolve(response);
        });
      }),
      timeoutMs,
      "页面响应超时。"
    );
  }

  async function getState() {
    const response = await sendRuntimeMessage({ type: "AGENT_RUNNER_STATE" });
    return response.state;
  }

  async function patchState(patch) {
    const response = await sendRuntimeMessage({ type: "AGENT_STATE_PATCH", patch });
    renderRunnerState(response.state);
    return response.state;
  }

  function createAgentError(message, stage) {
    const error = new Error(message);
    error.stage = stage;
    return error;
  }

  function throwIfStopped() {
    if (stopRequested) {
      const error = new Error("Agent已停止。 ");
      error.code = "AGENT_STOPPED";
      throw error;
    }
  }

  function throwIfPaused() {
    if (pauseRequested) {
      const error = new Error("Agent 已暂停。");
      error.code = "AGENT_PAUSED";
      error.status = "paused_user";
      error.userAction = "resume_agent";
      throw error;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise.then((value) => {
        clearTimeout(timer);
        resolve(value);
      }).catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function bindRunnerControls() {
    document.getElementById("pauseBtn").addEventListener("click", () => requestRunnerAction("AGENT_PAUSE"));
    document.getElementById("resumeBtn").addEventListener("click", () => requestRunnerAction("AGENT_START"));
    document.getElementById("resumeActionBtn").addEventListener("click", () => requestRunnerAction("AGENT_START"));
    document.getElementById("stopBtn").addEventListener("click", () => requestRunnerAction("AGENT_STOP"));
    document.getElementById("viewBossBtn").addEventListener("click", viewBossTab);
  }

  async function requestRunnerAction(type) {
    try {
      const response = await sendRuntimeMessage({ type });
      renderRunnerState(response.state);
    } catch (error) {
      renderRunnerState({ status: "error", message: error.message || "任务操作失败。" });
    }
  }

  function startStatusPolling() {
    refreshRunnerStatus();
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(refreshRunnerStatus, 1000);
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      sendRuntimeMessage({ type: "AGENT_RUNNER_HEARTBEAT" }).catch(() => {});
    }, 2500);
  }

  async function refreshRunnerStatus() {
    try {
      const response = await sendRuntimeMessage({ type: "AGENT_RUNNER_STATE" });
      renderRunnerState(response.state);
    } catch (error) {
      renderRunnerState({ status: "error", message: error.message || "后台状态不可用。" });
    }
  }

  async function viewBossTab() {
    try {
      const state = await getState();
      const tabId = state.detailTabId || state.tabId;
      if (!tabId) throw new Error("当前还没有可查看的 BOSS 页面。");
      await chrome.tabs.update(tabId, { active: true });
    } catch (error) {
      renderRunnerState({ status: "error", message: error.message || "无法打开工作页面。" });
    }
  }

  function renderRunnerState(state = {}) {
    const status = state.status || "idle";
    const counts = state.counts || {};
    const queued = Number(state.queued ?? counts.queued ?? 0);
    const processed = Number(state.processed ?? counts.processed ?? 0);
    const currentStage = stageForStatus(status);
    const statusLabel = STATUS_LABELS[status] || status;
    const badge = document.getElementById("runnerStatusBadge");
    const subtitle = document.getElementById("runnerSubtitle");
    const phaseTitle = document.getElementById("phaseTitle");
    const currentStageElement = document.getElementById("currentStage");
    const currentTitle = document.getElementById("currentTitle");
    const currentMessage = document.getElementById("currentMessage");
    const currentLink = document.getElementById("currentLink");

    badge.textContent = statusLabel;
    badge.dataset.status = status;
    subtitle.textContent = state.message || "任务状态将在这里实时更新。";
    phaseTitle.textContent = statusLabel;
    currentStageElement.textContent = statusLabel;
    currentTitle.textContent = state.currentTitle || "暂无岗位";
    currentMessage.textContent = state.message || "任务状态将在这里实时更新。";
    currentLink.hidden = !state.currentJob?.link;
    currentLink.href = state.currentJob?.link || "#";

    document.getElementById("discoveredCount").textContent = String(counts.discovered || 0);
    document.getElementById("queuedCount").textContent = String(queued);
    document.getElementById("detailsCount").textContent = String(state.detailsCompleted ?? counts.detailsCompleted ?? 0);
    document.getElementById("savedCount").textContent = String(state.saved ?? counts.saved ?? 0);
    document.getElementById("failedCount").textContent = String(state.failed ?? counts.failed ?? 0);
    document.getElementById("responseCount").textContent = String(counts.responseCaptured || 0);
    document.getElementById("fallbackCount").textContent = String(counts.domFallback || 0);
    document.getElementById("progressText").textContent = `${processed} / ${queued}`;
    document.getElementById("lastHeartbeat").textContent = state.runnerLastSeen ? `心跳 ${formatTime(state.runnerLastSeen)}` : "等待心跳";
    document.getElementById("runnerStatus").textContent = `${statusLabel}：${state.message || "无状态消息"}`;

    document.querySelectorAll(".stage[data-stage]").forEach((stage) => {
      const index = STAGE_ORDER.indexOf(stage.dataset.stage);
      const currentIndex = STAGE_ORDER.indexOf(currentStage);
      stage.dataset.state = index < currentIndex ? "done" : index === currentIndex ? "active" : "";
    });

    const paused = JobAgentState.isPaused(status);
    const runningState = JobAgentState.isRunning(status);
    document.getElementById("pauseBtn").disabled = !runningState;
    document.getElementById("resumeBtn").disabled = !paused;
    document.getElementById("resumeActionBtn").disabled = !paused;
    document.getElementById("stopBtn").disabled = !(runningState || paused);
    document.getElementById("viewBossBtn").disabled = !(state.detailTabId || state.tabId);

    const notice = document.getElementById("actionNotice");
    const needsAction = paused;
    notice.hidden = !needsAction;
    if (needsAction) {
      document.getElementById("actionTitle").textContent = status === "paused_auth" ? "需要登录" : status === "paused_captcha" ? "需要完成验证" : "任务已暂停";
      document.getElementById("actionMessage").textContent = state.message || "处理完成后继续任务。";
    }

    const activityKey = `${status}:${state.updatedAt || ""}:${state.message || ""}`;
    if (activityKey !== lastActivityKey) {
      lastActivityKey = activityKey;
      appendActivity(statusLabel, state.message || "状态已更新", state.updatedAt);
    }
  }

  function stageForStatus(status) {
    if (["idle", "stopped", "error"].includes(status)) return "";
    if (["opening_detail", "waiting_detail", "extracting"].includes(status)) return "opening_detail";
    if (["filtering", "saving", "retrying"].includes(status)) return "saving";
    if (["completed"].includes(status)) return "completed";
    return STAGE_ORDER.includes(status) ? status : status === "preflight" ? "collecting_list" : "queue_ready";
  }

  function appendActivity(statusLabel, message, timestamp) {
    const list = document.getElementById("activityList");
    const empty = list.querySelector(".empty-activity");
    if (empty) empty.remove();
    const item = document.createElement("li");
    item.className = "activity-item";
    item.innerHTML = `<span>${formatTime(timestamp || new Date().toISOString())}</span><strong>${escapeHtml(statusLabel)}</strong><span>${escapeHtml(message)}</span>`;
    list.prepend(item);
    while (list.children.length > 30) list.lastElementChild.remove();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--:--:--";
    return date.toLocaleTimeString("zh-CN", { hour12: false });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "AGENT_RUNNER_STOP") stopRequested = true;
    if (message?.type === "AGENT_RUNNER_PAUSE") pauseRequested = true;
    if (message?.type === "AGENT_RUNNER_RESUME") {
      stopRequested = false;
      pauseRequested = false;
      if (!running) run().catch((error) => renderRunnerState({ status: "error", message: error.message || "Agent 恢复失败。" }));
    }
  });
})();
