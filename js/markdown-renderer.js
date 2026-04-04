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
                            return `<div class="kw-mermaid-block" data-mermaid-id="${id}"><pre class="mermaid">${text}</pre></div>`;
                        }
                        if (typeof hljs !== 'undefined') {
                            if (lang && hljs.getLanguage(lang)) {
                                const highlighted = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
                                return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
                            }
                            const auto = hljs.highlightAuto(text).value;
                            return `<pre><code class="hljs">${auto}</code></pre>`;
                        }
                        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        return `<pre><code>${escaped}</code></pre>`;
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
                'input', 'div', 'span', 'i',
                'details', 'summary',
            ],
            ALLOWED_ATTR: [
                'href', 'src', 'alt', 'title', 'target', 'rel', 'class',
                'data-mermaid-id', 'loading', 'type', 'checked', 'disabled',
                'style', 'width', 'height', 'align',
            ],
        });
    }

    static renderMermaid(containerEl) {
        if (typeof mermaid === 'undefined' || !containerEl) return;
        const blocks = containerEl.querySelectorAll('.kw-mermaid-block[data-mermaid-id]');
        if (blocks.length === 0) return;
        try {
            mermaid.initialize({
                startOnLoad: false,
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
            blocks.forEach(async (block) => {
                const id = block.dataset.mermaidId;
                const preEl = block.querySelector('pre.mermaid');
                if (!preEl) return;
                const definition = preEl.textContent;
                try {
                    const { svg } = await mermaid.render(id, definition);
                    block.innerHTML = svg;
                    block.classList.add('kw-mermaid-rendered');
                } catch (err) {
                    block.innerHTML = `<pre class="kw-mermaid-error"><code>Mermaid 渲染失败: ${err.message}\n\n${definition}</code></pre>`;
                }
            });
        } catch (e) {
            console.warn('[MarkdownRenderer] Mermaid 初始化失败:', e);
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
}
