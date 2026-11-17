import documentCSS from './document.css?inline';
import layoutCSS from './layouts.css?inline';
import mathCSS from 'virtual:math-css';
import { embedRemoteImages } from './images.js';
import { groupPrintIntroductions } from './print-layout.js';

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

export async function printDocument(html) {
  const frame = document.createElement('iframe');
  frame.title = 'Print document'; frame.className = 'print-frame';
  // Scripts are unnecessary; same-origin access lets us await fonts and images.
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  const loaded = new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = () => reject(new Error('Could not prepare the print view'));
  });
  frame.srcdoc = html; document.body.append(frame);
  try {
    await loaded;
    const doc = frame.contentDocument;
    // Print disclosures expanded so their content is included in the PDF.
    doc.querySelectorAll('details').forEach(details => { details.open = true; });
    await doc.fonts.ready;
    await Promise.all([...doc.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 10000);
    })));
    frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    frame.contentWindow.focus(); frame.contentWindow.print();
    // Retain the frame while browsers display a nonblocking print dialog.
    setTimeout(() => frame.remove(), 300000);
  } catch (error) { frame.remove(); throw error; }
}
