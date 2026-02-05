/**
 * 本地预览兼容层（非扩展环境）
 *
 * 目的：允许通过 http://localhost 预览 index.html，不因 chrome.* API 缺失而崩溃。
 * 在真正的 Chrome 扩展环境中，chrome.* 已存在，本文件不会覆盖任何实现。
 */
(function ensureChromeApisForLocalPreview() {
  const hasChrome =
    typeof globalThis !== 'undefined' &&
    typeof globalThis.chrome !== 'undefined' &&
    globalThis.chrome &&
    globalThis.chrome.storage &&
    globalThis.chrome.storage.local;

  if (hasChrome) return;

  const safeJsonParse = (raw, fallback) => {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const storageArea = {
    get: (keys, cb) => {
      const all = safeJsonParse(localStorage.getItem('__chrome_storage__') || '{}', {});
      let result = {};

      if (keys == null) {
        result = all;
      } else if (typeof keys === 'string') {
        result[keys] = all[keys];
      } else if (Array.isArray(keys)) {
        keys.forEach((k) => (result[k] = all[k]));
      } else if (typeof keys === 'object') {
        // keys as object means default values
        Object.keys(keys).forEach((k) => (result[k] = all[k] ?? keys[k]));
      }

      cb && cb(result);
      return Promise.resolve(result);
    },
    set: (items, cb) => {
      const all = safeJsonParse(localStorage.getItem('__chrome_storage__') || '{}', {});
      Object.assign(all, items || {});
      localStorage.setItem('__chrome_storage__', JSON.stringify(all));
      cb && cb();
      return Promise.resolve();
    },
    remove: (keys, cb) => {
      const all = safeJsonParse(localStorage.getItem('__chrome_storage__') || '{}', {});
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.filter(Boolean).forEach((k) => delete all[k]);
      localStorage.setItem('__chrome_storage__', JSON.stringify(all));
      cb && cb();
      return Promise.resolve();
    },
    getBytesInUse: (_keys, cb) => {
      const raw = localStorage.getItem('__chrome_storage__') || '';
      const bytes = new Blob([raw]).size;
      cb && cb(bytes);
      return Promise.resolve(bytes);
    },
  };

  globalThis.chrome = globalThis.chrome || {};
  globalThis.chrome.storage = globalThis.chrome.storage || {};
  globalThis.chrome.storage.local = globalThis.chrome.storage.local || storageArea;
  globalThis.chrome.storage.sync = globalThis.chrome.storage.sync || storageArea;
  globalThis.chrome.storage.session = globalThis.chrome.storage.session || storageArea;

  globalThis.chrome.runtime = globalThis.chrome.runtime || {};
  globalThis.chrome.runtime.sendMessage =
    globalThis.chrome.runtime.sendMessage ||
    ((_msg, cb) => {
      cb && cb({});
    });

  globalThis.chrome.alarms = globalThis.chrome.alarms || {
    create: () => {},
    clear: () => {},
    get: (_name, cb) => cb && cb(null),
    getAll: (cb) => cb && cb([]),
    onAlarm: { addListener: () => {} },
  };

  globalThis.chrome.notifications = globalThis.chrome.notifications || {
    create: async () => {},
  };
})();

