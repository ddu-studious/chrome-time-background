/**
 * 多语言支持模块
 * 提供中英文语言切换功能
 */

class I18nManager {
    constructor() {
        // 语言包
        this.translations = {
            zh: {
                // 时间相关
                weekdays: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
                months: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
                today: '今天',
                now: '现在',
                
                // 天气相关
                weather: '天气',
                temperature: '温度',
                feelsLike: '体感温度',
                humidity: '湿度',
                wind: '风速',
                sunrise: '日出',
                sunset: '日落',
                loading: '加载中...',
                locationError: '无法获取位置信息',
                weatherError: '无法获取天气数据',
                
                // 设置相关
                settings: '设置',
                timeSettings: '时间设置',
                timeFormat: '时间格式',
                hour12: '12小时制',
                hour24: '24小时制',
                showSeconds: '显示秒数',
                showDate: '显示日期',
                
                weatherSettings: '天气设置',
                showWeather: '显示天气',
                temperatureUnit: '温度单位',
                celsius: '摄氏度 (°C)',
                fahrenheit: '华氏度 (°F)',
                
                backgroundSettings: '背景设置',
                backgroundInterval: '背景切换间隔',
                min5: '5分钟',
                min15: '15分钟',
                min30: '30分钟',
                hour1: '1小时',
                
                holidaySettings: '节假日设置',
                showHolidays: '显示节假日',
                
                interfaceSettings: '界面设置',
                theme: '主题',
                auto: '自动',
                light: '浅色',
                dark: '深色',
                language: '语言',
                
                languageSettings: '语言设置',
                chinese: '中文',
                english: '英文',
                
                save: '保存',
                cancel: '取消',
                close: '关闭',
                
                // 备忘录相关
                memoTitle: '备忘录',
                memos: '备忘录',
                tasks: '任务',
                addMemo: '添加备忘录',
                addTask: '添加任务',
                editMemo: '编辑备忘录',
                deleteMemo: '删除备忘录',
                memoTitlePlaceholder: '标题',
                memoContentPlaceholder: '内容',
                memoCategory: '分类',
                work: '工作',
                life: '生活',
                study: '学习',
                other: '其他',
                noMemos: '暂无备忘录',
                noTasks: '暂无任务',
                titleRequired: '请输入标题',
                contentRequired: '请输入内容',
                confirmDelete: '确定要删除这条备忘录吗？',
                edit: '编辑',
                delete: '删除',
                minimize: '最小化',
                close: '关闭',
                
                // 任务排序和过滤
                sortBy: '排序方式',
                sortByCreatedTime: '创建时间',
                sortByUpdatedTime: '更新时间',
                sortByTitle: '标题',
                sortByCompleted: '完成状态',
                sortAscending: '升序',
                sortDescending: '降序',
                filter: '筛选',
                filterAll: '全部',
                filterCompleted: '已完成',
                filterUncompleted: '未完成',
                search: '搜索',
                searchPlaceholder: '搜索任务...',
                clearSearch: '清除搜索',
                searchTasks: '搜索任务...',
                allTasks: '所有任务',
                completedTasks: '已完成任务',
                uncompletedTasks: '未完成任务',
                allCategories: '所有分类',
                allTags: '所有标签',
                
                // 背景相关
                backgroundInfo: '背景信息',
                photographer: '摄影师',
                location: '位置',
                changeBackground: '按 Ctrl/⌘ + Shift + B 切换背景',
                
                // 任务优先级相关
                priority: '优先级',
                highPriority: '高',
                mediumPriority: '中',
                lowPriority: '低',
                noPriority: '无',
                
                // 截止日期相关
                dueDate: '截止日期',
                overdue: '已逾期',
                dueToday: '今日到期',
                dueTomorrow: '明日到期',
                daysLeft: '剩余天数',
                noDueDate: '无截止日期',
                clearDueDate: '清除截止日期',
                
                // 排序相关
                sort: '排序',
                sortNewest: '最新创建',
                sortOldest: '最早创建',
                sortPriority: '按优先级',
                sortDueDate: '按截止日期',
                
                // 键盘快捷键相关
                shortcuts: '快捷键',
                shortcutAdd: '添加新任务',
                shortcutComplete: '完成/取消完成任务',
                shortcutEdit: '编辑任务',
                shortcutDelete: '删除任务',
                shortcutSave: '保存',
                shortcutCancel: '取消',
                shortcutTogglePanel: '显示/隐藏面板',
                shortcutHelp: '显示快捷键帮助',
                
                // 任务分类和标签相关
                categories: '分类',
                tags: '标签',
                addCategory: '添加分类',
                editCategory: '编辑分类',
                deleteCategory: '删除分类',
                categoryName: '分类名称',
                categoryColor: '分类颜色',
                addTag: '添加标签',
                editTag: '编辑标签',
                deleteTag: '删除标签',
                tagName: '标签名称',
                tagColor: '标签颜色',
                selectCategory: '选择分类',
                selectTags: '选择标签',
                noCategory: '无分类',
                manageCategoriesAndTags: '管理分类和标签',
                confirmDeleteCategory: '确定要删除此分类吗？分类下的任务将变为无分类。',
                confirmDeleteTag: '确定要删除此标签吗？已使用此标签的任务将移除此标签。',
                
                category: '分类',
                tag: '标签',
                manageCategoriesAndTags: '管理分类和标签',
                addCategory: '添加分类',
                editCategory: '编辑分类',
                addTag: '添加标签',
                editTag: '编辑标签',
                categoryName: '分类名称',
                tagName: '标签名称',
                color: '颜色',
                edit: '编辑',
                delete: '删除',
                save: '保存',
                cancel: '取消',
                close: '关闭',
                noCategories: '暂无分类，点击"添加分类"按钮创建一个新分类。',
                noTags: '暂无标签，点击"添加标签"按钮创建一个新标签。',
                confirmDeleteCategory: '确定要删除这个分类吗？所有使用此分类的任务将不再属于任何分类。',
                confirmDeleteTag: '确定要删除这个标签吗？所有使用此标签的任务将不再包含此标签。',
                selectCategory: '选择分类',
                selectTags: '选择标签',
                noCategory: '无分类',
            },
            en: {
                // 时间相关
                weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
                today: 'Today',
                now: 'Now',
                
                // 天气相关
                weather: 'Weather',
                temperature: 'Temperature',
                feelsLike: 'Feels Like',
                humidity: 'Humidity',
                wind: 'Wind',
                sunrise: 'Sunrise',
                sunset: 'Sunset',
                loading: 'Loading...',
                locationError: 'Unable to get location',
                weatherError: 'Unable to get weather data',
                
                // 设置相关
                settings: 'Settings',
                timeSettings: 'Time Settings',
                timeFormat: 'Time Format',
                hour12: '12-hour',
                hour24: '24-hour',
                showSeconds: 'Show Seconds',
                showDate: 'Show Date',
                
                weatherSettings: 'Weather Settings',
                showWeather: 'Show Weather',
                temperatureUnit: 'Temperature Unit',
                celsius: 'Celsius (°C)',
                fahrenheit: 'Fahrenheit (°F)',
                
                backgroundSettings: 'Background Settings',
                backgroundInterval: 'Background Change Interval',
                min5: '5 minutes',
                min15: '15 minutes',
                min30: '30 minutes',
                hour1: '1 hour',
                
                holidaySettings: 'Holiday Settings',
                showHolidays: 'Show Holidays',
                
                interfaceSettings: 'Interface Settings',
                theme: 'Theme',
                auto: 'Auto',
                light: 'Light',
                dark: 'Dark',
                language: 'Language',
                
                languageSettings: 'Language Settings',
                chinese: 'Chinese',
                english: 'English',
                
                save: 'Save',
                cancel: 'Cancel',
                close: 'Close',
                
                // 备忘录相关
                memoTitle: 'Memos',
                memos: 'Memos',
                tasks: 'Tasks',
                addMemo: 'Add Memo',
                addTask: 'Add Task',
                editMemo: 'Edit Memo',
                deleteMemo: 'Delete Memo',
                memoTitlePlaceholder: 'Title',
                memoContentPlaceholder: 'Content',
                memoCategory: 'Category',
                work: 'Work',
                life: 'Life',
                study: 'Study',
                other: 'Other',
                noMemos: 'No memos yet',
                noTasks: 'No tasks yet',
                titleRequired: 'Title is required',
                contentRequired: 'Content is required',
                confirmDelete: 'Are you sure you want to delete this memo?',
                edit: 'Edit',
                delete: 'Delete',
                minimize: 'Minimize',
                close: 'Close',
                
                // 任务排序和过滤
                sortBy: 'Sort by',
                sortByCreatedTime: 'Created time',
                sortByUpdatedTime: 'Updated time',
                sortByTitle: 'Title',
                sortByCompleted: 'Completed status',
                sortAscending: 'Ascending',
                sortDescending: 'Descending',
                filter: 'Filter',
                filterAll: 'All',
                filterCompleted: 'Completed',
                filterUncompleted: 'Uncompleted',
                search: 'Search',
                searchPlaceholder: 'Search tasks...',
                clearSearch: 'Clear search',
                searchTasks: 'Search tasks...',
                allTasks: 'All tasks',
                completedTasks: 'Completed tasks',
                uncompletedTasks: 'Uncompleted tasks',
                allCategories: 'All categories',
                allTags: 'All tags',
                
                // 背景相关
                backgroundInfo: 'Background Info',
                photographer: 'Photographer',
                location: 'Location',
                changeBackground: 'Press space to change background',
                
                // 任务优先级相关
                priority: 'Priority',
                highPriority: 'High',
                mediumPriority: 'Medium',
                lowPriority: 'Low',
                noPriority: 'None',
                
                // 截止日期相关
                dueDate: 'Due Date',
                overdue: 'Overdue',
                dueToday: 'Due Today',
                dueTomorrow: 'Due Tomorrow',
                daysLeft: 'Days Left',
                noDueDate: 'No Due Date',
                clearDueDate: 'Clear Due Date',
                
                // 排序相关
                sort: 'Sort',
                sortNewest: 'Newest First',
                sortOldest: 'Oldest First',
                sortPriority: 'By Priority',
                sortDueDate: 'By Due Date',
                
                // 键盘快捷键相关
                shortcuts: 'Shortcuts',
                shortcutAdd: 'Add new task',
                shortcutComplete: 'Complete/Uncomplete task',
                shortcutEdit: 'Edit task',
                shortcutDelete: 'Delete task',
                shortcutSave: 'Save',
                shortcutCancel: 'Cancel',
                shortcutTogglePanel: 'Show/Hide panel',
                shortcutHelp: 'Show shortcuts help',
                
                // 任务分类和标签相关
                categories: 'Categories',
                tags: 'Tags',
                addCategory: 'Add Category',
                editCategory: 'Edit Category',
                deleteCategory: 'Delete Category',
                categoryName: 'Category Name',
                categoryColor: 'Category Color',
                addTag: 'Add Tag',
                editTag: 'Edit Tag',
                deleteTag: 'Delete Tag',
                tagName: 'Tag Name',
                tagColor: 'Tag Color',
                selectCategory: 'Select Category',
                selectTags: 'Select Tags',
                noCategory: 'No Category',
                manageCategoriesAndTags: 'Manage Categories & Tags',
                confirmDeleteCategory: 'Are you sure you want to delete this category? Tasks in this category will become uncategorized.',
                confirmDeleteTag: 'Are you sure you want to delete this tag? This tag will be removed from all tasks that use it.',
                
                category: 'Category',
                tag: 'Tag',
                manageCategoriesAndTags: 'Manage Categories & Tags',
                addCategory: 'Add Category',
                editCategory: 'Edit Category',
                addTag: 'Add Tag',
                editTag: 'Edit Tag',
                categoryName: 'Category Name',
                tagName: 'Tag Name',
                color: 'Color',
                edit: 'Edit',
                delete: 'Delete',
                save: 'Save',
                cancel: 'Cancel',
                close: 'Close',
                noCategories: 'No categories yet. Click "Add Category" button to create one.',
                noTags: 'No tags yet. Click "Add Tag" button to create one.',
                confirmDeleteCategory: 'Are you sure you want to delete this category? All tasks using this category will no longer belong to any category.',
                confirmDeleteTag: 'Are you sure you want to delete this tag? All tasks using this tag will no longer have this tag.',
                selectCategory: 'Select Category',
                selectTags: 'Select Tags',
                noCategory: 'No Category',
            }
        };
        
        // 当前语言
        this.currentLanguage = 'zh';
    }
    
