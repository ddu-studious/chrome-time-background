/**
 * Adaptive Overlay — 背景自适应可读性优化模块
 * 
 * 原理：通过 Canvas 分析背景图片平均亮度，动态调整遮罩透明度
 * 亮色图片 → 加深遮罩保证文字可读
 * 暗色图片 → 减轻遮罩展示更多背景
 * 
 * 性能：缩放至 100px 宽度采样，耗时 < 10ms
 */
class AdaptiveOverlay {
    constructor() {
        // 亮度缓存（同一图片 URL 不重复计算）
        this.brightnessCache = {};
    }

    /**
     * 分析图片并应用自适应 overlay
     * @param {string} imageUrl - 背景图片 URL
     */
    async analyzeAndApply(imageUrl) {
        if (!imageUrl) return;

        // 检查缓存
        if (this.brightnessCache[imageUrl] !== undefined) {
            this._applyOverlay(this.brightnessCache[imageUrl]);
            return;
        }

        try {
            const brightness = await this._getImageBrightness(imageUrl);
            this.brightnessCache[imageUrl] = brightness;
            this._applyOverlay(brightness);
        } catch (err) {
            console.warn('[AdaptiveOverlay] 亮度分析失败，使用默认值:', err.message);
            this._applyOverlay(0.35); // fallback 到默认中等亮度
        }
    }

    /**
     * 通过 Canvas 计算图片平均亮度
     * 使用 WCAG 相对亮度公式 (W3C 标准)
     * @returns {Promise<number>} 亮度值 0~1
     */
    _getImageBrightness(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    // 缩放至 100px 宽度采样（性能优化）
                    const sampleWidth = 100;
                    const scale = sampleWidth / img.width;
                    canvas.width = sampleWidth;
                    canvas.height = Math.max(1, Math.floor(img.height * scale));

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    const pixelCount = data.length / 4;

                    let luminanceSum = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        // sRGB → 线性 RGB → WCAG 相对亮度
                        const r = data[i] / 255;
                        const g = data[i + 1] / 255;
                        const b = data[i + 2] / 255;

                        const rLin = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
                        const gLin = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
                        const bLin = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

                        luminanceSum += 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
                    }

                    const avgLuminance = luminanceSum / pixelCount;
                    resolve(avgLuminance);
                } catch (e) {
                    reject(e);
                }
            };

            img.onerror = () => reject(new Error('图片加载失败'));

            // 超时保护（3秒）
            setTimeout(() => reject(new Error('图片加载超时')), 3000);

            img.src = imageUrl;
        });
    }

    /**
     * 根据亮度映射 overlay 透明度并注入 CSS 变量
     * @param {number} brightness - 平均亮度 0~1
     */
    _applyOverlay(brightness) {
        // 分段线性映射：亮度越高，遮罩越深
        let overlayOpacity, containerOpacity;

        if (brightness < 0.15) {
            // 极暗（夜景）— 几乎透明
            overlayOpacity = 0.10;
            containerOpacity = 0.08;
        } else if (brightness < 0.30) {
            // 偏暗（日落）— 轻微遮罩
            overlayOpacity = 0.20;
            containerOpacity = 0.15;
        } else if (brightness < 0.50) {
            // 中等（多数风景）— 当前默认值附近
            overlayOpacity = 0.30;
            containerOpacity = 0.20;
        } else if (brightness < 0.70) {
            // 偏亮（白天风景）— 适度加深
            overlayOpacity = 0.45;
            containerOpacity = 0.30;
        } else {
            // 极亮（雪景/白云）— 显著加深
            overlayOpacity = 0.55;
            containerOpacity = 0.38;
        }

        // 注入 CSS 变量
        const root = document.documentElement;
        root.style.setProperty('--overlay-opacity', overlayOpacity);
        root.style.setProperty('--container-opacity', containerOpacity);

        // 切换亮色背景 class（用于增强 text-shadow）
        document.body.classList.toggle('bright-bg', brightness > 0.5);

        console.log(`[AdaptiveOverlay] 亮度: ${brightness.toFixed(3)}, overlay: ${overlayOpacity}, container: ${containerOpacity}`);
    }
}

// 全局实例
window.adaptiveOverlay = new AdaptiveOverlay();
