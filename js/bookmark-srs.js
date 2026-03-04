/**
 * 书签间隔复习系统 (Bookmark SRS)
 * SM-2 改良算法，适配书签场景
 * Phase 3: 间隔复习 + 频率模板 + 今日推荐 + 复习反馈
 */

class BookmarkSRS {
    static TEMPLATES = {
        frequent: {
            name: '频繁阅读',
            desc: '适合工具文档、API 参考等高频资料',
            icon: 'fa-fire',
            initialInterval: 1,
            initialEF: 2.0,
            minInterval: 1,
            maxInterval: 30
        },
        regular: {
            name: '定期关注',
            desc: '适合技术博客、行业资讯',
            icon: 'fa-clock',
            initialInterval: 3,
            initialEF: 2.5,
            minInterval: 1,
            maxInterval: 90
        },
        occasional: {
            name: '偶尔翻阅',
            desc: '适合参考文章、教程收藏',
            icon: 'fa-book-open',
            initialInterval: 7,
            initialEF: 2.5,
            minInterval: 3,
            maxInterval: 180
        },
        archive: {
            name: '长期存档',
            desc: '适合备用资料、低优先级收藏',
            icon: 'fa-archive',
            initialInterval: 14,
            initialEF: 2.8,
            minInterval: 7,
            maxInterval: 365
        }
    };

    static QUALITY = {
        ARCHIVE: 0,
        AGAIN: 1,
        LATER: 2,
        GOOD: 3
    };

    static QUALITY_META = {
        [BookmarkSRS.QUALITY.ARCHIVE]: { label: '归档', icon: 'fa-box-archive', color: '#888' },
        [BookmarkSRS.QUALITY.AGAIN]:   { label: '不熟', icon: 'fa-rotate-left', color: '#ff6b6b' },
        [BookmarkSRS.QUALITY.LATER]:   { label: '稍后', icon: 'fa-clock', color: '#ffa502' },
        [BookmarkSRS.QUALITY.GOOD]:    { label: '已读', icon: 'fa-check', color: '#5cd85c' }
    };

    /**
     * 计算下一次复习调度（SM-2 改良）
     */
    static schedule(srs, quality, templateId = 'regular') {
        const template = BookmarkSRS.TEMPLATES[templateId] || BookmarkSRS.TEMPLATES.regular;
        const now = Date.now();

        if (!srs) {
            srs = {
                ef: template.initialEF,
                interval: template.initialInterval,
                repetition: 0,
                nextReview: now,
                lastReview: null,
                quality: null,
                template: templateId
            };
        }

        if (quality === BookmarkSRS.QUALITY.ARCHIVE) {
            return { ...srs, status: 'archived', lastReview: now, quality };
        }

        let { ef, interval, repetition } = srs;

        if (quality === BookmarkSRS.QUALITY.AGAIN) {
            repetition = 0;
            interval = template.minInterval;
            ef = Math.max(1.3, ef - 0.3);
        } else if (quality === BookmarkSRS.QUALITY.LATER) {
            interval = Math.max(template.minInterval, Math.ceil(interval * 0.6));
            ef = Math.max(1.3, ef - 0.1);
        } else if (quality === BookmarkSRS.QUALITY.GOOD) {
            repetition += 1;
            if (repetition === 1) {
                interval = template.initialInterval;
            } else if (repetition === 2) {
                interval = Math.ceil(template.initialInterval * 2.5);
            } else {
                interval = Math.ceil(interval * ef);
            }
            ef = Math.max(1.3, ef + 0.1 - (5 - Math.min(quality * 1.5, 4)) * (0.08 + (5 - Math.min(quality * 1.5, 4)) * 0.02));
        }

        interval = Math.min(interval, template.maxInterval);
        interval = Math.max(interval, template.minInterval);

        return {
            ef: Math.round(ef * 100) / 100,
            interval,
            repetition,
            nextReview: now + interval * 24 * 60 * 60 * 1000,
            lastReview: now,
            quality,
            template: templateId
        };
    }

