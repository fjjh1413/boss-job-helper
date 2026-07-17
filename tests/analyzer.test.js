const assert = require("node:assert/strict");

function loadAnalyzer() {
  delete require.cache[require.resolve("../analyzer.js")];
  global.window = {};
  delete global.location;
  require("../analyzer.js");
  return global.window.JobAnalyzer;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const analyzer = loadAnalyzer();

test("normalizes BOSS detail links and strips query/hash", () => {
  const job = analyzer.normalizeJobRecord({
    title: "AI应用开发实习生",
    company: "示例科技",
    link: "https://www.zhipin.com/job_detail/abc123.html?lid=456#company"
  });

  assert.equal(job.link, "https://www.zhipin.com/job_detail/abc123.html");
  assert.equal(job.id, "https://www.zhipin.com/job_detail/abc123.html");
});

test("rejects non-BOSS detail links", () => {
  const job = analyzer.normalizeJobRecord({
    title: "AI应用开发实习生",
    company: "示例科技",
    link: "https://example.com/job_detail/abc123.html"
  });

  assert.equal(job.link, "");
  assert.equal(job.id, "AI应用开发实习生|示例科技|未识别|未识别");
});

test("rejects BOSS search result links as job links", () => {
  const job = analyzer.normalizeJobRecord({
    title: "AI应用开发实习生",
    company: "示例科技",
    link: "https://www.zhipin.com/web/geek/jobs?query=AI"
  });

  assert.equal(job.link, "");
});

test("does not treat calendar years as experience requirements", () => {
  const job = analyzer.normalizeJobRecord({
    title: "AI应用开发实习生",
    company: "示例科技",
    rawText: "公司成立于2018年，团队负责RAG知识库问答系统。"
  });

  assert.equal(job.experience, "未识别");
});

test("keeps explicit experience requirements", () => {
  const job = analyzer.normalizeJobRecord({
    title: "AI应用开发工程师",
    company: "示例科技",
    rawText: "任职要求：1-3年开发经验，熟悉RAG和FastAPI。"
  });

  assert.equal(job.experience, "1-3年");
});

test("generates a JD summary for detail records", () => {
  const job = analyzer.normalizeJobRecord({
    title: "AI应用开发实习生",
    company: "示例科技",
    city: "杭州",
    salary: "10-15K",
    experience: "在校/应届",
    education: "本科",
    sourceType: "detail",
    detailText: "岗位职责：负责RAG知识库问答应用开发和接口联调。任职要求：熟悉Python、FastAPI和向量数据库。"
  });

  assert.match(job.jdSummary, /示例科技/);
  assert.match(job.jdSummary, /JD职责重点/);
  assert.match(job.jdSummary, /匹配技术栈/);
});

test("does not infer a complete JD from a list-only record marked as detail", () => {
  const job = analyzer.normalizeJobRecord({
    title: "Java后端工程师",
    company: "示例科技",
    sourceType: "detail",
    detailCompleted: false,
    detailText: "",
    rawText: "负责Java服务开发，熟悉Spring Boot。"
  });

  assert.equal(job.detailCompleted, false);
  assert.equal(job.responsibilities, "当前页面未展示明确岗位职责");
  assert.equal(job.requirements, "当前页面未展示明确技术要求");
});

test("extracts responsibilities and requirements from detail text without list-text pollution", () => {
  const job = analyzer.normalizeJobRecord({
    title: "AI应用开发实习生",
    company: "示例科技",
    sourceType: "detail",
    detailCompleted: true,
    detailText: "岗位职责：负责RAG知识库问答应用开发。任职要求：熟悉Python和FastAPI。",
    cardText: "AI应用开发实习生 示例科技 10-15K 在校/应届 本科",
    rawText: "岗位职责：负责RAG知识库问答应用开发。任职要求：熟悉Python和FastAPI。\nAI应用开发实习生 示例科技 10-15K"
  });

  assert.equal(job.responsibilities, "负责RAG知识库问答应用开发。");
  assert.equal(job.requirements, "熟悉Python和FastAPI。");
  assert.doesNotMatch(job.requirements, /AI应用开发实习生|10-15K/);
});

test("scores a job against a configurable candidate profile", () => {
  const job = analyzer.normalizeJobRecord(
    {
      title: "Python后端开发工程师",
      company: "示例科技",
      city: "杭州",
      salary: "12-18K",
      experience: "1-3年",
      education: "本科",
      sourceType: "detail",
      detailCompleted: true,
      detailText: "岗位职责：负责服务开发。任职要求：熟悉Python、FastAPI和MySQL。"
    },
    {
      education: "本科",
      yearsOfExperience: "1年",
      skills: "Python、FastAPI、MySQL",
      preferredCities: "杭州",
      mustHave: "Python"
    }
  );

  assert.ok(job.matchAnalysis.score >= 80);
  assert.equal(job.matchAnalysis.missingSkills.length, 0);
  assert.equal(job.jdSummaryData.requirements, "熟悉Python、FastAPI和MySQL。");
  assert.equal(job.jdSummaryData.candidateMatch.score, job.matchAnalysis.score);
  assert.match(job.jdSummary, /候选人匹配度/);
});

test("uses explicit not-shown markers for missing detail fields", () => {
  const job = analyzer.normalizeJobRecord({
    title: "Java 后端工程师",
    company: "示例科技",
    link: "https://www.zhipin.com/job_detail/missing.html",
    sourceType: "detail",
    detailCompleted: true,
    detailText: "岗位职责：负责服务开发与维护。任职要求：熟悉 Java 和 Spring Boot。"
  });

  assert.equal(job.salary, "未展示");
  assert.equal(job.experience, "未展示");
  assert.equal(job.education, "未展示");
  assert.ok(job.jdSummaryData.unknownFields.includes("salary"));
});

test("rejects a detail record whose identity does not match the queued job", () => {
  const result = analyzer.isDetailRecordConsistent(
    { title: "Java 后端工程师", company: "示例科技", link: "https://www.zhipin.com/job_detail/a.html" },
    { title: "产品经理", company: "另一家公司", link: "https://www.zhipin.com/job_detail/a.html" }
  );

  assert.equal(result.ok, false);
  assert.match(result.reason, /不一致/);
});

test("applies salary overlap criteria without guessing unshown salary", () => {
  const matched = analyzer.evaluateJobCriteria(
    { title: "Python 后端工程师", city: "杭州", salary: "12-18K", detailText: "Python" },
    { keyword: "Python", city: "杭州", minSalaryK: 15, maxSalaryK: 20 }
  );
  const unknown = analyzer.evaluateJobCriteria(
    { title: "Python 后端工程师", city: "杭州", salary: "未展示", detailText: "Python" },
    { keyword: "Python", city: "杭州", minSalaryK: 15 }
  );

  assert.equal(matched.matched, true);
  assert.equal(unknown.matched, false);
  assert.match(unknown.reason, /薪资/);
});

test("converts daily salary to comparable monthly K range", () => {
  const result = analyzer.evaluateJobCriteria(
    { title: "后端开发", city: "杭州", salary: "500-700元/天", detailText: "Python" },
    { keyword: "Python", city: "杭州", minSalaryK: 10, maxSalaryK: 20 }
  );

  assert.equal(result.matched, true);
});
