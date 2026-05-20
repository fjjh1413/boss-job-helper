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
    return /当前页面未展示|未识别|待补充|字体加密|[\uE000-\uF8FF□]/.test(String(value || ""));
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
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    jobs.forEach((job) => store.put(job));
    await transactionDone(transaction);
    db.close();
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
    const currentJobs = await getAllJobs();
    const jobMap = new Map(currentJobs.map((job) => [job.id, job]));
    let inserted = 0;
    let updated = 0;

    incomingJobs.forEach((job) => {
      const existing = jobMap.get(job.id);
      const merged = mergeJob(existing, job);
      jobMap.set(merged.id, merged);
      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }
    });

    const mergedJobs = [...jobMap.values()].sort((a, b) => {
      if (a.serialNumber && b.serialNumber) return a.serialNumber - b.serialNumber;
      if (a.serialNumber) return -1;
      if (b.serialNumber) return 1;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });

    mergedJobs.forEach((job, index) => {
      job.serialNumber = index + 1;
    });

    await replaceAll(mergedJobs);
    return { total: mergedJobs.length, inserted, updated };
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
    const jobs = await getAllJobs();
    return jobs.length;
  }

  window.JobStorage = {
    getAllJobs,
    saveJobs,
    clearJobs,
    countJobs
  };
})();
