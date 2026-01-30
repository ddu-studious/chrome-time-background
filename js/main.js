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
            creditElement.innerHTML = `
                <span class="location">${background.location}</span> - 
                <span class="description">${background.description}</span>
            `;
        }
        
        // 添加空格键切换背景事件
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                changeBackground();
            }
        });
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
            creditElement.innerHTML = `
                <span class="location">${background.location}</span> - 
                <span class="description">${background.description}</span>
            `;
        }
    }
}

// 更新时间显示
function updateTime() {
    const now = new Date();
    const timeElement = document.querySelector('.time');
    const dateElement = document.querySelector('.date');
    
    // 格式化时间
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    // 格式化日期
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[now.getDay()];
    
    timeElement.textContent = `${hours}:${minutes}:${seconds}`;
    dateElement.textContent = `${year}年${month}月${date}日 ${weekday}`;
}

// 每秒更新一次时间
setInterval(updateTime, 1000);
updateTime(); // 初始化显示

// 初始化应用
async function initApp() {
    console.log('正在初始化应用...');
    
    try {
        // 初始化设置管理器
        await window.settingsManager.init();
        console.log('设置管理器初始化完成');
        
        // 初始化国际化模块
        window.i18nManager.init();
        console.log('国际化模块初始化完成');
        
        // 初始化时钟模块
        clockManager.init();
        console.log('时钟模块初始化完成');
        
        // 初始化节假日模块
        holidayManager.init();
        console.log('节假日模块初始化完成');
        
        // 初始化天气模块
        await weatherManager.init();
        console.log('天气模块初始化完成');
        
        // 初始化备忘录模块
        window.memoManager.init();
        console.log('备忘录模块初始化完成');
        
        // 设置键盘快捷键
        setupKeyboardShortcuts();
        console.log('键盘快捷键设置完成');
        
        console.log('应用初始化完成');
    } catch (error) {
        console.error('应用初始化失败:', error);
    }
}

// 设置键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // 空格键切换背景
        if (event.code === 'Space') {
            changeBackground();
        }
    });
    
    // 备忘录按钮点击事件
    const memoToggleBtn = document.getElementById('memo-toggle-btn');
    if (memoToggleBtn) {
        memoToggleBtn.addEventListener('click', () => {
            window.memoManager.toggle();
        });
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', initApp);
