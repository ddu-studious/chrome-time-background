/**
 * 统一 Markdown 渲染模块
 * 整合 marked.js v15 + DOMPurify + highlight.js + mermaid 的完整渲染链路
 * 供 memo.js、knowledge-wall.js、tasks.js 共用
 *
 * marked v15 要求通过 marked.use({ renderer: { ... } }) 配置自定义 renderer，
 * 而非旧版 new marked.Renderer() + marked.setOptions() 方式。
 */
class MarkdownRenderer {
    static _configured = false;
    static _mermaidLoad = null;
    static _mermaidURL = new URL('../vendor/mermaid.tiny.min.js', document.currentScript?.src || new URL('js/markdown-renderer.js', document.baseURI)).href;

    static loadMermaid() {
        if (globalThis.mermaid?.render) return Promise.resolve(globalThis.mermaid);
        if (this._mermaidLoad) return this._mermaidLoad;
        this._mermaidLoad = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            let settled = false;
            const finish = error => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                script.onload = script.onerror = null;
                if (error) { script.remove(); this._mermaidLoad = null; reject(error); }
                else resolve(globalThis.mermaid);
            };
            const timer = setTimeout(() => finish(new Error('图表组件加载超时，请重新打开内容')), 10000);
            script.src = this._mermaidURL;
            script.async = true;
            script.onload = () => finish(globalThis.mermaid?.render ? null : new Error('图表组件不可用'));
            script.onerror = () => finish(new Error('图表组件加载失败，请重新打开内容'));
            document.head.appendChild(script);
        });
        return this._mermaidLoad;
    }

    static configure() {
        if (this._configured || typeof marked === 'undefined') return;
        try {
            marked.use({
                breaks: true,
                gfm: true,
                renderer: {
                    image({ href, title, text }) {
                        if (!href) return text || '';
                        const titleAttr = title ? ` title="${title}"` : '';
                        const altText = text || '';
                        return `<img src="${href}" alt="${altText}"${titleAttr} class="md-img" loading="lazy">`;
                    },

                    link({ href, title, tokens }) {
                        const inner = this.parser.parseInline(tokens);
                        const isExternal = href && /^https?:\/\//.test(href);
                        const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
                        const titleAttr = title ? ` title="${title}"` : '';
                        return `<a href="${href}"${titleAttr}${target}>${inner}</a>`;
                    },

                    code({ text, lang }) {
                        if (lang === 'mermaid') {
                            const id = 'mermaid-' + Math.random().toString(36).slice(2, 10);
                            return `<div class="kw-mermaid-block" data-mermaid-id="${id}"><pre class="mermaid">${MarkdownRenderer.escapeHtml(text)}</pre></div>`;
                        }
                        const langLabel = lang ? `<span class="kw-code-lang">${lang}</span>` : '';
                        const copyBtn = `<button class="kw-code-copy-btn" aria-label="复制代码" title="复制代码"><i class="fas fa-copy"></i></button>`;
                        let codeHtml;
                        if (typeof hljs !== 'undefined') {
                            if (lang && hljs.getLanguage(lang)) {
                                codeHtml = `<code class="hljs language-${lang}">${hljs.highlight(text, { language: lang, ignoreIllegals: true }).value}</code>`;
                            } else {
                                codeHtml = `<code class="hljs">${hljs.highlightAuto(text).value}</code>`;
                            }
                        } else {
                            const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            codeHtml = `<code>${escaped}</code>`;
                        }
                        return `<div class="kw-code-wrapper">${langLabel}${copyBtn}<pre>${codeHtml}</pre></div>`;
                    },

                    paragraph({ tokens }) {
                        const html = this.parser.parseInline(tokens);
                        const preserved = html.replace(/^( +)/gm, m => '&nbsp;'.repeat(m.length));
                        return `<p>${preserved}</p>\n`;
                    },

                    listitem({ tokens, task, checked }) {
                        const html = this.parser.parse(tokens, !!this.options?.mangle);
                        if (task) {
                            const content = html.replace(/^\s*<p>\s*<input[^>]*>\s*/, '<p>');
                            return `<li class="kw-md-task-item${checked ? ' done' : ''}"><i class="fas fa-${checked ? 'check-square' : 'square'}"></i> ${content}</li>\n`;
                        }
                        return `<li>${html}</li>\n`;
                    },
                },
            });

            marked.use({
                extensions: [{
                    name: 'highlight',
                    level: 'inline',
                    start(src) { return src.indexOf('=='); },
                    tokenizer(src) {
                        const match = src.match(/^==([^=]+)==/);
                        if (match) return { type: 'highlight', raw: match[0], text: match[1] };
                    },
                    renderer(token) {
                        return `<mark>${token.text}</mark>`;
                    }
                }]
            });

            this._configured = true;
        } catch (e) {
            console.warn('[MarkdownRenderer] marked 配置失败:', e);
        }
    }

    /**
     * 预处理 Markdown 文本，修复常见格式问题
     * - 图片/链接语法跨行：![text]\n(url) → ![text](url)
     */
    static preprocess(text) {
        if (!text) return '';
        text = text.replace(/!\[([^\]]*)\]\s*\n\s*\(([^)]+)\)/g, '![$1]($2)');
        text = text.replace(/(?<!!)\[([^\]]*)\]\s*\n\s*\(([^)]+)\)/g, '[$1]($2)');
        return text;
    }

    static render(text) {
        if (!text) return '';
        this.configure();
        try {
            if (typeof marked !== 'undefined' && marked.parse) {
                const preprocessed = this.preprocess(text);
                const raw = marked.parse(preprocessed);
                return this.sanitize(raw);
            }
        } catch (e) {
            console.warn('[MarkdownRenderer] 渲染失败，回退纯文本:', e);
        }
        return this.escapeHtml(text).replace(/\n/g, '<br>');
    }

    static sanitize(html) {
        if (typeof DOMPurify === 'undefined') return html;
        return DOMPurify.sanitize(html, {
            ADD_ATTR: [
                'target', 'rel', 'data-mermaid-id', 'class',
                'loading', 'alt', 'type', 'checked', 'disabled',
                'aria-label',
            ],
            ADD_TAGS: [
                'svg', 'g', 'path', 'line', 'rect', 'circle',
                'text', 'tspan', 'polygon', 'polyline', 'marker',
                'defs', 'style', 'foreignObject',
            ],
            ALLOWED_TAGS: [
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
                'strong', 'em', 'del', 's', 'blockquote', 'mark', 'sup', 'sub',
                'ul', 'ol', 'li', 'a', 'img', 'code', 'pre',
                'table', 'thead', 'tbody', 'tr', 'th', 'td',
                'input', 'div', 'span', 'i', 'button',
                'details', 'summary',
            ],
            ALLOWED_ATTR: [
                'href', 'src', 'alt', 'title', 'target', 'rel', 'class',
                'data-mermaid-id', 'loading', 'type', 'checked', 'disabled',
                'style', 'width', 'height', 'align', 'aria-label',
            ],
        });
    }

    static async renderMermaid(containerEl) {
        if (!containerEl) return;
        const blocks = [...containerEl.querySelectorAll('.kw-mermaid-block[data-mermaid-id]')]
            .filter(block => block.querySelector('pre.mermaid') && !block.dataset.mermaidPending);
        if (blocks.length === 0) return;
        blocks.forEach(block => { block.dataset.mermaidPending = 'true'; });
        try {
            const mermaid = await this.loadMermaid();
            mermaid.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                theme: 'dark',
                themeVariables: {
                    darkMode: true,
                    background: 'transparent',
                    primaryColor: '#3b82f6',
                    primaryTextColor: '#e2e8f0',
                    primaryBorderColor: '#4b5563',
                    lineColor: '#6b7280',
                    secondaryColor: '#1e3a5f',
                    tertiaryColor: '#1a1a2e',
                },
                flowchart: { htmlLabels: true, curve: 'basis' },
                sequence: { showSequenceNumbers: true },
            });
            await Promise.all(blocks.map(async (block) => {
                if (!containerEl.contains(block)) return;
                const id = block.dataset.mermaidId;
                const preEl = block.querySelector('pre.mermaid');
                if (!preEl) return;
                const definition = preEl.textContent;
                try {
                    const { svg } = await mermaid.render(id, definition);
                    if (!containerEl.contains(block)) return;
                    block.innerHTML = DOMPurify.sanitize(svg, {
                        ADD_TAGS: ['foreignObject'],
                        HTML_INTEGRATION_POINTS: { foreignobject: true },
                    });
                    block.classList.add('kw-mermaid-rendered');
                } catch (err) {
                    const error = document.createElement('pre');
                    error.className = 'kw-mermaid-error';
                    error.textContent = `图表渲染失败：${err.message}\n\n${definition}`;
                    block.replaceChildren(error);
                }
            }));
        } catch (e) {
            for (const block of blocks) {
                if (!containerEl.contains(block)) continue;
                const error = document.createElement('p');
                error.className = 'kw-mermaid-error';
                error.textContent = e.message;
                block.querySelector('.kw-mermaid-error')?.remove();
                block.prepend(error);
            }
        } finally {
            blocks.forEach(block => { delete block.dataset.mermaidPending; });
        }
    }

    /**
     * 检测文本是否包含 Markdown 语法
     * 使用 m 标志支持多行匹配
     */
    static hasMarkdownSyntax(text) {
        if (!text) return false;
        return /^#{1,6} |^\d+\. |^[-*+] |\*\*.+?\*\*|`.+?`|^> |^-{3,}$|\[.+?\]\(.+?\)|!\[|==.+?==|^\|.+\|$/m.test(text);
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static bindCopyButtons(container) {
        if (!container) return;
        container.querySelectorAll('.kw-code-copy-btn').forEach(btn => {
            if (btn._copyBound) return;
            btn._copyBound = true;
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const code = btn.closest('.kw-code-wrapper')?.querySelector('code');
                if (!code) return;
                try {
                    await navigator.clipboard.writeText(code.textContent);
                    btn.classList.add('copied');
                    btn.innerHTML = '<i class="fas fa-check"></i>';
                    setTimeout(() => {
                        btn.classList.remove('copied');
                        btn.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 1500);
                } catch { /* silent */ }
            });
        });

        container.querySelectorAll('code:not(pre code):not(.kw-inline-code-copy)').forEach(el => {
            el.classList.add('kw-inline-code-copy');
            el.title = '点击复制';
            el.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(el.textContent);
                    el.classList.add('copied');
                    setTimeout(() => el.classList.remove('copied'), 1200);
                } catch { /* silent */ }
            });
        });
    }
}
