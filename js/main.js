// 获取背景图片数据
let backgroundImages = [];
chrome.runtime.sendMessage({ action: 'getBackgrounds' }, function(response) {
    if (response && response.backgrounds) {
        backgroundImages = response.backgrounds;
        initBackgrounds();
    }
});

// 初始化背景图片
function initBackgrounds() {
    if (backgroundImages.length > 0) {
        const randomIndex = Math.floor(Math.random() * backgroundImages.length);
        const background = backgroundImages[randomIndex];
        
        // 设置背景图片
        document.body.style.backgroundImage = `url(${background.url})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        
        // 更新背景信息
        const creditElement = document.getElementById('background-credit');
        if (creditElement) {
            const licenseHtml = background.licenseUrl
                ? ` · <a href="${background.licenseUrl}" target="_blank" rel="noreferrer">许可</a>`
                : '';
            const photographerText = background.photographer ? `摄影/来源：${background.photographer}` : '';
            creditElement.innerHTML = `
                <span class="location">${background.location}</span> - 
                <span class="description" title="${photographerText}">${background.description}</span>
                ${licenseHtml}
            `;
        }
    }
}

// 切换背景图片
function changeBackground() {
    if (backgroundImages.length > 0) {
        const randomIndex = Math.floor(Math.random() * backgroundImages.length);
        const background = backgroundImages[randomIndex];
        
        // 设置背景图片
        document.body.style.backgroundImage = `url(${background.url})`;
        
        // 更新背景信息
        const creditElement = document.getElementById('background-credit');
        if (creditElement) {
            const licenseHtml = background.licenseUrl
                ? ` · <a href="${background.licenseUrl}" target="_blank" rel="noreferrer">许可</a>`
                : '';
            const photographerText = background.photographer ? `摄影/来源：${background.photographer}` : '';
            creditElement.innerHTML = `
                <span class="location">${background.location}</span> - 
                <span class="description" title="${photographerText}">${background.description}</span>
                ${licenseHtml}
            `;
        }
    }
}

// 注意：时间显示已由 clock.js 模块处理，此处不再重复更新
// 避免多处同时更新导致的闪烁问题

// 初始化应用
async function initApp() {
    console.log('正在初始化应用...');

    // 关键：无论其他模块是否初始化失败，按钮/快捷键都必须可用
    try {
        setupKeyboardShortcuts();
        console.log('键盘快捷键设置完成');
    } catch (e) {
        console.error('键盘快捷键设置失败:', e);
    }

    // 各模块独立初始化，避免单点失败影响全局
    try {
        await window.settingsManager.init();
        console.log('设置管理器初始化完成');
    } catch (error) {
        console.error('设置管理器初始化失败:', error);
    }

    try {
        window.i18nManager.init();
        console.log('国际化模块初始化完成');
    } catch (error) {
        console.error('国际化模块初始化失败:', error);
    }

    try {
        clockManager.init();
        console.log('时钟模块初始化完成');
    } catch (error) {
        console.error('时钟模块初始化失败:', error);
    }

    try {
        holidayManager.init();
        console.log('节假日模块初始化完成');
    } catch (error) {
        console.error('节假日模块初始化失败:', error);
    }

    try {
        await weatherManager.init();
        console.log('天气模块初始化完成');
    } catch (error) {
        console.error('天气模块初始化失败:', error);
    }

    try {
        // 不 await：避免阻塞其它功能；内部会自处理加载与UI创建
        if (window.memoManager && typeof window.memoManager.init === 'function') {
            window.memoManager.init();
        } else {
            console.warn('备忘录模块未就绪：window.memoManager 不存在或 init 不是函数');
        }
        console.log('备忘录模块初始化完成');
    } catch (error) {
        console.error('备忘录模块初始化失败:', error);
    }

    // 初始化滚动信息栏（延迟加载，不阻塞主功能）
    try {
        if (window.techTicker && typeof window.techTicker.init === 'function') {
            window.techTicker.init();
        }
        console.log('滚动信息栏初始化完成');
    } catch (error) {
        console.error('滚动信息栏初始化失败:', error);
    }

    // 初始化任务滚动提醒条
    try {
        if (window.taskTicker && typeof window.taskTicker.init === 'function') {
            window.taskTicker.init();
        }
        console.log('任务提醒条初始化完成');
    } catch (error) {
        console.error('任务提醒条初始化失败:', error);
    }

    console.log('应用初始化完成（可能部分模块降级）');
}

// 设置键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Ctrl/⌘ + Shift + B 切换背景（避免与任务空格键冲突）
        const isSwitchBackground =
            !isInputFocused() &&
            event.shiftKey &&
            (event.ctrlKey || event.metaKey) &&
            event.code === 'KeyB';

        if (isSwitchBackground) {
            event.preventDefault();
            changeBackground();
        }
    });
    
    // 右下角按钮点击事件 - 切换侧边栏
    const memoToggleBtn = document.getElementById('memo-toggle-btn');
    if (memoToggleBtn) {
        memoToggleBtn.addEventListener('click', () => {
            if (window.memoManager && typeof window.memoManager.toggle === 'function') {
                window.memoManager.toggle();
            }
        });
    }
    
    // 侧边栏折叠按钮
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            if (window.memoManager && typeof window.memoManager.toggleSidebar === 'function') {
                window.memoManager.toggleSidebar();
            }
        });
    }
}

// 检查是否有输入框聚焦
function isInputFocused() {
    const activeEl = document.activeElement;
    return activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
    );
}

// 启动应用
document.addEventListener('DOMContentLoaded', initApp);