    init() {
        // 获取当前设置的语言
        this.currentLanguage = window.settingsManager.settings.language;
        
        // 监听设置变化
        window.settingsManager.addChangeListener(settings => {
            if (this.currentLanguage !== settings.language) {
                this.currentLanguage = settings.language;
                this.updatePageText();
            }
        });
        
        // 初始化页面文本
        this.updatePageText();
    }
    
    // 获取翻译文本
    getText(key) {
        const translations = this.translations[this.currentLanguage];
        return translations[key] || key;
    }
    
    // 获取数组类型的翻译（如星期几、月份）
    getTextArray(key, index) {
        const translations = this.translations[this.currentLanguage];
        if (translations[key] && translations[key][index] !== undefined) {
            return translations[key][index];
        }
        return `${key}[${index}]`;
    }
    
    // 更新页面上的所有文本
    updatePageText() {
        // 更新设置面板
        this.updateSettingsText();
        
        // 更新天气信息
        this.updateWeatherText();
        
        // 更新背景信息
        this.updateBackgroundText();
        
        // 更新键盘提示
        this.updateKeyboardHint();
    }
    
    // 更新设置面板文本
    updateSettingsText() {
        const settingsPanel = document.querySelector('.settings-panel');
        if (!settingsPanel) return;
        
        // 更新设置标题
        const settingsTitle = settingsPanel.querySelector('.settings-title');
        if (settingsTitle) {
            settingsTitle.textContent = this.getText('settings');
        }
        
        // 更新设置组标题
        const groupTitles = settingsPanel.querySelectorAll('.settings-group h3');
        if (groupTitles.length > 0) {
            const titles = [
                'timeSettings', 
                'weatherSettings', 
                'backgroundSettings', 
                'holidaySettings', 
                'interfaceSettings',
                'languageSettings'
            ];
            
            groupTitles.forEach((title, index) => {
                if (index < titles.length) {
                    title.textContent = this.getText(titles[index]);
                }
            });
        }
        
        // 更新设置项标签
        this.updateSettingLabels();
        
        // 更新按钮文本
        const saveButton = settingsPanel.querySelector('.settings-save');
        if (saveButton) {
            saveButton.textContent = this.getText('save');
        }
        
        const cancelButton = settingsPanel.querySelector('.settings-cancel');
        if (cancelButton) {
            cancelButton.textContent = this.getText('cancel');
        }
        
        const resetButton = settingsPanel.querySelector('.settings-reset');
        if (resetButton) {
            resetButton.textContent = this.getText('reset');
        }
    }
    
