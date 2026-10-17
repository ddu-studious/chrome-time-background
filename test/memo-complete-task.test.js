// memo.js 的 MemoManager.prototype.completeTaskById：首页水母被抓进纸篓时“完成任务”的唯一入口。
// 层级：memo.js 太大、依赖整个页面，所以按函数边界把这一个函数从源码里切出来，放进 vm 运行，
// 它调用的两个切换入口（toggleSidebarTaskComplete / toggleHabitCompletion）与 saveMemos 的去抖行为用替身；
// 这是“切片 + 替身”验证，不是真实页面里真实 chrome.storage 的验证。切不到会明确失败，提示更新切片。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const memoSource = fs.readFileSync(path.join(root, 'js/memo.js'), 'utf8');

function slice() {
    const start = memoSource.indexOf('MemoManager.prototype.completeTaskById = async function');
    assert.ok(start > 0, '找不到 completeTaskById：memo.js 结构变了，请更新本测试的切片');
    const end = memoSource.indexOf('\n};\n', start);
    assert.ok(end > start, '找不到 completeTaskById 的结尾');
    return memoSource.slice(start, end + 3);
}

/**
 * 造一个“管理器”：memos 是内存里的任务；两个切换入口先同步改内存、再等一个可控的“保存”——
 * 与 memo.js 里真实的 toggleSidebarTaskComplete / toggleHabitCompletion 同样的顺序（先改后存）。
 * saveMode: 'ok'（立即成功） | 'reject'（保存失败） | 'never'（永远不结束，模拟被后一次保存顶替的去抖 Promise）。
 */
function build(memos, { saveMode = 'ok', habitSetsCompleted = true } = {}) {
    const sandbox = { MemoManager: { prototype: {} }, JSON, Promise, setTimeout, clearTimeout, Number, Array, Object };
    vm.createContext(sandbox);
    vm.runInContext(slice(), sandbox, { filename: 'memo.js(completeTaskById)' });
    const self = Object.create(sandbox.MemoManager.prototype);
    self.memos = memos;
    self.calls = [];
    self.toasts = [];
    self.showToast = (message, ms) => { self.toasts.push({ message, ms }); };
    const save = () => {
        if (saveMode === 'reject') return Promise.reject(new Error('QUOTA'));
        if (saveMode === 'never') return new Promise(() => {});
        return Promise.resolve(true);
    };
    self.toggleSidebarTaskComplete = async function (taskId) {
        self.calls.push(['sidebar', taskId]);
        const task = this.memos.find(m => m.id === taskId);
        if (!task || task.status === 'failed') return;
        task.completed = !task.completed;
        task.completedAt = task.completed ? 1700000000000 : null;
        task.updatedAt = 1700000000001;
        if (task.completed && task.progress !== null && task.progress !== undefined) task.progress = 100;
        await save();
    };
    self.toggleHabitCompletion = async function (habitId) {
        self.calls.push(['habit', habitId]);
        const habit = this.memos.find(m => m.id === habitId);
        if (!habit) return;
        if (!habit.habit) habit.habit = { streak: 0, bestStreak: 0, completedDates: [], totalCompletions: 0 };
        habit.habit.completedDates.push('2026-10-15');
        habit.habit.totalCompletions++;
        habit.habit.streak = 1;
        if (habitSetsCompleted) { habit.completed = true; habit.completedAt = 1700000000000; }
        habit.updatedAt = 1700000000001;
        await save();
    };
    return self;
}

// vm 里创建的对象原型与外面不是同一个 Object.prototype，严格 deepEqual 会因此失败：统一过一遍 JSON 变成外面的普通对象
const plain = value => JSON.parse(JSON.stringify(value));
const complete = async (self, id, options) => plain(await self.completeTaskById(id, options));

test('普通任务：走任务列表的 toggleSidebarTaskComplete，只调用一次，进度补满，回报 ok', async () => {
    const self = build([{ id: 'a', title: '写周报', completed: false, progress: 40 }, { id: 'b', title: '别的', completed: false }]);
    const result = await complete(self, 'a');
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(self.calls, [['sidebar', 'a']]);
    assert.equal(self.memos[0].completed, true);
    assert.equal(self.memos[0].progress, 100);
    assert.equal(self.memos[1].completed, false, '别的任务不受影响');
    assert.deepEqual(self.toasts, []);
});

