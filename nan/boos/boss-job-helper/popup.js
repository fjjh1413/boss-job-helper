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
    "岗位职责",
    "技术要求",
    "出现频次关键词",
    "是否适合大三实习",
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
    { header: "岗位职责", key: "responsibilities" },
    { header: "技术要求", key: "requirements" },
    { header: "出现频次关键词", key: "keywordFrequency" },
    { header: "是否适合大三实习", key: "suitability" },
    { header: "匹配技术栈", key: "techStack" },
    { header: "简历优化建议", key: "resumeAdvice" },
    { header: "详情是否完整", key: "detailCompleteStatus" },
    { header: "信息完整度", key: "completenessScore" },
    { header: "岗位链接", key: "link" }
  ];
  const CONTENT_SCRIPT_VERSION = "2026-05-20-compliance-v6";

  const elements = {};

  document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    bindEvents();
    refreshPreview();
  });

  function bindElements() {
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
    elements.collectPageBtn.addEventListener("click", () => collectJobs("COLLECT_VISIBLE_JOBS_V6"));
    elements.collectDetailBtn.addEventListener("click", () => collectJobs("COLLECT_DETAIL_JOB_V6"));
    elements.refreshBtn.addEventListener("click", refreshPreview);
    elements.exportCsvBtn.addEventListener("click", exportCsv);
    elements.exportJsonBtn.addEventListener("click", exportJson);
    elements.clearBtn.addEventListener("click", clearData);
  }

  function setStatus(message, type = "normal") {
    elements.statusText.textContent = message;
    elements.statusText.dataset.type = type;
  }

  function setBusy(isBusy) {
    [
      elements.collectPageBtn,
      elements.collectDetailBtn,
      elements.refreshBtn,
      elements.exportCsvBtn,
      elements.exportJsonBtn,
      elements.clearBtn
    ].forEach((button) => {
      button.disabled = isBusy;
    });
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
      files: ["content.js"]
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
  async function collectJobs(type) {
    try {
      setBusy(true);
      setStatus(type === "COLLECT_VISIBLE_JOBS_V6" ? "正在采集当前页已显示岗位..." : "正在采集当前岗位详情...");
      const pageResult = await requestJobsFromPage(type);
      const rawJobs = pageResult.jobs;
      const normalizedJobs = rawJobs.map((job) => JobAnalyzer.normalizeJobRecord(job));

      if (!normalizedJobs.length) {
        setStatus("未识别到可见岗位信息。请确认页面已加载岗位卡片或详情内容。", "warn");
        await refreshPreview({ keepStatus: true });
        return;
      }

      const result = await JobStorage.saveJobs(normalizedJobs);
      const warningText = pageResult.warning ? ` ${pageResult.warning}` : "";
      setStatus(`采集完成：新增 ${result.inserted} 条，更新 ${result.updated} 条，当前共 ${result.total} 条。${warningText}`, "success");
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
      elements.previewBody.innerHTML = '<tr><td colspan="16" class="empty">暂无数据</td></tr>';
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
      return job.link ? `<a class="job-link" href="${escapeAttribute(job.link)}" target="_blank" rel="noreferrer">打开岗位</a>` : "";
    }
    return escapeHtml(formatFieldValue(job, key));
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
    const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
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
    URL.revokeObjectURL(url);
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
