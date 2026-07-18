const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function createContext() {
  const messages = [];
  const listeners = [];
  const fakeWindow = {
    location: {
      href: "https://www.zhipin.com/web/geek/jobs",
      origin: "https://www.zhipin.com"
    },
    postMessage(message) {
      messages.push(message);
    },
    addEventListener(type, listener) {
      if (type === "message") listeners.push(listener);
    }
  };
  fakeWindow.fetch = (input) => Promise.resolve({
    status: 200,
    clone: () => ({ text: () => Promise.resolve(JSON.stringify({ data: { jobInfo: { jobName: "测试岗位" } } })) })
  });

  class FakeXhr {
    constructor() {
      this.listeners = {};
      this.status = 200;
      this.responseText = "{}";
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    send() {
      this.listeners.load?.call(this);
    }
  }

  const context = {
    window: fakeWindow,
    location: fakeWindow.location,
    XMLHttpRequest: FakeXhr,
    URL,
    Promise,
    JSON,
    Date,
    String,
    Number,
    Object,
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(fs.readFileSync("bridge.js", "utf8"), context, { filename: "bridge.js" });
  return { context, messages, fakeWindow, FakeXhr };
}

test("captures only same-origin BOSS detail responses", async () => {
  const { fakeWindow, messages } = createContext();
  await fakeWindow.fetch("https://www.zhipin.com/wapi/zpgeek/job/detail.json");
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "BOSS_DETAIL_RESPONSE");
  assert.match(messages[0].requestUrl, /\/wapi\/zpgeek\/job\/detail\.json$/);
});

test("does not publish ordinary API responses", async () => {
  const { fakeWindow, messages } = createContext();
  await fakeWindow.fetch("https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(messages.length, 0);
});
