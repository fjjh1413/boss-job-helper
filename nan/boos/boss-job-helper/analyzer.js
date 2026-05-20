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
    "专业要求",
    "资格要求",
    "任职条件"
  ];

  const SECTION_TAIL_HEADINGS = [
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

  /**
   * 根据岗位名称、经验、学历和技术要求判断大三实习适配度。
   * @param {object} job 标准化后的岗位对象。
   * @returns {string} 适合、较适合、可作为学习参考或不优先。
   */
  function analyzeSuitability(job) {
    const text = removeCalendarYears(getFullText(job));
    const title = cleanText(job.title);
    const experience = removeCalendarYears(job.experience);
    const education = cleanText(job.education);
    const decisionText = `${title}\n${experience}\n${education}\n${text}`;
    const unsuitablePattern = /不接受实习|非实习|实习生勿扰|不招实习|不考虑实习|3\s*年\s*(?:以上|及以上)|3-5年|5-10年|10\s*年\s*以上/;
    const internshipPattern = /实习|实习生|校招|应届|经验不限|在校生|在校\/应届|在校/;
    const applicationPattern = /RAG|Agent|智能体|FastAPI|Spring\s*Boot|Vue|Dify|LangChain|知识库|向量数据库|API|Prompt|提示词|MySQL|Redis|Docker|Linux|Git/i;
    const seniorExperiencePattern = /3-5年|5-10年|10年以上|[4-9]年以上|[1-9]\d年以上/;
    const juniorExperiencePattern = /1-3年|1年以内|一年以内|1年以下/;
    const trainingHeavyPattern = /模型训练|模型预训练|预训练经验|预训练框架|预训练任务|CUDA|推理引擎|分布式训练|算法论文|论文发表|模型压缩|模型微调|训练框架|算子优化|深度学习框架/i;
    const advancedDegreePattern = /硕士|博士|研究生|硕博/;

    if (unsuitablePattern.test(decisionText)) {
      return "不优先";
    }

    if (trainingHeavyPattern.test(decisionText) || (advancedDegreePattern.test(`${education}\n${text}`) && /算法|训练|推理|论文|研究/.test(text))) {
      return "不优先";
    }

    if (internshipPattern.test(decisionText)) {
      return "适合";
    }

    if (seniorExperiencePattern.test(experience) || seniorExperiencePattern.test(text)) {
      return applicationPattern.test(text) ? "可作为学习参考" : "不优先";
    }

    if (juniorExperiencePattern.test(experience) || juniorExperiencePattern.test(text)) {
      return applicationPattern.test(text) ? "较适合" : "可作为学习参考";
    }

    if (applicationPattern.test(text) && !advancedDegreePattern.test(education)) {
      return "较适合";
    }

    if (trainingHeavyPattern.test(text)) {
      return "不优先";
    }

    return "可作为学习参考";
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

  /**
   * 根据岗位要求生成一句简历优化建议。
   * @param {object} job 标准化后的岗位对象。
   * @returns {string} 简短建议。
   */
  function generateResumeAdvice(job) {
    const text = getFullText(job);
    const techStack = cleanText(job.techStack || extractTechStack(text));
    const suitability = cleanText(job.suitability || analyzeSuitability(job));
    const trainingHeavyPattern = /模型训练|模型预训练|预训练经验|预训练框架|预训练任务|CUDA|推理引擎|分布式训练|算法论文|论文发表|算子优化/i;

    if (suitability === "不优先" || trainingHeavyPattern.test(text)) {
      return "该岗位偏算法训练或高阶研究，不建议作为当前主要投递方向。";
    }

    if (/Java|Spring\s*Boot/i.test(techStack) || /Java|Spring\s*Boot/i.test(text)) {
      return "建议强化 Java/Spring Boot 后端能力，并补充大模型 API 调用与智能体工具调用经验。";
    }

    if (/RAG|FastAPI|向量数据库|知识库/i.test(techStack) || /RAG|FastAPI|向量数据库|知识库/i.test(text)) {
      return "建议突出 RAG 知识库问答项目、FastAPI 接口开发和向量数据库使用经验。";
    }

    if (/LangChain|Dify|Agent|智能体/i.test(techStack) || /LangChain|Dify|Agent|智能体/i.test(text)) {
      return "建议增加 LangChain/Dify 项目经历，突出从需求到部署的 AI 应用落地能力。";
    }

    if (/Vue|React/i.test(techStack) || /Vue|React/i.test(text)) {
      return "建议补充前端交互和后端接口联调经历，展示 AI 应用从页面到接口的完整闭环。";
    }

    return "建议围绕一个大模型应用项目补充项目背景、技术栈、个人职责和可量化结果。";
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

  function normalizeJobLink(link) {
    const value = cleanText(link);
    if (!value) return "";

    try {
      const baseUrl = typeof location === "undefined" ? "https://www.zhipin.com/" : location.href;
      const url = new URL(value, baseUrl);
      const detailMatch = url.pathname.match(/\/job_detail\/[^/?#]+/);
      if (detailMatch) {
        return `${url.origin}${detailMatch[0]}`;
      }
      url.hash = "";
      url.search = "";
      return url.href;
    } catch (error) {
      return value.split("#")[0].split("?")[0];
    }
  }

  function sanitizeJobLink(link) {
    const normalizedLink = normalizeJobLink(link);
    if (!normalizedLink) return "";

    try {
      const url = new URL(normalizedLink, "https://www.zhipin.com/");
      if (/\/web\/geek\/jobs/.test(url.pathname)) return "";
    } catch (error) {
      if (/\/web\/geek\/jobs/.test(normalizedLink)) return "";
    }
    return normalizedLink;
  }

  function createJobId(job) {
    const normalizedLink = sanitizeJobLink(job.link);
    if (/\/job_detail\//.test(normalizedLink)) {
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
    return Boolean(text) && !/未识别|当前页面未展示|待补充|字体加密|未读取到明文/.test(text);
  }

  function calculateCompletenessScore(job) {
    const weightedFields = [
      ["title", 10],
      ["company", 10],
      ["city", 8],
      ["salary", 8],
      ["experience", 8],
      ["education", 8],
      ["link", 10],
      ["responsibilities", 14],
      ["requirements", 14],
      ["techStack", 10]
    ];
    const score = weightedFields.reduce((total, [field, weight]) => total + (hasUsefulValue(job[field]) ? weight : 0), 0);
    const warningPenalty = job.collectWarnings?.length ? 10 : 0;
    return Math.max(0, Math.min(100, score - warningPenalty));
  }

  function normalizeJobRecord(rawJob) {
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
      raw.responsibilities,
      raw.requirements,
      raw.detailText,
      raw.cardText,
      raw.rawText
    ]);
    const hasDetailText = sourceType === "detail" || cleanText(raw.detailText).length > 20;
    const detailCompleted = typeof raw.detailCompleted === "boolean" ? raw.detailCompleted : hasDetailText;

    const normalized = {
      title: cleanText(raw.title) || extractFirstMatch(mergedText, /[^\n]{2,40}(工程师|开发|实习生|助理|顾问|产品|算法|后端|前端|全栈)[^\n]*/) || "未识别",
      company: cleanText(raw.company) || "未识别",
      city: cleanText(raw.city) || extractCity(mergedText) || "未识别",
      salary:
        cleanText(raw.salary) ||
        extractFirstMatch(mergedText, /\d+(?:\.\d+)?-\d+(?:\.\d+)?[Kk](?:[·・•･]?\d+薪)?|\d+(?:\.\d+)?[Kk](?:[·・•･]?\d+薪)?|\d+-\d+元\/天|\d+元\/天|\d+(?:\.\d+)?-\d+(?:\.\d+)?万\/月|\d+(?:\.\d+)?万\/月|面议/) ||
        "未识别",
      experience: cleanText(raw.experience) || extractFirstMatch(mergedText, /经验不限|在校\/应届|在校|应届|1-3年|3-5年|5-10年|10年以上|\d+年(?:以内|以下|以上)?/) || "未识别",
      education:
        cleanText(raw.education) ||
        extractFirstMatch(mergedText, /(?:985\/211|211\/985|985|211|双一流)\s*本科(?:及以上)?(?:学历)?|(?:985\/211|211\/985|985|211|双一流)\s*(?:院校|高校|学历|背景)?|学历不限|中专|高中|大专|本科(?:及以上)?(?:学历)?|硕士(?:及以上)?(?:学历)?|博士(?:及以上)?(?:学历)?/) ||
        "未识别",
      responsibilities: cleanText(raw.responsibilities) || (hasDetailText ? extractResponsibilities(mergedText) : "当前页面未展示明确岗位职责"),
      requirements: cleanText(raw.requirements) || (hasDetailText ? extractRequirements(mergedText) : "当前页面未展示明确技术要求"),
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
    normalized.suitability = analyzeSuitability(normalized);
    normalized.resumeAdvice = generateResumeAdvice(normalized);
    normalized.completenessScore = calculateCompletenessScore(normalized);
    normalized.id = createJobId(normalized);
    normalized.updatedAt = new Date().toISOString();
    return normalized;
  }

  window.extractKeywords = extractKeywords;
  window.analyzeSuitability = analyzeSuitability;
  window.extractTechStack = extractTechStack;
  window.generateResumeAdvice = generateResumeAdvice;
  window.JobAnalyzer = {
    extractKeywords,
    analyzeSuitability,
    extractTechStack,
    generateResumeAdvice,
    normalizeJobRecord,
    cleanText
  };
})();
