import documentCSS from './document.css?inline';
import layoutCSS from './layouts.css?inline';
import mathCSS from 'virtual:math-css';
import { embedRemoteImages } from './images.js';
import { groupPrintIntroductions, preparePrintContent } from './print-layout.js';

export { documentCSS, mathCSS };
export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function safeFilename(name) {
  return (name.trim().replace(/\.(md|markdown|html|pdf|txt)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 120) || 'document');
}

export function buildExportHTML(root, settings, format = 'html') {
  const content = root.cloneNode(true);
  groupPrintIntroductions(content);
  content.querySelectorAll('button').forEach(button => button.remove());
  // A closed disclosure should remain available in a static HTML export.
  const title = settings.filename.trim() || 'Document';
  const page = settings.pageSize === 'Letter' ? 'Letter' : 'A4';
  const margin = ({ normal: '18mm', narrow: '10mm', wide: '25mm' })[settings.margins] || '18mm';
  const theme = format === 'pdf' || settings.theme === 'light' ? 'light' : 'dark';
  const background = theme === 'light' ? '#fff' : '#151a24';
  const pdfStyle = format === 'pdf' ? (settings.pdfStyle === 'minimal' ? 'minimal' : 'standard') : 'none';
  const size = Math.min(20, Math.max(12, Number(settings.fontSize) || 14));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'">
<title>${escapeHTML(title)}</title>
<style>${documentCSS}\n${layoutCSS}\n${mathCSS}\n@page{size:${page};margin:${margin}}body{--print-background:${background}}.document{--reading-size:${size}px}</style>
</head><body class="document-host theme-${theme}"><main class="document" data-theme="${theme}" data-pdf-style="${pdfStyle}">${content.innerHTML}</main></body></html>`;
}

export async function prepareExport(root, settings, format = 'html') {
  const copy = root.cloneNode(true);
  const failed = settings.embedRemote ? await embedRemoteImages(copy) : [];
  return { html: buildExportHTML(copy, settings, format), failed };
}

export function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

let activePrintCleanup;
export async function printDocument(html) {
  activePrintCleanup?.();
  const { container, style, title } = preparePrintContent(html, document);
  const previousTitle = document.title;
  let cleanupTimer;
  const cleanup = () => {
    clearTimeout(cleanupTimer); window.removeEventListener('afterprint', cleanup);
    container.remove(); style.remove(); document.title = previousTitle;
    if (activePrintCleanup === cleanup) activePrintCleanup = undefined;
  };
  activePrintCleanup = cleanup;
  document.head.append(style); document.body.append(container);
  try {
    await document.fonts.ready;
    await Promise.all([...container.querySelectorAll('img')].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 10000);
    })));
    container.removeAttribute('aria-hidden'); document.title = title || previousTitle;
    window.addEventListener('afterprint', cleanup, { once: true });
    // Retain the print layout for browsers with a nonblocking dialog.
    cleanupTimer = setTimeout(cleanup, 300000);
    window.print();
  } catch (error) { cleanup(); throw error; }
}
