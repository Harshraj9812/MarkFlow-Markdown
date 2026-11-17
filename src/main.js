import './app.css';
import './document.css';
import './workspace.css';
import './layouts.css';
import './mobile.css';
import example from './example.md?raw';
import { prepareDocument, finishDiagrams } from './render.js';
import { resolveImages, blobToDataURL } from './images.js';
import { readWorkspace, writeWorkspace } from './storage.js';
import { mathCSS, download, safeFilename, prepareExport, printDocument } from './export.js';
import { registerSW } from 'virtual:pwa-register';

// Capture app controls before inserting any imported document content.
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
const source = ui.source, paper = ui.document;
const themeButtons = [...document.querySelectorAll('button[data-theme]')];
const viewButtons = [...document.querySelectorAll('button[data-view]')];
const mathStyle = document.createElement('style'); mathStyle.textContent = mathCSS; document.head.append(mathStyle);
const defaults = { theme: 'dark', fontSize: 14, toc: true, tocPosition: 'top', wrapText: true, pdfStyle: 'standard', pageSize: 'A4', margins: 'normal', filename: 'kubernetes-deployment', embedRemote: true };
let settings = { ...defaults }, assets = new Map(), inputFilename = 'kubernetes-deployment.md';
let toastTimer, saveTimer, renderTimer, renderTask, renderRevision = 0, renderedRevision = -1;
let saveQueue = Promise.resolve(), saveRevision = 0, renderError = false, exporting = false;
let pendingInstall, offlineReady = false;
let renderWarnings = [], missingImages = [];

function notify(message) {
  clearTimeout(toastTimer); ui.toast.textContent = message; ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 6500);
}

function selectView(button, focus = false) {
  ui.workspace.dataset.view = button.dataset.view;
  if (['settings', 'export'].includes(button.dataset.view)) ui['settings-panel'].open = true;
  for (const tab of viewButtons) { const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; }
  if (focus) button.focus();
}
viewButtons.forEach((button, index) => {
  button.addEventListener('click', () => {
    selectView(button);
    if (matchMedia('(max-width:700px)').matches) ui.workspace.scrollIntoView({ block: 'start' });
  });
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? viewButtons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + viewButtons.length) % viewButtons.length;
    selectView(viewButtons[next], true);
  });
});
selectView(ui['preview-tab']);
ui['expand-preview'].addEventListener('click', () => {
  const expanded = ui.workspace.classList.toggle('reading-view');
  ui['expand-preview'].setAttribute('aria-pressed', String(expanded));
  ui['expand-preview'].textContent = expanded ? 'Show editor' : 'Expand preview';
});

const editorMeasure = document.createElement('div');
editorMeasure.className = 'editor-measure'; editorMeasure.setAttribute('aria-hidden', 'true'); document.body.append(editorMeasure);
let gutterFrame;
function updateGutter() {
  if (!source.clientWidth) return;
  const lines = source.value.split('\n');
  if (!settings.wrapText) ui.gutter.textContent = lines.map((_, index) => index + 1).join('\n');
  else {
    const style = getComputedStyle(source);
    const lineHeight = parseFloat(style.lineHeight);
    editorMeasure.style.font = style.font;
    editorMeasure.style.lineHeight = style.lineHeight;
    editorMeasure.style.letterSpacing = style.letterSpacing;
    editorMeasure.style.tabSize = style.tabSize;
    editorMeasure.style.width = `${source.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`;
    const rows = lines.map(line => { const row = document.createElement('div'); row.textContent = line || '\u200b'; return row; });
    editorMeasure.replaceChildren(...rows);
    ui.gutter.textContent = rows.map((row, index) => String(index + 1) + '\n'.repeat(Math.max(0, Math.round(row.getBoundingClientRect().height / lineHeight) - 1))).join('\n');
  }
  ui.gutter.scrollTop = source.scrollTop;
}
function scheduleGutter() { cancelAnimationFrame(gutterFrame); gutterFrame = requestAnimationFrame(updateGutter); }
new ResizeObserver(scheduleGutter).observe(source);

