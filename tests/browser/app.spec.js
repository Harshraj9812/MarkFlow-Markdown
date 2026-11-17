import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('headings · Ready');
}

test('renders sample, switches document theme and toggles generated contents', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await expect(page.locator('.document .diagram svg')).toHaveCount(2);
  await expect(page.locator('.document .diagram').first()).toContainText('API service');
  await expect(page.locator('.document .katex')).toHaveCount(5);
  await expect(page.locator('.document input:checked')).toHaveCount(2);
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('#document')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('checkbox', { name: 'Table of contents', exact: true }).uncheck();
  await expect(page.locator('#document .toc')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Table of contents', exact: true }).check();
  await expect(page.locator('#document .toc')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('file import and images persist, export opens independently offline', async ({ page, context }, testInfo) => {
  await ready(page);
  await page.locator('#file-input').setInputFiles({ name: 'my-runbook.md', mimeType: 'text/markdown', buffer: Buffer.from('# My runbook\n\n![Shot](images/shot.png)\n\n$x^2$\n\n```mermaid\nflowchart LR\n A[Build] --> B[Deploy]\n```') });
  await expect(page.locator('#document h1')).toHaveText('My runbook');
  await expect(page.locator('#render-warning')).toContainText('shot.png');
  const image = await readFile('public/icon-192.png');
  await page.locator('#image-input').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('#document img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload(); await expect(page.locator('#render-status')).toContainText('Ready');
  await expect(page.locator('#source')).toHaveValue(/My runbook/);
  await expect(page.locator('#document img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export HTML/ }).click();
  const downloaded = await pending; const path = testInfo.outputPath('export.html'); await downloaded.saveAs(path);
  const html = await readFile(path, 'utf8');
  expect(html).not.toMatch(/<script\b/i); expect(html).not.toMatch(/url\(fonts\//);
  expect(html).toContain('data:font/woff2;base64,');
  await context.setOffline(true);
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator('h1')).toHaveText('My runbook');
  await expect(page.locator('.diagram svg')).toHaveCount(1);
  await expect(page.locator('.diagram')).toContainText('Deploy');
  await expect(page.locator('.katex')).toHaveCount(1);
  expect(await page.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [...document.fonts].some(font => font.status === 'loaded'))).toBe(true);
});

test('offline reload can render a new diagram engine and new math', async ({ page, context }) => {
  await ready(page);
  await expect(page.locator('#offline-status')).toHaveText('Offline ready', { timeout: 30000 });
  await expect(page.locator('#offline-status')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#offline-status')).toHaveCSS('color', 'rgb(169, 240, 209)');
  await context.setOffline(true);
  await page.reload(); await expect(page.locator('#render-status')).toContainText('Ready');
  await expect(page.locator('#offline-status')).toHaveText('Working offline');
  await expect(page.locator('#offline-status')).toHaveAttribute('data-state', 'active');
  await page.locator('#source').fill('# Offline note\n\n$\\sum_{i=1}^{n} i$\n\n```mermaid\npie title Resources\n "CPU" : 40\n "Memory" : 60\n```');
  await expect(page.locator('#document h1')).toHaveText('Offline note');
  await expect(page.locator('#document .diagram svg')).toHaveCount(1);
  await expect(page.locator('#document .katex')).toHaveCount(1);
  await expect(page.locator('#render-warning')).toBeHidden();
});

test('drag and drop, unsafe HTML and invalid Mermaid are handled', async ({ page }) => {
  await ready(page);
  await page.locator('#drop-zone').dispatchEvent('drop', await page.evaluateHandle(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['# Dropped\n\n<script>window.pwned=true</script><img src=x onerror="window.pwned=true">\n\n```mermaid\ninvalid this is not a diagram\n```'], 'dropped.md', { type: 'text/markdown' }));
    return { dataTransfer: transfer };
  }));
  await expect(page.locator('#document h1')).toHaveText('Dropped');
  await expect(page.locator('#render-warning')).toContainText('Mermaid');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(page.locator('#document script, #document [onerror]')).toHaveCount(0);
  await page.locator('#source').fill('# Fixed\n\n```mermaid\nflowchart LR\n A --> B\n```');
  await expect(page.locator('#document h1')).toHaveText('Fixed');
  await expect(page.locator('#document .diagram svg')).toHaveCount(1);
});

test('mobile layout and PDF print view include document content', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await ready(page);
  await expect(page.locator('#editor-panel')).toBeHidden();
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
  await expect(page.locator('#source')).toBeVisible();
  await page.locator('#source').fill('# Mobile guide\n\n$$\n\\frac{a}{b}\n$$\n\n```bash\necho hello\n```\n\n```mermaid\nflowchart LR\n A[Build] --> B[Deploy]\n```\n\n<details><summary>More</summary>Printable detail</details>');
  await page.getByRole('tab', { name: 'Document preview' }).click();
  await expect(page.locator('#document h1')).toHaveText('Mobile guide');
  await expect(page.locator('#document')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'PDF appearance' }).selectOption('minimal');
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { window.__printed = 0; });
  // Stub only the native dialog; keep document generation, fonts and layout real.
  await page.evaluate(() => {
    const append = document.body.append.bind(document.body);
    document.body.append = (...nodes) => {
      for (const node of nodes) if (node.tagName === 'IFRAME') node.addEventListener('load', () => { node.contentWindow.print = () => { window.__printed++; }; });
      return append(...nodes);
    };
  });
  await page.getByRole('button', { name: /Save as PDF/ }).click();
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  const frame = page.frameLocator('.print-frame');
  await expect(frame.locator('h1')).toHaveText('Mobile guide');
  await expect(frame.locator('details')).toHaveAttribute('open', '');
  await expect(frame.locator('.katex')).toHaveCount(1);
  await expect(frame.locator('.document')).toHaveAttribute('data-theme', 'light');
  await expect(frame.locator('.document')).toHaveAttribute('data-pdf-style', 'minimal');
  await expect(frame.locator('.codeblock')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(frame.locator('.diagram')).toContainText('Deploy');
  const printHTML = await page.locator('.print-frame').getAttribute('srcdoc');
  const printPage = await page.context().newPage(); await printPage.setContent(printHTML);
  const pdf = await printPage.pdf({ path: testInfo.outputPath('mobile-guide.pdf'), printBackground: true, preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF'); expect(pdf.length).toBeGreaterThan(10000);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('mobile navigation stays at the bottom and editor wrap preserves text and line numbers', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
  const note = '# Wrapped note\n' + 'A long Markdown paragraph with spaces and documentation. '.repeat(12) + '\nThird source line';
  await page.locator('#source').fill(note);
  await expect(page.getByRole('checkbox', { name: 'Wrap text' })).toBeChecked();
  await expect(page.locator('#source')).toHaveCSS('white-space', 'pre-wrap');
  await expect.poll(() => page.locator('#gutter').textContent()).toMatch(/2\n\n+3/);
  await page.getByRole('checkbox', { name: 'Wrap text' }).uncheck();
  await expect(page.locator('#source')).toHaveCSS('white-space', 'pre');
  await expect(page.locator('#source')).toHaveValue(note);
  await expect(page.locator('#gutter')).toHaveText('1\n2\n3');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload(); await expect(page.locator('#render-status')).toContainText('Ready');
  await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Wrap text' })).not.toBeChecked();
  await expect(page.locator('#source')).toHaveValue(note);
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'PDF appearance' })).toBeVisible();
  await expect(page.locator('#source')).toBeHidden();
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const nav = await page.getByRole('tablist', { name: 'Workspace view' }).boundingBox();
  expect(Math.round(nav.y + nav.height)).toBe(844);
  await page.getByRole('tab', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: /Export HTML/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'PDF appearance' })).toBeHidden();
});

