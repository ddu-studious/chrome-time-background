/**
 * 马士兵教育 - 学习进度追踪 Content Script
 * 注入到 mashibing.com/study 页面，提取课程信息和播放进度
 * 通过 chrome.runtime.sendMessage 同步到扩展存储
 */
(function() {
    'use strict';

    const REPORT_INTERVAL = 60000; // 每分钟上报一次
    let _lastReport = 0;
    let _observer = null;

    function extractCourseInfo() {
        const info = {
            platform: 'mashibing',
            url: location.href,
            courseName: '',
            sectionName: '',
            progress: 0,
        };

        const params = new URLSearchParams(location.search);
        info.courseNo = params.get('courseNo') || '';
        info.sectionNo = params.get('sectionNo') || '';

        const titleEl = document.querySelector('.course-title, .video-title, h1, .study-title, [class*="courseName"], [class*="course-name"]');
        if (titleEl) info.courseName = titleEl.textContent.trim();

        const sectionEl = document.querySelector('.section-title, .chapter-title, .active .section-name, [class*="sectionName"], [class*="section-name"], .video-item.active, .catalog-item.active, .section-item.active');
        if (sectionEl) info.sectionName = sectionEl.textContent.trim().slice(0, 100);

        if (!info.courseName) {
            const breadcrumb = document.querySelector('.breadcrumb, .course-path, nav');
            if (breadcrumb) {
                const parts = breadcrumb.textContent.trim().split(/[/>\-]/).map(s => s.trim()).filter(Boolean);
                if (parts.length >= 2) info.courseName = parts[parts.length - 1];
            }
        }

        if (!info.courseName) {
            const title = document.title.replace(/[-|].*$/, '').trim();
            if (title && title !== '码士集团官网') info.courseName = title;
        }

        const video = document.querySelector('video');
        if (video && video.duration > 0 && !isNaN(video.duration)) {
            info.progress = Math.round((video.currentTime / video.duration) * 100);
        }

        const catalogItems = document.querySelectorAll('.catalog-item, .section-item, .chapter-section, [class*="catalog"] li, [class*="section"] li');
        if (catalogItems.length > 0) {
            info.totalSections = catalogItems.length;
            const activeIdx = Array.from(catalogItems).findIndex(el =>
                el.classList.contains('active') || el.classList.contains('current') || el.classList.contains('playing')
            );
            if (activeIdx >= 0) info.completedSections = activeIdx;
        }

        return info;
    }

    function reportProgress() {
        const now = Date.now();
        if (now - _lastReport < REPORT_INTERVAL) return;
        _lastReport = now;

        const info = extractCourseInfo();
        if (!info.courseName && !info.sectionName) return;

        try {
            chrome.runtime.sendMessage({
                action: 'study_progress_update',
                data: info,
            });
        } catch {}
    }

    function setupVideoTracking() {
        const video = document.querySelector('video');
        if (!video) return;

        video.addEventListener('play', () => reportProgress());
        video.addEventListener('timeupdate', throttle(() => reportProgress(), 30000));
        video.addEventListener('ended', () => {
            _lastReport = 0;
            reportProgress();
        });
    }

    function throttle(fn, ms) {
        let last = 0;
        return function() {
            const now = Date.now();
            if (now - last >= ms) { last = now; fn.apply(this, arguments); }
        };
    }

    function init() {
        if (!location.pathname.includes('/study')) return;

        setTimeout(() => {
            reportProgress();
            setupVideoTracking();
        }, 3000);

        _observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (video && !video._scTracked) {
                video._scTracked = true;
                setupVideoTracking();
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });

        setInterval(() => {
            const video = document.querySelector('video');
            if (video && !video.paused) reportProgress();
        }, REPORT_INTERVAL);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
