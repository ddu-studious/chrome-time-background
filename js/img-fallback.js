/**
 * 图片加载失败回退（符合 MV3 CSP，替代内联 onerror）
 *
 * 动态拼接的 HTML 里不能写内联 error 处理属性（扩展页面 CSP 禁止内联事件处理器），
 * 改为在 <img> 上标注 data-img-fallback="hide|remove"，由这里统一在捕获阶段处理。
 * error 事件不冒泡，所以必须用捕获监听；监听只挂一次，对后续动态插入的图片同样有效。
 */
(function installImageFallback(root) {
  'use strict';
  if (root.__imgFallbackInstalled) return;

  function onError(event) {
    const el = event && event.target;
    if (!el || el.tagName !== 'IMG') return;
    const mode = el.getAttribute('data-img-fallback');
    if (mode === 'remove') {
      el.remove();
    } else if (mode === 'hide') {
      el.style.display = 'none';
    }
  }

  root.document.addEventListener('error', onError, true);
  root.__imgFallbackInstalled = true;
})(typeof window !== 'undefined' ? window : globalThis);
