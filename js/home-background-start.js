// Start the existing, filtered background request while the rest of the home page loads.
// No second cache or source policy: BackgroundWarm still owns selection and preloading.
(function (global) {
    'use strict';
    if (!global.chrome?.runtime?.sendMessage || !global.BackgroundWarm) return;
    global.HomeBackground = {
        ready: new Promise(resolve => {
            global.chrome.runtime.sendMessage({ action: 'getBackgrounds' }, response => {
                // Consume lastError for a closed/reloaded service worker without reissuing the request.
                if (global.chrome.runtime.lastError) { resolve({ response: null }); return; }
                let choice = null;
                try {
                    if (Array.isArray(response?.backgrounds)) {
                        choice = global.BackgroundWarm.choose(response.backgrounds, global.BackgroundWarm.read(global.localStorage));
                        if (choice && !document.hidden && global.navigator?.connection?.saveData !== true && global.BackgroundWarm.isWarmable(choice.item)) {
                            void global.BackgroundWarm.warmImage(choice.item.url, { timeoutMs: 20000 });
                        }
                    }
                } catch { /* 预热不可用时，main.js 仍正常接收列表并选图。 */ }
                resolve({ response, choice });
            });
        }).catch(() => ({ response: null })),
    };
})(window);