function updateSourceMeta() {
  const count = source.value.split('\n').length;
  scheduleGutter();
  ui['input-count'].textContent = `${count.toLocaleString()} lines · ${source.value.length.toLocaleString()} chars`;
  ui['input-filename'].textContent = inputFilename;
}

function snapshot() {
  return { version: 1, source: source.value, settings: { ...settings }, inputFilename, assets: [...assets.entries()] };
}

function saveNow() {
  clearTimeout(saveTimer);
  const value = snapshot(), revision = ++saveRevision;
  ui['save-status'].textContent = 'Saving on device…';
  saveQueue = saveQueue.catch(() => {}).then(() => writeWorkspace(value)).then(() => {
    if (revision === saveRevision) ui['save-status'].textContent = 'Saved on this device';
    return true;
  }).catch(() => { ui['save-status'].textContent = 'Local save unavailable · download your .md'; return false; });
  return saveQueue;
}

function scheduleSave() {
  clearTimeout(saveTimer); ui['save-status'].textContent = 'Unsaved changes…';
  saveTimer = setTimeout(saveNow, 350);
}

function showWarnings() {
  const messages = [...renderWarnings];
  if (missingImages.length) messages.push(`Attach local images to include them: ${missingImages.join(', ')}`);
  ui['render-warning'].textContent = messages.join(' ');
  ui['render-warning'].hidden = messages.length === 0;
}

async function runRenderer() {
  ui['preview-panel'].setAttribute('aria-busy', 'true');
  try {
    while (renderedRevision !== renderRevision) {
      const revision = renderRevision, text = source.value, options = { ...settings };
      ui['render-status'].textContent = 'Rendering…';
      try {
        const prepared = prepareDocument(text, options);
        const warnings = await finishDiagrams(prepared, options.theme);
        const missing = resolveImages(prepared.root, assets);
        if (revision !== renderRevision) continue;
        if (!text.trim()) prepared.root.innerHTML = '<div class="empty-document"><h1>A blank page. A fresh start.</h1><p>Paste Markdown, type your notes, or open a file to see your document here.</p></div>';
        paper.replaceChildren(...prepared.root.childNodes);
        paper.dataset.theme = options.theme;
        paper.style.setProperty('--reading-size', `${settings.fontSize}px`);
        renderWarnings = warnings; missingImages = missing; showWarnings();
        ui['render-status'].textContent = `${prepared.headingCount} headings · Ready`;
        renderError = false; renderedRevision = revision;
      } catch (error) {
        if (revision !== renderRevision) continue;
        renderError = true; renderedRevision = revision;
        renderWarnings = ['Could not render this document. Check the Markdown or try a smaller file.']; missingImages = []; showWarnings();
        ui['render-status'].textContent = 'Render failed';
        console.error('Document rendering failed', error);
      }
    }
  } finally { ui['preview-panel'].setAttribute('aria-busy', 'false'); }
}

async function flushRender() {
  clearTimeout(renderTimer);
  if (!renderTask) renderTask = runRenderer().finally(() => { renderTask = undefined; });
  await renderTask;
  if (renderedRevision !== renderRevision) await flushRender();
}

function scheduleRender() {
  renderRevision++; clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { void flushRender(); }, 180);
}

function applySettings() {
  for (const button of themeButtons) button.setAttribute('aria-pressed', String(button.dataset.theme === settings.theme));
  ui['font-size'].value = settings.fontSize; ui['size-value'].textContent = `${settings.fontSize} px`;
  ui['include-toc'].checked = settings.toc; ui['page-size'].value = settings.pageSize;
  ui['toc-position'].value = settings.tocPosition;
  ui['pdf-style'].value = settings.pdfStyle;
  ui['wrap-text'].checked = settings.wrapText;
  source.dataset.wrap = settings.wrapText ? 'on' : 'off'; source.wrap = settings.wrapText ? 'soft' : 'off';
  scheduleGutter();
  ui['toc-position'].disabled = !settings.toc;
  ui.margins.value = settings.margins; ui.filename.value = settings.filename;
  ui['embed-remote'].checked = settings.embedRemote;
}

