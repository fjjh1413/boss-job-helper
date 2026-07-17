(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BossJobShared = api;
  root.BossJobConfig = api.config;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const config = Object.freeze({
    SEARCH_URL: "https://www.zhipin.com/web/geek/jobs",
    CONTENT_SCRIPT_VERSION: "2026-07-13-agent-v3",
    PAGE_LOAD_TIMEOUT_MS: 30000,
    MESSAGE_TIMEOUT_MS: 30000,
    DEFAULT_DELAY_MS: 2200,
    SEARCH_COLLECTION_TIMEOUT_MS: 180000,
    MAX_SCROLL_ROUNDS: 60,
    CITY_CODE_MAP: Object.freeze({
      北京: "101010100",
      上海: "101020100",
      广州: "101280100",
      深圳: "101280600",
      杭州: "101210100",
      成都: "101270100",
      武汉: "101200100",
      南京: "101190100",
      苏州: "101190400",
      西安: "101110100",
      重庆: "101040100",
      天津: "101030100",
      长沙: "101250100",
      郑州: "101180100",
      合肥: "101220100",
      厦门: "101230200",
      福州: "101230100",
      青岛: "101120200",
      济南: "101120100",
      宁波: "101210400"
    })
  });

  function buildSearchUrl(criteria = {}) {
    const url = new URL(config.SEARCH_URL);
    if (criteria.keyword) url.searchParams.set("query", criteria.keyword);
    const cityCode = config.CITY_CODE_MAP[criteria.city];
    if (cityCode) url.searchParams.set("city", cityCode);
    return url.href;
  }

  function getScrollBudget(delayMs, requestedRounds = config.MAX_SCROLL_ROUNDS, timeoutMs = config.SEARCH_COLLECTION_TIMEOUT_MS) {
    const safeDelay = Math.max(1200, Math.min(10000, Number(delayMs) || config.DEFAULT_DELAY_MS));
    const safeTimeout = Math.max(30000, Math.min(config.SEARCH_COLLECTION_TIMEOUT_MS, Number(timeoutMs) || config.SEARCH_COLLECTION_TIMEOUT_MS));
    const timeBoundRounds = Math.max(4, Math.floor(safeTimeout / safeDelay));
    const configuredRounds = Math.max(1, Number(requestedRounds) || config.MAX_SCROLL_ROUNDS);
    return Math.max(1, Math.min(config.MAX_SCROLL_ROUNDS, configuredRounds, timeBoundRounds));
  }

  function csvEscape(value) {
    const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
    const safeText = /^[\t ]*[=+\-@]/.test(text) ? `'${text}` : text;
    if (/[",\n]/.test(safeText)) {
      return `"${safeText.replace(/"/g, '""')}"`;
    }
    return safeText;
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "后台状态请求失败。"));
          return;
        }
        resolve(response);
      });
    });
  }

  return {
    config,
    buildSearchUrl,
    getScrollBudget,
    csvEscape,
    sendRuntimeMessage
  };
});
