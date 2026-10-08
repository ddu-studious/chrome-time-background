(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.QuickCapture = api;
})(globalThis, function () {
  'use strict';
  function task(data, now = Date.now()) {
    return {
      id: data.id || `memo_${now}_${Math.random().toString(36).slice(2, 8)}`,
      title: data.title, text: data.description || '', completed: false,
      createdAt: now, updatedAt: now, completedAt: null,
      categoryId: null, tagIds: [], priority: data.priority || 'medium',
      startDate: data.startDate || null, dueDate: data.dueDate || null,
      images: data.images || [], links: [], progress: data.progress || 0,
      recurrence: data.recurrence || null,
      habit: data.recurrence ? { type: data.recurrence, streak: 0 } : null,
      habitCard: null, subtasks: data.firstSubtask ? [{ id: `st_${now}`, title: data.firstSubtask, completed: false }] : [],
      status: null, failedAt: null, archived: false, archivedAt: null,
      recurrencePaused: false, lastSkippedAt: null, assignee: data.assignee || '我'
    };
  }
  function entry(data, now = Date.now()) {
    return {
      id: data.id || `te_${now}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: data.projectId || 'proj_default', description: (data.description || '').trim(),
      date: data.date || new Date(now).toLocaleDateString('sv-SE'),
      duration: Math.max(0, Math.round(data.duration || 0)),
      startTime: data.startTime || '', endTime: data.endTime || '',
      tags: Array.isArray(data.tags) ? data.tags : [], memoId: data.memoId || null,
      urgency: !!data.urgency, importance: !!data.importance,
      subItems: Array.isArray(data.subItems) ? data.subItems : [], createdAt: now, updatedAt: now
    };
  }
  async function append(storage, key, value, guard = () => {}) {
    guard();
    const existing = (await storage.get(key))[key];
    guard();
    const rows = Array.isArray(existing) ? existing : [];
    if (rows.some(row => row.id === value.id)) return { value: rows.find(row => row.id === value.id), duplicate: true };
    await storage.set({ [key]: [value, ...rows] });
    guard();
    const saved = (await storage.get(key))[key];
    guard();
    if (!Array.isArray(saved) || !saved.some(row => row.id === value.id)) throw new Error('保存回执核对失败，请检查 App 中的实际记录');
    return { value, duplicate: false };
  }
  return Object.freeze({ task, entry, append });
});