function changeSetting(key, value, rerender = false) {
  settings[key] = value;
  if (rerender) scheduleRender();
  if (key === 'fontSize') {
    ui['size-value'].textContent = `${value} px`; paper.style.setProperty('--reading-size', `${value}px`);
  }
  scheduleSave();
}
themeButtons.forEach(button => button.addEventListener('click', () => {
  changeSetting('theme', button.dataset.theme, true);
  themeButtons.forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
}));
ui['font-size'].addEventListener('input', event => changeSetting('fontSize', Number(event.target.value)));
ui['include-toc'].addEventListener('change', event => changeSetting('toc', event.target.checked, true));
ui['include-toc'].addEventListener('change', event => { ui['toc-position'].disabled = !event.target.checked; });
ui['toc-position'].addEventListener('change', event => changeSetting('tocPosition', event.target.value, true));
ui['pdf-style'].addEventListener('change', event => changeSetting('pdfStyle', event.target.value));
ui['wrap-text'].addEventListener('change', event => {
  changeSetting('wrapText', event.target.checked);
  source.dataset.wrap = settings.wrapText ? 'on' : 'off'; source.wrap = settings.wrapText ? 'soft' : 'off'; scheduleGutter();
});
ui['page-size'].addEventListener('change', event => changeSetting('pageSize', event.target.value));
ui.margins.addEventListener('change', event => changeSetting('margins', event.target.value));
ui.filename.addEventListener('input', event => changeSetting('filename', event.target.value));
ui['embed-remote'].addEventListener('change', event => changeSetting('embedRemote', event.target.checked));
source.addEventListener('input', () => { updateSourceMeta(); scheduleRender(); scheduleSave(); });
source.addEventListener('scroll', () => { ui.gutter.scrollTop = source.scrollTop; });

let resolveReplacement;
ui['replace-dialog'].setAttribute('aria-labelledby', 'replace-title');
ui['replace-dialog'].addEventListener('close', () => {
  resolveReplacement?.(ui['replace-dialog'].returnValue === 'replace'); resolveReplacement = undefined;
});
async function canReplace() {
  if ((!source.value.trim() || source.value === example) && assets.size === 0) return true;
  if (ui['replace-dialog'].open) return false;
  ui['replace-dialog'].returnValue = 'cancel'; ui['replace-dialog'].showModal();
  return new Promise(resolve => { resolveReplacement = resolve; });
}

async function replaceDocument(text, name, clearAssets = true) {
  source.value = text; inputFilename = name;
  settings.filename = safeFilename(name); ui.filename.value = settings.filename;
  if (clearAssets) { assets.clear(); updateImageList(); }
  source.scrollTop = 0; updateSourceMeta(); scheduleRender(); await saveNow();
}
async function loadFile(file) {
  if (!/\.(md|markdown|txt)$/i.test(file.name)) { notify('Choose a .md, .markdown or .txt file.'); return false; }
  if (!await canReplace()) return false;
  try {
    const text = await file.text();
    await replaceDocument(text.replace(/^\uFEFF/, ''), file.name);
    selectView(ui['editor-tab']); source.focus(); notify(`Opened ${file.name}.`);
    return true;
  } catch { notify('Could not read this file. Please try again.'); return false; }
}
ui['browse-markdown'].addEventListener('click', () => ui['file-input'].click());
ui['file-input'].addEventListener('change', async () => {
  if (ui['file-input'].files[0]) await loadFile(ui['file-input'].files[0]); ui['file-input'].value = '';
});
ui['paste-markdown'].addEventListener('click', () => {
  selectView(ui['editor-tab']); source.focus();
  notify('Paste into the editor with Ctrl+V, ⌘+V, or your device’s Paste menu.');
});
ui.sample.addEventListener('click', async () => {
  if (await canReplace()) { await replaceDocument(example, 'kubernetes-deployment.md'); selectView(ui['preview-tab']); }
});
ui.clear.addEventListener('click', async () => {
  // Clearing also needs confirmation when the example has been edited or imported.
  if (await canReplace()) { await replaceDocument('', 'untitled.md'); selectView(ui['editor-tab']); source.focus(); }
});

