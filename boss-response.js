(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BossResponse = api;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const MAX_SEARCH_DEPTH = 8;
  const DETAIL_PATH_PATTERN = /\/wapi\/[^/]+\/job\/detail(?:\.json)?(?:\/|$)/i;

  function cleanText(value) {
    return String(value == null ? "" : value)
      .replace(/<br\s*\/?>(?=.)/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function parsePayload(raw) {
    if (isObject(raw) || Array.isArray(raw)) return raw;
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function isSupportedDetailUrl(sourceUrl) {
    try {
      const url = new URL(String(sourceUrl || ""));
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (host === "zhipin.com" || host.endsWith(".zhipin.com")) && DETAIL_PATH_PATTERN.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function valuesAtPath(root, path) {
    return String(path || "").split(".").reduce((values, segment) => {
      const next = [];
      values.forEach((value) => {
        if (isObject(value) && segment in value) next.push(value[segment]);
      });
      return next;
    }, [root]);
  }

  function firstObjectAtPaths(payload, paths) {
    for (const path of paths) {
      const value = valuesAtPath(payload, path).find(isObject);
      if (value) return value;
    }
    return null;
  }

  function walkObjects(value, visitor, path = "", depth = 0) {
    if (depth > MAX_SEARCH_DEPTH || value == null) return null;
    if (isObject(value)) {
      const result = visitor(value, path);
      if (result) return result;
      for (const [key, child] of Object.entries(value)) {
        const found = walkObjects(child, visitor, path ? `${path}.${key}` : key, depth + 1);
        if (found) return found;
      }
    } else if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const found = walkObjects(value[index], visitor, `${path}[${index}]`, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  function findObjectByKeys(payload, keys) {
    const wanted = new Set(keys);
    return walkObjects(payload, (value) => {
      if (Object.keys(value).some((key) => wanted.has(key)) && Object.values(value).some((item) => isObject(item))) return value;
      return null;
    });
  }

  function findJobInfo(payload) {
    const direct = firstObjectAtPaths(payload, [
      "zpData.jobInfo",
      "data.zpData.jobInfo",
      "data.jobInfo",
      "jobInfo",
      "data.job",
      "job"
    ]);
    if (direct) return { value: direct, path: "known" };

    const result = walkObjects(payload, (value, path) => {
      const keys = Object.keys(value);
      const hasTitle = keys.some((key) => ["jobName", "job_name", "positionName", "position_name", "title"].includes(key));
      const hasDetail = keys.some((key) => ["postDescription", "post_description", "jobDescription", "job_description", "description", "jobDesc"].includes(key));
      const hasIdentity = keys.some((key) => ["encryptId", "encrypt_id", "jobId", "job_id"].includes(key));
      return hasTitle && (hasDetail || hasIdentity) ? { value, path } : null;
    });
    return result || { value: null, path: "" };
  }

  function findCompanyInfo(payload, jobInfo) {
    return firstObjectAtPaths(payload, [
      "zpData.brandComInfo",
      "data.zpData.brandComInfo",
      "data.brandComInfo",
      "brandComInfo",
      "data.company",
      "company"
    ]) || findObjectByKeys(payload, ["brandName", "brand_name", "industryName", "scaleName"]) || jobInfo;
  }

  function findBossInfo(payload) {
    return firstObjectAtPaths(payload, [
      "zpData.bossInfo",
      "data.zpData.bossInfo",
      "data.bossInfo",
      "bossInfo",
      "boss",
      "recruiter"
    ]) || {};
  }

  function firstText(objects, keys) {
    for (const object of objects) {
      if (!isObject(object)) continue;
      for (const key of keys) {
        const text = cleanText(object[key]);
        if (text) return text;
      }
    }
    return "";
  }

  function extractJobIdentity(jobInfo, targetJob) {
    const responseId = firstText([jobInfo], ["encryptId", "encrypt_id", "jobId", "job_id", "jobDetailId", "job_detail_id"]);
    let targetId = "";
    try {
      const match = String(targetJob?.link || "").match(/\/job_detail\/([^/?#.]+)/i);
      targetId = cleanText(match?.[1]);
    } catch (error) {
      targetId = "";
    }
    return { responseId, targetId };
  }

  function compact(value) {
    return cleanText(value).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").toLowerCase();
  }

  function identitiesMatch(job, targetJob, identity) {
    if (identity.targetId && identity.responseId) {
      return identity.targetId === identity.responseId;
    }
    const titleMatches = compact(job.title) && compact(targetJob?.title) && (
      compact(job.title).includes(compact(targetJob.title)) || compact(targetJob.title).includes(compact(job.title))
    );
    const companyMatches = !targetJob?.company || !job.company || compact(job.company) === compact(targetJob.company);
    return Boolean(titleMatches && companyMatches);
  }

  function normalizeDetailResponse(raw, options = {}) {
    if (!isSupportedDetailUrl(options.sourceUrl)) return { ok: false, reason: "unsupported_response_url" };
    if (Number(options.status) >= 400) return { ok: false, reason: "http_error" };

    const payload = parsePayload(raw);
    if (!payload) return { ok: false, reason: "invalid_json" };
    const jobResult = findJobInfo(payload);
    if (!jobResult.value) return { ok: false, reason: "job_info_not_found" };

    const jobInfo = jobResult.value;
    const companyInfo = findCompanyInfo(payload, jobInfo);
    const bossInfo = findBossInfo(payload);
    const targetJob = options.targetJob || {};
    const title = firstText([jobInfo], ["jobName", "job_name", "positionName", "position_name", "title"]);
    const company = firstText([companyInfo, jobInfo], ["brandName", "brand_name", "companyName", "company_name", "name", "company"]);
    const detailText = firstText([jobInfo], [
      "postDescription",
      "post_description",
      "jobDescription",
      "job_description",
      "description",
      "jobDesc",
      "job_desc",
      "content"
    ]);
    const identity = extractJobIdentity(jobInfo, targetJob);
    const job = {
      title,
      company,
      city: firstText([jobInfo], ["locationName", "location_name", "location", "city", "workAddress"]),
      salary: firstText([jobInfo], ["salaryDesc", "salary_desc", "salary", "salaryDescription"]),
      experience: firstText([jobInfo], ["experienceName", "experience_name", "experience", "workingYears"]),
      education: firstText([jobInfo], ["degreeName", "degree_name", "education", "degree"]),
      majorRequirement: firstText([jobInfo], ["majorName", "major_name", "majorRequirement", "professionalRequirement"]),
      detailText,
      rawText: cleanText([title, company, detailText].filter(Boolean).join("\n")),
      cardText: cleanText([targetJob.title, targetJob.company, targetJob.salary].filter(Boolean).join(" ")),
      link: cleanText(targetJob.link || ""),
      detailCompleted: detailText.length >= 20,
      detailStatus: detailText.length >= 20 ? "complete" : "partial",
      collectWarnings: detailText.length >= 20 ? [] : ["接口响应中未包含足够长的岗位描述。"],
      sourceType: "response",
      collectionMethod: "response",
      responseUrl: cleanText(options.sourceUrl),
      responsePath: jobResult.path,
      platformJobId: identity.responseId,
      platformUserId: firstText([bossInfo], ["encryptUserId", "encrypt_user_id", "userId", "user_id"]),
      recruiter: firstText([bossInfo], ["name", "userName", "user_name"]),
      recruiterTitle: firstText([bossInfo], ["title", "position", "jobTitle"]),
      recruiterActiveTime: firstText([bossInfo], ["activeTimeDesc", "active_time_desc", "activeTime"]),
      companyIndustry: firstText([companyInfo], ["industryName", "industry_name", "industry"]),
      companyScale: firstText([companyInfo], ["scaleName", "scale_name", "scale"]),
      companyStage: firstText([companyInfo], ["stageName", "stage_name", "stage"]),
      captureConfidence: identity.responseId && identity.targetId ? 0.995 : 0.97
    };

    if (!job.title || !job.detailText) return { ok: false, reason: "incomplete_job_info", job, identity };
    const identityMatches = identitiesMatch(job, targetJob, identity);
    if (!identityMatches) return { ok: false, reason: "response_identity_mismatch", identity, job };
    return {
      ok: true,
      job,
      identity,
      identityMatches,
      payloadPath: jobResult.path
    };
  }

  return {
    cleanText,
    isSupportedDetailUrl,
    normalizeDetailResponse,
    parsePayload
  };
});
