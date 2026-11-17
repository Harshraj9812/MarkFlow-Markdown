import createDOMPurify from 'dompurify';
import { parseMarkdown } from './markdown.js';

const purifier = createDOMPurify(window);
let diagramCounter = 0;
let mermaidModule;

export function sanitizeHTML(html) {
  return purifier.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'dialog', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'srcset', 'background', 'ping', 'poster', 'autofocus', 'contenteditable', 'formaction', 'popover', 'popovertarget', 'popovertargetaction', 'command', 'commandfor'],
    ADD_TAGS: ['input'], ADD_ATTR: ['type', 'checked', 'disabled'],
    ALLOW_DATA_ATTR: true,
  });
}

export function prepareDocument(source, settings) {
  const result = parseMarkdown(source);
  // Parse in an inert template first: even detached images in the live document
  // can start requests before local filenames have been resolved.
  const template = document.createElement('template');
  template.innerHTML = sanitizeHTML(result.html);
  const root = template.content.ownerDocument.createElement('div');
  root.append(template.content);
  for (const image of root.querySelectorAll('img')) {
    image.dataset.originalSrc = image.getAttribute('src') || '';
    image.removeAttribute('src');
  }
  const documentClasses = new Set(['codeblock', 'code-head', 'copy-code', 'hljs', 'math-slot', 'diagram', 'footnotes', 'footnotes-list', 'footnotes-sep', 'footnote-item', 'footnote-ref', 'footnote-backref', 'contains-task-list', 'task-list-item', 'task-list-item-checkbox']);
  for (const node of root.querySelectorAll('[class]')) {
    const classes = [...node.classList].filter(name => documentClasses.has(name) || /^hljs-[a-z0-9_-]+$/i.test(name));
    if (classes.length) node.className = classes.join(' '); else node.removeAttribute('class');
  }
  // Prevent imported document identifiers from shadowing app controls.
  const ids = new Map(), used = new Set();
  for (const node of root.querySelectorAll('[id]')) {
    const original = node.id;
    let id = `doc-${original}`, suffix = 1;
    while (used.has(id)) id = `doc-${original}-${suffix++}`;
    used.add(id); if (!ids.has(original)) ids.set(original, id); node.id = id;
  }
  for (const link of root.querySelectorAll('a')) {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) {
      let target = href.slice(1);
      try { target = decodeURIComponent(target); } catch { /* Keep literal malformed fragment. */ }
      link.setAttribute('href', `#${ids.get(target) || `doc-${target}`}`);
    } else { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  }
  for (const input of root.querySelectorAll('input')) {
    if (input.type !== 'checkbox') input.remove();
    else { input.disabled = true; input.removeAttribute('name'); input.removeAttribute('id'); }
  }
  for (const button of root.querySelectorAll('button')) {
    if (!button.classList.contains('copy-code')) button.remove();
  }
  for (const slot of root.querySelectorAll('[data-math-slot]')) {
    const value = result.math[Number(slot.dataset.mathSlot)];
    if (value) slot.innerHTML = value;
  }
  // GitHub-style callouts remain ordinary Markdown blockquotes if unknown.
  for (const quote of root.querySelectorAll('blockquote')) {
    const first = quote.querySelector(':scope > p');
    const text = first?.firstChild;
    const match = text?.nodeType === Node.TEXT_NODE && text.textContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
    if (!match) continue;
    const type = match[1].toLowerCase();
    text.textContent = text.textContent.slice(match[0].length);
    quote.className = `callout callout-${type}`;
    const title = document.createElement('strong'); title.className = 'callout-title'; title.textContent = type;
    quote.prepend(title);
  }
  const headings = result.headings.filter(heading => ids.has(heading.id));
  const layout = document.createElement('div'); layout.className = 'document-layout';
  layout.dataset.tocPosition = settings.tocPosition === 'left' && settings.toc && headings.length ? 'left' : 'top';
  const content = document.createElement('div'); content.className = 'document-content';
  content.append(...root.childNodes); layout.append(content); root.append(layout);
  if (settings.toc && headings.length) {
    const toc = document.createElement('nav'); toc.className = 'toc'; toc.setAttribute('aria-label', 'Table of contents');
    const title = document.createElement('strong'); title.textContent = 'On this page'; toc.append(title);
    const list = document.createElement('ol');
    const minimum = Math.min(...headings.map(heading => heading.level));
    for (const heading of headings) {
      const li = document.createElement('li'); li.style.setProperty('--toc-depth', String(Math.min(heading.level - minimum, 4)));
      const link = document.createElement('a'); link.href = `#${ids.get(heading.id)}`; link.textContent = heading.title; li.append(link); list.append(li);
    }
    toc.append(list);
    if (layout.dataset.tocPosition === 'left') layout.prepend(toc);
    else {
      const h1 = content.querySelector('h1');
      if (h1) h1.after(toc); else content.prepend(toc);
    }
  }
  const figures = [...root.querySelectorAll('figure[data-diagram]')];
  return { root, figures, diagrams: result.diagrams, headingCount: headings.length };
}

let diagramQueue = Promise.resolve();
export function finishDiagrams(prepared, theme) {
  const task = diagramQueue.catch(() => {}).then(() => renderDiagrams(prepared, theme));
  diagramQueue = task;
  return task;
}

async function renderDiagrams(prepared, theme) {
  const warnings = [];
  if (!prepared.figures.length) return warnings;
  mermaidModule ||= import('mermaid').then(module => module.default);
  const mermaid = await mermaidModule;
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
    secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'themeCSS', 'themeVariables', 'fontFamily', 'htmlLabels', 'flowchart'],
    theme: theme === 'light' ? 'default' : 'dark',
    fontFamily: 'system-ui, sans-serif',
    htmlLabels: false,
    flowchart: { htmlLabels: false, useMaxWidth: true },
    maxTextSize: 100000, maxEdges: 500,
  });
  for (const figure of prepared.figures) {
    const source = prepared.diagrams[Number(figure.dataset.diagram)];
    if (source === undefined) { figure.remove(); continue; }
    try {
      const { svg } = await mermaid.render(`diagram-${++diagramCounter}`, source);
      // Mermaid runs with strict security; sanitize its generated SVG as well.
      figure.innerHTML = purifier.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'], FORBID_TAGS: ['foreignObject'], FORBID_ATTR: ['onclick', 'onload'] });
      const graphic = figure.querySelector('svg');
      if (graphic) { graphic.setAttribute('role', 'img'); graphic.setAttribute('aria-label', 'Markdown diagram'); }
    } catch {
      figure.classList.add('diagram-error');
      const message = document.createElement('figcaption'); message.textContent = 'This diagram could not be rendered. Check the Mermaid syntax.';
      figure.prepend(message); warnings.push('A Mermaid diagram has invalid or unsupported syntax; its source is shown instead.');
    }
  }
  return warnings;
}