let dragDepth = 0;
const hasFiles = event => [...event.dataTransfer.types].includes('Files');
// Catch files across the page, including mobile/tablet preview mode.
document.addEventListener('dragenter', event => {
  if (!hasFiles(event)) return;
  event.preventDefault(); dragDepth++; ui.workspace.classList.add('drag-over'); ui['drop-zone'].classList.add('drag-over');
});
document.addEventListener('dragover', event => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) { ui.workspace.classList.remove('drag-over'); ui['drop-zone'].classList.remove('drag-over'); }
});
document.addEventListener('drop', async event => {
  if (!hasFiles(event)) return;
  event.preventDefault(); dragDepth = 0; ui.workspace.classList.remove('drag-over'); ui['drop-zone'].classList.remove('drag-over');
  const files = [...event.dataTransfer.files];
  const notes = files.filter(file => /\.(md|markdown|txt)$/i.test(file.name));
  const images = files.filter(file => /^image\//.test(file.type));
  if (notes.length > 1) { notify('Drop one Markdown document at a time, with any companion images.'); return; }
  if (notes.length && !await loadFile(notes[0])) return;
  if (images.length) await attachImages(images);
  if (!notes.length && !images.length) notify('Drop a Markdown file or local images.');
});

function updateImageList() {
  ui['image-list'].replaceChildren();
  for (const [key, asset] of assets) {
    const item = document.createElement('li'), name = document.createElement('span'), remove = document.createElement('button');
    name.textContent = asset.name; name.title = key;
    remove.textContent = '×'; remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${asset.name}`);
    remove.addEventListener('click', () => { assets.delete(key); updateImageList(); scheduleRender(); scheduleSave(); });
    item.append(name, remove); ui['image-list'].append(item);
  }
}
async function attachImages(files) {
  let count = 0;
  for (const file of files) {
    if (!/^image\/(png|jpeg|webp|gif|avif)$/i.test(file.type)) { notify(`Unsupported image: ${file.name}. Use PNG, JPEG, WebP, GIF or AVIF.`); continue; }
    try {
      assets.set(file.name, { name: file.name, data: await blobToDataURL(file) }); count++;
    } catch { notify(`Could not read ${file.name}.`); }
  }
  updateImageList(); scheduleRender(); await saveNow();
  if (count) notify(`${count} image${count === 1 ? '' : 's'} attached. Reference ${count === 1 ? 'it' : 'them'} by filename in your Markdown.`);
}
ui['add-images'].addEventListener('click', () => ui['image-input'].click());
ui['image-input'].addEventListener('change', async () => { await attachImages([...ui['image-input'].files]); ui['image-input'].value = ''; });

function saveMarkdown() { download(source.value, `${safeFilename(settings.filename)}.md`, 'text/markdown;charset=utf-8'); }
ui['download-md'].addEventListener('click', saveMarkdown);
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveMarkdown(); }
});
paper.addEventListener('click', async event => {
  const button = event.target.closest('.copy-code');
  if (!button) return;
  try { await navigator.clipboard.writeText(button.closest('.codeblock').querySelector('code').textContent); notify('Code copied to clipboard.'); }
  catch { notify('Clipboard unavailable. Select the code and use your device’s Copy command.'); }
});

async function exportDocument(format) {
  if (exporting) return;
  if (!source.value.trim()) { notify('Add some Markdown before exporting.'); return; }
  exporting = true; ui['export-html'].disabled = true; ui['export-pdf'].disabled = true;
  try {
    await flushRender();
    if (renderError) throw new Error('Resolve the rendering error before exporting.');
    const options = { ...settings };
    let exportRoot = paper;
    if (format === 'pdf') {
      // Diagrams have their own colors; render a light copy as well as changing the page theme.
      const prepared = prepareDocument(source.value, { ...options, theme: 'light' });
      const attached = new Map(assets);
      await finishDiagrams(prepared, 'light'); resolveImages(prepared.root, attached);
      exportRoot = prepared.root;
    }
    const { html, failed } = await prepareExport(exportRoot, options, format);
    if (format === 'html') download(html, `${safeFilename(options.filename)}.html`, 'text/html;charset=utf-8');
    else await printDocument(html);
    const notices = [];
    if (failed.length) notices.push(`${failed.length} linked image(s) could not be embedded and still need internet.`);
    if (missingImages.length) notices.push('Some local images are missing; attach them and export again to include them.');
    if (renderWarnings.length) notices.push('A diagram could not be rendered; its source is included.');
    notify(notices.join(' ') || (format === 'html' ? 'HTML exported with embedded styles, equations and rendered diagrams.' : 'Choose Save as PDF. Your PDF uses white pages and a light document theme.'));
  } catch (error) { notify(error.message || 'Export failed. Please try again.'); }
  finally { exporting = false; ui['export-html'].disabled = false; ui['export-pdf'].disabled = false; }
}
ui['export-html'].addEventListener('click', () => { void exportDocument('html'); });
ui['export-pdf'].addEventListener('click', () => { void exportDocument('pdf'); });

function updateOfflineStatus() {
  const indicator = ui['offline-status'];
  if (import.meta.env.DEV) { indicator.textContent = 'Development preview'; indicator.dataset.state = 'development'; return; }
  const active = navigator.serviceWorker?.controller;
  const ready = Boolean(offlineReady && active);
  indicator.dataset.state = ready ? (navigator.onLine ? 'ready' : 'active') : (navigator.onLine ? 'preparing' : 'unavailable');
  indicator.textContent = ready ? 'Offline' : (navigator.onLine ? 'Preparing offline access…' : 'Offline · cache not ready');
}
window.addEventListener('online', updateOfflineStatus); window.addEventListener('offline', updateOfflineStatus);
navigator.serviceWorker?.addEventListener('controllerchange', () => { offlineReady = true; updateOfflineStatus(); });
if (navigator.serviceWorker?.controller) offlineReady = true;
const updateSW = registerSW({
  immediate: true,
  onOfflineReady() { offlineReady = true; updateOfflineStatus(); },
  onNeedRefresh() { ui['update-banner'].hidden = false; },
  onRegisterError() { ui['offline-status'].textContent = 'Offline setup unavailable'; ui['offline-status'].dataset.state = 'unavailable'; },
});
ui['update-app'].addEventListener('click', async () => {
  if (await saveNow()) await updateSW(true);
  else notify('Local saving is unavailable. Download your Markdown before updating.');
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); pendingInstall = event; ui.install.hidden = false;
});
ui.install.addEventListener('click', async () => {
  if (!pendingInstall) return;
  await pendingInstall.prompt(); await pendingInstall.userChoice; pendingInstall = undefined; ui.install.hidden = true;
});
window.addEventListener('appinstalled', () => { pendingInstall = undefined; ui.install.hidden = true; });
window.addEventListener('pagehide', () => { void saveNow(); });

async function initialize() {
  source.value = example; source.disabled = true;
  try {
    const saved = await readWorkspace();
    if (saved?.version === 1 && typeof saved.source === 'string') {
      source.value = saved.source;
      const stored = saved.settings || {};
      settings = {
        theme: stored.theme === 'light' ? 'light' : 'dark',
        fontSize: Math.min(20, Math.max(12, Number(stored.fontSize) || 14)),
        toc: stored.toc !== false,
        tocPosition: stored.tocPosition === 'left' ? 'left' : 'top',
        wrapText: stored.wrapText !== false,
        pdfStyle: stored.pdfStyle === 'minimal' ? 'minimal' : 'standard',
        pageSize: stored.pageSize === 'Letter' ? 'Letter' : 'A4',
        margins: ['normal', 'narrow', 'wide'].includes(stored.margins) ? stored.margins : 'normal',
        filename: typeof stored.filename === 'string' ? stored.filename.slice(0, 150) : defaults.filename,
        embedRemote: stored.embedRemote !== false,
      };
      inputFilename = typeof saved.inputFilename === 'string' ? saved.inputFilename : 'untitled.md';
      for (const entry of Array.isArray(saved.assets) ? saved.assets : []) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1]?.name === 'string' && /^data:image\/(png|jpeg|webp|gif|avif);base64,/i.test(entry[1]?.data || '')) assets.set(entry[0], entry[1]);
      }
      ui['save-status'].textContent = 'Draft restored from this device';
    }
  } catch { ui['save-status'].textContent = 'Local save unavailable · download your .md'; }
  source.disabled = false; applySettings(); updateImageList(); updateSourceMeta(); updateOfflineStatus();
  renderRevision++; await flushRender();
}
void initialize();
