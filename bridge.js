(function () {
  "use strict";

  const STATE_KEY = "__BOSS_JOB_HELPER_RESPONSE_BRIDGE__";
  const MESSAGE_SOURCE = "boss-job-helper";
  const MAX_BODY_LENGTH = 2 * 1024 * 1024;
  const DETAIL_PATH_PATTERN = /\/wapi\/[^/]+\/job\/detail(?:\.json)?(?:\/|$)/i;

  if (window[STATE_KEY]) return;
  window[STATE_KEY] = { version: 1 };

  function isBossDetailUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ""), location.href);
      const host = url.hostname.toLowerCase();
      const isBossHost = host === "zhipin.com" || host.endsWith(".zhipin.com");
      return url.protocol === "https:" && isBossHost && url.origin === location.origin && DETAIL_PATH_PATTERN.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function normalizeUrl(rawUrl) {
    try {
      return new URL(String(rawUrl || ""), location.href).href;
    } catch (error) {
      return "";
    }
  }

  function postResponse({ url, method, status, body }) {
    if (!body || body.length > MAX_BODY_LENGTH || !isBossDetailUrl(url)) return;
    const trimmed = body.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return;
    window.postMessage({
      source: MESSAGE_SOURCE,
      type: "BOSS_DETAIL_RESPONSE",
      requestUrl: normalizeUrl(url),
      method: String(method || "GET").toUpperCase(),
      status: Number(status) || 0,
      body: trimmed,
      capturedAt: Date.now()
    }, location.origin);
  }

  function captureFetchResponse(response, url, method) {
    if (!response || !isBossDetailUrl(url)) return;
    try {
      response.clone().text().then((body) => {
        postResponse({ url, method, status: response.status, body });
      }).catch(() => {});
    } catch (error) {
    }
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function bossJobHelperFetch(input, init) {
      const requestUrl = typeof input === "string" ? input : input?.url;
      const method = init?.method || input?.method || "GET";
      const result = nativeFetch.apply(this, arguments);
      Promise.resolve(result).then((response) => {
        captureFetchResponse(response, requestUrl, method);
      }).catch(() => {});
      return result;
    };
  }

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function bossJobHelperOpen(method, url) {
    this.__bossJobHelperRequest = { method, url: normalizeUrl(url) };
    return nativeOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function bossJobHelperSend() {
    const request = this.__bossJobHelperRequest || {};
    if (isBossDetailUrl(request.url)) {
      this.addEventListener("load", function onBossJobHelperLoad() {
        postResponse({
          url: request.url,
          method: request.method,
          status: this.status,
          body: typeof this.responseText === "string" ? this.responseText : ""
        });
      }, { once: true });
    }
    return nativeSend.apply(this, arguments);
  };
})();
