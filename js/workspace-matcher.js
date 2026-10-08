(function () {
  'use strict';
  window.WorkspaceMatcher = { mount(controller) {
    const anchor = document.getElementById('sw-groups');
    if (!anchor) return;
    const box = document.createElement('section');
    box.className = 'sw-matcher';
    box.innerHTML = `<label for="sw-find-group">查找 / 打开分组</label>
      <form><input id="sw-find-group" maxlength="500" placeholder="输入分组名称" autocomplete="off"><button class="sw-secondary" type="submit">查找</button></form>
      <div class="sw-match-options"></div><p role="status" aria-live="polite">按名称查找，无需 AI；打开时复用已有标签页。</p>
      <button class="sw-primary" type="button" data-open hidden></button>
      <details class="sw-ai-match"><summary>也可以用一句话描述</summary>
        <p data-ai-status>正在检查本机 AI 设置…</p>
        <button class="sw-text-action" type="button" data-ai disabled>按描述匹配</button>
        <button class="sw-text-action" type="button" data-check>刷新状态</button>
        <button class="sw-text-action" type="button" data-cancel hidden>取消</button>
      </details>`;
    anchor.before(box);
    const input = box.querySelector('input'), status = box.querySelector('[role="status"]');
    const choices = box.querySelector('.sw-match-options'), open = box.querySelector('[data-open]');
    const ai = box.querySelector('[data-ai]'), cancel = box.querySelector('[data-cancel]');
    const aiStatus = box.querySelector('[data-ai-status]'), check = box.querySelector('[data-check]');
    let active = null, selection = null, opening = false, generation = 0, aiEnabled = false;
    const signature = (config, id) => JSON.stringify({ group: config.groups.find(g => g.id === id),
      sites: config.sites.filter(s => s.groupId === id).map(s => [s.id, s.name, s.startUrl]),
      pages: config.pages.filter(p => p.groupId === id && p.pinned !== false).map(p => [p.id, p.customTitle || p.title, p.url]) });
    const stop = () => { generation++; active?.abort(); active = null; cancel.hidden = true; ai.disabled = !aiEnabled || opening; };
    const reset = () => { stop(); selection = null; open.hidden = true; choices.replaceChildren(); };
    const choose = (snapshot, group, reason) => {
      selection = { id: group.id, signature: signature(snapshot.config, group.id) };
      const count = snapshot.config.pages.filter(p => p.groupId === group.id && p.pinned !== false).length;
      const sites = snapshot.config.sites.filter(s => s.groupId === group.id).length;
      status.textContent = `${group.name}：${count} 个固定入口、${sites} 个网站。${reason}；打开时去重并复用，临时页面不批量重开。`;
      open.textContent = `打开“${group.name}”分组`; open.hidden = false;
    };
    const find = async () => {
      if (opening) return;
      reset(); const token = generation;
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) { status.textContent = '按名称查找，无需 AI；打开时复用已有标签页。'; return; }
      try {
        const snapshot = await controller.service.getSnapshot();
        if (token !== generation) return;
        const exact = snapshot.config.groups.filter(g => [g.name, `打开${g.name}`, `打开${g.name}工作区`].some(v => v.toLocaleLowerCase() === query));
        if (exact.length === 1) { choose(snapshot, exact[0], '名称匹配'); return; }
        const matches = snapshot.config.groups.filter(g => g.name.toLocaleLowerCase().includes(query));
        status.textContent = matches.length ? '选择要打开的分组。' : '没有同名分组。可以换个关键词，或展开下方按描述匹配。';
        for (const group of matches) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'sw-text-action'; button.textContent = group.name;
          button.addEventListener('click', () => { if (token === generation) choose(snapshot, group, '名称匹配'); }); choices.append(button);
        }
      } catch (error) { if (token === generation) status.textContent = error.message; }
    };
    const refreshAI = async () => {
      check.disabled = true;
      try {
        const state = await window.SceneAI.control();
        aiEnabled = Boolean(state.policy?.modelEnabled && !state.policy.disabledScenes?.includes('workspace.match'));
        aiStatus.textContent = aiEnabled ? '自然语言匹配已开启。例如：打开我写 Java 时用的工作区。' : '自然语言匹配已关闭。按分组名称查找仍可使用。';
      } catch (error) {
        aiEnabled = false; aiStatus.textContent = `本机 AI 暂不可用：${error.message}。按名称查找仍可使用。`;
      } finally { ai.disabled = !aiEnabled || Boolean(active) || opening; check.disabled = false; }
    };
    input.addEventListener('input', find);
    box.querySelector('form').addEventListener('submit', event => { event.preventDefault(); void find(); });
    check.addEventListener('click', refreshAI);
    cancel.addEventListener('click', () => { reset(); status.textContent = '已取消匹配'; });
    window.addEventListener('pagehide', stop);
    ai.addEventListener('click', async () => {
      if (!input.value.trim() || opening) { status.textContent = '请先在上方输入你想打开的工作区。'; return; }
      reset(); const pending = active = new AbortController();
      ai.disabled = true; cancel.hidden = false; status.textContent = '正在匹配已有分组…';
      try {
        const snapshot = await controller.service.getSnapshot();
        if (active !== pending) return;
        if (snapshot.config.groups.length > 30) throw new Error('分组超过 30 个，请按名称查找');
        const groups = snapshot.config.groups.map(group => ({ id: group.id, name: group.name.slice(0, 60),
          entries: [...snapshot.config.sites.filter(s => s.groupId === group.id).map(s => s.name),
            ...snapshot.config.pages.filter(p => p.groupId === group.id && p.pinned !== false).map(p => p.customTitle || p.title)].join('、').slice(0, 120) }));
        const result = await window.SceneAI.run('workspace.match', { query: input.value.trim(), groups }, { signal: pending.signal });
        if (active !== pending) return;
        if (result.question) { status.textContent = result.question; return; }
        const group = snapshot.config.groups.find(g => g.id === result.groupId);
        if (!group) throw new Error('匹配分组不存在');
        choose(snapshot, group, result.reason);
      } catch (error) { if (active === pending) status.textContent = error.message; }
      finally { if (active === pending) stop(); }
    });
    open.addEventListener('click', async () => {
      if (!selection || opening) return;
      const chosen = selection; opening = true; open.disabled = true; input.disabled = true; ai.disabled = true;
      try {
        const fresh = await controller.service.getSnapshot();
        if (signature(fresh.config, chosen.id) !== chosen.signature) throw new Error('固定入口或分组已变化，请重新查找');
        const result = await controller.service.openGroup(chosen.id);
        status.textContent = `已打开或复用 ${result.opened} 个入口，失败 ${result.failed} 个`;
        await controller.render();
      } catch (error) { status.textContent = error.message; }
      finally { opening = false; input.disabled = false; open.disabled = false; reset(); }
    });
    void refreshAI();
  } };
})();