    // 更新设置项标签
    updateSettingLabels() {
        const settingsPanel = document.querySelector('.settings-panel');
        if (!settingsPanel) return;
        
        // 时间格式
        const timeFormatLabel = settingsPanel.querySelector('label[for="timeFormat"]');
        if (timeFormatLabel) {
            timeFormatLabel.childNodes[0].nodeValue = this.getText('timeFormat');
        }
        
        // 显示秒数
        const showSecondsLabel = settingsPanel.querySelector('label[for="showSeconds"]');
        if (showSecondsLabel) {
            showSecondsLabel.childNodes[0].nodeValue = this.getText('showSeconds');
        }
        
        // 显示日期
        const showDateLabel = settingsPanel.querySelector('label[for="showDate"]');
        if (showDateLabel) {
            showDateLabel.childNodes[0].nodeValue = this.getText('showDate');
        }
        
        // 显示天气
        const showWeatherLabel = settingsPanel.querySelector('label[for="showWeather"]');
        if (showWeatherLabel) {
            showWeatherLabel.childNodes[0].nodeValue = this.getText('showWeather');
        }
        
        // 温度单位
        const temperatureUnitLabel = settingsPanel.querySelector('label[for="temperatureUnit"]');
        if (temperatureUnitLabel) {
            temperatureUnitLabel.childNodes[0].nodeValue = this.getText('temperatureUnit');
        }
        
        // 背景切换间隔
        const backgroundIntervalLabel = settingsPanel.querySelector('label[for="backgroundInterval"]');
        if (backgroundIntervalLabel) {
            backgroundIntervalLabel.childNodes[0].nodeValue = this.getText('backgroundInterval');
        }
        
        // 显示节假日
        const showHolidaysLabel = settingsPanel.querySelector('label[for="showHolidays"]');
        if (showHolidaysLabel) {
            showHolidaysLabel.childNodes[0].nodeValue = this.getText('showHolidays');
        }
        
        // 主题
        const themeLabel = settingsPanel.querySelector('label[for="theme"]');
        if (themeLabel) {
            themeLabel.childNodes[0].nodeValue = this.getText('theme');
        }
        
        // 语言
        const languageLabel = settingsPanel.querySelector('label[for="language"]');
        if (languageLabel) {
            languageLabel.childNodes[0].nodeValue = this.getText('language');
        }
        
        // 语言设置
        const chineseLabel = settingsPanel.querySelector('label[for="chinese"]');
        if (chineseLabel) {
            chineseLabel.childNodes[0].nodeValue = this.getText('chinese');
        }
        
        const englishLabel = settingsPanel.querySelector('label[for="english"]');
        if (englishLabel) {
            englishLabel.childNodes[0].nodeValue = this.getText('english');
        }
    }
    
