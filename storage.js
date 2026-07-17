(function () {
  "use strict";

  const DB_NAME = "bossJobHelperDb";
  const DB_VERSION = 1;
  const STORE_NAME = "jobs";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("serialNumber", "serialNumber", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  function isPlaceholder(value) {
    return /未展示|当前页面未展示|未识别|待补充|字体加密|[\uE000-\uF8FF□]/.test(String(value || ""));
  }

  function shouldUseIncoming(field, incoming, existing) {
    const incomingValue = incoming[field];
    const existingValue = existing[field];
    if (incomingValue === undefined || incomingValue === null || incomingValue === "") return false;
    if (field === "detailCompleted" && existingValue === true && incomingValue === false) return false;
    if (field === "completenessScore" && Number(incomingValue) < Number(existingValue || 0)) return false;
    if (field === "collectWarnings" && Array.isArray(incomingValue) && !incomingValue.length && Array.isArray(existingValue) && existingValue.length) return false;
    if (isPlaceholder(incomingValue) && existingValue && !isPlaceholder(existingValue)) return false;
    return true;
  }

  function mergeJob(existing, incoming) {
    if (!existing) {
      return {
        ...incoming,
        createdAt: incoming.createdAt || new Date().toISOString()
      };
    }

    const merged = { ...existing };
    Object.keys(incoming).forEach((field) => {
      if (shouldUseIncoming(field, incoming, existing)) {
        merged[field] = incoming[field];
      }
    });
    merged.id = existing.id;
    merged.createdAt = existing.createdAt || incoming.createdAt || new Date().toISOString();
    merged.updatedAt = new Date().toISOString();
    return merged;
  }

  async function replaceAll(jobs) {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      jobs.forEach((job) => store.put(job));
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async function upsertJob(incomingJob) {
    const result = await saveJobBatch([incomingJob]);
    return { existing: result.updated > 0, job: result.job };
  }

  async function saveJobBatch(incomingJobs) {
    const jobs = (Array.isArray(incomingJobs) ? incomingJobs : []).filter((job) => job && job.id);
    if (!jobs.length) return { total: await countJobs(), inserted: 0, updated: 0, job: null };

    const db = await openDatabase();
    let inserted = 0;
    let updated = 0;
    let lastJob = null;

    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const done = transactionDone(transaction);
      const initialCount = await requestToPromise(store.count());

      for (const incomingJob of jobs) {
        const existing = await requestToPromise(store.get(incomingJob.id));
        const merged = mergeJob(existing || null, incomingJob);
        if (existing) {
          updated += 1;
        } else {
          inserted += 1;
          merged.serialNumber = initialCount + inserted;
        }
        await requestToPromise(store.put(merged));
        lastJob = merged;
      }

      const total = await requestToPromise(store.count());
      await done;
      return { total, inserted, updated, job: lastJob };
    } finally {
      db.close();
    }
  }

  /**
   * 读取全部已保存岗位，并按序号排序。
   * @returns {Promise<object[]>} 岗位列表。
   */
  async function getAllJobs() {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const jobs = await requestToPromise(store.getAll());
    await transactionDone(transaction);
    db.close();

    return jobs.sort((a, b) => {
      const serialDiff = (a.serialNumber || 0) - (b.serialNumber || 0);
      if (serialDiff) return serialDiff;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  /**
   * 保存岗位并按岗位链接或兜底 ID 去重。
   * @param {object[]} incomingJobs 新采集的岗位。
   * @returns {Promise<{total:number, inserted:number, updated:number}>} 保存结果。
   */
  async function saveJobs(incomingJobs) {
    const result = await saveJobBatch(incomingJobs);
    return { total: result.total, inserted: result.inserted, updated: result.updated };
  }

  /**
   * 清空本地 IndexedDB 中的岗位数据。
   * @returns {Promise<void>}
   */
  async function clearJobs() {
    await replaceAll([]);
  }

  /**
   * 获取当前已保存岗位数量。
   * @returns {Promise<number>} 岗位数量。
   */
  async function countJobs() {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const count = await requestToPromise(transaction.objectStore(STORE_NAME).count());
      await transactionDone(transaction);
      return count;
    } finally {
      db.close();
    }
  }

  window.JobStorage = {
    getAllJobs,
    upsertJob,
    saveJobs,
    clearJobs,
    countJobs
  };
})();
