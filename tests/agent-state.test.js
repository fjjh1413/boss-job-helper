const assert = require("node:assert/strict");
const AgentState = require("../agent-state.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("creates an exhaustive run state without a job-count stop condition", () => {
  const state = AgentState.createRunState(
    { keyword: "Java", city: "杭州" },
    { education: "本科", yearsOfExperience: 1 },
    "2026-07-12T00:00:00.000Z"
  );

  assert.equal(state.status, "preflight");
  assert.equal(state.phase, "preflight");
  assert.equal(state.queue.length, 0);
  assert.equal(state.cursor, 0);
  assert.equal(state.criteria.keyword, "Java");
  assert.equal(state.candidateProfile.education, "本科");
  assert.equal(Object.hasOwn(state.criteria, "maxJobs"), false);
});

test("tracks response-first detail collection metrics independently from DOM fallback", () => {
  const state = AgentState.createRunState({}, {}, "2026-07-12T00:00:00.000Z");
  assert.equal(state.counts.responseCaptured, 0);
  assert.equal(state.counts.domFallback, 0);

  const responseState = AgentState.recordJobResult(
    AgentState.appendJobs(state, [{ title: "A", link: "https://www.zhipin.com/job_detail/a.html" }]),
    { status: "saved", detailCompleted: true, collectionMethod: "response" },
    "2026-07-12T00:02:00.000Z"
  );
  assert.equal(responseState.counts.responseCaptured, 1);
  assert.equal(responseState.counts.domFallback, 0);

  const fallbackState = AgentState.recordJobResult(
    AgentState.appendJobs(responseState, [{ title: "B", link: "https://www.zhipin.com/job_detail/b.html" }]),
    { status: "saved", detailCompleted: true, collectionMethod: "dom" },
    "2026-07-12T00:03:00.000Z"
  );
  assert.equal(fallbackState.counts.responseCaptured, 1);
  assert.equal(fallbackState.counts.domFallback, 1);
});

test("treats a user-paused task as resumable instead of terminal", () => {
  assert.equal(AgentState.isPaused("paused_user"), true);
  assert.equal(AgentState.isRunning("paused_user"), false);
  assert.equal(AgentState.isTerminal("paused_user"), false);
});

test("appends all unique jobs instead of truncating the queue at 100", () => {
  const state = AgentState.createRunState({ keyword: "AI" }, {}, "2026-07-12T00:00:00.000Z");
  const jobs = Array.from({ length: 125 }, (_, index) => ({
    title: `岗位${index}`,
    company: `公司${index}`,
    link: `https://www.zhipin.com/job_detail/${index}.html`
  }));

  const next = AgentState.appendJobs(state, jobs, "2026-07-12T00:01:00.000Z");

  assert.equal(next.queue.length, 125);
  assert.equal(next.counts.discovered, 125);
  assert.equal(next.counts.queued, 125);
});

test("deduplicates the same detail URL across pages", () => {
  const state = AgentState.createRunState({ keyword: "AI" }, {}, "2026-07-12T00:00:00.000Z");
  const next = AgentState.appendJobs(
    state,
    [
      { title: "A", company: "X", link: "https://www.zhipin.com/job_detail/a.html?lid=1" },
      { title: "A", company: "X", link: "https://www.zhipin.com/job_detail/a.html?lid=2" },
      { title: "B", company: "Y", link: "https://www.zhipin.com/job_detail/b.html" }
    ],
    "2026-07-12T00:01:00.000Z"
  );

  assert.equal(next.queue.length, 2);
  assert.equal(next.queue[0].link, "https://www.zhipin.com/job_detail/a.html");
});

test("records a successful detail and advances the cursor", () => {
  const state = AgentState.appendJobs(
    AgentState.createRunState({ keyword: "AI" }, {}, "2026-07-12T00:00:00.000Z"),
    [{ title: "A", link: "https://www.zhipin.com/job_detail/a.html" }],
    "2026-07-12T00:01:00.000Z"
  );

  const next = AgentState.recordJobResult(
    state,
    { status: "saved", job: { id: "https://www.zhipin.com/job_detail/a.html" }, missingFields: [] },
    "2026-07-12T00:02:00.000Z"
  );

  assert.equal(next.cursor, 1);
  assert.equal(next.counts.processed, 1);
  assert.equal(next.counts.saved, 1);
  assert.equal(next.currentJob, null);
});

test("records failure without losing the rest of the queue", () => {
  const state = AgentState.appendJobs(
    AgentState.createRunState({ keyword: "AI" }, {}, "2026-07-12T00:00:00.000Z"),
    [
      { title: "A", link: "https://www.zhipin.com/job_detail/a.html" },
      { title: "B", link: "https://www.zhipin.com/job_detail/b.html" }
    ],
    "2026-07-12T00:01:00.000Z"
  );

  const next = AgentState.recordJobResult(
    state,
    { status: "failed", reason: "详情页超时", stage: "open_detail" },
    "2026-07-12T00:02:00.000Z"
  );

  assert.equal(next.cursor, 1);
  assert.equal(next.counts.failed, 1);
  assert.equal(next.failures.length, 1);
  assert.equal(next.queue.length, 2);
  assert.equal(next.queue[1].title, "B");
});

test("keeps visited search pages unique while preserving progress", () => {
  const state = AgentState.createRunState({ keyword: "AI" }, {}, "2026-07-12T00:00:00.000Z");
  const next = AgentState.markSearchProgress(
    AgentState.markSearchProgress(
      state,
      { currentUrl: "https://www.zhipin.com/web/geek/jobs?page=1", visitedPageUrls: ["https://www.zhipin.com/web/geek/jobs?page=1"] },
      "2026-07-12T00:01:00.000Z"
    ),
    { page: 2, currentUrl: "https://www.zhipin.com/web/geek/jobs?page=2", visitedPageUrls: ["https://www.zhipin.com/web/geek/jobs?page=2", "https://www.zhipin.com/web/geek/jobs?page=1"] },
    "2026-07-12T00:02:00.000Z"
  );

  assert.equal(next.search.page, 2);
  assert.deepEqual(next.search.visitedPageUrls, [
    "https://www.zhipin.com/web/geek/jobs?page=1",
    "https://www.zhipin.com/web/geek/jobs?page=2"
  ]);
});

test("counts completed details separately from locally skipped jobs", () => {
  const state = AgentState.appendJobs(
    AgentState.createRunState({ keyword: "AI" }, {}, "2026-07-12T00:00:00.000Z"),
    [{ title: "A", link: "https://www.zhipin.com/job_detail/a.html" }],
    "2026-07-12T00:01:00.000Z"
  );
  const next = AgentState.recordJobResult(
    state,
    { status: "skipped", detailCompleted: true, reason: "薪资不符合条件" },
    "2026-07-12T00:02:00.000Z"
  );

  assert.equal(next.counts.detailsCompleted, 1);
  assert.equal(next.counts.saved, 0);
  assert.equal(next.counts.skipped, 1);
});

test("does not mutate the source state while updating progress", () => {
  const state = AgentState.appendJobs(
    AgentState.createRunState({ keyword: "AI" }, {}, "2026-07-12T00:00:00.000Z"),
    [{ title: "A", link: "https://www.zhipin.com/job_detail/a.html" }],
    "2026-07-12T00:01:00.000Z"
  );
  const next = AgentState.recordJobResult(state, { status: "saved" }, "2026-07-12T00:02:00.000Z");

  assert.equal(state.cursor, 0);
  assert.equal(state.counts.processed, 0);
  assert.equal(next.cursor, 1);
});