test('每日习惯任务：走打卡 toggleHabitCompletion（带连续天数），不走普通完成入口', async () => {
    const self = build([{ id: 'h', title: '喝水', completed: false, recurrence: { enabled: true, type: 'daily' }, habit: { streak: 0, bestStreak: 0, completedDates: [], totalCompletions: 0 } }]);
    const result = await complete(self, 'h');
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(self.calls, [['habit', 'h']]);
    assert.equal(self.memos[0].habit.streak, 1);
    // 重复但不是每日的不算习惯
    const weekly = build([{ id: 'w', completed: false, recurrence: { enabled: true, type: 'weekly' } }]);
    assert.deepEqual(await complete(weekly, 'w'), { ok: true });
    assert.deepEqual(weekly.calls, [['sidebar', 'w']]);
    const off = build([{ id: 'o', completed: false, recurrence: { enabled: false, type: 'daily' } }]);
    await complete(off, 'o');
    assert.deepEqual(off.calls, [['sidebar', 'o']]);
});

test('已经完成的任务只回报 already，绝不取消完成（两个入口本身都是“切换”）', async () => {
    const self = build([{ id: 'a', completed: true, completedAt: 5 }]);
    assert.deepEqual(await complete(self, 'a'), { ok: true, already: true });
    assert.deepEqual(self.calls, [], '没有调用任何切换入口');
    assert.deepEqual(self.toasts, [], 'already 不打扰用户');
    assert.equal(self.memos[0].completed, true);
    assert.equal(self.memos[0].completedAt, 5);
});

test('连续两次抓同一个任务（第一次还在等保存）：第二次看到的已经是完成态，不会再切换回未完成', async () => {
    const self = build([{ id: 'a', completed: false }]);
    const first = complete(self, 'a');
    const second = complete(self, 'a');
    assert.deepEqual(await second, { ok: true, already: true });
    assert.deepEqual(await first, { ok: true });
    assert.deepEqual(self.calls, [['sidebar', 'a']]);
    assert.equal(self.memos[0].completed, true);
});

test('失败态任务拒绝（与列表里失败任务的勾选框一样不响应）；找不到、编号类型不对都回报 missing，不调用任何入口', async () => {
    const failed = build([{ id: 'f', completed: false, status: 'failed' }]);
    assert.deepEqual(await complete(failed, 'f'), { ok: false, reason: 'failed' });
    assert.deepEqual(failed.calls, []);
    assert.equal(failed.toasts.length, 1);
    assert.match(failed.toasts[0].message, /失败/);
    const self = build([{ id: 'a', completed: false }]);
    for (const bad of ['zzz', 0, null, undefined, {}, [], NaN, true]) {
        assert.deepEqual(await complete(self, bad), { ok: false, reason: 'missing' }, String(bad));
    }
    assert.deepEqual(self.calls, []);
    assert.equal(self.toasts.length, 8, '每次找不到都告诉用户');
    assert.match(self.toasts[0].message, /找不到/);
    const noMemos = build([]);
    noMemos.memos = null;
    assert.deepEqual(await complete(noMemos, 'a'), { ok: false, reason: 'missing' });
    assert.equal(self.memos[0].completed, false);
});

test('编号是数字也可以（严格相等）；字符串 "1" 不会匹配数字 1', async () => {
    const self = build([{ id: 1, completed: false }]);
    assert.deepEqual(await complete(self, '1'), { ok: false, reason: 'missing' });
    assert.deepEqual(await complete(self, 1), { ok: true });
});

test('切换入口抛错（保存失败）：把它改过的字段原样放回去，提示一次，回报 error——内存里不留“已完成但没存上”的状态', async () => {
    const memos = [{ id: 'a', title: 'x', completed: false, completedAt: null, updatedAt: 111, progress: 30 }];
    const self = build(memos, { saveMode: 'reject' });
    const result = await complete(self, 'a');
    assert.deepEqual(result, { ok: false, reason: 'error' });
    assert.equal(self.memos[0].completed, false);
    assert.equal(self.memos[0].completedAt, null);
    assert.equal(self.memos[0].updatedAt, 111);
    assert.equal(self.memos[0].progress, 30);
    assert.equal(self.toasts.length, 1);
    assert.match(self.toasts[0].message, /没有完成/);
});

test('保存失败的回滚：原本没有的字段删掉而不是留下 undefined；习惯的打卡记录整体还原', async () => {
    const simple = build([{ id: 'a', completed: false }], { saveMode: 'reject' });
    await complete(simple, 'a');
    assert.deepEqual(Object.keys(simple.memos[0]).sort(), ['completed', 'id'], '没有新增 completedAt / updatedAt 等键');
    const habit = { id: 'h', completed: false, recurrence: { enabled: true, type: 'daily' }, habit: { streak: 2, bestStreak: 5, completedDates: ['2026-10-13', '2026-10-14'], totalCompletions: 9 } };
    const self = build([habit], { saveMode: 'reject' });
    await complete(self, 'h');
    assert.deepEqual(plain(self.memos[0].habit), { streak: 2, bestStreak: 5, completedDates: ['2026-10-13', '2026-10-14'], totalCompletions: 9 });
    assert.equal(self.memos[0].completed, false);
    const fresh = build([{ id: 'n', completed: false, recurrence: { enabled: true, type: 'daily' }, habit: null }], { saveMode: 'reject' });
    await complete(fresh, 'n');
    assert.equal(fresh.memos[0].habit, null, '原本是 null 就还原成 null');
});

