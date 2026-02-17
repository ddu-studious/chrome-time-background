/**
 * Adaptive Overlay — 背景自适应可读性优化模块
 * 
 * 原理：通过 Canvas 分析背景图片平均亮度，动态调整遮罩透明度
 * 亮色图片 → 加深遮罩保证文字可读
 * 暗色图片 → 减轻遮罩展示更多背景
 * 
 * 加载策略（双通道回退）：
 *   1. fetch + createImageBitmap — 利用 HTTP 缓存（与 CSS 背景共享），避免重复下载
 *   2. new Image() 回退 — 兼容 data:/blob: 等特殊协议
 * 
 * 性能：缩放至 100px 宽度采样，耗时 < 10ms
 */
class AdaptiveOverlay {
    constructor() {
        this.brightnessCache = {};
        this.SAMPLE_WIDTH = 100;
        this.TIMEOUT_MS = 10000;
    }

    /**
     * 分析图片并应用自适应 overlay
     * @param {string} imageUrl - 背景图片 URL
     */
    async analyzeAndApply(imageUrl) {
        if (!imageUrl) return;

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
            this._applyOverlay(0.35);
        }
    }

    /**
     * 获取图片亮度（双策略回退）
     * 优先 fetch（与 CSS 共享 HTTP 缓存），失败则回退到 Image 方式
     */
    async _getImageBrightness(imageUrl) {
        try {
            return await this._analyzeViaFetch(imageUrl);
        } catch (fetchErr) {
            console.debug('[AdaptiveOverlay] fetch 方式失败，回退到 Image:', fetchErr.message);
            return await this._analyzeViaImage(imageUrl);
        }
    }

    /**
     * 策略 1：fetch + createImageBitmap
     * 优势：与 CSS background-image 共享 HTTP 缓存，不会重复下载大图
     * Chrome 扩展通过 host_permissions 天然绕过 CORS
     */
    async _analyzeViaFetch(imageUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

        try {
            const res = await fetch(imageUrl, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob, {
                resizeWidth: this.SAMPLE_WIDTH,
                resizeQuality: 'low',
            });

            return this._computeBrightness(bitmap);
        } catch (err) {
            clearTimeout(timer);
            throw err.name === 'AbortError' ? new Error('fetch 超时') : err;
        }
    }

    /**
     * 策略 2：传统 Image 加载回退
     * 兼容 data: / blob: 等 fetch 不支持的协议
     */
    _analyzeViaImage(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const timer = setTimeout(() => {
                img.src = '';
                reject(new Error('Image 加载超时'));
            }, this.TIMEOUT_MS);

            img.onload = () => {
                clearTimeout(timer);
                try {
                    resolve(this._computeBrightness(img));
                } catch (e) {
                    reject(e);
                }
            };

            img.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Image 加载失败'));
            };

            img.src = imageUrl;
        });
    }

    /**
     * 通过 Canvas 计算平均亮度（WCAG 相对亮度公式）
     * @param {ImageBitmap|HTMLImageElement} source - 图片源
     * @returns {number} 亮度值 0~1
     */
    _computeBrightness(source) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (source instanceof ImageBitmap) {
            canvas.width = source.width;
            canvas.height = source.height;
        } else {
            const scale = this.SAMPLE_WIDTH / source.width;
            canvas.width = this.SAMPLE_WIDTH;
            canvas.height = Math.max(1, Math.floor(source.height * scale));
        }

        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        if (source instanceof ImageBitmap) source.close();

        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixelCount = data.length / 4;
        let luminanceSum = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            const rLin = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
            const gLin = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
            const bLin = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

            luminanceSum += 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
        }

        return luminanceSum / pixelCount;
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
