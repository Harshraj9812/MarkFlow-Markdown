import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import { katex } from '@mdit/plugin-katex';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import json from 'highlight.js/lib/languages/json';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import nginx from 'highlight.js/lib/languages/nginx';
import ini from 'highlight.js/lib/languages/ini';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import diff from 'highlight.js/lib/languages/diff';

for (const [name, grammar] of Object.entries({ bash, yaml, json, dockerfile, python, javascript, typescript, nginx, ini, xml, css, sql, diff })) hljs.registerLanguage(name, grammar);
hljs.registerLanguage('hcl', language => ({
  name: 'HCL', aliases: ['terraform', 'tf'],
  keywords: { keyword: 'resource data variable output provider module terraform locals dynamic for_each count depends_on lifecycle for in if', literal: 'true false null' },
  contains: [language.HASH_COMMENT_MODE, language.C_LINE_COMMENT_MODE, language.C_BLOCK_COMMENT_MODE, language.QUOTE_STRING_MODE, language.C_NUMBER_MODE],
}));
hljs.registerAliases(['sh', 'shell', 'zsh', 'console'], { languageName: 'bash' });

export function slugify(text) {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').replace(/\s+/g, '-') || 'heading';
}

export function parseMarkdown(source) {
  const math = [], diagrams = [], headings = [];
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false })
    .use(taskLists, { enabled: false, label: false })
    .use(footnote)
    .use(anchor, { slugify, callback: (token, info) => headings.push({ level: Number(token.tag.slice(1)), id: info.slug, title: info.title }) })
    .use(katex, {
      delimiters: 'all', mathFence: true, trust: false, maxExpand: 1000,
      maxSize: 20, throwOnError: false, output: 'htmlAndMathml',
      transformer: (html, display) => {
        const index = math.push(html) - 1;
        const tag = display ? 'div' : 'span';
        return `<${tag} class="math-slot" data-math-slot="${index}"></${tag}>`;
      },
    });
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0].toLowerCase();
    if (language === 'mermaid') {
      const position = diagrams.push(token.content) - 1;
      return `<figure class="diagram" data-diagram="${position}"><pre>${md.utils.escapeHtml(token.content)}</pre></figure>`;
    }
    if (language === 'math') return defaultFence(tokens, index, options, env, self);
    const content = hljs.getLanguage(language)
      ? hljs.highlight(token.content, { language, ignoreIllegals: true }).value
      : md.utils.escapeHtml(token.content);
    return `<div class="codeblock"><div class="code-head"><span>${md.utils.escapeHtml(language || 'text')}</span><button class="copy-code" type="button">Copy</button></div><pre><code class="hljs">${content}</code></pre></div>\n`;
  };
  return { html: md.render(source), math, diagrams, headings };
}