test('保存 Promise 永远不结束（被后一次保存顶替的去抖，既有行为）：等 waitMs 后按内存里的结果判断，不会让水母一直卡在纸篓口', async () => {
    const self = build([{ id: 'a', completed: false }], { saveMode: 'never' });
    const started = Date.now();
    const result = await complete(self, 'a', { waitMs: 30 });
    assert.deepEqual(result, { ok: true });
    assert.ok(Date.now() - started >= 25, '确实等了 waitMs');
    assert.ok(Date.now() - started < 1000);
    // 坏的 waitMs 回到默认值（这里不真的等 3 秒，只验证返回前没有同步抛错：用已经完成态走快速路径）
    const done = build([{ id: 'a', completed: true }], { saveMode: 'never' });
    for (const bad of [0, -5, NaN, 'x', null, {}]) assert.deepEqual(await complete(done, 'a', { waitMs: bad }), { ok: true, already: true });
});

test('入口正常结束但任务没有变成完成态（例如打卡被当成取消打卡）：回报 not-completed，不假装成功', async () => {
    const self = build([{ id: 'h', completed: false, recurrence: { enabled: true, type: 'daily' }, habit: null }], { habitSetsCompleted: false });
    assert.deepEqual(await complete(self, 'h'), { ok: false, reason: 'not-completed' });
    assert.equal(self.toasts.length, 1);
    assert.match(self.toasts[0].message, /没有完成/);
    // 任务在等待期间被别处删掉
    const gone = build([{ id: 'a', completed: false }]);
    const original = gone.toggleSidebarTaskComplete;
    gone.toggleSidebarTaskComplete = async function (id) { await original.call(this, id); this.memos.length = 0; };
    assert.deepEqual(await complete(gone, 'a'), { ok: false, reason: 'not-completed' });
});

test('清理计时器：正常结束后不留下未触发的 setTimeout（vm 里的替身计数）', async () => {
    const live = new Set();
    const sandbox = {
        MemoManager: { prototype: {} }, JSON, Promise, Number, Array, Object,
        setTimeout: (fn, ms) => { const handle = setTimeout(fn, ms); live.add(handle); return handle; },
        clearTimeout: handle => { live.delete(handle); clearTimeout(handle); },
    };
    vm.createContext(sandbox);
    vm.runInContext(slice(), sandbox);
    const self = Object.create(sandbox.MemoManager.prototype);
    self.memos = [{ id: 'a', completed: false }];
    self.toggleSidebarTaskComplete = async function (id) { this.memos[0].completed = true; };
    const result = plain(await self.completeTaskById('a'));
    assert.deepEqual(result, { ok: true });
    assert.equal(live.size, 0, '3 秒的等待计时器已被清掉（否则会拖住进程/页面里的无用回调）');
});

// ---------- 静态契约（读源码，不是真实页面验证） ----------

test('契约：函数挂在 MemoManager 原型上、在 window.memoManager 创建之前；不依赖水母/纸篓的任何名字（互不耦合）', () => {
    const at = memoSource.indexOf('MemoManager.prototype.completeTaskById = async function');
    const created = memoSource.indexOf('window.memoManager = new MemoManager();');
    assert.ok(at > 0 && created > at);
    const body = slice();
    assert.doesNotMatch(body, /Jellyfish|jellyfish|TaskCrumple|document\.|window\.|chrome\./, '只经由 this 上的既有入口完成任务');
    assert.match(body, /toggleHabitCompletion/);
    assert.match(body, /toggleSidebarTaskComplete/);
    assert.doesNotMatch(body, /\.completed\s*=(?!=)/, '这里不自己写 completed——完成只走既有入口');
});

test('契约：它复用的两个入口仍然存在且签名是（任务编号）；列表里勾选框与习惯打卡按钮分别调用它们', () => {
    assert.match(memoSource, /async toggleSidebarTaskComplete\(taskId\) \{/);
    assert.match(memoSource, /async toggleHabitCompletion\(habitId\) \{/);
    assert.match(memoSource, /this\.toggleSidebarTaskComplete\(task\.id\)/);
    assert.match(memoSource, /this\.toggleHabitCompletion\(habit\.id\)/);
    // 列表里区分“习惯”的规则与 completeTaskById 一致：每日重复
    assert.match(memoSource, /m\.recurrence\?\.enabled && m\.recurrence\?\.type === 'daily'/);
});
