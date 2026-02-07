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
     * 根据城市ID获取天气数据
     */
    async fetchWeatherDataByCity(locationId, cityName) {
        try {
            // 获取实时天气
            const weatherUrl = `https://devapi.qweather.com/v7/weather/now?location=${locationId}&key=${this.API_KEY}`;
            const weatherData = await this.fetchWithTimeout(weatherUrl);
            
            if (weatherData.code !== '200') {
                throw new Error('获取实时天气信息失败');
            }

            // 获取天气预报
            const forecastUrl = `https://devapi.qweather.com/v7/weather/3d?location=${locationId}&key=${this.API_KEY}`;
            const forecastData = await this.fetchWithTimeout(forecastUrl);
            
            if (forecastData.code !== '200') {
                throw new Error('获取天气预报信息失败');
            }

            return {
                city: cityName,
                current: weatherData.now,
                forecast: forecastData.daily
            };
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
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

            // 更新天气预报
            this.forecastContainer.innerHTML = weatherData.forecast.map(day => `
                <div class="forecast-day">
                    <span class="forecast-date">${this.formatDate(day.fxDate)}</span>
                    <span class="forecast-icon">${this.getWeatherIcon(day.iconDay)}</span>
                    <div class="forecast-temp">
                        <span class="temp-max">${this.formatTemp(day.tempMax, false)}</span>
                        <span class="temp-min">${this.formatTemp(day.tempMin, false)}</span>
                    </div>
                </div>
            `).join('');

            // 更新主题
            this.updateTheme(weatherData.current.icon);
        } catch (error) {
            console.error('Failed to update weather:', error);
            this.showError(error.message);
        }
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
    }
}

// 创建天气服务实例
const weatherManager = new WeatherService();

// 将天气管理器设置为全局变量
window.weatherManager = weatherManager;

// 注意：统一在 main.js 中初始化，避免重复启动与重复计时器
