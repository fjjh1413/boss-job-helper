(function () {
  "use strict";

  const CSV_HEADERS = [
    "序号",
    "岗位名称",
    "公司名称",
    "城市",
    "薪资",
    "经验要求",
    "学历要求",
    "专业要求",
    "岗位职责",
    "技术要求",
    "JD总结",
    "出现频次关键词",
    "适配度",
    "候选人匹配度",
    "能力缺口",
    "匹配技术栈",
    "简历优化建议",
    "详情是否完整",
    "信息完整度",
    "岗位链接"
  ];

  const EXPORT_FIELDS = [
    { header: "序号", key: "serialNumber" },
    { header: "岗位名称", key: "title" },
    { header: "公司名称", key: "company" },
    { header: "城市", key: "city" },
    { header: "薪资", key: "salary" },
    { header: "经验要求", key: "experience" },
    { header: "学历要求", key: "education" },
    { header: "专业要求", key: "majorRequirement" },
    { header: "岗位职责", key: "responsibilities" },
    { header: "技术要求", key: "requirements" },
    { header: "JD总结", key: "jdSummary" },
    { header: "出现频次关键词", key: "keywordFrequency" },
    { header: "候选人匹配度", key: "matchScore" },
    { header: "能力缺口", key: "matchGaps" },
    { header: "适配度", key: "suitability" },
    { header: "匹配技术栈", key: "techStack" },
    { header: "简历优化建议", key: "resumeAdvice" },
    { header: "详情是否完整", key: "detailCompleteStatus" },
    { header: "信息完整度", key: "completenessScore" },
    { header: "岗位链接", key: "link" }
  ];
  const CONFIG = window.BossJobConfig;
  const { CONTENT_SCRIPT_VERSION, CITY_CODE_MAP } = CONFIG;
  const buildSearchUrl = BossJobShared.buildSearchUrl;
  const sendRuntimeMessage = BossJobShared.sendRuntimeMessage;
  const CRITERIA_STORAGE_KEY = "bossJobHelperSearchCriteria";

  const elements = {};
  let agentStatusTimer = null;
  let lastTerminalAgentStateKey = "";
  let manualBusy = false;
  let agentRunning = false;

  document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    restoreSearchCriteria();
    bindEvents();
    refreshPreview();
    startAgentStatusPolling();
  });

  function bindElements() {
    elements.keywordInput = document.getElementById("keywordInput");
    elements.cityInput = document.getElementById("cityInput");
    elements.minSalaryInput = document.getElementById("minSalaryInput");
    elements.maxSalaryInput = document.getElementById("maxSalaryInput");
    elements.educationInput = document.getElementById("educationInput");
    elements.yearsOfExperienceInput = document.getElementById("yearsOfExperienceInput");
    elements.targetRolesInput = document.getElementById("targetRolesInput");
    elements.preferredCitiesInput = document.getElementById("preferredCitiesInput");
    elements.skillsInput = document.getElementById("skillsInput");
    elements.preferredSalaryInput = document.getElementById("preferredSalaryInput");
    elements.workTypesInput = document.getElementById("workTypesInput");
    elements.mustHaveInput = document.getElementById("mustHaveInput");
    elements.flexibleOnInput = document.getElementById("flexibleOnInput");
    elements.delaySecondsInput = document.getElementById("delaySecondsInput");
    elements.maxRetriesInput = document.getElementById("maxRetriesInput");
    elements.agentStatusText = document.getElementById("agentStatusText");
    elements.startAgentBtn = document.getElementById("startAgentBtn");
    elements.stopAgentBtn = document.getElementById("stopAgentBtn");
    elements.openSearchBtn = document.getElementById("openSearchBtn");
    elements.collectMatchedBtn = document.getElementById("collectMatchedBtn");
    elements.collectPageBtn = document.getElementById("collectPageBtn");
    elements.collectDetailBtn = document.getElementById("collectDetailBtn");
    elements.refreshBtn = document.getElementById("refreshBtn");
    elements.exportCsvBtn = document.getElementById("exportCsvBtn");
    elements.exportJsonBtn = document.getElementById("exportJsonBtn");
    elements.clearBtn = document.getElementById("clearBtn");
    elements.statusText = document.getElementById("statusText");
    elements.jobCount = document.getElementById("jobCount");
    elements.previewBody = document.getElementById("previewBody");
  }

  function bindEvents() {
    elements.startAgentBtn.addEventListener("click", startAgent);
    elements.stopAgentBtn.addEventListener("click", stopAgent);
    elements.openSearchBtn.addEventListener("click", openSearchPage);
    elements.collectMatchedBtn.addEventListener("click", () => collectJobs("COLLECT_VISIBLE_JOBS_V6", { filterByCriteria: true }));
    elements.collectPageBtn.addEventListener("click", () => collectJobs("COLLECT_VISIBLE_JOBS_V6"));
    elements.collectDetailBtn.addEventListener("click", () => collectJobs("COLLECT_DETAIL_JOB_V6"));
    elements.refreshBtn.addEventListener("click", refreshPreview);
    elements.exportCsvBtn.addEventListener("click", exportCsv);
    elements.exportJsonBtn.addEventListener("click", exportJson);
    elements.clearBtn.addEventListener("click", clearData);
    [
      elements.keywordInput,
      elements.cityInput,
      elements.minSalaryInput,
      elements.maxSalaryInput,
      elements.educationInput,
      elements.yearsOfExperienceInput,
      elements.targetRolesInput,
      elements.preferredCitiesInput,
      elements.skillsInput,
      elements.preferredSalaryInput,
      elements.workTypesInput,
      elements.mustHaveInput,
      elements.flexibleOnInput,
      elements.delaySecondsInput,
      elements.maxRetriesInput
    ].forEach((input) => {
      input.addEventListener("input", saveSearchCriteria);
    });
  }

  function setStatus(message, type = "normal") {
    elements.statusText.textContent = message;
    elements.statusText.dataset.type = type;
  }

  function setBusy(isBusy) {
    manualBusy = isBusy;
    [
      elements.openSearchBtn,
      elements.collectMatchedBtn,
      elements.collectPageBtn,
      elements.collectDetailBtn,
      elements.refreshBtn,
      elements.exportCsvBtn,
      elements.exportJsonBtn,
      elements.clearBtn
    ].forEach((button) => {
      button.disabled = manualBusy || agentRunning;
    });
  }

  function getNumberInput(input) {
    const value = Number(input.value);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function getNonNegativeNumberInput(input) {
    const value = Number(input.value);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function getSearchCriteria() {
    const keyword = elements.keywordInput.value.trim();
    const city = elements.cityInput.value.trim();
    const minSalaryK = getNumberInput(elements.minSalaryInput);
    const maxSalaryK = getNumberInput(elements.maxSalaryInput);
    const delaySeconds = getNumberInput(elements.delaySecondsInput);
    const maxRetries = getNonNegativeNumberInput(elements.maxRetriesInput);
    return {
      keyword,
      city,
      minSalaryK,
      maxSalaryK,
      delayMs: delaySeconds ? Math.round(delaySeconds * 1000) : null,
      maxRetries: maxRetries === null ? null : Math.round(maxRetries)
    };
  }

  function getCandidateProfile() {
    return {
      education: elements.educationInput.value.trim(),
      yearsOfExperience: elements.yearsOfExperienceInput.value.trim(),
      targetRoles: elements.targetRolesInput.value.trim(),
      preferredCities: elements.preferredCitiesInput.value.trim(),
      skills: elements.skillsInput.value.trim(),
      preferredSalary: elements.preferredSalaryInput.value.trim(),
      workTypes: elements.workTypesInput.value.trim(),
      mustHave: elements.mustHaveInput.value.trim(),
      flexibleOn: elements.flexibleOnInput.value.trim()
    };
  }

  function saveSearchCriteria() {
    localStorage.setItem(CRITERIA_STORAGE_KEY, JSON.stringify({
      ...getSearchCriteria(),
      candidateProfile: getCandidateProfile()
    }));
  }

  function restoreSearchCriteria() {
    try {
      const criteria = JSON.parse(localStorage.getItem(CRITERIA_STORAGE_KEY) || "{}");
      elements.keywordInput.value = criteria.keyword || "";
      elements.cityInput.value = criteria.city || "";
      elements.minSalaryInput.value = criteria.minSalaryK || "";
      elements.maxSalaryInput.value = criteria.maxSalaryK || "";
      elements.delaySecondsInput.value = criteria.delayMs ? criteria.delayMs / 1000 : 2.2;
      elements.maxRetriesInput.value = criteria.maxRetries ?? 2;
      const profile = criteria.candidateProfile || {};
      elements.educationInput.value = profile.education || "";
      elements.yearsOfExperienceInput.value = profile.yearsOfExperience || "";
      elements.targetRolesInput.value = profile.targetRoles || "";
      elements.preferredCitiesInput.value = profile.preferredCities || "";
      elements.skillsInput.value = profile.skills || "";
      elements.preferredSalaryInput.value = profile.preferredSalary || "";
      elements.workTypesInput.value = profile.workTypes || "";
      elements.mustHaveInput.value = profile.mustHave || "";
      elements.flexibleOnInput.value = profile.flexibleOn || "";
    } catch (error) {
      localStorage.removeItem(CRITERIA_STORAGE_KEY);
    }
  }

  function validateSearchCriteria(criteria) {
    if (criteria.minSalaryK && criteria.maxSalaryK && criteria.minSalaryK > criteria.maxSalaryK) {
      return "最低月薪不能大于最高月薪。";
    }
    if (!criteria.keyword) return "请先输入职位关键词。";
    return "";
  }

  async function startAgent() {
    try {
      const criteria = getSearchCriteria();
      const criteriaError = validateSearchCriteria(criteria);
      if (criteriaError) {
        setStatus(criteriaError, "warn");
        return;
      }
      saveSearchCriteria();
      agentRunning = true;
      setBusy(false);
      elements.startAgentBtn.disabled = true;
      setStatus("正在启动采集agent...");
      const response = await sendRuntimeMessage({ type: "AGENT_START", criteria, candidateProfile: getCandidateProfile() });
      renderAgentStatus(response.state);
      setStatus("采集agent已启动。", "success");
    } catch (error) {
      setStatus(error.message || "启动agent失败。", "error");
      await refreshAgentStatus();
    }
  }

  async function stopAgent() {
    try {
      elements.stopAgentBtn.disabled = true;
      const response = await sendRuntimeMessage({ type: "AGENT_STOP" });
      renderAgentStatus(response.state);
      setStatus("已请求停止agent。", "warn");
    } catch (error) {
      setStatus(error.message || "停止agent失败。", "error");
      await refreshAgentStatus();
    }
  }

  function startAgentStatusPolling() {
    refreshAgentStatus();
    if (agentStatusTimer) clearInterval(agentStatusTimer);
    agentStatusTimer = setInterval(refreshAgentStatus, 1500);
  }

  async function refreshAgentStatus() {
    try {
      const response = await sendRuntimeMessage({ type: "AGENT_STATUS" });
      const terminalKey = `${response.state?.status || ""}:${response.state?.updatedAt || ""}`;
      if (["completed", "done", "stopped", "error"].includes(response.state?.status) && terminalKey !== lastTerminalAgentStateKey) {
        lastTerminalAgentStateKey = terminalKey;
        await refreshPreview({ keepStatus: true });
      }
      renderAgentStatus(response.state);
    } catch (error) {
      elements.agentStatusText.textContent = "后台状态不可用";
      agentRunning = false;
      setBusy(false);
      elements.startAgentBtn.disabled = false;
      elements.stopAgentBtn.disabled = true;
    }
  }

  function isAgentRunning(status) {
    return [
      "starting",
      "preflight",
      "opening",
      "collecting_list",
      "queue_ready",
      "opening_detail",
      "waiting_detail",
      "extracting",
      "saving",
      "filtering",
      "retrying",
      "scrolling",
      "queued",
      "collecting_detail",
      "stopping"
    ].includes(status);
  }

  function renderAgentStatus(state = {}) {
    const running = isAgentRunning(state.status);
    agentRunning = running;
    const current = state.currentTitle ? ` 当前：${state.currentTitle}` : "";
    const errorText = Array.isArray(state.errors) && state.errors.length ? ` 错误：${state.errors[state.errors.length - 1]}` : "";
    elements.agentStatusText.textContent = `${state.message || "agent空闲。"} 队列${state.queued || 0} / 已处理${state.processed || 0} / 详情成功${state.detailsCompleted || 0} / 已保存${state.saved || 0} / 跳过${state.skipped || 0} / 失败${state.failed || 0}.${current}${errorText}`;
    elements.startAgentBtn.disabled = running;
    elements.stopAgentBtn.disabled = !running || state.status === "stopping";
    setBusy(manualBusy);
  }

  async function openSearchPage() {
    try {
      const criteria = getSearchCriteria();
      const criteriaError = validateSearchCriteria(criteria);
      if (criteriaError) {
        setStatus(criteriaError, "warn");
        return;
      }

      saveSearchCriteria();
      setBusy(true);
      await chrome.tabs.create({ url: buildSearchUrl(criteria) });
      const cityNote = criteria.city && !CITY_CODE_MAP[criteria.city] ? " 未内置该城市编码，采集时会在本地按城市文本筛选。" : "";
      setStatus(`已打开 BOSS 搜索页：${criteria.keyword}。${cityNote}`, "success");
    } catch (error) {
      setStatus(error.message || "打开搜索页失败。", "error");
    } finally {
      setBusy(false);
    }
  }

  function matchesSearchCriteria(job, criteria) {
    return JobAnalyzer.evaluateJobCriteria(job, criteria).matched;
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      throw new Error("未找到当前活动标签页。");
    }
    return tab;
  }

  function isBossUrl(url) {
    return /^https:\/\/([a-z0-9-]+\.)?zhipin\.com\//i.test(url || "");
  }

  async function sendMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    });
  }

  async function ensureContentScript(tab) {
    try {
      const response = await sendMessage(tab.id, { type: "PING" });
      if (response?.version === CONTENT_SCRIPT_VERSION) return;
    } catch (error) {
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["shared.js", "content.js"]
    });
  }

  async function requestJobsFromPage(type) {
    const tab = await getActiveTab();
    if (!isBossUrl(tab.url)) {
      throw new Error("请先打开 BOSS 直聘 zhipin.com 的搜索结果页或岗位详情页。");
    }

    await ensureContentScript(tab);
    const response = await sendMessage(tab.id, { type });
    if (!response || !response.ok) {
      throw new Error("页面没有返回可采集的数据。");
    }
    return {
      jobs: response.jobs || [],
      warning: response.warning || ""
    };
  }

  /**
   * 从当前页面读取岗位数据，调用分析函数后保存到 IndexedDB。
   * @param {string} type 内容脚本消息类型。
   * @returns {Promise<void>}
   */
  async function collectJobs(type, options = {}) {
    try {
      setBusy(true);
      const criteria = getSearchCriteria();
      const isFilteredCollect = Boolean(options.filterByCriteria);
      const criteriaError = validateSearchCriteria(criteria);
      if (isFilteredCollect && criteriaError) {
        setStatus(criteriaError, "warn");
        return;
      }
      saveSearchCriteria();
      setStatus(
        isFilteredCollect
          ? "正在采集当前页已显示岗位，并按输入条件筛选..."
          : type === "COLLECT_VISIBLE_JOBS_V6"
            ? "正在采集当前页已显示岗位..."
            : "正在采集当前岗位详情..."
      );
      const pageResult = await requestJobsFromPage(type);
      const rawJobs = pageResult.jobs;
      const normalizedJobs = rawJobs.map((job) => JobAnalyzer.normalizeJobRecord(job));
      const jobsToSave = isFilteredCollect ? normalizedJobs.filter((job) => matchesSearchCriteria(job, criteria)) : normalizedJobs;

      if (!jobsToSave.length) {
        setStatus(
          normalizedJobs.length
            ? "当前页岗位已采集，但没有符合输入条件的结果。可放宽关键词、地点或薪资范围后重试。"
            : "未识别到可见岗位信息。请确认页面已加载岗位卡片或详情内容。",
          "warn"
        );
        await refreshPreview({ keepStatus: true });
        return;
      }

      const result = await JobStorage.saveJobs(jobsToSave);
      const warningText = pageResult.warning ? ` ${pageResult.warning}` : "";
      const filterText = isFilteredCollect ? `，本次符合条件 ${jobsToSave.length}/${normalizedJobs.length} 条` : "";
      setStatus(`采集完成${filterText}：新增 ${result.inserted} 条，更新 ${result.updated} 条，当前共 ${result.total} 条。${warningText}`, "success");
      await refreshPreview({ keepStatus: true });
    } catch (error) {
      setStatus(error.message || "采集失败。", "error");
    } finally {
      setBusy(false);
    }
  }

  /**
   * 刷新已采集数量和预览表格。
   * @param {{keepStatus?: boolean}} options 刷新时是否保留当前状态提示。
   * @returns {Promise<void>}
   */
  async function refreshPreview(options = {}) {
    try {
      const jobs = await JobStorage.getAllJobs();
      elements.jobCount.textContent = String(jobs.length);
      renderPreview(jobs);
      if (jobs.length && !options.keepStatus) {
        setStatus(`当前已保存 ${jobs.length} 条岗位。`);
      }
    } catch (error) {
      setStatus(error.message || "刷新预览失败。", "error");
    }
  }

  function renderPreview(jobs) {
    const rows = jobs.slice(-10).reverse();
    if (!rows.length) {
      elements.previewBody.innerHTML = '<tr><td colspan="20" class="empty">暂无数据</td></tr>';
      return;
    }

    elements.previewBody.innerHTML = rows
      .map(
        (job) => {
          const row = EXPORT_FIELDS.map(({ key }) => `<td>${renderPreviewCell(job, key)}</td>`).join("");
          return `
          <tr>
            ${row}
          </tr>
        `;
        }
      )
      .join("");
  }

  function renderPreviewCell(job, key) {
    if (key === "link") {
      return isSafeBossDetailLink(job.link) ? `<a class="job-link" href="${escapeAttribute(job.link)}" target="_blank" rel="noreferrer">打开岗位</a>` : "";
    }
    return escapeHtml(formatFieldValue(job, key));
  }

  function isAllowedBossHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "zhipin.com" || host.endsWith(".zhipin.com");
  }

  function isSafeBossDetailLink(link) {
    try {
      const url = new URL(link);
      return url.protocol === "https:" && isAllowedBossHost(url.hostname) && /^\/job_detail\//.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function getDetailCompleteStatus(job) {
    if (!job.detailCompleted) return "否";
    return Array.isArray(job.collectWarnings) && job.collectWarnings.length ? "可能未完整" : "是";
  }

  function formatFieldValue(job, key) {
    if (key === "detailCompleteStatus") return getDetailCompleteStatus(job);
    if (key === "jdSummary") return job.jdSummary || JobAnalyzer.generateJdSummary(job);
    if (key === "matchScore") {
      const score = job.matchAnalysis?.score;
      return Number.isFinite(Number(score)) ? `${Math.round(Number(score))}%` : "待完善画像";
    }
    if (key === "matchGaps") return Array.isArray(job.matchAnalysis?.gaps) ? job.matchAnalysis.gaps.join("；") : "";
    if (key === "completenessScore") {
      const score = Number(job.completenessScore);
      return Number.isFinite(score) ? `${Math.round(score)}%` : "";
    }
    return job[key] ?? "";
  }

  function toExportRows(jobs) {
    return jobs.map((job) => {
      const row = {};
      EXPORT_FIELDS.forEach(({ header, key }) => {
        row[header] = formatFieldValue(job, key);
      });
      return row;
    });
  }

  function csvEscape(value) {
    return BossJobShared.csvEscape(value);
  }

  function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /**
   * 按固定中文表头导出 CSV。
   * @returns {Promise<void>}
   */
  async function exportCsv() {
    try {
      const jobs = await JobStorage.getAllJobs();
      if (!jobs.length) {
        setStatus("暂无可导出的岗位数据。", "warn");
        return;
      }

      const rows = toExportRows(jobs);
      const lines = [CSV_HEADERS.join(",")].concat(rows.map((row) => CSV_HEADERS.map((header) => csvEscape(row[header])).join(",")));
      downloadTextFile(`boss_jobs_${formatTimestamp()}.csv`, `\ufeff${lines.join("\n")}`, "text/csv;charset=utf-8");
      setStatus(`已导出 CSV，共 ${jobs.length} 条。`, "success");
    } catch (error) {
      setStatus(error.message || "导出 CSV 失败。", "error");
    }
  }

  /**
   * 导出 JSON，字段顺序与 CSV 保持一致。
   * @returns {Promise<void>}
   */
  async function exportJson() {
    try {
      const jobs = await JobStorage.getAllJobs();
      if (!jobs.length) {
        setStatus("暂无可导出的岗位数据。", "warn");
        return;
      }

      const rows = toExportRows(jobs);
      downloadTextFile(`boss_jobs_${formatTimestamp()}.json`, JSON.stringify(rows, null, 2), "application/json;charset=utf-8");
      setStatus(`已导出 JSON，共 ${jobs.length} 条。`, "success");
    } catch (error) {
      setStatus(error.message || "导出 JSON 失败。", "error");
    }
  }

  /**
   * 清空 IndexedDB 中已保存的岗位数据。
   * @returns {Promise<void>}
   */
  async function clearData() {
    try {
      if (!confirm("确定要清空所有已采集岗位吗？此操作仅清空本插件本地数据。")) {
        return;
      }

      await JobStorage.clearJobs();
      setStatus("已清空本地数据。", "success");
      await refreshPreview({ keepStatus: true });
    } catch (error) {
      setStatus(error.message || "清空数据失败。", "error");
    }
  }

  function formatTimestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }
})();
