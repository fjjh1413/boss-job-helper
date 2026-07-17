(function () {
  "use strict";

  const KEYWORD_RULES = [
    { name: "Spring Boot", pattern: /Spring\s*Boot/gi },
    { name: "AI Agent", pattern: /AI\s*Agent/gi },
    { name: "Python", pattern: /\bPython\b/gi },
    { name: "Java", pattern: /\bJava\b/gi },
    { name: "Vue", pattern: /\bVue(?:\.js)?\b/gi },
    { name: "React", pattern: /\bReact\b/gi },
    { name: "FastAPI", pattern: /\bFastAPI\b/gi },
    { name: "Flask", pattern: /\bFlask\b/gi },
    { name: "Django", pattern: /\bDjango\b/gi },
    { name: "LangChain", pattern: /\bLangChain\b/gi },
    { name: "Dify", pattern: /\bDify\b/gi },
    { name: "RAG", pattern: /\bRAG\b/gi },
    { name: "Agent", pattern: /\bAgent\b|智能体/g },
    { name: "LLM", pattern: /\bLLM\b/gi },
    { name: "大模型", pattern: /大模型/g },
    { name: "Prompt", pattern: /\bPrompt(?:\s*Engineering)?\b/gi },
    { name: "提示词", pattern: /提示词/g },
    { name: "向量数据库", pattern: /向量数据库|向量库/g },
    { name: "Milvus", pattern: /\bMilvus\b/gi },
    { name: "FAISS", pattern: /\bFAISS\b/gi },
    { name: "Chroma", pattern: /\bChroma\b/gi },
    { name: "Elasticsearch", pattern: /\bElasticsearch\b|\bES\b/g },
    { name: "MySQL", pattern: /\bMySQL\b/gi },
    { name: "Redis", pattern: /\bRedis\b/gi },
    { name: "Docker", pattern: /\bDocker\b/gi },
    { name: "Linux", pattern: /\bLinux\b/gi },
    { name: "Git", pattern: /\bGit\b/gi },
    { name: "API", pattern: /\bAPI\b|接口调用|开放接口/g },
    { name: "知识库", pattern: /知识库|知识库问答/g },
    { name: "智能体", pattern: /智能体/g },
    { name: "工具调用", pattern: /工具调用|function\s*calling|tool\s*calling/gi },
    { name: "多模态", pattern: /多模态/g },
    { name: "Embedding", pattern: /\bEmbedding(?:s)?\b|嵌入模型|向量化/gi },
    { name: "OpenAI", pattern: /\bOpenAI\b/gi },
    { name: "DeepSeek", pattern: /\bDeepSeek\b|深度求索/gi },
    { name: "通义千问", pattern: /通义千问|Qwen/gi },
    { name: "Kimi", pattern: /\bKimi\b|月之暗面/gi },
    { name: "Claude", pattern: /\bClaude\b/gi }
  ];

  const APPLICATION_STACK_RULES = [
    { name: "Python", pattern: /\bPython\b/gi },
    { name: "Java", pattern: /\bJava\b/gi },
    { name: "Spring Boot", pattern: /Spring\s*Boot/gi },
    { name: "Vue", pattern: /\bVue(?:\.js)?\b/gi },
    { name: "FastAPI", pattern: /\bFastAPI\b/gi },
    { name: "LangChain", pattern: /\bLangChain\b/gi },
    { name: "Dify", pattern: /\bDify\b/gi },
    { name: "RAG", pattern: /\bRAG\b|检索增强/g },
    { name: "Agent", pattern: /\bAgent\b|智能体/g },
    { name: "向量数据库", pattern: /向量数据库|向量库|Milvus|FAISS|Chroma/gi },
    { name: "MySQL", pattern: /\bMySQL\b/gi },
    { name: "Redis", pattern: /\bRedis\b/gi },
    { name: "Docker", pattern: /\bDocker\b/gi },
    { name: "Linux", pattern: /\bLinux\b/gi },
    { name: "Git", pattern: /\bGit\b/gi },
    { name: "Prompt Engineering", pattern: /\bPrompt(?:\s*Engineering)?\b|提示词/gi },
    { name: "API 调用", pattern: /\bAPI\b|接口调用|大模型接口|模型调用/g },
    { name: "知识库问答", pattern: /知识库问答|知识库|问答系统/g }
  ];

  const RESPONSIBILITY_HEADINGS = [
    "岗位职责",
    "工作职责",
    "主要职责",
    "工作内容",
    "职位描述",
    "工作描述",
    "岗位描述",
    "职位详情",
    "岗位说明"
  ];

  const REQUIREMENT_HEADINGS = [
    "任职要求",
    "岗位要求",
    "职位要求",
    "任职资格",
    "技能要求",
    "能力要求",
    "技术要求",
    "资格要求",
    "任职条件"
  ];

  const MAJOR_HEADINGS = ["专业要求", "专业背景", "所学专业", "专业方向", "专业限制", "专业条件"];

  const SECTION_TAIL_HEADINGS = [
    "专业要求",
    "专业背景",
    "所学专业",
    "专业方向",
    "专业限制",
    "专业条件",
    "我们能提供",
    "福利待遇",
    "职位福利",
    "工作地址",
    "公司介绍",
    "团队介绍",
    "关于我们",
    "加分项",
    "其他信息"
  ];

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
  const EXPERIENCE_PATTERN = /经验不限|在校\/应届|在校|应届|应届生|1年以内|一年以内|1年以下|1-3年|3-5年|5-10年|10年以上|(?:[1-9]|10)年(?:以内|以下|以上)?/;

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function countMatches(text, pattern) {
    const source = cleanText(text);
    if (!source) return 0;
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);
    const matches = source.match(matcher);
    return matches ? matches.length : 0;
  }

  function hasPattern(text, pattern) {
    return countMatches(text, pattern) > 0;
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function joinUniqueText(parts) {
    const seen = new Set();
    return cleanText(
      parts
        .map(cleanText)
        .filter(Boolean)
        .filter((part) => {
          if (seen.has(part)) return false;
          seen.add(part);
          return true;
        })
        .join("\n")
    );
  }

  function extractFirstMatch(text, pattern) {
    const match = cleanText(text).match(pattern);
    return match ? cleanText(match[0]) : "";
  }

  function extractExperienceRequirement(text) {
    return extractFirstMatch(removeCalendarYears(text), EXPERIENCE_PATTERN);
  }

  function extractCity(text) {
    const source = cleanText(text);
    return CITY_NAMES.find((city) => source.includes(city)) || "";
  }

  function getFullText(job) {
    return joinUniqueText([
      job.title,
      job.company,
      job.city,
      job.salary,
      job.experience,
      job.education,
      job.majorRequirement,
      job.responsibilities,
      job.requirements,
      job.detailText,
      job.cardText,
      job.rawText
    ]);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractSection(text, startHeadings, stopHeadings) {
    const source = cleanText(text);
    if (!source) return "";

    let selected = null;
    for (const heading of startHeadings) {
      const matcher = new RegExp(`[【\\[（(]?\\s*${escapeRegExp(heading)}\\s*[】\\]）)]?\\s*[：:：]?`, "gi");
      const match = matcher.exec(source);
      if (match) {
        selected = { index: match.index, end: matcher.lastIndex };
        break;
      }
    }

    if (!selected) return "";
    let endIndex = source.length;
    stopHeadings.concat(SECTION_TAIL_HEADINGS).forEach((heading) => {
      const matcher = new RegExp(`[【\\[（(]?\\s*${escapeRegExp(heading)}\\s*[】\\]）)]?\\s*[：:：]?`, "gi");
      let match = matcher.exec(source);
      while (match) {
        if (match.index > selected.end && match.index < endIndex) {
          endIndex = match.index;
        }
        match = matcher.exec(source);
      }
    });

    return cleanText(source.slice(selected.end, endIndex)).slice(0, 1200);
  }

  function splitSentences(text) {
    return cleanText(text)
      .split(/[\n。；;]+/)
      .map((sentence) => cleanText(sentence))
      .filter((sentence) => sentence.length >= 8);
  }

  function inferResponsibilities(text) {
    const responsibilityWords = /(负责|参与|完成|搭建|开发|设计|实现|维护|优化|落地|推进|构建|对接|协作|支持)/;
    const technicalTrainingWords = /(模型训练|模型预训练|预训练经验|分布式训练|CUDA|推理引擎|论文|算法研究)/i;
    return splitSentences(text)
      .filter((sentence) => responsibilityWords.test(sentence) && !technicalTrainingWords.test(sentence))
      .slice(0, 5)
      .join("；");
  }

  function inferRequirements(text) {
    const requirementWords = /(熟悉|掌握|了解|经验|能力|优先|要求|具备|本科|硕士|Python|Java|RAG|Agent|LangChain|Dify|FastAPI|Spring\s*Boot|向量|数据库|Docker|Linux|Git|API|Prompt|提示词)/i;
    return splitSentences(text)
      .filter((sentence) => requirementWords.test(sentence))
      .slice(0, 6)
      .join("；");
  }

  function inferMajorRequirement(text) {
    const majorWords =
      /(计算机|软件工程|人工智能|智能科学|数据科学|大数据|数学|统计|自动化|电子信息|通信工程|信息安全|网络工程|物联网|信息与计算科学|控制科学|机器学习|模式识别|自然语言处理|NLP|相关专业|理工科|工科)/i;
    const contextWords = /(专业|背景|学历|本科|硕士|博士|优先|相关|方向)/;
    return splitSentences(text)
      .filter((sentence) => majorWords.test(sentence) && contextWords.test(sentence))
      .slice(0, 4)
      .join("；");
  }

  /**
   * 统计指定大模型应用开发关键词的出现频次。
   * @param {string} text 岗位标题、卡片和详情组合文本。
   * @returns {string} 形如 Python(3)、RAG(2) 的展示文本。
   */
  function extractKeywords(text) {
    const result = KEYWORD_RULES.map((rule, index) => ({
      name: rule.name,
      count: countMatches(text, rule.pattern),
      index
    }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count || a.index - b.index);

    return result.length ? result.map((item) => `${item.name}(${item.count})`).join("、") : "未匹配到重点关键词";
  }

  function splitProfileValues(value) {
    return cleanText(value)
      .split(/[、,，/|;；\s]+/)
      .map(cleanText)
      .filter((item) => item.length >= 1);
  }

  function normalizeMatchText(value) {
    return cleanText(value).replace(/\s+/g, "").toLowerCase();
  }

  function educationRank(value) {
    const text = cleanText(value);
    if (/博士/.test(text)) return 5;
    if (/硕士|研究生/.test(text)) return 4;
    if (/本科|双一流|211|985/.test(text)) return 3;
    if (/大专/.test(text)) return 2;
    if (/高中|中专/.test(text)) return 1;
    return 0;
  }

  function minimumExperienceYears(value) {
    const text = removeCalendarYears(value);
    if (!text || /不限|在校|应届/.test(text)) return 0;
    const match = text.match(/(\d+(?:\.\d+)?)\s*(?:年|年以上|年以内)/);
    return match ? Number(match[1]) : null;
  }

  function parseSalaryRange(value) {
    const text = cleanText(value)
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
      .replace(/[－—–]/g, "-");
    let match = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*[Kk]/);
    if (match) return { min: Number(match[1]), max: Number(match[2]) };
    match = text.match(/(\d+(?:\.\d+)?)\s*[Kk]/);
    if (match) return { min: Number(match[1]), max: Number(match[1]) };
    match = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*万\/月/);
    if (match) return { min: Number(match[1]) * 10, max: Number(match[2]) * 10 };
    match = text.match(/(\d+(?:\.\d+)?)\s*万\/月/);
    if (match) return { min: Number(match[1]) * 10, max: Number(match[1]) * 10 };
    match = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*元\/天/);
    if (match) return { min: (Number(match[1]) * 22) / 1000, max: (Number(match[2]) * 22) / 1000 };
    match = text.match(/(\d+(?:\.\d+)?)\s*元\/天/);
    if (match) return { min: (Number(match[1]) * 22) / 1000, max: (Number(match[1]) * 22) / 1000 };
    return null;
  }

  function evaluateJobCriteria(job, criteria = {}) {
    const keywordWords = cleanText(criteria.keyword)
      .split(/[\s,+，、/]+/)
      .map(normalizeMatchText)
      .filter(Boolean);
    const searchableText = normalizeMatchText(getFullText(job));
    if (keywordWords.length && !keywordWords.every((word) => searchableText.includes(word))) {
      return { matched: false, reason: "不包含输入的职位关键词。" };
    }

    const city = normalizeMatchText(criteria.city);
    if (city && !normalizeMatchText([job.city, job.rawText].join("\n")).includes(city)) {
      return { matched: false, reason: "工作地点不符合输入条件。" };
    }

    const minSalary = Number(criteria.minSalaryK);
    const maxSalary = Number(criteria.maxSalaryK);
    const hasMinSalary = criteria.minSalaryK !== null && criteria.minSalaryK !== undefined && Number.isFinite(minSalary);
    const hasMaxSalary = criteria.maxSalaryK !== null && criteria.maxSalaryK !== undefined && Number.isFinite(maxSalary);
    if (hasMinSalary || hasMaxSalary) {
      const salary = parseSalaryRange(job.salary);
      if (!salary) return { matched: false, reason: "薪资未展示可比较的范围。" };
      if (hasMinSalary && salary.max < minSalary) return { matched: false, reason: "薪资低于输入的最低范围。" };
      if (hasMaxSalary && salary.min > maxSalary) return { matched: false, reason: "薪资高于输入的最高范围。" };
    }

    return { matched: true, reason: "" };
  }

  function scoreFractionalCriteria(values, sourceText, weight) {
    const normalizedSource = normalizeMatchText(sourceText);
    const matched = values.filter((value) => normalizedSource.includes(normalizeMatchText(value)));
    return {
      available: values.length ? weight : 0,
      score: values.length ? (matched.length / values.length) * weight : 0,
      matched,
      missing: values.filter((value) => !matched.includes(value))
    };
  }

  function scoreBooleanCriteria(values, sourceText, weight) {
    const normalizedSource = normalizeMatchText(sourceText);
    const matchedValue = values.find((value) => normalizedSource.includes(normalizeMatchText(value))) || "";
    return {
      available: values.length ? weight : 0,
      score: matchedValue ? weight : 0,
      matched: matchedValue
    };
  }

  function evaluateTextMatches(job, profile) {
    const jobText = normalizeMatchText(getFullText(job));
    const skills = splitProfileValues(profile.skills);
    const mustHave = splitProfileValues(profile.mustHave);
    const targetRoles = splitProfileValues(profile.targetRoles);
    const workTypes = splitProfileValues(profile.workTypes);
    const skillMatch = scoreFractionalCriteria(skills, jobText, 30);
    const mustHaveMatch = scoreFractionalCriteria(mustHave, jobText, 30);
    const result = { score: 0, available: 0, reasons: [], gaps: [] };

    if (skills.length) {
      result.available += skillMatch.available;
      result.score += skillMatch.score;
      if (skillMatch.matched.length) result.reasons.push(`匹配技能：${skillMatch.matched.join("、")}`);
      if (skillMatch.missing.length) result.gaps.push(`未在JD中发现：${skillMatch.missing.join("、")}`);
    }
    if (mustHave.length) {
      result.available += mustHaveMatch.available;
      result.score += mustHaveMatch.score;
      if (mustHaveMatch.missing.length) result.gaps.push(`必须条件缺失：${mustHaveMatch.missing.join("、")}`);
      else result.reasons.push("候选人填写的必须条件均在JD中出现");
    }
    if (targetRoles.length) {
      const roleMatch = scoreBooleanCriteria(targetRoles, job.title, 15);
      result.available += roleMatch.available;
      if (roleMatch.matched) {
        result.score += roleMatch.score;
        result.reasons.push(`目标职位匹配：${roleMatch.matched}`);
      } else {
        result.gaps.push(`职位方向可能不一致：${targetRoles.join("、")}`);
      }
    }
    if (workTypes.length) {
      const workTypeMatch = scoreBooleanCriteria(workTypes, jobText, 10);
      result.available += workTypeMatch.available;
      if (workTypeMatch.matched) {
        result.score += workTypeMatch.score;
        result.reasons.push(`工作类型匹配：${workTypeMatch.matched}`);
      } else {
        result.gaps.push(`未在JD中确认工作类型：${workTypes.join("、")}`);
      }
    }

    return {
      ...result,
      matchedSkills: skillMatch.matched,
      missingSkills: skillMatch.missing,
      matchedMustHave: mustHaveMatch.matched,
      missingMustHave: mustHaveMatch.missing
    };
  }

  function evaluateSalaryMatch(job, profile) {
    const result = { score: 0, available: 0, reasons: [], gaps: [], warnings: [] };
    const preferredSalary = parseSalaryRange(profile.preferredSalary);
    const jobSalary = parseSalaryRange(job.salary);
    if (!preferredSalary) return result;

    result.available = 10;
    if (!jobSalary) {
      result.warnings.push("JD未展示可比较的薪资范围");
    } else if (jobSalary.max >= preferredSalary.min && jobSalary.min <= preferredSalary.max) {
      result.score = 10;
      result.reasons.push("薪资范围有交集");
    } else {
      result.gaps.push("薪资范围与候选人期望不重合");
    }
    return result;
  }

  function evaluateRequirementMatch(job, profile) {
    const result = { score: 0, available: 0, reasons: [], gaps: [], warnings: [] };
    const candidateEducation = educationRank(profile.education);
    const requiredEducation = educationRank(job.education);
    if (candidateEducation && requiredEducation) {
      result.available += 15;
      if (candidateEducation >= requiredEducation) {
        result.score += 15;
        result.reasons.push("学历要求匹配");
      } else {
        result.gaps.push("学历可能低于岗位要求");
      }
    } else if (requiredEducation === 0) {
      result.warnings.push("JD未展示明确学历要求");
    }

    const candidateYears = minimumExperienceYears(profile.yearsOfExperience);
    const requiredYears = minimumExperienceYears(job.experience);
    if (candidateYears !== null && requiredYears !== null) {
      result.available += 15;
      if (candidateYears >= requiredYears) {
        result.score += 15;
        result.reasons.push("经验要求匹配");
      } else {
        result.gaps.push("工作年限可能低于岗位要求");
      }
    } else if (/未识别|未展示/.test(job.experience)) {
      result.warnings.push("JD未展示明确经验要求");
    }
    return result;
  }

  function evaluateCityMatch(job, profile) {
    const preferredCities = splitProfileValues(profile.preferredCities);
    const result = { score: 0, available: 0, reasons: [], gaps: [], warnings: [] };
    if (!preferredCities.length || !hasUsefulValue(job.city)) return result;

    result.available = 10;
    const cityMatched = preferredCities.some((city) => normalizeMatchText(job.city).includes(normalizeMatchText(city)));
    if (cityMatched) {
      result.score = 10;
      result.reasons.push("工作地点匹配");
    } else {
      result.gaps.push("工作地点不在候选人偏好中");
    }
    return result;
  }

  function analyzeCandidateMatch(job, candidateProfile = {}) {
    const profile = candidateProfile && typeof candidateProfile === "object" ? candidateProfile : {};
    const textMatch = evaluateTextMatches(job, profile);
    const salaryMatch = evaluateSalaryMatch(job, profile);
    const requirementMatch = evaluateRequirementMatch(job, profile);
    const cityMatch = evaluateCityMatch(job, profile);
    const score = textMatch.score + salaryMatch.score + requirementMatch.score + cityMatch.score;
    const available = textMatch.available + salaryMatch.available + requirementMatch.available + cityMatch.available;
    const reasons = [textMatch, salaryMatch, requirementMatch, cityMatch].flatMap((item) => item.reasons);
    const gaps = [textMatch, salaryMatch, requirementMatch, cityMatch].flatMap((item) => item.gaps);
    const warnings = [salaryMatch, requirementMatch, cityMatch].flatMap((item) => item.warnings);

    if (!available) {
      return {
        score: null,
        level: "待完善候选人画像",
        matchedSkills: textMatch.matchedSkills,
        missingSkills: textMatch.missingSkills,
        matchedMustHave: textMatch.matchedMustHave,
        missingMustHave: textMatch.missingMustHave,
        reasons: [],
        gaps: ["请填写候选人的技能、学历或工作年限"],
        warnings
      };
    }

    const normalizedScore = Math.max(0, Math.min(100, Math.round((score / available) * 100)));
    const level = normalizedScore >= 80 ? "高度匹配" : normalizedScore >= 60 ? "较匹配" : normalizedScore >= 40 ? "部分匹配" : "匹配度较低";
    return {
      score: normalizedScore,
      level,
      matchedSkills: textMatch.matchedSkills,
      missingSkills: textMatch.missingSkills,
      matchedMustHave: textMatch.matchedMustHave,
      missingMustHave: textMatch.missingMustHave,
      reasons,
      gaps,
      warnings
    };
  }

  function analyzeSuitability(job, candidateProfile = {}) {
    return analyzeCandidateMatch(job, candidateProfile).level;
  }

  function removeCalendarYears(text) {
    return cleanText(text).replace(/(?:19|20)\d{2}\s*年/g, "");
  }

  /**
   * 提取与大模型应用开发相关的技术栈。
   * @param {string} text 岗位文本。
   * @returns {string} 使用顿号分隔的技术栈。
   */
  function extractTechStack(text) {
    const stacks = APPLICATION_STACK_RULES.filter((rule) => hasPattern(text, rule.pattern)).map((rule) => rule.name);
    return uniqueValues(stacks).join("、") || "待补充";
  }

  function generateResumeAdvice(job, matchAnalysis = null) {
    const match = matchAnalysis || job.matchAnalysis || analyzeCandidateMatch(job, {});
    if (match.score === null) return "请先完善候选人画像，再生成针对性的简历建议。";
    if (match.missingMustHave?.length) return `优先补充或解释必须条件：${match.missingMustHave.join("、")}。`;
    if (match.missingSkills?.length) return `建议在简历项目和技能栏中补充：${match.missingSkills.join("、")}。`;
    if (match.gaps?.length) return `投递前确认：${match.gaps.join("；")}。`;
    return "岗位要求与候选人画像匹配度较高，建议突出相关项目中的职责、技术栈和可量化结果。";
  }

  function summarizeText(value, maxLength = 140) {
    const text = cleanText(value);
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function hasUsefulAnalysisValue(value) {
    const text = cleanText(value);
    return Boolean(text) && !/未识别|未展示|当前页面未展示|待补充|待完善候选人画像|字体加密|未读取到明文/.test(text);
  }

  function createJdSummaryData(job, matchAnalysis = null) {
    const match = matchAnalysis || job.matchAnalysis || analyzeCandidateMatch(job, {});
    const unknownFields = ["salary", "experience", "education", "majorRequirement", "responsibilities", "requirements", "techStack"]
      .filter((field) => !hasUsefulValue(job[field]));
    const warnings = uniqueValues([
      ...(Array.isArray(job.collectWarnings) ? job.collectWarnings : []),
      ...(Array.isArray(match.warnings) ? match.warnings : [])
    ]);

    return {
      overview: `${job.company || "未展示公司"}的${job.title || "该岗位"}`,
      responsibilities: summarizeText(job.responsibilities, 300),
      requirements: summarizeText(job.requirements, 300),
      majorRequirement: summarizeText(job.majorRequirement, 180),
      techStack: cleanText(job.techStack || extractTechStack(getFullText(job))),
      compensation: {
        city: job.city || "未展示",
        salary: job.salary || "未展示",
        experience: job.experience || "未展示",
        education: job.education || "未展示"
      },
      candidateMatch: match,
      unknownFields,
      warnings,
      detailCompleted: Boolean(job.detailCompleted)
    };
  }

  function generateJdSummary(job, matchAnalysis = null) {
    const title = hasUsefulAnalysisValue(job.title) ? job.title : "该岗位";
    const company = hasUsefulAnalysisValue(job.company) ? job.company : "未识别公司";
    const city = hasUsefulAnalysisValue(job.city) ? job.city : "地点未展示";
    const salary = hasUsefulAnalysisValue(job.salary) ? job.salary : "薪资未展示";
    const experience = hasUsefulAnalysisValue(job.experience) ? job.experience : "经验要求未展示";
    const education = hasUsefulAnalysisValue(job.education) ? job.education : "学历要求未展示";
    const techStack = hasUsefulAnalysisValue(job.techStack) ? job.techStack : extractTechStack(getFullText(job));
    const responsibilities = hasUsefulAnalysisValue(job.responsibilities) ? summarizeText(job.responsibilities, 160) : "";
    const requirements = hasUsefulAnalysisValue(job.requirements) ? summarizeText(job.requirements, 180) : "";
    const match = matchAnalysis || job.matchAnalysis || analyzeCandidateMatch(job, {});

    const summaryData = createJdSummaryData(job, matchAnalysis);
    const parts = [`${summaryData.overview}，工作地点${city}，薪资${salary}，经验要求${experience}，学历要求${education}。`];
    if (responsibilities) parts.push(`JD职责重点：${responsibilities}`);
    if (requirements) parts.push(`能力要求：${requirements}`);
    if (hasUsefulAnalysisValue(techStack)) parts.push(`匹配技术栈：${techStack}。`);
    if (match.score === null) {
      parts.push("候选人匹配度：待完善候选人画像。");
    } else {
      parts.push(`候选人匹配度：${match.score}%，${match.level}。`);
    }
    if (match.gaps?.length) parts.push(`能力缺口：${match.gaps.join("；")}。`);
    if (match.warnings?.length) parts.push(`信息缺口：${match.warnings.join("；")}。`);
    if (summaryData.unknownFields.length) parts.push(`未展示字段：${summaryData.unknownFields.join("、")}。`);
    if (!job.detailCompleted) parts.push("当前仅基于列表信息，建议打开岗位详情后补采完整JD。");
    return parts.join("");
  }

  function extractResponsibilities(text) {
    return (
      extractSection(text, RESPONSIBILITY_HEADINGS, REQUIREMENT_HEADINGS) ||
      inferResponsibilities(text) ||
      "当前页面未展示明确岗位职责"
    );
  }

  function extractRequirements(text) {
    return (
      extractSection(text, REQUIREMENT_HEADINGS, RESPONSIBILITY_HEADINGS) ||
      inferRequirements(text) ||
      "当前页面未展示明确技术要求"
    );
  }

  function extractMajorRequirement(text) {
    return (
      extractSection(text, MAJOR_HEADINGS, RESPONSIBILITY_HEADINGS.concat(REQUIREMENT_HEADINGS)) ||
      inferMajorRequirement(text) ||
      "当前页面未展示明确专业要求"
    );
  }

  function isAllowedBossHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "zhipin.com" || host.endsWith(".zhipin.com");
  }

  function normalizeJobLink(link) {
    const value = cleanText(link);
    if (!value) return "";

    try {
      const baseUrl = typeof location === "undefined" ? "https://www.zhipin.com/" : location.href;
      const url = new URL(value, baseUrl);
      if (url.protocol !== "https:" || !isAllowedBossHost(url.hostname)) return "";
      const detailMatch = url.pathname.match(/^\/job_detail\/[^/?#]+/);
      return detailMatch ? `${url.origin}${detailMatch[0]}` : "";
    } catch (error) {
      return "";
    }
  }

  function isDetailRecordConsistent(listJob, detailJob) {
    const list = listJob || {};
    const detail = detailJob || {};
    const listLink = normalizeJobLink(list.link || list.url);
    const detailLink = normalizeJobLink(detail.link || detail.url);
    if (listLink && detailLink && listLink !== detailLink) {
      return { ok: false, reason: "详情链接与搜索结果岗位不一致。" };
    }

    const compact = (value) => cleanText(value).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "").toLowerCase();
    const listTitle = compact(list.title);
    const detailTitle = compact(detail.title);
    if (listTitle && detailTitle && !listTitle.includes(detailTitle) && !detailTitle.includes(listTitle)) {
      const shared = [...new Set(detailTitle)].filter((char) => listTitle.includes(char)).length;
      if (shared < Math.min(8, detailTitle.length)) return { ok: false, reason: "详情页职位名称与列表岗位不一致。" };
    }

    const listCompany = compact(list.company);
    const detailCompany = compact(detail.company);
    if (listCompany && detailCompany && !listCompany.includes(detailCompany) && !detailCompany.includes(listCompany)) {
      return { ok: false, reason: "详情页公司名称与列表岗位不一致。" };
    }

    return { ok: true, reason: "" };
  }

  function sanitizeJobLink(link) {
    return normalizeJobLink(link);
  }

  function createJobId(job) {
    const normalizedLink = sanitizeJobLink(job.link);
    if (normalizedLink) {
      return normalizedLink;
    }
    return [job.title, job.company, job.city, job.salary].map(cleanText).join("|");
  }

  function normalizeWarnings(raw) {
    const values = [];
    if (Array.isArray(raw.collectWarnings)) {
      raw.collectWarnings.forEach((warning) => values.push(cleanText(warning)));
    } else if (raw.collectWarnings) {
      values.push(cleanText(raw.collectWarnings));
    }
    if (raw.warning) values.push(cleanText(raw.warning));
    return uniqueValues(values);
  }

  function hasUsefulValue(value) {
    const text = cleanText(value);
    return Boolean(text) && !/未识别|未展示|当前页面未展示|待补充|字体加密|未读取到明文/.test(text);
  }

  function calculateCompletenessScore(job) {
    const weightedFields = [
      ["title", 9],
      ["company", 9],
      ["city", 7],
      ["salary", 7],
      ["experience", 7],
      ["education", 8],
      ["majorRequirement", 7],
      ["link", 9],
      ["responsibilities", 13],
      ["requirements", 14],
      ["techStack", 10]
    ];
    const score = weightedFields.reduce((total, [field, weight]) => total + (hasUsefulValue(job[field]) ? weight : 0), 0);
    const warningPenalty = job.collectWarnings?.length ? 10 : 0;
    return Math.max(0, Math.min(100, score - warningPenalty));
  }

  function normalizeJobRecord(rawJob, candidateProfile = {}) {
    const raw = rawJob || {};
    const sourceType = cleanText(raw.sourceType) || "page";
    const collectWarnings = normalizeWarnings(raw);
    const mergedText = joinUniqueText([
      raw.title,
      raw.company,
      raw.city,
      raw.salary,
      raw.experience,
      raw.education,
      raw.majorRequirement,
      raw.professionalRequirement,
      raw.major,
      raw.responsibilities,
      raw.requirements,
      raw.detailText,
      raw.cardText,
      raw.rawText
    ]);
    const hasDetailText = cleanText(raw.detailText).length > 20;
    const detailCompleted = typeof raw.detailCompleted === "boolean" ? raw.detailCompleted : hasDetailText;
    const extractionText = cleanText(raw.detailText) || mergedText;
    const missingFieldValue = hasDetailText ? "未展示" : "未识别";

    const normalized = {
      title: cleanText(raw.title) || extractFirstMatch(mergedText, /[^\n]{2,40}(工程师|开发|实习生|助理|顾问|产品|算法|后端|前端|全栈)[^\n]*/) || missingFieldValue,
      company: cleanText(raw.company) || missingFieldValue,
      city: cleanText(raw.city) || extractCity(mergedText) || missingFieldValue,
      salary:
        cleanText(raw.salary) ||
        extractFirstMatch(mergedText, /\d+(?:\.\d+)?-\d+(?:\.\d+)?[Kk](?:[·・•･]?\d+薪)?|\d+(?:\.\d+)?[Kk](?:[·・•･]?\d+薪)?|\d+-\d+元\/天|\d+元\/天|\d+(?:\.\d+)?-\d+(?:\.\d+)?万\/月|\d+(?:\.\d+)?万\/月|面议/) ||
        missingFieldValue,
      experience: extractExperienceRequirement(raw.experience) || extractExperienceRequirement(mergedText) || missingFieldValue,
      education:
        cleanText(raw.education) ||
        extractFirstMatch(mergedText, /(?:985\/211|211\/985|985|211|双一流)\s*本科(?:及以上)?(?:学历)?|(?:985\/211|211\/985|985|211|双一流)\s*(?:院校|高校|学历|背景)?|学历不限|中专|高中|大专|本科(?:及以上)?(?:学历)?|硕士(?:及以上)?(?:学历)?|博士(?:及以上)?(?:学历)?/) ||
        missingFieldValue,
      majorRequirement: cleanText(raw.majorRequirement || raw.professionalRequirement || raw.major) || (hasDetailText ? extractMajorRequirement(extractionText) : "当前页面未展示明确专业要求"),
      responsibilities: cleanText(raw.responsibilities) || (hasDetailText ? extractResponsibilities(extractionText) : "当前页面未展示明确岗位职责"),
      requirements: cleanText(raw.requirements) || (hasDetailText ? extractRequirements(extractionText) : "当前页面未展示明确技术要求"),
      link: sanitizeJobLink(raw.link || raw.url),
      cardText: cleanText(raw.cardText),
      detailText: cleanText(raw.detailText),
      rawText: mergedText,
      detailCompleted,
      collectWarnings,
      completenessScore: 0,
      sourceType
    };

    const analysisText = mergedText || getFullText(normalized);
    normalized.keywordFrequency = extractKeywords(analysisText);
    normalized.techStack = extractTechStack(analysisText);
    normalized.matchAnalysis = analyzeCandidateMatch(normalized, candidateProfile);
    normalized.suitability = normalized.matchAnalysis.level;
    normalized.resumeAdvice = generateResumeAdvice(normalized, normalized.matchAnalysis);
    normalized.jdSummaryData = createJdSummaryData(normalized, normalized.matchAnalysis);
    normalized.jdSummary = generateJdSummary(normalized, normalized.matchAnalysis);
    normalized.completenessScore = calculateCompletenessScore(normalized);
    normalized.id = createJobId(normalized);
    normalized.updatedAt = new Date().toISOString();
    return normalized;
  }

  window.extractKeywords = extractKeywords;
  window.analyzeSuitability = analyzeSuitability;
  window.analyzeCandidateMatch = analyzeCandidateMatch;
  window.extractTechStack = extractTechStack;
  window.generateResumeAdvice = generateResumeAdvice;
  window.generateJdSummary = generateJdSummary;
  window.createJdSummaryData = createJdSummaryData;
  window.JobAnalyzer = {
    extractKeywords,
    analyzeSuitability,
    analyzeCandidateMatch,
    extractTechStack,
    generateResumeAdvice,
    generateJdSummary,
    createJdSummaryData,
    evaluateJobCriteria,
    isDetailRecordConsistent,
    normalizeJobLink,
    normalizeJobRecord,
    cleanText
  };
})();
