(function () {
  "use strict";

  const CONFIG = window.BossJobConfig;
  if (!CONFIG) {
    console.error("BOSS 岗位助手公共配置未加载。 ");
    return;
  }
  const CONTENT_SCRIPT_VERSION = CONFIG.CONTENT_SCRIPT_VERSION;
  const DETAIL_RESPONSE_TIMEOUT_MS = Number(CONFIG.DETAIL_RESPONSE_TIMEOUT_MS) || 4500;
  const DETAIL_UNEXPANDED_WARNING = "当前岗位详情可能未展开，请点击查看更多信息后重新采集。";

  if (window.__bossJobHelperContentVersion === CONTENT_SCRIPT_VERSION) {
    return;
  }
  window.__bossJobHelperContentLoaded = true;
  window.__bossJobHelperContentVersion = CONTENT_SCRIPT_VERSION;
  const BossResponse = window.BossResponse;
  const capturedDetailResponses = [];
  const detailResponseListeners = new Set();
  const MAX_CAPTURED_RESPONSES = 40;

  function rememberDetailResponse(event) {
    const data = event?.data;
    if (event.source !== window || !data || data.source !== "boss-job-helper" || data.type !== "BOSS_DETAIL_RESPONSE") return;
    if (!data.body || !data.requestUrl) return;
    const captured = {
      sourceUrl: String(data.requestUrl),
      method: String(data.method || "GET"),
      status: Number(data.status) || 0,
      body: String(data.body),
      capturedAt: Number(data.capturedAt) || Date.now()
    };
    capturedDetailResponses.push(captured);
    while (capturedDetailResponses.length > MAX_CAPTURED_RESPONSES) capturedDetailResponses.shift();
    detailResponseListeners.forEach((listener) => listener(captured));
  }

  window.addEventListener("message", rememberDetailResponse);

  function createResponseJob(captured, targetJob) {
    if (!BossResponse || typeof BossResponse.normalizeDetailResponse !== "function") {
      return { ok: false, reason: "response_parser_unavailable" };
    }
    return BossResponse.normalizeDetailResponse(captured.body, {
      sourceUrl: captured.sourceUrl,
      status: captured.status,
      targetJob
    });
  }

  function waitForMatchingDetailResponse(targetJob, timeoutMs = DETAIL_RESPONSE_TIMEOUT_MS) {
    const startedAt = Date.now();
    const buffered = capturedDetailResponses
      .filter((item) => item.capturedAt >= startedAt)
      .map((item) => createResponseJob(item, targetJob))
      .find((result) => result.ok);
    if (buffered) return Promise.resolve(buffered);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        detailResponseListeners.delete(onResponse);
        resolve(result);
      };
      const onResponse = (captured) => {
        if (captured.capturedAt < startedAt) return;
        const result = createResponseJob(captured, targetJob);
        if (result.ok) finish(result);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: "response_timeout" }), Math.max(1000, timeoutMs));
      detailResponseListeners.add(onResponse);
    });
  }

  const CARD_SELECTORS = [
    ".job-card-wrapper",
    ".job-card-box",
    ".job-card",
    ".search-job-result li",
    ".job-list-box li",
    ".job-list li",
    "li[class*='job']",
    "div[class*='job-card']"
  ];

  const TITLE_SELECTORS = [
    ".job-name",
    ".job-title .job-name",
    ".job-title .name",
    ".job-title",
    ".job-info .name",
    ".info-primary .name",
    ".name",
    "h1",
    "h2",
    "a[href*='/job_detail/']"
  ];

  const COMPANY_SELECTORS = [
    ".company-name",
    ".company-info .company-name",
    ".company-info .name",
    ".company-info h3",
    ".company-text .name",
    ".info-company .name",
    ".job-detail-company .name",
    "a[href*='/gongsi/']"
  ];

  const SALARY_SELECTORS = [".salary", ".job-salary", ".red", "[class*='salary']"];
  const CITY_SELECTORS = [".job-area", ".job-location", ".location", "[class*='area']"];
  const TAG_SELECTORS = [".tag-list li", ".job-tag li", ".job-labels span", ".info-desc", "[class*='tag'] li"];
  const DETAIL_ROOT_SELECTORS = [
    ".job-detail-box",
    ".job-detail-container",
    ".job-detail-card",
    ".job-detail",
    ".detail-content",
    ".detail-box",
    "[class*='job-detail']",
    "main",
    "section",
    "article",
    "aside"
  ];
  const DETAIL_BODY_SELECTORS = [
    ".job-sec-text",
    ".job-detail-section",
    ".job-description",
    ".job-detail-content",
    ".detail-content",
    "[class*='job-sec']",
    "[class*='description']"
  ];

  const DETAIL_KEYWORDS = [
    "我们能提供",
    "职位描述",
    "岗位职责",
    "工作内容",
    "任职要求",
    "岗位要求",
    "技术要求",
    "工作地址"
  ];
  const DETAIL_KEYWORD_PATTERN = new RegExp(DETAIL_KEYWORDS.join("|"));
  const UNEXPANDED_PATTERN = /查看更多信息|查看更多|展开全部|展开更多/;
  const JOB_TITLE_PATTERN = /工程师|开发|实习生|助理|顾问|产品|算法|后端|前端|全栈|大模型|AI|训练师|数据标注/i;
  const COMPANY_WORD_PATTERN = /(科技|信息|网络|软件|数据|集团|股份|有限|公司|教育|咨询|传媒|电子|通信|云|数科|研究院|实验室)/;
  const NON_COMPANY_TEXT_PATTERN = /(负责|参与|制定|标准|规范|开发|设计|实现|熟悉|掌握|经验|要求|职位描述|岗位职责|工作内容|任职要求|岗位要求|技术要求|我们能提供|工作地址|应用设计|业务|模型|流程)/;
  const EXPERIENCE_PATTERN = /经验不限|在校\/应届|在校|应届|应届生|1年以内|一年以内|1年以下|1-3年|3-5年|5-10年|10年以上|(?:[1-9]|10)年(?:以内|以下|以上)?/;

  const CITY_NAMES = [
    "北京",
    "上海",
    "杭州",
    "深圳",
    "广州",
    "成都",
    "武汉",
    "南京",
    "苏州",
    "西安",
    "重庆",
    "天津",
    "长沙",
    "郑州",
    "合肥",
    "厦门",
    "福州",
    "青岛",
    "济南",
    "宁波",
    "无锡",
    "佛山",
    "东莞",
    "珠海",
    "大连",
    "沈阳",
    "长春",
    "哈尔滨",
    "昆明",
    "南昌",
    "南宁",
    "贵阳",
    "海口",
    "石家庄",
    "太原",
    "兰州",
    "呼和浩特",
    "乌鲁木齐"
  ];

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function removeCalendarYears(text) {
    return cleanText(text).replace(/(?:19|20)\d{2}\s*年/g, "");
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getRect(element) {
    return element.getBoundingClientRect();
  }

  function getVisibleText(element) {
    if (!element || !isVisible(element)) return "";
    return cleanText(element.innerText || element.textContent || "");
  }

  function stripCssContent(value) {
    const text = cleanText(value);
    if (!text || text === "none" || text === "normal") return "";
    return text.replace(/^["']|["']$/g, "");
  }

  function getPseudoTexts(element) {
    return ["::before", "::after"]
      .map((pseudo) => stripCssContent(window.getComputedStyle(element, pseudo).content))
      .filter(Boolean);
  }

  function getElementTextCandidates(element) {
    if (!element || !isVisible(element)) return [];
    const values = [
      element.innerText,
      element.textContent,
      element.getAttribute("title"),
      element.getAttribute("aria-label"),
      element.getAttribute("data-title"),
      element.getAttribute("data-name"),
      element.getAttribute("data-salary"),
      element.getAttribute("data-value")
    ];

    getPseudoTexts(element).forEach((value) => values.push(value));

    return [...new Set(values.map(cleanText).filter(Boolean))];
  }

  function getAllTexts(root, selectors) {
    return selectors
      .flatMap((selector) => [...root.querySelectorAll(selector)].filter(isVisible).flatMap(getElementTextCandidates))
      .filter(Boolean);
  }

  function getLines(root) {
    return getVisibleText(root)
      .split("\n")
      .map(cleanText)
      .filter(Boolean);
  }

  function normalizeSalary(text) {
    const source = cleanText(text)
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/[－—–]/g, "-")
      .replace(/[／]/g, "/")
      .replace(/[・•･]/g, "·")
      .replace(/\s+/g, "");
    const match = source.match(
      /\d+(?:\.\d+)?-\d+(?:\.\d+)?[Kk](?:·?\d+薪)?|\d+(?:\.\d+)?[Kk](?:·?\d+薪)?|\d+-\d+元\/天|\d+元\/天|\d+-\d+元每天|\d+元每天|\d+(?:\.\d+)?-\d+(?:\.\d+)?万\/月|\d+(?:\.\d+)?万\/月|面议/
    );
    return match ? match[0].replace(/k/g, "K") : "";
  }

  function hasObfuscatedSalaryText(text) {
    const source = cleanText(text).replace(/\s+/g, "");
    return /[\uE000-\uF8FF□]{1,4}-[\uE000-\uF8FF□]{1,4}[Kk]/.test(source) || /[\uE000-\uF8FF□]+元\/天/.test(source);
  }

  function extractSalary(root) {
    const salaryTexts = getAllTexts(root, SALARY_SELECTORS);
    const candidates = [...salaryTexts, ...getElementTextCandidates(root), getVisibleText(root)];
    for (const text of candidates) {
      const salary = normalizeSalary(text);
      if (salary) return salary;
    }
    return candidates.some(hasObfuscatedSalaryText) ? "薪资数字被页面字体加密，未读取到明文" : "";
  }

  function extractExperience(text) {
    return removeCalendarYears(text).match(EXPERIENCE_PATTERN)?.[0] || "";
  }

  function extractEducation(text) {
    const source = cleanText(text);
    return (
      source.match(/(?:985\/211|211\/985|985|211|双一流)\s*本科(?:及以上)?(?:学历)?/)?.[0] ||
      source.match(/(?:985\/211|211\/985|985|211|双一流)\s*(?:院校|高校|学历|背景)?/)?.[0] ||
      source.match(/学历不限|中专|高中|大专|本科(?:及以上)?(?:学历)?|硕士(?:及以上)?(?:学历)?|博士(?:及以上)?(?:学历)?/)?.[0] ||
      ""
    );
  }

  function normalizeCity(text) {
    const source = cleanText(text);
    if (!source || /职位描述|岗位职责|岗位要求|任职要求|技术要求/.test(source)) return "";
    return CITY_NAMES.find((city) => source.includes(city)) || "";
  }

  function normalizeTitle(text) {
    let title = cleanText(text).split("\n")[0];
    title = title.replace(normalizeSalary(title), "").trim();
    title = title.replace(/[\uE000-\uF8FF□]{1,4}-[\uE000-\uF8FF□]{1,4}[Kk](?:·[\uE000-\uF8FF□]{1,3}薪)?/g, "").trim();
    title = title.replace(/^(推荐|急聘|\s)+/, "").trim();
    if (!title || title.length > 70) return "";
    if (/职位描述|岗位职责|任职要求|工作地址|公司介绍|BOSS直聘|立即沟通|收藏|举报/.test(title)) return "";
    return title;
  }

  function extractTitleFromText(text) {
    return (
      cleanText(text)
        .split("\n")
        .map(normalizeTitle)
        .find((line) => JOB_TITLE_PATTERN.test(line)) || ""
    );
  }

  function getFirstUsefulText(root, selectors, predicate) {
    for (const selector of selectors) {
      const candidates = [...root.querySelectorAll(selector)].filter(isVisible);
      for (const element of candidates) {
        for (const value of getElementTextCandidates(element)) {
          const firstLine = cleanText(value.split("\n")[0]);
          if (firstLine && (!predicate || predicate(firstLine))) return firstLine;
        }
      }
    }
    return "";
  }

  function extractTitle(root) {
    const selected = getFirstUsefulText(root, TITLE_SELECTORS, (text) => Boolean(normalizeTitle(text)));
    return normalizeTitle(selected) || extractTitleFromText(getVisibleText(root));
  }

  function normalizeCompany(text) {
    let value = cleanText(text).split("\n")[0];
    value = value.replace(/^.*?(?=([\u4e00-\u9fa5A-Za-z0-9（）()]+(?:科技|信息|智能|网络|软件|数据|集团|股份|有限|公司|教育|咨询|传媒|电子|通信|云|数科|研究院|实验室)))/, "");
    value = value.split(/[·|｜]/)[0].trim();
    if (!value || value.length > 44) return "";
    if (NON_COMPANY_TEXT_PATTERN.test(value)) return "";
    if (/BOSS直聘|岗位职责|任职要求|职位描述|工作地址|薪资|经验|学历|首页|职位|公司|校园|立即沟通|收藏/.test(value) && !COMPANY_WORD_PATTERN.test(value)) {
      return "";
    }
    if (normalizeSalary(value) || extractExperience(value) || extractEducation(value)) return "";
    return value;
  }

  function extractCompany(root) {
    const selected = getFirstUsefulText(root, COMPANY_SELECTORS, (text) => Boolean(normalizeCompany(text)));
    if (normalizeCompany(selected)) return normalizeCompany(selected);

    return (
      getLines(root)
        .map(normalizeCompany)
        .find((line) => line && COMPANY_WORD_PATTERN.test(line)) || ""
    );
  }

  function extractCity(root) {
    const cityTexts = getAllTexts(root, CITY_SELECTORS).concat(getLines(root).slice(0, 16));
    for (const text of cityTexts) {
      const city = normalizeCity(text);
      if (city) return city;
    }
    return normalizeCity(getVisibleText(root));
  }

  function extractRequirementFromRoot(root, extractor) {
    const headerText = getLines(root).slice(0, 16).join("\n");
    const tagText = getAllTexts(root, TAG_SELECTORS).join("\n");
    return extractor(tagText) || extractor(headerText) || extractor(getVisibleText(root));
  }

  function extractExperienceFromRoot(root) {
    return extractRequirementFromRoot(root, extractExperience);
  }

  function extractEducationFromRoot(root) {
    return extractRequirementFromRoot(root, extractEducation);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getScrollableElement(selector) {
    return [...document.querySelectorAll(selector)]
      .filter(isVisible)
      .find((element) => element.scrollHeight > element.clientHeight + 40);
  }

  function getScrollTarget() {
    return (
      getScrollableElement(".job-list-box") ||
      getScrollableElement(".search-job-result") ||
      getScrollableElement(".job-list") ||
      getScrollableElement("[class*='job-list']") ||
      document.scrollingElement ||
      document.documentElement
    );
  }

  function getScrollTop(target) {
    return target === document.scrollingElement || target === document.documentElement ? window.scrollY : target.scrollTop;
  }

  function getMaxScrollTop(target) {
    if (target === document.scrollingElement || target === document.documentElement) {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }
    return Math.max(0, target.scrollHeight - target.clientHeight);
  }

  function scrollSearchResultsOnce() {
    const target = getScrollTarget();
    const before = getScrollTop(target);
    const delta = Math.max(360, Math.round(window.innerHeight * 0.75));
    if (target === document.scrollingElement || target === document.documentElement) {
      window.scrollBy({ top: delta, left: 0, behavior: "smooth" });
    } else {
      target.scrollBy({ top: delta, left: 0, behavior: "smooth" });
    }
    return { before, max: getMaxScrollTop(target) };
  }

  function collectUniqueJobs(existingJobs) {
    const unique = new Map();
    existingJobs.concat(collectVisibleJobCards()).forEach((job) => {
      const key = job.link || [job.title, job.company, job.city, job.salary].join("|");
      if (key && !unique.has(key)) unique.set(key, job);
    });
    return [...unique.values()];
  }

  async function scrollAndCollectJobs(options = {}) {
    const maxScrolls = Math.max(1, Math.min(20, Number(options.maxScrolls) || 6));
    const delayMs = Math.max(1000, Math.min(10000, Number(options.delayMs) || 2200));
    let jobs = collectUniqueJobs([]);
    let stableRounds = 0;

    for (let index = 0; index < maxScrolls; index += 1) {
      const beforeCount = jobs.length;
      const { before, max } = scrollSearchResultsOnce();
      await sleep(delayMs);
      jobs = collectUniqueJobs(jobs);
      const after = getScrollTop(getScrollTarget());
      const reachedBottom = after >= max - 8 || after === before;
      stableRounds = jobs.length === beforeCount ? stableRounds + 1 : 0;
      if (reachedBottom && stableRounds >= 1) break;
      if (stableRounds >= 2) break;
    }

    return jobs;
  }

  function detectPageGate() {
    const text = getVisibleText(document.body).slice(0, 12000);
    const url = String(location.href || "");
    if (/安全验证|人机验证|滑动验证|请输入验证码|验证码校验/.test(text)) return "captcha";
    if (/\/login(?:[/?#]|$)|\/register(?:[/?#]|$)|\/user\/login(?:[/?#]|$)/i.test(url)) return "auth";
    if (/登录后查看|立即登录|请先登录|登录\s*\/\s*注册|登录注册/.test(text)) return "auth";
    return "";
  }

  function isDisabledControl(element) {
    return (
      element.disabled ||
      element.getAttribute("aria-disabled") === "true" ||
      /disabled|disable|已是最后|没有下一页/.test(String(element.className || ""))
    );
  }

  function findNextPageUrl() {
    const candidates = [...document.querySelectorAll("a, button")]
      .filter(isVisible)
      .filter((element) => !isDisabledControl(element))
      .filter((element) => {
        const label = cleanText(element.innerText || element.textContent || element.getAttribute("aria-label") || "");
        return /下一页|下页|next/i.test(label);
    });

    for (const element of candidates) {
      const href = element.getAttribute("href") || element.getAttribute("data-url") || element.getAttribute("data-href");
      try {
        let url;
        if (href) {
          url = new URL(href, location.href);
        } else {
          const page = element.getAttribute("data-page") || element.dataset?.page;
          if (!page) continue;
          url = new URL(location.href);
          url.searchParams.set("page", page);
        }
        if (url.origin === location.origin && url.href !== location.href) return url.href;
      } catch (error) {
      }
    }
    return "";
  }

  async function collectSearchPage(options = {}) {
    const gate = detectPageGate();
    if (gate) {
      return {
        ok: true,
        version: CONTENT_SCRIPT_VERSION,
        jobs: [],
        exhausted: false,
        requiresUserAction: gate,
        message: gate === "captcha" ? "BOSS 页面需要完成验证码。" : "BOSS 页面需要先登录。"
      };
    }

    const delayMs = Math.max(1200, Math.min(10000, Number(options.delayMs) || CONFIG.DEFAULT_DELAY_MS));
    const maxScrollRounds = typeof BossJobShared !== "undefined" && typeof BossJobShared.getScrollBudget === "function"
      ? BossJobShared.getScrollBudget(delayMs, options.maxScrollRounds || CONFIG.MAX_SCROLL_ROUNDS, options.collectionTimeoutMs)
      : Math.max(4, Math.min(CONFIG.MAX_SCROLL_ROUNDS, Math.floor(CONFIG.SEARCH_COLLECTION_TIMEOUT_MS / delayMs)));
    let jobs = collectUniqueJobs([]);
    let stableRounds = 0;
    let reachedBottomRounds = 0;
    let scrollRounds = 0;

    for (let index = 0; index < maxScrollRounds; index += 1) {
      scrollRounds = index + 1;
      const beforeCount = jobs.length;
      const target = getScrollTarget();
      const beforeTop = getScrollTop(target);
      const beforeMax = getMaxScrollTop(target);
      scrollSearchResultsOnce();
      await sleep(delayMs);
      jobs = collectUniqueJobs(jobs);

      const afterTarget = getScrollTarget();
      const afterTop = getScrollTop(afterTarget);
      const afterMax = getMaxScrollTop(afterTarget);
      const hasNewJobs = jobs.length > beforeCount;
      const reachedBottom = afterTop >= afterMax - 8 || (afterTop <= beforeTop + 2 && beforeMax <= afterMax + 8);
      stableRounds = hasNewJobs ? 0 : stableRounds + 1;
      reachedBottomRounds = reachedBottom ? reachedBottomRounds + 1 : 0;

      if (reachedBottom && stableRounds >= 2) break;
      if (stableRounds >= 4 && afterTop <= beforeTop + 2) break;
    }

    const nextPageUrl = findNextPageUrl();
    return {
      ok: true,
      version: CONTENT_SCRIPT_VERSION,
      jobs,
      exhausted: !nextPageUrl && stableRounds >= 2 && reachedBottomRounds >= 1,
      nextPageUrl,
      pageUrl: location.href,
      search: {
        scrollRounds,
        stagnantRounds: stableRounds,
        exhausted: !nextPageUrl && stableRounds >= 2 && reachedBottomRounds >= 1,
        nextPageUrl,
        currentUrl: location.href
      }
    };
  }

  function getAbsoluteLink(root) {
    const link = root.matches?.("a[href*='/job_detail/']") ? root : root.querySelector("a[href*='/job_detail/']");
    if (!link) return "";
    try {
      return new URL(link.getAttribute("href"), location.href).href;
    } catch (error) {
      return "";
    }
  }

  function isDetailLink(value) {
    if (!value) return false;
    try {
      return /\/job_detail\//.test(new URL(value, location.href).pathname);
    } catch (error) {
      return /\/job_detail\//.test(String(value));
    }
  }

  function getCurrentDetailUrl() {
    try {
      const url = new URL(location.href);
      return /\/job_detail\//.test(url.pathname) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function isPlaceholderValue(value) {
    return /未识别|当前页面未展示|字体加密|未读取到明文|[\uE000-\uF8FF□]/.test(cleanText(value));
  }

  function compactText(value) {
    return cleanText(value).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").toLowerCase();
  }

  function titleLooksRelated(leftTitle, rightTitle) {
    const left = compactText(leftTitle);
    const right = compactText(rightTitle);
    if (!left || !right) return false;
    if (left.includes(right) || right.includes(left)) return true;
    const shared = [...new Set(right)].filter((char) => left.includes(char)).length;
    return shared >= Math.min(8, right.length);
  }

  function isLeftPaneElement(element, rightPaneLeft) {
    const rect = getRect(element);
    if (!rect.width || !rect.height) return false;
    if (window.innerWidth < 900) return true;
    const centerX = rect.left + rect.width / 2;
    return centerX < window.innerWidth * 0.55 && rect.right <= rightPaneLeft + 32;
  }

  function isRightPaneElement(element) {
    const rect = getRect(element);
    if (!rect.width || !rect.height) return false;
    if (window.innerWidth < 900) return true;
    const centerX = rect.left + rect.width / 2;
    return centerX > window.innerWidth * 0.42 && rect.right > window.innerWidth * 0.55;
  }

  function getRightPaneRatio(element) {
    const rect = getRect(element);
    if (!rect.width) return 0;
    const rightStart = window.innerWidth * 0.42;
    const rightWidth = Math.max(0, rect.right - Math.max(rect.left, rightStart));
    return rightWidth / rect.width;
  }

  function scoreDetailRoot(element) {
    if (!isRightPaneElement(element)) return 0;
    const text = getVisibleText(element);
    if (text.length < 40 || text.length > 16000) return 0;

    let score = 0;
    const keywordMatches = text.match(DETAIL_KEYWORD_PATTERN) || [];
    score += keywordMatches.length * 45;
    score += Math.round(getRightPaneRatio(element) * 30);
    if (extractSalary(element)) score += 30;
    if (JOB_TITLE_PATTERN.test(text)) score += 20;
    if (/立即沟通|收藏|举报|微信扫码分享/.test(text)) score += 12;
    if (/推荐\s*\||添加求职期望|工作区域|职位类型|薪资待遇|公司行业|公司规模/.test(text)) score -= 80;
    return score;
  }

  function findDetailRoot() {
    const selectorCandidates = [...new Set(DETAIL_ROOT_SELECTORS.flatMap((selector) => [...document.querySelectorAll(selector)].filter(isVisible)))];
    const fallbackCandidates = [...document.querySelectorAll("div")]
      .filter(isVisible)
      .filter((element) => isRightPaneElement(element) && DETAIL_KEYWORD_PATTERN.test(getVisibleText(element)));
    const candidates = [...new Set(selectorCandidates.concat(fallbackCandidates))];

    return (
      candidates
        .map((element) => ({ element, score: scoreDetailRoot(element), rect: getRect(element) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]?.element || null
    );
  }

  function findDetailBody(detailRoot) {
    if (!detailRoot) return null;
    const candidates = DETAIL_BODY_SELECTORS.flatMap((selector) => [...detailRoot.querySelectorAll(selector)].filter(isVisible));
    return (
      candidates
        .map((element) => {
          const text = getVisibleText(element);
          const keywordMatches = text.match(DETAIL_KEYWORD_PATTERN) || [];
          return { element, score: keywordMatches.length * 50 + (text.length > 120 ? 20 : 0), length: text.length };
        })
        .filter((item) => item.score > 0 && item.length >= 20)
        .sort((a, b) => b.score - a.score || b.length - a.length)[0]?.element || detailRoot
    );
  }

  function findRightHeaderBlock(detailRoot) {
    if (!detailRoot) return null;
    const candidates = [detailRoot].concat([...detailRoot.querySelectorAll("h1, h2, h3, span, div")].filter(isVisible));
    return (
      candidates
        .map((element) => {
          const text = getVisibleText(element);
          if (!text || text.length > 700) return { element, score: 0, length: text.length };
          let score = 0;
          if (extractSalary(element)) score += 60;
          if (JOB_TITLE_PATTERN.test(text)) score += 40;
          if (extractExperience(text)) score += 12;
          if (extractEducation(text)) score += 12;
          if (normalizeCity(text)) score += 8;
          if (DETAIL_KEYWORD_PATTERN.test(text)) score -= 30;
          return { element, score, length: text.length };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.length - b.length)[0]?.element || detailRoot
    );
  }

  function hasUnexpandedDetail(detailRoot) {
    if (!detailRoot) return false;
    return [...detailRoot.querySelectorAll("button, a, span, div")]
      .filter(isVisible)
      .some((element) => UNEXPANDED_PATTERN.test(getVisibleText(element)));
  }

  async function expandDetail(detailRoot) {
    if (!detailRoot) return false;
    const controls = [...detailRoot.querySelectorAll("button, a, span, div")]
      .filter(isVisible)
      .filter((element) => !isDisabledControl(element))
      .filter((element) => UNEXPANDED_PATTERN.test(getVisibleText(element)))
      .filter((element) => getVisibleText(element).length <= 40)
      .slice(0, 3);

    let expanded = false;
    for (const control of controls) {
      control.click();
      expanded = true;
      await sleep(500);
    }
    return expanded;
  }

  async function collectCurrentDetailV2() {
    const gate = detectPageGate();
    if (gate) {
      return {
        ok: true,
        version: CONTENT_SCRIPT_VERSION,
        jobs: [],
        requiresUserAction: gate,
        message: gate === "captcha" ? "详情页需要完成验证码。" : "详情页需要先登录。"
      };
    }

    let detailRoot = findDetailRoot();
    if (!detailRoot) return { ok: false, version: CONTENT_SCRIPT_VERSION, error: "未找到岗位详情容器。" };
    await expandDetail(detailRoot);
    await sleep(300);
    detailRoot = findDetailRoot() || detailRoot;

    const jobs = collectCurrentDetail();
    if (!jobs.length) return { ok: false, version: CONTENT_SCRIPT_VERSION, error: "详情容器中没有可提取的岗位信息。" };

    const job = jobs[0];
    const warning = hasUnexpandedDetail(detailRoot) ? DETAIL_UNEXPANDED_WARNING : "";
    const detailText = cleanText(job.detailText);
    job.warning = warning;
    job.collectWarnings = warning ? [warning] : [];
    const hasStructuredDetail = /岗位职责|任职要求|岗位要求|职位描述|工作内容/.test(detailText) && detailText.length >= 20;
    job.detailCompleted = !warning && (hasStructuredDetail || detailText.length >= 60);
    job.detailStatus = job.detailCompleted ? "complete" : "partial";

    return {
      ok: true,
      version: CONTENT_SCRIPT_VERSION,
      collectionMethod: "dom",
      captureConfidence: 0.96,
      warning,
      jobs: [job]
    };
  }

  function sameJobDetailLink(left, right) {
    if (!isDetailLink(left) || !isDetailLink(right)) return false;
    try {
      return new URL(left, location.href).pathname === new URL(right, location.href).pathname;
    } catch (error) {
      return false;
    }
  }

  function findJobCardForSelection(targetJob = {}) {
    const targetLink = targetJob.link || "";
    if (targetLink) {
      const direct = [...document.querySelectorAll("a[href*='/job_detail/']")]
        .find((anchor) => sameJobDetailLink(anchor.href, targetLink));
      if (direct) return getCardRoot(direct);
    }
    const candidates = collectCardRoots();
    return candidates.find((card) => {
      const cardJob = parseJobFromRoot(card, "list");
      if (targetLink && sameJobDetailLink(cardJob.link, targetLink)) return true;
      const titleMatched = titleLooksRelated(cardJob.title, targetJob.title);
      const companyMatched = !targetJob.company || !cardJob.company || compactText(cardJob.company) === compactText(targetJob.company);
      return Boolean(titleMatched && companyMatched);
    }) || null;
  }

  function detailMatchesSelection(detailJob, targetJob = {}) {
    if (!detailJob) return false;
    if (sameJobDetailLink(detailJob.link, targetJob.link)) return true;
    return titleLooksRelated(detailJob.title, targetJob.title);
  }

  function dispatchCardClick(target) {
    if (!target || typeof target.dispatchEvent !== "function") return;
    try {
      target.focus?.({ preventScroll: true });
    } catch (error) {
    }
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
      const EventClass = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventClass(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: type.includes("down") ? 1 : 0
      }));
    });
    if (typeof target.click === "function" && !target.matches?.("a[href], button, input, textarea, select")) {
      target.click();
    }
  }

  function activateJobCard(card) {
    const target = card.matches?.("li.job-card-box, .job-card-box, .job-card-wrapper")
      ? card
      : card.querySelector("[role='button'], .job-card-left, .job-card-body") || card;
    if (target.matches?.("a[href], button, input, textarea, select")) {
      dispatchCardClick(target.parentElement || card);
      return;
    }
    dispatchCardClick(target);
  }

  async function collectDetailFromSearchCard(targetJob = {}) {
    const gate = detectPageGate();
    if (gate) {
      return {
        ok: true,
        version: CONTENT_SCRIPT_VERSION,
        jobs: [],
        requiresUserAction: gate,
        message: gate === "captcha" ? "详情面板需要完成验证码。" : "详情面板需要先登录。"
      };
    }

    const card = findJobCardForSelection(targetJob);
    if (!card) return { ok: false, version: CONTENT_SCRIPT_VERSION, error: "当前搜索页未找到对应岗位卡片，无法进入详情面板。" };

    card.scrollIntoView({ block: "center", behavior: "auto" });
    const responsePromise = waitForMatchingDetailResponse(targetJob, DETAIL_RESPONSE_TIMEOUT_MS);
    activateJobCard(card);

    const captured = await responsePromise;
    if (captured.ok && captured.job?.detailCompleted) {
      return {
        ok: true,
        version: CONTENT_SCRIPT_VERSION,
        collectionMethod: "response",
        captureConfidence: captured.job.captureConfidence,
        responseUrl: captured.job.responseUrl,
        jobs: [{
          ...captured.job,
          warning: "",
          collectWarnings: [],
          detailStatus: "complete"
        }]
      };
    }

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      await sleep(300);
      const currentGate = detectPageGate();
      if (currentGate) {
        return {
          ok: true,
          version: CONTENT_SCRIPT_VERSION,
          jobs: [],
          requiresUserAction: currentGate,
          message: currentGate === "captcha" ? "详情面板需要完成验证码。" : "详情面板需要先登录。"
        };
      }
      const detailRoot = findDetailRoot();
      if (!detailRoot) continue;
      const current = collectCurrentDetail()[0];
      if (!detailMatchesSelection(current, targetJob)) continue;
      return collectCurrentDetailV2();
    }

    return {
      ok: false,
      version: CONTENT_SCRIPT_VERSION,
      error: captured.reason === "response_timeout"
        ? "岗位详情接口和右侧详情面板均未在限定时间内返回。"
        : "岗位卡片已选中，但详情面板未在限定时间内加载。"
    };
  }

  function getCardRoot(element) {
    return element.closest(".job-card-wrapper, .job-card-box, .job-card, li[class*='job'], div[class*='job-card']") || element;
  }

  function hasSelectedClass(element) {
    const selectedClassPattern = /(^|[-_])(active|selected|checked|current|cur|on)([-_]|$)/i;
    return [element, ...element.querySelectorAll("[class]")]
      .slice(0, 80)
      .some((node) => [...node.classList].some((className) => selectedClassPattern.test(className)));
  }

  function hasSelectedStyle(element) {
    const style = window.getComputedStyle(element);
    const marker = `${style.borderColor} ${style.outlineColor} ${style.boxShadow}`;
    return /(0,\s*190,\s*189|0,\s*191,\s*191|0,\s*180,\s*180|0,\s*188,\s*183|18,\s*183,\s*183)/i.test(marker);
  }

  function isSelectedCard(element) {
    return (
      element.getAttribute("aria-selected") === "true" ||
      element.getAttribute("data-selected") === "true" ||
      hasSelectedClass(element) ||
      hasSelectedStyle(element)
    );
  }

  function isLikelyJobCard(element) {
    const text = getVisibleText(element);
    if (text.length < 16 || text.length > 900) return false;
    if (DETAIL_KEYWORD_PATTERN.test(text)) return false;
    const hasLink = Boolean(element.matches?.("a[href*='/job_detail/']") || element.querySelector("a[href*='/job_detail/']"));
    const hasSalary = Boolean(extractSalary(element));
    const hasJobWord = JOB_TITLE_PATTERN.test(text);
    return hasLink || (hasSalary && hasJobWord);
  }

  function collectCardRoots() {
    const detailRoot = findDetailRoot();
    const rightPaneLeft = detailRoot ? getRect(detailRoot).left : window.innerWidth * 0.5;
    const roots = new Set();

    CARD_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        const root = getCardRoot(element);
        const isInJobListPane = !detailRoot || isLeftPaneElement(root, rightPaneLeft);
        if (isVisible(root) && isInJobListPane && isLikelyJobCard(root)) {
          roots.add(root);
        }
      });
    });

    const candidates = [...roots];
    const candidateSet = new Set(candidates);
    const links = new Map(candidates.map((root) => [root, getAbsoluteLink(root)]));
    return candidates.filter((root) => {
      const link = links.get(root);
      let parent = root.parentElement;
      while (parent) {
        if (candidateSet.has(parent) && links.get(parent) === link) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }

  function scoreCardMatch(cardJob, detailJob) {
    let score = 0;
    if (cardJob.title && detailJob.title && titleLooksRelated(cardJob.title, detailJob.title)) score += 55;
    if (cardJob.city && detailJob.city && cardJob.city === detailJob.city) score += 20;
    if (cardJob.experience && detailJob.experience && cardJob.experience === detailJob.experience) score += 12;
    if (cardJob.education && detailJob.education && cardJob.education === detailJob.education) score += 12;
    if (cardJob.salary && detailJob.salary && cardJob.salary === detailJob.salary) score += 24;
    if (cardJob.company && detailJob.company && compactText(cardJob.company) === compactText(detailJob.company)) score += 20;
    return score;
  }

  function hasReliableCardMatch(cardJob, detailJob, score) {
    const titleMatched = cardJob.title && detailJob.title && titleLooksRelated(cardJob.title, detailJob.title);
    const companyMatched = cardJob.company && detailJob.company && compactText(cardJob.company) === compactText(detailJob.company);
    const salaryMatched = cardJob.salary && detailJob.salary && cardJob.salary === detailJob.salary;
    const hasCompanyOrSalarySignal = Boolean((cardJob.company && detailJob.company) || (cardJob.salary && detailJob.salary));
    if (hasCompanyOrSalarySignal) return Boolean(titleMatched && (companyMatched || salaryMatched));
    return Boolean(titleMatched && score >= 79);
  }

  function findMatchingLeftCardJob(detailJob) {
    return collectCardRoots()
      .map((card) => parseJobFromRoot(card, "list"))
      .map((job) => ({ job, score: scoreCardMatch(job, detailJob) }))
      .filter((item) => hasReliableCardMatch(item.job, detailJob, item.score))
      .sort((a, b) => b.score - a.score)[0]?.job || {};
  }

  function findActiveLeftCardJob() {
    return collectCardRoots()
      .filter(isSelectedCard)
      .map((card) => parseJobFromRoot(card, "list"))
      .find((job) => isDetailLink(job.link)) || {};
  }

  function resolveLeftCardJob(detailJob) {
    const activeJob = findActiveLeftCardJob();
    if (activeJob.link) return activeJob;
    return findMatchingLeftCardJob(detailJob);
  }

  function resolveDetailLink(detailJob, leftCardJob) {
    const currentDetailUrl = getCurrentDetailUrl();
    if (currentDetailUrl) return currentDetailUrl;
    if (isDetailLink(leftCardJob.link)) return leftCardJob.link;
    if (isDetailLink(detailJob.link)) return detailJob.link;
    return "";
  }

  function preferUsefulValue(primary, fallback) {
    return primary && !isPlaceholderValue(primary) ? primary : fallback || primary || "";
  }

  function parseJobFromRoot(root, sourceType) {
    const rawText = getVisibleText(root);
    return {
      title: extractTitle(root),
      company: extractCompany(root),
      city: extractCity(root),
      salary: extractSalary(root),
      experience: extractExperienceFromRoot(root),
      education: extractEducationFromRoot(root),
      link: getAbsoluteLink(root),
      cardText: sourceType === "list" ? rawText : "",
      detailText: sourceType === "detail" ? rawText : "",
      rawText,
      sourceType
    };
  }

  function collectVisibleJobCards() {
    const jobs = collectCardRoots().map((card) => parseJobFromRoot(card, "list"));
    const unique = new Map();
    jobs.forEach((job) => {
      const key = job.link || [job.title, job.company, job.city, job.salary].join("|");
      if (!unique.has(key) && job.title) {
        unique.set(key, {
          ...job,
          detailCompleted: false,
          collectWarnings: [],
          completenessScore: 0
        });
      }
    });
    return [...unique.values()];
  }

  function collectCurrentDetail() {
    const detailRoot = findDetailRoot();
    if (!detailRoot) return [];

    const headerRoot = findRightHeaderBlock(detailRoot);
    const bodyRoot = findDetailBody(detailRoot);
    const headerJob = parseJobFromRoot(headerRoot || detailRoot, "detail");
    const leftCardJob = resolveLeftCardJob(headerJob);
    const detailText = getVisibleText(bodyRoot || detailRoot);
    const rawText = [getVisibleText(headerRoot || detailRoot), detailText].map(cleanText).filter(Boolean).join("\n\n");
    const warning = hasUnexpandedDetail(detailRoot) ? DETAIL_UNEXPANDED_WARNING : "";
    const collectWarnings = warning ? [warning] : [];

    return [
      {
        ...headerJob,
        title: headerJob.title || extractTitleFromText(rawText),
        company: preferUsefulValue(headerJob.company, leftCardJob.company || extractCompany(detailRoot)),
        city: headerJob.city || extractCity(detailRoot),
        salary: preferUsefulValue(headerJob.salary, leftCardJob.salary || extractSalary(detailRoot) || normalizeSalary(rawText)),
        experience: headerJob.experience || extractExperience(rawText),
        education: headerJob.education || extractEducation(rawText),
        link: resolveDetailLink(headerJob, leftCardJob),
        detailText,
        rawText,
        warning,
        collectWarnings,
        detailCompleted: true,
        completenessScore: 0,
        sourceType: "detail"
      }
    ];
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "PING") {
      sendResponse({ ok: true, version: CONTENT_SCRIPT_VERSION });
      return true;
    }

    if (
      message.type === "COLLECT_VISIBLE_JOBS" ||
      message.type === "COLLECT_VISIBLE_JOBS_V2" ||
      message.type === "COLLECT_VISIBLE_JOBS_V4" ||
      message.type === "COLLECT_VISIBLE_JOBS_V6"
    ) {
      sendResponse({
        ok: true,
        version: CONTENT_SCRIPT_VERSION,
        jobs: collectVisibleJobCards()
      });
      return true;
    }

    if (
      message.type === "COLLECT_DETAIL_JOB" ||
      message.type === "COLLECT_DETAIL_JOB_V2" ||
      message.type === "COLLECT_DETAIL_JOB_V4" ||
      message.type === "COLLECT_DETAIL_JOB_V6" ||
      message.type === "COLLECT_DETAIL_JOB_AGENT_V1" ||
      message.type === "COLLECT_DETAIL_JOB_AGENT_V2"
    ) {
      const result = message.type === "COLLECT_DETAIL_JOB_AGENT_V2" ? collectCurrentDetailV2() : Promise.resolve({ ok: true, jobs: collectCurrentDetail() });
      result.then((detailResult) => {
        sendResponse({
          ok: detailResult.ok !== false,
          version: CONTENT_SCRIPT_VERSION,
          warning: detailResult.warning || "",
          requiresUserAction: detailResult.requiresUserAction || "",
          message: detailResult.message || "",
          error: detailResult.error || "",
          jobs: detailResult.jobs || []
        });
      }).catch((error) => {
        sendResponse({
          ok: false,
          version: CONTENT_SCRIPT_VERSION,
          error: error.message || "详情页采集失败。"
        });
      });
      return true;
    }

    if (message.type === "COLLECT_DETAIL_FOR_JOB_AGENT_V1") {
      collectDetailFromSearchCard(message.job || {})
        .then((detailResult) => sendResponse({
          ok: detailResult.ok !== false,
          version: CONTENT_SCRIPT_VERSION,
          warning: detailResult.warning || "",
          requiresUserAction: detailResult.requiresUserAction || "",
          message: detailResult.message || "",
          error: detailResult.error || "",
          jobs: detailResult.jobs || []
        }))
        .catch((error) => sendResponse({
          ok: false,
          version: CONTENT_SCRIPT_VERSION,
          error: error.message || "详情面板采集失败。"
        }));
      return true;
    }

    if (message.type === "AGENT_COLLECT_SEARCH_PAGE_V1") {
      collectSearchPage(message)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, version: CONTENT_SCRIPT_VERSION, error: error.message || "搜索页采集失败。" }));
      return true;
    }

    if (message.type === "AGENT_SCROLL_AND_COLLECT") {
      scrollAndCollectJobs(message)
        .then((jobs) => {
          sendResponse({
            ok: true,
            version: CONTENT_SCRIPT_VERSION,
            jobs
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            version: CONTENT_SCRIPT_VERSION,
            error: error.message || "自动滚动采集失败。"
          });
        });
      return true;
    }

    return false;
  });
})();