    /**
     * 初始化书签的 SRS 数据
     */
    static initSRS(templateId = 'regular') {
        const template = BookmarkSRS.TEMPLATES[templateId] || BookmarkSRS.TEMPLATES.regular;
        const now = Date.now();
        return {
            ef: template.initialEF,
            interval: template.initialInterval,
            repetition: 0,
            nextReview: now,
            lastReview: null,
            quality: null,
            template: templateId
        };
    }

    /**
     * 获取今日待复习队列
     */
    static getTodayReviewQueue(bookmarks, limit = 5) {
        const now = Date.now();
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        const eod = endOfDay.getTime();

        return bookmarks
            .filter(bm => {
                if (bm.status !== 'active') return false;
                if (!bm.srs) return false;
                if (bm.srs.status === 'archived') return false;
                return bm.srs.nextReview <= eod;
            })
            .sort((a, b) => {
                const aOverdue = now - a.srs.nextReview;
                const bOverdue = now - b.srs.nextReview;
                return bOverdue - aOverdue;
            })
            .slice(0, limit);
    }

    /**
     * 获取从未复习过的书签（可用于首次启用复习）
     */
    static getUnreviewedBookmarks(bookmarks, limit = 5) {
        return bookmarks
            .filter(bm => bm.status === 'active' && !bm.srs)
            .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
            .slice(0, limit);
    }

    /**
     * 计算复习统计
     */
    static getReviewStats(bookmarks) {
        const now = Date.now();
        const active = bookmarks.filter(b => b.status === 'active');
        const withSRS = active.filter(b => b.srs && b.srs.status !== 'archived');
        const archived = active.filter(b => b.srs?.status === 'archived');
        const dueToday = withSRS.filter(b => b.srs.nextReview <= now);
        const reviewed = withSRS.filter(b => b.srs.lastReview !== null);
        const unreviewed = active.filter(b => !b.srs);

        let totalReps = 0;
        for (const bm of withSRS) {
            totalReps += bm.srs.repetition || 0;
        }

        return {
            total: active.length,
            inReview: withSRS.length,
            archived: archived.length,
            dueToday: dueToday.length,
            reviewed: reviewed.length,
            unreviewed: unreviewed.length,
            totalRepetitions: totalReps,
            averageEF: withSRS.length > 0
                ? Math.round(withSRS.reduce((s, b) => s + b.srs.ef, 0) / withSRS.length * 100) / 100
                : 0
        };
    }

    /**
     * 批量启用 SRS
     */
    static enableSRSForBookmarks(bookmarks, templateId = 'regular') {
        let count = 0;
        for (const bm of bookmarks) {
            if (bm.status === 'active' && !bm.srs) {
                bm.srs = BookmarkSRS.initSRS(templateId);
                count++;
            }
        }
        return count;
    }

    /**
     * 切换频率模板
     */
    static changeTemplate(bookmark, newTemplateId) {
        if (!bookmark.srs) {
            bookmark.srs = BookmarkSRS.initSRS(newTemplateId);
        } else {
            bookmark.srs.template = newTemplateId;
        }
    }

    /**
     * 格式化下次复习时间
     */
    static formatNextReview(nextReview) {
        if (!nextReview) return '未设置';
        const now = Date.now();
        const diff = nextReview - now;

        if (diff <= 0) return '现在';

        const hours = diff / (1000 * 60 * 60);
        if (hours < 1) return `${Math.ceil(diff / (1000 * 60))} 分钟后`;
        if (hours < 24) return `${Math.ceil(hours)} 小时后`;
        const days = Math.ceil(hours / 24);
        if (days === 1) return '明天';
        if (days <= 7) return `${days} 天后`;
        if (days <= 30) return `${Math.ceil(days / 7)} 周后`;
        return `${Math.ceil(days / 30)} 个月后`;
    }

    /**
     * 格式化距离上次复习
     */
    static formatLastReview(lastReview) {
        if (!lastReview) return '从未';
        const diff = Date.now() - lastReview;
        const hours = diff / (1000 * 60 * 60);
        if (hours < 1) return '刚刚';
        if (hours < 24) return `${Math.floor(hours)} 小时前`;
        const days = Math.floor(hours / 24);
        if (days === 1) return '昨天';
        if (days <= 7) return `${days} 天前`;
        return `${Math.ceil(days / 7)} 周前`;
    }
}

window.BookmarkSRS = BookmarkSRS;
