import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('local Markdown processing does not send document text or local image references over the network', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('Ready');
  await expect(page.locator('#offline-status')).toHaveText('Offline');
  const requests = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() || '' }));
  await page.route('**/*MARKFLOW_PRIVATE*', route => route.abort());
  await page.locator('#source').fill('# MARKFLOW_PRIVATE_DOCUMENT\n\nLocal note.\n\n![Private screenshot](MARKFLOW_PRIVATE_SCREENSHOT.png?token=MARKFLOW_PRIVATE_TOKEN)');
  await expect(page.locator('#document h1')).toHaveText('MARKFLOW_PRIVATE_DOCUMENT');
  await expect(page.locator('#render-warning')).toContainText('MARKFLOW_PRIVATE_SCREENSHOT');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export HTML/ }).click(); await pending;
  expect(requests.filter(request => request.url.includes('MARKFLOW_PRIVATE') || request.body.includes('MARKFLOW_PRIVATE') || request.method !== 'GET')).toEqual([]);
});

test('imported HTML cannot overlay the app using its UI classes or execute script', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#render-status')).toContainText('Ready');
  await page.locator('#source').fill('# Security check\n\n<div class="toast mobile-tabs topbar" id="source">Injected overlay</div>\n\n<img src=x onerror="window.__markflowSecurityExecuted=true"><iframe srcdoc="<script>parent.__markflowSecurityExecuted=true</script>"></iframe>\n\n<script>window.__markflowSecurityExecuted=true</script>');
  await expect(page.locator('#document h1')).toHaveText('Security check');
  await expect(page.locator('#document .toast,#document .mobile-tabs,#document .topbar')).toHaveCount(0);
  await expect(page.locator('#document script,#document iframe,#document [onerror]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__markflowSecurityExecuted)).toBeUndefined();
  await page.evaluate(() => {
    const script = document.createElement('script'); script.textContent = 'window.__markflowInlineExecuted=true'; document.body.append(script); script.remove();
  });
  expect(await page.evaluate(() => window.__markflowInlineExecuted)).toBeUndefined();
});

test('explicit external images still display and can be embedded without a referrer', async ({ page }) => {
  const png = await readFile('public/icon-192.png');
  await page.route('https://images.example.test/screenshot.png', route => route.fulfill({ body: png, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/'); await expect(page.locator('#render-status')).toContainText('Ready');
  await page.locator('#source').fill('# External image\n\n![Screenshot](https://images.example.test/screenshot.png)');
  await expect(page.locator('#document img')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect.poll(() => page.locator('#document img').evaluate(image => image.naturalWidth)).toBe(192);
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: /Export HTML/ }).click();
  const download = await pending;
  const html = await readFile(await download.path(), 'utf8');
  expect(html).toContain('data:image/png;base64,');
  expect(html).not.toContain('src="https://images.example.test/');
});
