const assert = require("node:assert/strict");
const BossResponse = require("../boss-response.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const referenceDetailResponse = {
  zpData: {
    jobInfo: {
      encryptId: "job-abc123",
      jobName: "AI 应用开发工程师",
      salaryDesc: "15-25K·14薪",
      locationName: "杭州·西湖区",
      experienceName: "1-3年",
      degreeName: "本科",
      postDescription: "岗位职责：负责 RAG 知识库问答应用开发。任职要求：熟悉 Python、FastAPI 和向量数据库。"
    },
    brandComInfo: {
      brandName: "示例科技",
      industryName: "互联网",
      scaleName: "100-499人",
      stageName: "B轮"
    },
    bossInfo: {
      encryptUserId: "user-xyz789",
      name: "李经理",
      title: "招聘经理",
      activeTimeDesc: "今日活跃"
    }
  }
};

test("normalizes the BOSS detail response into a complete job record", () => {
  const result = BossResponse.normalizeDetailResponse(
    JSON.stringify(referenceDetailResponse),
    {
      sourceUrl: "https://www.zhipin.com/wapi/zpgeek/job/detail.json",
      targetJob: {
        link: "https://www.zhipin.com/job_detail/job-abc123.html",
        title: "AI 应用开发工程师",
        company: "示例科技"
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.job.title, "AI 应用开发工程师");
  assert.equal(result.job.company, "示例科技");
  assert.equal(result.job.salary, "15-25K·14薪");
  assert.equal(result.job.city, "杭州·西湖区");
  assert.equal(result.job.detailCompleted, true);
  assert.equal(result.job.collectionMethod, "response");
  assert.equal(result.job.platformJobId, "job-abc123");
  assert.equal(result.job.recruiter, "李经理");
  assert.equal(result.job.companyIndustry, "互联网");
  assert.equal(result.identityMatches, true);
});

test("rejects a response that belongs to another queued job", () => {
  const result = BossResponse.normalizeDetailResponse(referenceDetailResponse, {
    sourceUrl: "https://www.zhipin.com/wapi/zpgeek/job/detail.json",
    targetJob: {
      link: "https://www.zhipin.com/job_detail/job-other.html",
      title: "AI 应用开发工程师",
      company: "示例科技"
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "response_identity_mismatch");
});

test("supports common wrapped response aliases without accepting an incomplete payload", () => {
  const result = BossResponse.normalizeDetailResponse({
    code: 0,
    data: {
      jobInfo: {
        jobId: "job-alias",
        jobName: "后端开发工程师",
        salary: "12-18K",
        location: "宁波",
        experience: "经验不限",
        education: "本科",
        description: "负责服务开发与维护，熟悉 Java 和 Spring Boot。"
      },
      company: { name: "另一家公司" }
    }
  }, {
    sourceUrl: "https://www.zhipin.com/wapi/zpgeek/job/detail.json",
    targetJob: {
      link: "https://www.zhipin.com/job_detail/job-alias.html",
      title: "后端开发工程师"
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.platformJobId, "job-alias");
  assert.equal(result.job.company, "另一家公司");
  assert.equal(result.job.detailCompleted, true);
});

test("rejects non-detail response URLs before parsing payloads", () => {
  const result = BossResponse.normalizeDetailResponse(referenceDetailResponse, {
    sourceUrl: "https://www.zhipin.com/wapi/zpgeek/user/profile.json",
    targetJob: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unsupported_response_url");
});