    // 更新天气信息文本
    updateWeatherText() {
        const weatherContainer = document.querySelector('.weather-container');
        if (!weatherContainer) return;
        
        // 更新天气标题
        const weatherTitle = weatherContainer.querySelector('.weather-title');
        if (weatherTitle) {
            weatherTitle.textContent = this.getText('weather');
        }
        
        // 更新天气详情标签
        const temperatureLabel = weatherContainer.querySelector('.weather-detail-label[data-i18n="temperature"]');
        if (temperatureLabel) {
            temperatureLabel.textContent = this.getText('temperature');
        }
        
        const feelsLikeLabel = weatherContainer.querySelector('.weather-detail-label[data-i18n="feelsLike"]');
        if (feelsLikeLabel) {
            feelsLikeLabel.textContent = this.getText('feelsLike');
        }
        
        const humidityLabel = weatherContainer.querySelector('.weather-detail-label[data-i18n="humidity"]');
        if (humidityLabel) {
            humidityLabel.textContent = this.getText('humidity');
        }
        
        const windLabel = weatherContainer.querySelector('.weather-detail-label[data-i18n="wind"]');
        if (windLabel) {
            windLabel.textContent = this.getText('wind');
        }
    }
    
    // 更新背景信息文本
    updateBackgroundText() {
        const bgInfoContainer = document.querySelector('.background-info');
        if (!bgInfoContainer) return;
        
        // 更新背景信息标题
        const bgInfoTitle = bgInfoContainer.querySelector('.background-info-title');
        if (bgInfoTitle) {
            bgInfoTitle.textContent = this.getText('backgroundInfo');
        }
        
        // 更新摄影师标签
        const photographerLabel = bgInfoContainer.querySelector('.background-info-label[data-i18n="photographer"]');
        if (photographerLabel) {
            photographerLabel.textContent = this.getText('photographer');
        }
        
        // 更新位置标签
        const locationLabel = bgInfoContainer.querySelector('.background-info-label[data-i18n="location"]');
        if (locationLabel) {
            locationLabel.childNodes[0].nodeValue = this.getText('location');
        }
    }
    
    // 更新键盘提示
    updateKeyboardHint() {
        const keyboardHint = document.querySelector('.keyboard-hint');
        if (keyboardHint) {
            keyboardHint.textContent = this.getText('changeBackground');
        }
    }
    
    // 格式化日期
    formatDate(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const weekday = date.getDay();
        
        if (this.currentLanguage === 'zh') {
            return `${year}年${month + 1}月${day}日 ${this.getTextArray('weekdays', weekday)}`;
        } else {
            return `${this.getTextArray('months', month)} ${day}, ${year} ${this.getTextArray('weekdays', weekday)}`;
        }
    }
    
    /**
     * 获取当前语言
     * @returns {string} 当前语言代码（'zh' 或 'en'）
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }
}

// 创建并导出国际化管理器
const i18nManager = new I18nManager();
window.i18nManager = i18nManager;
