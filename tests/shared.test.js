const assert = require("node:assert/strict");
const Shared = require("../shared.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("builds a search URL from shared criteria configuration", () => {
  const url = new URL(Shared.buildSearchUrl({ keyword: "AI 应用", city: "杭州" }));

  assert.equal(url.searchParams.get("query"), "AI 应用");
  assert.equal(url.searchParams.get("city"), "101210100");
});

test("keeps search collection rounds within the message timeout budget", () => {
  assert.equal(Shared.getScrollBudget(2200), 60);
  assert.equal(Shared.getScrollBudget(10000), 18);
});

test("prefixes CSV formula-like values to prevent spreadsheet injection", () => {
  assert.equal(Shared.csvEscape("=HYPERLINK(\"https://example.com\")"), "\"'=HYPERLINK(\"\"https://example.com\"\")\"");
  assert.equal(Shared.csvEscape("岗位,杭州"), '"岗位,杭州"');
});

test("classifies an empty search page as a diagnostic instead of a successful collection", () => {
  const diagnostic = Shared.diagnoseSearchPage({
    url: "https://www.zhipin.com/web/geek/jobs?query=Python",
    title: "BOSS直聘",
    bodyTextLength: 2400,
    hasJobText: true,
    noResultMarker: false,
    visibleJobLinks: 0,
    visibleCardRoots: 0,
    parsedJobs: 0
  });

  assert.equal(diagnostic.ok, false);
  assert.equal(diagnostic.reasonCode, "list_not_rendered");
});

test("allows a confirmed no-result search to finish with an explicit reason", () => {
  const diagnostic = Shared.diagnoseSearchPage({
    url: "https://www.zhipin.com/web/geek/jobs?query=NoSuchJob",
    title: "BOSS直聘",
    bodyTextLength: 1200,
    hasJobText: true,
    noResultMarker: true,
    visibleJobLinks: 0,
    visibleCardRoots: 0,
    parsedJobs: 0
  });

  assert.equal(diagnostic.ok, true);
  assert.equal(diagnostic.reasonCode, "no_results");
});
