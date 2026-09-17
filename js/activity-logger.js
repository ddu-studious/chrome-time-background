/**
 * 活动日志模块 — 跨模块活动记录与回顾基础设施
 * v1.0: 活动记录、按时间范围查询、周摘要聚合、AI 周报生成
 *
 * 存储: chrome.storage.local 'activityLog'
 * 保留策略: 最近 90 天
 */
class ActivityLogger {
    constructor() {
        this.STORAGE_KEY = 'activityLog';
        this.MAX_AGE_DAYS = 90;
        this.WEEKLY_CACHE_KEY = 'activityWeeklySummaryCache';
        this._log = null;

    }

    // ===================== 存储 =====================

    async _load() {
        if (this._log) return this._log;
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            this._log = Array.isArray(result[this.STORAGE_KEY]) ? result[this.STORAGE_KEY] : [];
        } catch {
            this._log = [];
        }
        return this._log;
    }

    async _save() {
        if (!this._log) return;
        try {
            await chrome.storage.local.set({ [this.STORAGE_KEY]: this._log });
        } catch (e) {
            console.error('[ActivityLogger] save failed:', e);
        }
    }

    _invalidateCache() {
        this._log = null;
    }

    // ===================== 记录活动 =====================

    /**
     * @param {Object} activity
     * @param {string} activity.type      e.g. 'note_create', 'task_complete'
     * @param {string} activity.module    e.g. 'knowledge-wall', 'memo', 'ticker', 'bookmark'
     * @param {string} activity.title     活动简述
     * @param {string} [activity.targetId]
     * @param {string} [activity.targetTitle]
     * @param {Object} [activity.meta]    额外上下文
     */
    async log(activity) {
        const log = await this._load();
        log.push({
            id: this._genId(),
            ts: Date.now(),
            type: activity.type,
            module: activity.module,
            title: activity.title,
            targetId: activity.targetId || '',
            targetTitle: activity.targetTitle || '',
            meta: activity.meta || {}
        });
        this._prune(log);
        await this._save();
    }

    _genId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    _prune(log) {
        const cutoff = Date.now() - this.MAX_AGE_DAYS * 86400000;
        while (log.length && log[0].ts < cutoff) log.shift();
    }

    // ===================== 查询 =====================

    async getAll() {
        return await this._load();
    }

    async getByDateRange(startTs, endTs) {
        const log = await this._load();
        return log.filter(e => e.ts >= startTs && e.ts <= endTs);
    }

    async getByModule(module) {
        const log = await this._load();
        return log.filter(e => e.module === module);
    }

    /**
     * 获取按天分组的活动（用于时间线视图）
     * @param {number} weekOffset  0=本周, -1=上周, ...
     * @returns {{ weekLabel, weekStart, weekEnd, stats, days: [{ date, dayLabel, items }] }}
     */
    async getWeeklyTimeline(weekOffset = 0) {
        const now = new Date();
        const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;

        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const items = await this.getByDateRange(weekStart.getTime(), weekEnd.getTime());

        const dayMap = new Map();
        items.forEach(item => {
            const d = new Date(item.ts);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!dayMap.has(key)) dayMap.set(key, []);
            dayMap.get(key).push(item);
        });

        const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const today = this._dateKey(now);
        const yesterday = this._dateKey(new Date(now.getTime() - 86400000));

        const days = [...dayMap.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([dateStr, dayItems]) => {
                const d = new Date(dateStr + 'T00:00:00');
                const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
                let label = `${d.getMonth() + 1}月${d.getDate()}日`;
                if (dateStr === today) label += ' · 今天';
                else if (dateStr === yesterday) label += ' · 昨天';
                return {
                    date: dateStr,
                    dayLabel: label,
                    weekDay: weekDays[dow],
                    items: dayItems.sort((a, b) => b.ts - a.ts)
                };
            });

        const stats = this._calcStats(items);
        const wStart = weekStart;
        const weekLabel = `${wStart.getMonth() + 1}.${wStart.getDate()} - ${weekEnd.getMonth() + 1}.${weekEnd.getDate()}`;

        return {
            weekLabel,
            weekStart: weekStart.getTime(),
            weekEnd: weekEnd.getTime(),
            weekOffset,
            stats,
            days,
            totalItems: items.length
        };
    }

    _dateKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    _calcStats(items) {
        const stats = { notes: 0, tasks: 0, bookmarks: 0, links: 0, ticker: 0, total: items.length };
        items.forEach(e => {
            if (e.module === 'knowledge-wall') stats.notes++;
            else if (e.module === 'memo') stats.tasks++;
            else if (e.module === 'bookmark') stats.bookmarks++;
            else if (e.module === 'ticker') stats.ticker++;
        });
        return stats;
    }

    // ===================== 混合时间线（活动日志 + 实体回溯） =====================

    /**
     * 从卡片和任务的时间戳构建虚拟活动条目，补全历史数据
     * @param {Array} cards   知识墙卡片
     * @param {Array} memos   任务列表
     * @param {number} startTs
     * @param {number} endTs
     */
    _buildEntityEvents(cards, memos, startTs, endTs) {
        const events = [];

        (cards || []).forEach(card => {
            const ts = card.createdAt;
            if (ts >= startTs && ts <= endTs) {
                const typeLabels = { note: '笔记', link: '链接', code: '代码', contact: '联系人', weekly: '周记' };
                events.push({
                    id: 'ent_c_' + card.id,
                    ts,
                    type: card.type === 'weekly' ? 'weekly_create' : 'note_create',
                    module: 'knowledge-wall',
                    title: `创建${typeLabels[card.type] || '卡片'}「${card.title}」`,
                    targetId: card.id,
                    targetTitle: card.title,
                    meta: { cardType: card.type, tags: card.tags || [], source: 'entity' }
                });
            }
            const uTs = card.updatedAt;
            if (uTs && uTs !== card.createdAt && uTs >= startTs && uTs <= endTs) {
                const typeLabels = { note: '笔记', link: '链接', code: '代码', contact: '联系人', weekly: '周记' };
                events.push({
                    id: 'ent_u_' + card.id,
                    ts: uTs,
                    type: card.type === 'weekly' ? 'weekly_update' : 'note_update',
                    module: 'knowledge-wall',
                    title: `更新${typeLabels[card.type] || '卡片'}「${card.title}」`,
                    targetId: card.id,
                    targetTitle: card.title,
                    meta: { cardType: card.type, tags: card.tags || [], source: 'entity' }
                });
            }
        });

        (memos || []).forEach(memo => {
            const ts = memo.createdAt;
            if (ts >= startTs && ts <= endTs) {
                events.push({
                    id: 'ent_mc_' + memo.id,
                    ts,
                    type: 'task_create',
                    module: 'memo',
                    title: `创建任务「${memo.title}」`,
                    targetId: memo.id,
                    targetTitle: memo.title,
                    meta: { priority: memo.priority, source: 'entity' }
                });
            }
            if (memo.completed && memo.completedAt && memo.completedAt >= startTs && memo.completedAt <= endTs) {
                events.push({
                    id: 'ent_md_' + memo.id,
                    ts: memo.completedAt,
                    type: 'task_complete',
                    module: 'memo',
                    title: `完成任务「${memo.title}」`,
                    targetId: memo.id,
                    targetTitle: memo.title,
                    meta: { source: 'entity' }
                });
            }
        });

        return events;
    }

    /**
     * 合并活动日志 + 实体事件并去重
     */
    _mergeAndDedup(logItems, entityEvents) {
        const seen = new Set();
        const merged = [];

        logItems.forEach(item => {
            if (item.targetId) {
                seen.add(`${item.type}_${item.targetId}`);
            }
            merged.push(item);
        });

        entityEvents.forEach(ev => {
            const key = ev.targetId ? `${ev.type}_${ev.targetId}` : ev.id;
            if (!seen.has(key)) {
                merged.push(ev);
            }
        });

        return merged.sort((a, b) => b.ts - a.ts);
    }

    /**
     * 获取混合时间线（活动日志 + 实体回溯），对外的主查询接口
     */
    async getHybridWeeklyTimeline(weekOffset = 0, cards = [], memos = []) {
        const now = new Date();
        const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;

        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const logItems = await this.getByDateRange(weekStart.getTime(), weekEnd.getTime());
        const entityEvents = this._buildEntityEvents(cards, memos, weekStart.getTime(), weekEnd.getTime());
        const allItems = this._mergeAndDedup(logItems, entityEvents);

        const dayMap = new Map();
        allItems.forEach(item => {
            const d = new Date(item.ts);
            const key = this._dateKey(d);
            if (!dayMap.has(key)) dayMap.set(key, []);
            dayMap.get(key).push(item);
        });

        const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const today = this._dateKey(now);
        const yesterday = this._dateKey(new Date(now.getTime() - 86400000));

        const days = [...dayMap.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([dateStr, dayItems]) => {
                const d = new Date(dateStr + 'T00:00:00');
                const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
                let label = `${d.getMonth() + 1}月${d.getDate()}日`;
                if (dateStr === today) label += ' · 今天';
                else if (dateStr === yesterday) label += ' · 昨天';
                return {
                    date: dateStr,
                    dayLabel: label,
                    weekDay: weekDays[dow],
                    items: dayItems.sort((a, b) => b.ts - a.ts)
                };
            });

        const stats = this._calcStats(allItems);
        const weekLabel = `${weekStart.getMonth() + 1}.${weekStart.getDate()} - ${weekEnd.getMonth() + 1}.${weekEnd.getDate()}`;

        return {
            weekLabel,
            weekStart: weekStart.getTime(),
            weekEnd: weekEnd.getTime(),
            weekOffset,
            stats,
            days,
            totalItems: allItems.length
        };
    }

    /**
     * 获取混合热力图（活动日志 + 实体回溯）
     */
    async getHybridHeatmapData(weeks = 12, cards = [], memos = []) {
        const now = new Date();
        const startTs = now.getTime() - weeks * 7 * 86400000;
        const logItems = await this.getByDateRange(startTs, now.getTime());
        const entityEvents = this._buildEntityEvents(cards, memos, startTs, now.getTime());
        const allItems = this._mergeAndDedup(logItems, entityEvents);

        const countMap = {};
        allItems.forEach(e => {
            const key = this._dateKey(new Date(e.ts));
            countMap[key] = (countMap[key] || 0) + 1;
        });

        const result = [];
        for (let w = weeks - 1; w >= 0; w--) {
            const week = [];
            for (let d = 0; d < 7; d++) {
                const date = new Date(now);
                date.setDate(now.getDate() - w * 7 - (6 - d));
                const key = this._dateKey(date);
                const count = countMap[key] || 0;
                let level = 0;
                if (count >= 8) level = 4;
                else if (count >= 5) level = 3;
                else if (count >= 3) level = 2;
                else if (count >= 1) level = 1;
                week.push({ date: key, count, level, isToday: key === this._dateKey(now) });
            }
            result.push(week);
        }
        return result;
    }

    // ===================== 热力图数据 =====================

    async getHeatmapData(weeks = 12) {
        const now = new Date();
        const startTs = now.getTime() - weeks * 7 * 86400000;
        const items = await this.getByDateRange(startTs, now.getTime());

        const countMap = {};
        items.forEach(e => {
            const key = this._dateKey(new Date(e.ts));
            countMap[key] = (countMap[key] || 0) + 1;
        });

        const result = [];
        for (let w = weeks - 1; w >= 0; w--) {
            const week = [];
            for (let d = 0; d < 7; d++) {
                const date = new Date(now);
                date.setDate(now.getDate() - w * 7 - (6 - d));
                const key = this._dateKey(date);
                const count = countMap[key] || 0;
                let level = 0;
                if (count >= 8) level = 4;
                else if (count >= 5) level = 3;
                else if (count >= 3) level = 2;
                else if (count >= 1) level = 1;
                week.push({ date: key, count, level, isToday: key === this._dateKey(now) });
            }
            result.push(week);
        }
        return result;
    }

    // ===================== 30 天活跃趋势 =====================

    async getDailyActivityTrend(days = 30, cards = [], memos = []) {
        const now = new Date();
        const todayKey = this._dateKey(now);
        const startTs = new Date(now);
        startTs.setDate(now.getDate() - days + 1);
        startTs.setHours(0, 0, 0, 0);

        const logItems = await this.getByDateRange(startTs.getTime(), now.getTime());
        const entityEvents = this._buildEntityEvents(cards, memos, startTs.getTime(), now.getTime());
        const all = this._mergeAndDedup(logItems, entityEvents);

        const countMap = {};
        all.forEach(e => {
            const key = this._dateKey(new Date(e.ts));
            countMap[key] = (countMap[key] || 0) + 1;
        });

        const result = [];
        let maxCount = 0;
        for (let i = 0; i < days; i++) {
            const d = new Date(startTs);
            d.setDate(startTs.getDate() + i);
            const key = this._dateKey(d);
            const count = countMap[key] || 0;
            if (count > maxCount) maxCount = count;
            result.push({
                date: key,
                label: `${d.getMonth() + 1}/${d.getDate()}`,
                count,
                isToday: key === todayKey
            });
        }
        return { data: result, maxCount };
    }

    // ===================== 月度回顾 =====================

    async getMonthlyReview(monthOffset = 0, cards = [], memos = []) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + monthOffset;
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const monthLabel = `${start.getFullYear()}年${start.getMonth() + 1}月`;

        const logItems = await this.getByDateRange(start.getTime(), end.getTime());
        const entityEvents = this._buildEntityEvents(cards, memos, start.getTime(), end.getTime());
        const all = this._mergeAndDedup(logItems, entityEvents);

        const stats = this._calcStats(all);
        const weekMap = new Map();
        all.forEach(item => {
            const d = new Date(item.ts);
            const weekNum = Math.ceil(d.getDate() / 7);
            const key = `W${weekNum}`;
            if (!weekMap.has(key)) weekMap.set(key, []);
            weekMap.get(key).push(item);
        });

        const weeks = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({
            label: `第${label.slice(1)}周`,
            count: items.length,
            noteCount: items.filter(i => i.module === 'knowledge-wall').length,
            taskCount: items.filter(i => i.module === 'memo').length
        }));

        const newCards = cards.filter(c => c.createdAt >= start.getTime() && c.createdAt <= end.getTime());
        const completedTasks = memos.filter(m => m.completedAt && m.completedAt >= start.getTime() && m.completedAt <= end.getTime());
        const totalTasksInMonth = memos.filter(m => m.createdAt >= start.getTime() && m.createdAt <= end.getTime());

        const dayCountMap = {};
        all.forEach(e => {
            const key = this._dateKey(new Date(e.ts));
            dayCountMap[key] = (dayCountMap[key] || 0) + 1;
        });
        const activeDays = Object.keys(dayCountMap).length;
        const totalDays = end.getDate();
        const peakDay = Object.entries(dayCountMap).sort(([, a], [, b]) => b - a)[0];

        return {
            monthLabel,
            startTs: start.getTime(),
            endTs: end.getTime(),
            totalItems: all.length,
            stats,
            weeks,
            newCards: newCards.length,
            completedTasks: completedTasks.length,
            createdTasks: totalTasksInMonth.length,
            activeDays,
            totalDays,
            peakDay: peakDay ? { date: peakDay[0], count: peakDay[1] } : null,
            taskCompletionRate: totalTasksInMonth.length > 0
                ? Math.round(completedTasks.length / totalTasksInMonth.length * 100) : 0
        };
    }

    async generateMonthlyReport(monthOffset = 0, options = {}) {
        const cards = options.cards || [];
        const memos = options.memos || [];
        const review = await this.getMonthlyReview(monthOffset, cards, memos);

        if (review.totalItems === 0) {
            return { ok: false, error: '该月暂无活动记录', review };
        }

        let report = `# ${review.monthLabel} 月度回顾\n\n`;
        report += `## 概览\n\n`;
        report += `- 总活动: **${review.totalItems}** 条\n`;
        report += `- 活跃天数: **${review.activeDays}/${review.totalDays}** 天\n`;
        report += `- 新增卡片: **${review.newCards}** 张\n`;
        report += `- 创建任务: **${review.createdTasks}** 个\n`;
        report += `- 完成任务: **${review.completedTasks}** 个（完成率 ${review.taskCompletionRate}%）\n`;
        if (review.peakDay) {
            report += `- 最活跃日: **${review.peakDay.date}**（${review.peakDay.count} 条活动）\n`;
        }
        report += `\n## 每周活动\n\n`;
        review.weeks.forEach(w => {
            report += `- **${w.label}**: ${w.count} 条（笔记 ${w.noteCount}, 任务 ${w.taskCount}）\n`;
        });

        report += `\n## 各模块统计\n\n`;
        report += `| 模块 | 数量 |\n|------|------|\n`;
        if (review.stats.notes > 0) report += `| 知识笔记 | ${review.stats.notes} |\n`;
        if (review.stats.tasks > 0) report += `| 任务管理 | ${review.stats.tasks} |\n`;
        if (review.stats.bookmarks > 0) report += `| 书签收藏 | ${review.stats.bookmarks} |\n`;
        if (review.stats.ticker > 0) report += `| 热榜资讯 | ${review.stats.ticker} |\n`;

        let aiError = null;
        try {
            const result = await window.SceneAI.run('activity.summary', { period: 'month', label: review.monthLabel, overview: report.slice(0, 2000), items: [] });
            report += `\n## AI 洞察\n\n${result.summary}\n`;
        } catch (error) { aiError = error.message; }

        return { ok: true, report, review, aiError };
    }

    // ===================== AI 周报摘要 =====================

    async generateWeeklySummary(weekOffset = 0, options = {}) {
        const cards = options.cards || [];
        const memos = options.memos || [];
        const timeline = await this.getHybridWeeklyTimeline(weekOffset, cards, memos);
        if (timeline.totalItems === 0) {
            return { ok: false, error: '本周暂无活动记录', timeline };
        }

        const allItems = timeline.days.flatMap(day => day.items.map(item => ({
            day: `${day.dayLabel} ${day.weekDay}`.slice(0, 40),
            title: String(item.title || '').slice(0, 100), detail: String(item.targetTitle || item.meta?.detail || '').slice(0, 100)
        })));
        const items = allItems.slice(0, 20).map((item, index) => ({ ...item, id: `activity-${index + 1}` }));
        try {
            const result = await window.SceneAI.run('activity.summary', {
                period: 'week', label: String(timeline.weekLabel).slice(0, 100),
                overview: this._buildPlainSummary(timeline).slice(0, 2000), items
            }, { signal: options.signal });
            const response = { ok: true, summary: result.summary, sources: result.sources, timeline, generatedAt: Date.now(), model: result.model, sampledItems: items.length, totalItems: timeline.totalItems };
            if (allItems.length > items.length) response.summary += `\n\n（基于本周统计与前 ${items.length} 条活动记录生成）`;
            await this._cacheWeeklySummary(weekOffset, response);
            return response;
        } catch (error) {
            return { ok: false, error: `AI 生成失败: ${error.message}`, timeline, fallback: this._buildPlainSummary(timeline) };
        }
    }

    _moduleLabel(module) {
        const labels = {
            'knowledge-wall': '笔记',
            'memo': '任务',
            'bookmark': '书签',
            'ticker': '热榜',
            'music': '音乐'
        };
        return labels[module] || module;
    }

    _buildPlainSummary(timeline) {
        const { stats, weekLabel, days } = timeline;
        const parts = [];
        parts.push(`本周（${weekLabel}）共有 ${timeline.totalItems} 条活动。`);

        if (stats.notes > 0) parts.push(`更新了 ${stats.notes} 条笔记`);
        if (stats.tasks > 0) parts.push(`处理了 ${stats.tasks} 个任务`);
        if (stats.bookmarks > 0) parts.push(`收藏了 ${stats.bookmarks} 个书签`);
        if (stats.ticker > 0) parts.push(`保存了 ${stats.ticker} 条热榜资讯`);

        const titles = [];
        days.forEach(day => {
            day.items.forEach(item => {
                if (item.targetTitle && titles.length < 5) {
                    titles.push(item.targetTitle);
                }
            });
        });

        if (titles.length > 0) {
            parts.push(`涉及内容：${titles.join('、')}`);
        }

        return parts.join('。') + '。';
    }

    async _cacheWeeklySummary(weekOffset, result) {
        try {
            const { [this.WEEKLY_CACHE_KEY]: cache } = await chrome.storage.local.get(this.WEEKLY_CACHE_KEY);
            const cacheMap = cache || {};
            cacheMap[String(weekOffset)] = {
                summary: result.summary,
                generatedAt: result.generatedAt,
                model: result.model
            };
            const keys = Object.keys(cacheMap);
            if (keys.length > 8) {
                keys.sort((a, b) => Number(a) - Number(b));
                delete cacheMap[keys[0]];
            }
            await chrome.storage.local.set({ [this.WEEKLY_CACHE_KEY]: cacheMap });
        } catch { /* ignore */ }
    }

    async getCachedWeeklySummary(weekOffset = 0) {
        try {
            const { [this.WEEKLY_CACHE_KEY]: cache } = await chrome.storage.local.get(this.WEEKLY_CACHE_KEY);
            return cache?.[String(weekOffset)] || null;
        } catch {
            return null;
        }
    }

    // ===================== 类型定义（用于埋点参考） =====================

    static get TYPES() {
        return {
            NOTE_CREATE: 'note_create',
            NOTE_UPDATE: 'note_update',
            NOTE_DELETE: 'note_delete',
            TASK_CREATE: 'task_create',
            TASK_COMPLETE: 'task_complete',
            TASK_UPDATE: 'task_update',
            TASK_DELETE: 'task_delete',
            TASK_FAIL: 'task_fail',
            BOOKMARK_SAVE: 'bookmark_save',
            TICKER_SAVE: 'ticker_save',
            WEEKLY_CREATE: 'weekly_create',
            WEEKLY_UPDATE: 'weekly_update'
        };
    }

    static get MODULES() {
        return {
            KNOWLEDGE_WALL: 'knowledge-wall',
            MEMO: 'memo',
            BOOKMARK: 'bookmark',
            TICKER: 'ticker',
            MUSIC: 'music'
        };
    }
}

const activityLogger = new ActivityLogger();