test('sidebar contents persist and adapt in standalone HTML and print', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await ready(page);
  await page.getByRole('combobox', { name: 'Contents position' }).selectOption('left');
  const layout = page.locator('#document .document-layout');
  for (const width of [1280, 1740]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(layout).toHaveCSS('display', 'grid');
    const toc = await layout.locator(':scope > .toc').boundingBox();
    const content = await layout.locator('.document-content').boundingBox();
    expect(toc.x + toc.width).toBeLessThan(content.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`sidebar-split-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(layout).toHaveCSS('display', 'block');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole('button', { name: 'Expand preview' }).click();
  await expect(layout).toHaveCSS('display', 'grid');
  expect(await layout.locator(':scope > .toc').evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(240);
  await expect(layout.locator('.toc a').first()).toHaveCSS('font-size', '13px');
  await page.screenshot({ path: testInfo.outputPath('sidebar-preview.png'), fullPage: true });
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload(); await expect(page.locator('#render-status')).toContainText('headings · Ready');
  await expect(page.getByRole('combobox', { name: 'Contents position' })).toHaveValue('left');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export HTML/ }).click();
  const file = await pending, path = testInfo.outputPath('sidebar.html'); await file.saveAs(path);
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator('.document-layout')).toHaveCSS('display', 'grid');
  await page.screenshot({ path: testInfo.outputPath('sidebar-export.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.document-layout')).toHaveCSS('display', 'grid');
  await expect(page.locator('.toc')).toHaveCSS('position', 'static');
  const pdf = await page.pdf({ path: testInfo.outputPath('sidebar.pdf'), printBackground: true, preferCSSPageSize: true });
  expect(pdf.length).toBeGreaterThan(10000);
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.document-layout')).toHaveCSS('display', 'block');
  await expect(page.locator('.document-content')).toHaveCSS('column-count', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('PDF keeps introductions with code, preserves oversized blocks and uses a white light-theme page', async ({ page }, testInfo) => {
  test.skip(Boolean(spawnSync('pdftotext', ['-v']).error), 'PDF pagination checks require Poppler pdftotext.');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await ready(page);
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  const paragraphs = 'Review the deployment, verify the active context, and record the outcome before continuing. '.repeat(6);
  const blocks = Array.from({ length: 10 }, (_, index) => {
    const id = String(index).padStart(2, '0');
    return `${paragraphs}\n\n## Deployment phase ${id}\n\nINTRO${id} Final working configuration:\n\n\`\`\`text\nBLOCK${id}BEGIN\n${Array.from({ length: 10 }, (_, row) => `value${row}=ready`).join('\n')}\nBLOCK${id}END\n\`\`\``;
  });
  const oversized = '\n\n## Extended log\n\n```text\nOVERSIZEDBEGIN\n' + Array.from({ length: 160 }, (_, row) => `LOG${row}OK`).join('\n') + '\nOVERSIZEDEND\n```';
  await page.locator('#source').fill('# Pagination check\n\n' + blocks.join('\n\n') + oversized);
  await expect(page.locator('#document h1')).toHaveText('Pagination check');
  for (const position of ['top', 'left']) {
    await page.getByRole('combobox', { name: 'Contents position' }).selectOption(position);
    await expect(page.locator('.document-layout')).toHaveAttribute('data-toc-position', position);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export HTML/ }).click();
    const file = await downloadEvent, htmlPath = testInfo.outputPath(`pagination-${position}.html`);
    await file.saveAs(htmlPath);
    const exported = await page.context().newPage();
    await exported.goto(pathToFileURL(htmlPath).href);
    await exported.emulateMedia({ media: 'print' });
    await expect(exported.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    const pdfPath = testInfo.outputPath(`pagination-${position}.pdf`);
    await exported.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
    const extraction = spawnSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
    expect(extraction.status).toBe(0);
    const pages = extraction.stdout.split('\f').map(text => text.replace(/\s+/g, ''));
    for (let index = 0; index < 10; index++) {
      const id = String(index).padStart(2, '0');
      const start = pages.findIndex(text => text.includes(`BLOCK${id}BEGIN`));
      expect(start, `${position}: missing code block ${id}`).toBeGreaterThanOrEqual(0);
      expect(pages[start], `${position}: block ${id} crossed a page boundary`).toContain(`BLOCK${id}END`);
      expect(pages[start], `${position}: heading ${id} was left on the previous page`).toContain(`Deploymentphase${id}`);
      expect(pages[start], `${position}: introduction ${id} was left on the previous page`).toContain(`INTRO${id}`);
    }
    const allText = pages.join('');
    expect(allText).toContain('OVERSIZEDBEGIN'); expect(allText).toContain('OVERSIZEDEND');
    for (let row = 0; row < 160; row++) expect(allText).toContain(`LOG${row}OK`);
    await exported.close();
  }
});
