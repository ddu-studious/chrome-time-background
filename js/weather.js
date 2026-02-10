class WeatherService {
    constructor() {
        this.API_KEY = '95c944325dfa427d836b3a32875d1b77';
        this.weatherContainer = document.getElementById('weather');
        this.forecastContainer = document.getElementById('forecast');
        this.weatherWrapper = document.querySelector('.weather-wrapper');
        this.updateInterval = 30 * 60 * 1000; // 30分钟更新一次
        this.retryTimeout = 5000; // 5秒后重试
        this.maxRetries = 3; // 最大重试次数
        this.weatherIcons = {
            //晴
            '100': '☀️', '101': '🌤', '102': '⛅️', '103': '🌥', '104': '☁️',
            //月相
            '150': '🌑', '151': '🌒', '152': '🌓', '153': '🌔',
            //雨
            '300': '🌧', '301': '🌧', '302': '⛈', '303': '⛈', '304': '⛈', 
            '305': '🌧', '306': '🌧', '307': '🌧', '308': '🌧', '309': '🌧',
            '310': '🌧', '311': '🌧', '312': '🌧', '313': '🌧', '314': '🌧',
            '315': '🌧', '316': '🌧', '317': '🌧', '318': '🌧', '350': '🌧',
            '351': '🌧', '399': '🌧',
            //雪
            '400': '🌨', '401': '🌨', '402': '🌨', '403': '🌨', '404': '🌨',
            '405': '🌨', '406': '🌨', '407': '🌨', '408': '🌨', '409': '🌨',
            '410': '🌨', '456': '🌨', '457': '🌨', '499': '🌨',
            //雾霾
            '500': '🌫', '501': '🌫', '502': '🌫', '503': '🌫', '504': '🌫',
            '507': '🌫', '508': '🌫', '509': '🌫', '510': '🌫', '511': '🌫',
            '512': '🌫', '513': '🌫', '514': '🌫', '515': '🌫', '599': '🌫',
            //特殊天气
            '900': '🌪', '901': '🌡', '999': '❓'
        };
        this._initialized = false;
        this._updateIntervalId = null;
    }

    async init() {
        // 防止重复初始化（main.js 与本文件曾同时触发）
        if (this._initialized) return;
        this._initialized = true;

        // 监听设置变更
        if (window.settingsManager) {
            window.settingsManager.addChangeListener((settings) => {
                this.onSettingsChange(settings);
            });
            // 初始化时检查 showWeather 设置
            const showWeather = window.settingsManager.getSetting('showWeather');
            if (showWeather === false) {
                this.hideWeatherArea();
                return;
            }
        }

        try {
            this.bindChartEvents();
            await this.updateWeather();
            this._updateIntervalId = setInterval(() => this.updateWeather(), this.updateInterval);
        } catch (error) {
            console.error('Weather initialization failed:', error);
            this.showError('');
            this.retryInit();
        }
    }

    /**
     * 响应设置变更
     */
    onSettingsChange(settings) {
        if (settings.showWeather === false) {
            this.hideWeatherArea();
            // 停止定时更新
            if (this._updateIntervalId) {
                clearInterval(this._updateIntervalId);
                this._updateIntervalId = null;
            }
        } else {
            this.showWeatherArea();
            // 重新启动天气更新
            this.updateWeather();
            if (!this._updateIntervalId) {
                this._updateIntervalId = setInterval(() => this.updateWeather(), this.updateInterval);
            }
        }
    }

    /**
     * 隐藏天气区域
     */
    hideWeatherArea() {
        if (this.weatherWrapper) {
            this.weatherWrapper.style.display = 'none';
        }
    }

    /**
     * 显示天气区域
     */
    showWeatherArea() {
        if (this.weatherWrapper) {
            this.weatherWrapper.style.display = '';
        }
    }

    async retryInit(retryCount = 0) {
        if (retryCount >= this.maxRetries) {
            this.showError('');
            return;
        }

        setTimeout(async () => {
            try {
                await this.updateWeather();
                if (!this._updateIntervalId) {
                    this._updateIntervalId = setInterval(() => this.updateWeather(), this.updateInterval);
                }
            } catch (error) {
                console.error(`Retry ${retryCount + 1} failed:`, error);
                this.retryInit(retryCount + 1);
            }
        }, this.retryTimeout);
    }

    async getCachedLocation() {
        try {
            if (!chrome?.storage?.local) return null;
            const { lastKnownLocation } = await chrome.storage.local.get('lastKnownLocation');
            if (!lastKnownLocation?.latitude || !lastKnownLocation?.longitude) return null;
            return lastKnownLocation;
        } catch {
            return null;
        }
    }

    async cacheLocation(location) {
        try {
            if (!chrome?.storage?.local) return;
            await chrome.storage.local.set({
                lastKnownLocation: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    ts: Date.now()
                }
            });
        } catch {
            // ignore
        }
    }

    async getLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('您的浏览器不支持地理位置服务'));
                return;
            }

            const options = {
                // 高精度定位更慢也更容易超时，这里默认关闭以提升首屏体验
                enableHighAccuracy: false,
                timeout: 6000,
                maximumAge: 30000
            };

            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    latitude: position.coords.latitude.toFixed(4),
                    longitude: position.coords.longitude.toFixed(4)
                }),
                error => {
                    console.warn('Geolocation error:', { code: error.code, message: error.message });
                    let errorMessage = '无法获取您的位置';
                    
                    // 根据错误代码提供更具体的错误消息
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = '您拒绝了地理位置请求。请在浏览器设置中允许此扩展使用地理位置服务。';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = '位置信息不可用。';
                            break;
                        case error.TIMEOUT:
                            errorMessage = '获取位置请求超时。';
                            break;
                        case error.UNKNOWN_ERROR:
                            errorMessage = '发生未知错误。';
                            break;
                    }
                    
                    reject(new Error(errorMessage));
                },
                options
            );
        });
    }

    async fetchWithTimeout(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } finally {
            clearTimeout(id);
        }
    }

    async fetchWeatherData(latitude, longitude) {
        try {
            // 获取城市ID
            const geoUrl = `https://geoapi.qweather.com/v2/city/lookup?location=${longitude},${latitude}&key=${this.API_KEY}`;
            const geoData = await this.fetchWithTimeout(geoUrl);
            
            if (geoData.code !== '200' || !geoData.location?.[0]?.id) {
                throw new Error('无法根据您的位置获取城市信息');
            }
            
            const locationId = geoData.location[0].id;
            const cityName = geoData.location[0].name;

            return await this.fetchWeatherDataByCity(locationId, cityName);
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    /**
     * 根据城市ID获取天气数据（含逐小时预报）
     */
    async fetchWeatherDataByCity(locationId, cityName) {
        try {
            // 并行请求所有天气数据（使用72h覆盖3天预报日期）
            const [weatherData, forecastData, hourlyData] = await Promise.all([
                this.fetchWithTimeout(`https://devapi.qweather.com/v7/weather/now?location=${locationId}&key=${this.API_KEY}`),
                this.fetchWithTimeout(`https://devapi.qweather.com/v7/weather/3d?location=${locationId}&key=${this.API_KEY}`),
                this.fetchHourlyForecast(locationId, '72h')
            ]);
            
            if (weatherData.code !== '200') {
                throw new Error('获取实时天气信息失败');
            }
            if (forecastData.code !== '200') {
                throw new Error('获取天气预报信息失败');
            }

            return {
                city: cityName,
                current: weatherData.now,
                forecast: forecastData.daily,
                hourly: hourlyData.hourly || []
            };
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    /**
     * 获取逐小时天气预报数据
     * @param {string} locationId - 城市ID
     * @param {string} hours - 预报小时数：24h
     * @returns {Promise<Object>} 逐小时预报数据
     */
    async fetchHourlyForecast(locationId, hours = '24h') {
        try {
            const hourlyUrl = `https://devapi.qweather.com/v7/weather/${hours}?location=${locationId}&key=${this.API_KEY}`;
            const hourlyData = await this.fetchWithTimeout(hourlyUrl);
            
            if (hourlyData.code !== '200') {
                console.warn('获取逐小时预报失败，降级处理');
                return { updateTime: new Date().toISOString(), hourly: [] };
            }
            
            return {
                updateTime: hourlyData.updateTime,
                hourly: hourlyData.hourly || []
            };
        } catch (error) {
            console.error('Hourly forecast API request failed:', error);
            // 逐小时预报失败不影响主天气显示
            return { updateTime: new Date().toISOString(), hourly: [] };
        }
    }

    getWeatherIcon(code) {
        // 确保code是字符串
        const iconCode = String(code);
        return this.weatherIcons[iconCode] || this.weatherIcons['999'];
    }

    updateTheme(weatherCode) {
        const container = document.querySelector('.container');
        if (!container) return;

        container.classList.remove('theme-sunny', 'theme-cloudy', 'theme-rainy', 'theme-snowy', 'theme-night');
        
        const hour = new Date().getHours();
        const isNight = hour < 6 || hour >= 18;

        if (isNight) {
            container.classList.add('theme-night');
            return;
        }

        const code = parseInt(weatherCode);
        if (code >= 100 && code <= 103) {
            container.classList.add('theme-sunny');
        } else if (code === 104 || (code >= 150 && code <= 153)) {
            container.classList.add('theme-cloudy');
        } else if (code >= 300 && code <= 399) {
            container.classList.add('theme-rainy');
        } else if (code >= 400 && code <= 499) {
            container.classList.add('theme-snowy');
        }
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return weekdays[date.getDay()];
    }

    /**
     * 通过城市名称查询城市ID
     */
    async lookupCityByName(cityName) {
        const geoUrl = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(cityName)}&key=${this.API_KEY}`;
        const geoData = await this.fetchWithTimeout(geoUrl);
        if (geoData.code !== '200' || !geoData.location?.[0]?.id) {
            throw new Error(`无法找到城市"${cityName}"，请检查城市名称`);
        }
        return {
            id: geoData.location[0].id,
            name: geoData.location[0].name
        };
    }

    /**
     * 获取温度单位
     */
    getTemperatureUnit() {
        return window.settingsManager?.getSetting('temperatureUnit') || 'C';
    }

    /**
     * 格式化温度显示
     */
    formatTemp(tempC, withUnit = true) {
        const unit = this.getTemperatureUnit();
        let temp = parseInt(tempC);
        if (unit === 'F') {
            temp = Math.round(temp * 9 / 5 + 32);
        }
        return withUnit ? `${temp}°${unit}` : `${temp}°`;
    }

    async updateWeather() {
        try {
            // 检查 showWeather 设置
            const showWeather = window.settingsManager?.getSetting('showWeather');
            if (showWeather === false) {
                this.hideWeatherArea();
                return;
            }

            let weatherData;
            const manualCity = window.settingsManager?.getSetting('weatherCity');

            if (manualCity && manualCity.trim()) {
                // 使用手动设置的城市名称
                try {
                    const cityInfo = await this.lookupCityByName(manualCity.trim());
                    weatherData = await this.fetchWeatherDataByCity(cityInfo.id, cityInfo.name);
                } catch (error) {
                    console.error('Manual city weather failed:', error);
                    this.showError(error.message);
                    return;
                }
            } else {
                // 自动定位模式
                let location;
                try {
                    location = await this.getLocation();
                    this.cacheLocation(location);
                } catch (error) {
                    console.warn('Location error:', error);
                    const cached = await this.getCachedLocation();
                    if (cached) {
                        location = cached;
                    } else {
                        // 自动定位失败且无缓存，也无手动城市 → 隐藏天气区域
                        console.warn('无法获取位置，且未设置手动城市，隐藏天气区域');
                        this.hideWeatherArea();
                        return;
                    }
                }
                weatherData = await this.fetchWeatherData(location.latitude, location.longitude);
            }
            
            if (!this.weatherContainer || !this.forecastContainer) {
                throw new Error('找不到天气显示容器');
            }

            // 确保天气区域可见
            this.showWeatherArea();

            // 更新当前天气
            this.weatherContainer.innerHTML = `
                <div class="current-weather">
                    <span class="weather-icon">${this.getWeatherIcon(weatherData.current.icon)}</span>
                    <span class="weather-temp">${this.formatTemp(weatherData.current.temp)}</span>
                    <span class="weather-desc">${weatherData.current.text}</span>
                    <span class="weather-city">${weatherData.city}</span>
                </div>
            `;

            // 存储完整的逐小时数据和预报日期，供日期切换使用
            this.allHourlyData = weatherData.hourly || [];
            this.forecastDays = weatherData.forecast || [];
            this.selectedDayIndex = 0; // 默认选中第一天（今天）

            // 更新天气预报（带日期选择交互）
            this.forecastContainer.innerHTML = weatherData.forecast.map((day, i) => `
                <div class="forecast-day${i === 0 ? ' active' : ''}" data-day-index="${i}" data-date="${day.fxDate}">
                    <span class="forecast-date">${this.formatDate(day.fxDate)}</span>
                    <span class="forecast-icon">${this.getWeatherIcon(day.iconDay)}</span>
                    <div class="forecast-temp">
                        <span class="temp-max">${this.formatTemp(day.tempMax, false)}</span>
                        <span class="temp-min">${this.formatTemp(day.tempMin, false)}</span>
                    </div>
                </div>
            `).join('');

            // 绑定日期卡片点击事件
            this.bindForecastDayEvents();

            // 渲染逐小时温度曲线图（按选中日期筛选）
            this.hourlyData = this.getHourlyDataForDay(0);
            this.renderHourlyChart();

            // 更新主题
            this.updateTheme(weatherData.current.icon);
        } catch (error) {
            console.error('Failed to update weather:', error);
            this.showError(error.message);
        }
    }

    /**
     * 渲染逐小时温度曲线图
     */
    renderHourlyChart() {
        const container = document.getElementById('hourly-chart-container');
        if (!container) return;
        
        if (!this.hourlyData || this.hourlyData.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = '';
        const chartEl = document.getElementById('hourly-chart');
        if (!chartEl) return;

        // 初始化或更新图表
        if (!this.temperatureChart) {
            this.temperatureChart = new HourlyTemperatureChart(chartEl, this.hourlyData, this);
        } else {
            this.temperatureChart.updateData(this.hourlyData);
        }
    }

    /**
     * 绑定逐小时图表切换事件
     */
    bindChartEvents() {
        const toggleBtn = document.getElementById('hourly-chart-toggle');
        const container = document.getElementById('hourly-chart-container');
        if (!toggleBtn || !container) return;

        toggleBtn.addEventListener('click', () => {
            const isVisible = !container.classList.contains('collapsed');
            container.classList.toggle('collapsed', isVisible);
            toggleBtn.querySelector('i').className = isVisible 
                ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            toggleBtn.title = isVisible ? '展开温度曲线' : '收起温度曲线';
        });
    }

    /**
     * 绑定预报日期卡片的点击事件（切换当日逐小时曲线）
     */
    bindForecastDayEvents() {
        if (!this.forecastContainer) return;
        
        this.forecastContainer.querySelectorAll('.forecast-day').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const dayIndex = parseInt(dayEl.dataset.dayIndex);
                if (isNaN(dayIndex) || dayIndex === this.selectedDayIndex) return;
                
                // 更新选中状态
                this.forecastContainer.querySelectorAll('.forecast-day').forEach(el => 
                    el.classList.remove('active'));
                dayEl.classList.add('active');
                this.selectedDayIndex = dayIndex;
                
                // 切换曲线数据
                this.hourlyData = this.getHourlyDataForDay(dayIndex);
                
                // 更新标题
                const titleEl = document.querySelector('.hourly-chart-title');
                if (titleEl) {
                    const dayLabel = dayIndex === 0 ? '今天' : this.forecastDays[dayIndex] 
                        ? this.formatDate(this.forecastDays[dayIndex].fxDate) : '';
                    titleEl.innerHTML = `<i class="fas fa-temperature-half"></i> ${dayLabel} 24小时温度趋势`;
                }

                this.renderHourlyChart();
            });
        });
    }

    /**
     * 按日期筛选逐小时数据
     * @param {number} dayIndex - 天数索引（0=今天，1=明天，2=后天）
     * @returns {Array} 该日期的逐小时数据
     */
    getHourlyDataForDay(dayIndex) {
        if (!this.allHourlyData || this.allHourlyData.length === 0) return [];
        if (!this.forecastDays || !this.forecastDays[dayIndex]) return this.allHourlyData.slice(0, 24);
        
        const targetDate = this.forecastDays[dayIndex].fxDate; // 'YYYY-MM-DD'
        
        // 筛选目标日期的数据
        const dayData = this.allHourlyData.filter(h => {
            const hDate = h.fxTime.substring(0, 10); // 'YYYY-MM-DD' from ISO
            return hDate === targetDate;
        });
        
        // 如果筛选到数据，直接返回；否则按24小时分段
        if (dayData.length > 0) return dayData;
        
        // 降级：按 24 小时分段
        const start = dayIndex * 24;
        return this.allHourlyData.slice(start, start + 24);
    }

    showError(message) {
        if (this.weatherContainer) {
            this.weatherContainer.innerHTML = `
                <div class="weather-error">
                    <span class="error-icon">⚠️</span>
                    <span class="error-message">${message || '天气服务暂时不可用'}</span>
                </div>
            `;
        }
        if (this.forecastContainer) {
            this.forecastContainer.innerHTML = '';
        }
        // 隐藏逐小时曲线图
        const chartContainer = document.getElementById('hourly-chart-container');
        if (chartContainer) chartContainer.style.display = 'none';
    }
}

/**
 * 逐小时温度曲线图（Canvas 实现）
 * 轻量级、无依赖的温度折线图，支持鼠标悬停 tooltip
 */
class HourlyTemperatureChart {
    constructor(container, hourlyData, weatherService) {
        this.container = container;
        this.data = hourlyData;
        this.ws = weatherService; // 用于 formatTemp
        this.hoveredIndex = -1;
        this.padding = { top: 30, right: 20, bottom: 44, left: 42 };
        this.dpr = window.devicePixelRatio || 1;
        
        this.initCanvas();
        this.setupInteraction();
        this.draw();
    }

    initCanvas() {
        // 清空容器
        this.container.innerHTML = '';
        
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'hourly-chart-canvas';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // tooltip DOM（放在 canvas 外部避免重绘闪烁）
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'hourly-chart-tooltip';
        this.tooltip.style.display = 'none';
        this.container.appendChild(this.tooltip);

        this.resize();
        this._resizeHandler = () => { this.resize(); this.draw(); };
        window.addEventListener('resize', this._resizeHandler);
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        const w = rect.width || 500;
        // 自适应高度：保持合理比例，但给底部标签充足空间
        // 基准高度 220，加上下内边距
        const h = Math.max(240, this.padding.top + 180 + this.padding.bottom);
        this.width = w;
        this.height = h;
        this.canvas.width = w * this.dpr;
        this.canvas.height = h * this.dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        this.plotArea = {
            x: this.padding.left,
            y: this.padding.top,
            w: w - this.padding.left - this.padding.right,
            h: h - this.padding.top - this.padding.bottom
        };
    }

    updateData(hourlyData) {
        this.data = hourlyData;
        this.hoveredIndex = -1;
        this.tooltip.style.display = 'none';
        this.draw();
    }

    /* ---- 坐标转换 ---- */
    get temps() {
        return this.data.map(d => parseInt(d.temp));
    }

    getPixelX(i) {
        const step = this.plotArea.w / Math.max(this.data.length - 1, 1);
        return this.plotArea.x + i * step;
    }

    getPixelY(temp) {
        const t = this.temps;
        const min = Math.min(...t) - 1;
        const max = Math.max(...t) + 1;
        const range = max - min || 1;
        return this.plotArea.y + this.plotArea.h * (1 - (temp - min) / range);
    }

    /* ---- 绘制 ---- */
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        if (!this.data || this.data.length === 0) return;

        this.drawGrid();
        this.drawAreaFill();
        this.drawLine();
        this.drawPoints();
        this.drawXLabels();
        this.drawYLabels();
    }

    drawGrid() {
        const ctx = this.ctx;
        const t = this.temps;
        const min = Math.min(...t) - 1;
        const max = Math.max(...t) + 1;
        const steps = 4;
        const range = max - min;

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;

        for (let i = 0; i <= steps; i++) {
            const y = this.plotArea.y + (this.plotArea.h / steps) * i;
            ctx.beginPath();
            ctx.moveTo(this.plotArea.x, y);
            ctx.lineTo(this.plotArea.x + this.plotArea.w, y);
            ctx.stroke();
        }
    }

    drawAreaFill() {
        const ctx = this.ctx;
        const pa = this.plotArea;
        
        ctx.beginPath();
        this.data.forEach((item, i) => {
            const x = this.getPixelX(i);
            const y = this.getPixelY(parseInt(item.temp));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        // 闭合到底部形成区域
        ctx.lineTo(this.getPixelX(this.data.length - 1), pa.y + pa.h);
        ctx.lineTo(this.getPixelX(0), pa.y + pa.h);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, pa.y, 0, pa.y + pa.h);
        gradient.addColorStop(0, 'rgba(100, 180, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(100, 180, 255, 0.02)');
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    drawLine() {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        this.data.forEach((item, i) => {
            const x = this.getPixelX(i);
            const y = this.getPixelY(parseInt(item.temp));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    drawPoints() {
        const ctx = this.ctx;
        this.data.forEach((item, i) => {
            const x = this.getPixelX(i);
            const y = this.getPixelY(parseInt(item.temp));
            const isHovered = i === this.hoveredIndex;

            ctx.beginPath();
            ctx.arc(x, y, isHovered ? 5 : 2.5, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? '#ff6b6b' : 'rgba(100, 180, 255, 0.9)';
            ctx.fill();

            if (isHovered) {
                ctx.beginPath();
                ctx.arc(x, y, 9, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 107, 107, 0.3)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });
    }

    drawXLabels() {
        const ctx = this.ctx;
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.textAlign = 'center';

        // 每隔几个点显示标签，避免拥挤
        const step = this.data.length <= 12 ? 2 : (this.data.length <= 24 ? 3 : 6);
        this.data.forEach((item, i) => {
            if (i % step !== 0 && i !== this.data.length - 1) return;
            const x = this.getPixelX(i);
            const hour = new Date(item.fxTime).getHours();
            ctx.fillText(`${hour}时`, x, this.plotArea.y + this.plotArea.h + 16);
        });
    }

    drawYLabels() {
        const ctx = this.ctx;
        const t = this.temps;
        const min = Math.min(...t) - 1;
        const max = Math.max(...t) + 1;
        const steps = 4;

        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let i = 0; i <= steps; i++) {
            const val = max - (max - min) * (i / steps);
            const y = this.plotArea.y + (this.plotArea.h / steps) * i;
            const formatted = this.ws ? this.ws.formatTemp(Math.round(val), false) : `${Math.round(val)}°`;
            ctx.fillText(formatted, this.plotArea.x - 6, y);
        }
    }

    /* ---- 交互 ---- */
    setupInteraction() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            let nearest = -1;
            let minDist = Infinity;

            this.data.forEach((item, i) => {
                const x = this.getPixelX(i);
                const y = this.getPixelY(parseInt(item.temp));
                const d = Math.sqrt((mx - x) ** 2 + (my - y) ** 2);
                if (d < minDist && d < 25) {
                    minDist = d;
                    nearest = i;
                }
            });

            if (nearest !== this.hoveredIndex) {
                this.hoveredIndex = nearest;
                this.draw();
                this.updateTooltip(nearest, e);
            } else if (nearest >= 0) {
                this.positionTooltip(e);
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoveredIndex = -1;
            this.tooltip.style.display = 'none';
            this.draw();
        });
    }

    updateTooltip(index, evt) {
        if (index < 0 || index >= this.data.length) {
            this.tooltip.style.display = 'none';
            return;
        }

        const d = this.data[index];
        const hour = new Date(d.fxTime).getHours();
        const temp = this.ws ? this.ws.formatTemp(d.temp) : `${d.temp}°C`;
        const icon = this.ws ? this.ws.getWeatherIcon(d.icon) : '';

        this.tooltip.innerHTML = `
            <div class="hct-time">${hour}:00</div>
            <div class="hct-main">${icon} ${temp}</div>
            <div class="hct-desc">${d.text}${d.windDir ? ' · ' + d.windDir + d.windScale + '级' : ''}</div>
            ${d.humidity ? `<div class="hct-extra">湿度 ${d.humidity}%${d.pop && d.pop !== '0' ? ' · 降水 ' + d.pop + '%' : ''}</div>` : ''}
        `;
        this.tooltip.style.display = 'block';
        this.positionTooltip(evt);
    }

    positionTooltip(evt) {
        const cr = this.container.getBoundingClientRect();
        let left = evt.clientX - cr.left + 12;
        let top = evt.clientY - cr.top - 10;

        // 防止超出右边界
        const tw = this.tooltip.offsetWidth || 140;
        if (left + tw > cr.width) left = evt.clientX - cr.left - tw - 12;
        // 防止超出上边界
        if (top < 0) top = evt.clientY - cr.top + 16;

        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';
    }

    destroy() {
        window.removeEventListener('resize', this._resizeHandler);
        this.container.innerHTML = '';
    }
}

// 创建天气服务实例
const weatherManager = new WeatherService();

// 将天气管理器设置为全局变量
window.weatherManager = weatherManager;

// 注意：统一在 main.js 中初始化，避免重复启动与重复计时器
