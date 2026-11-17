import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { groupPrintIntroductions } from '../src/print-layout.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
const { prepareDocument } = await import('../src/render.js');

test('untrusted raw HTML cannot inject scripts, styles, events or app identifiers', () => {
  const prepared = prepareDocument('# Test\n\n<script>alert(1)</script><style>body{display:none}</style><img src=x onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a><div id="export-html" style="position:fixed">text</div>', { toc: true });
  const root = prepared.root;
  assert.equal(root.querySelector('script,style,[onerror],[style="position:fixed"]'), null);
  assert.equal(root.querySelector('[id="export-html"]'), null);
  assert.equal(root.querySelector('[id="doc-export-html"]').textContent, 'text');
  assert.equal(root.querySelector('a[href^="javascript:"]'), null);
});

test('TOC can be omitted and heading links preserve valid IDs', () => {
  const source = '# One\n\n## Two\n\n[Jump](#two)';
  const withContents = prepareDocument(source, { toc: true }).root;
  assert.equal(withContents.querySelectorAll('.toc li').length, 2);
  for (const link of withContents.querySelectorAll('a[href^="#"]')) {
    assert.ok(withContents.querySelector(`[id="${link.getAttribute('href').slice(1)}"]`));
  }
  assert.equal(prepareDocument(source, { toc: false }).root.querySelector('.toc'), null);
});

test('checkbox tasks, callouts, details and math survive sanitization', () => {
  const root = prepareDocument('- [x] Ready\n\n> [!WARNING]\n> Check context.\n\n<details><summary>More</summary>Text</details>\n\n$\\frac{1}{2}$', { toc: false }).root;
  assert.ok(root.querySelector('input[type=checkbox]:disabled:checked'));
  assert.ok(root.querySelector('.callout-warning .callout-title'));
  assert.ok(root.querySelector('details summary'));
  assert.ok(root.querySelector('.katex .mfrac'));
});

test('sidebar contents wrap content without losing anchors', () => {
  const root = prepareDocument('# Runbook\n\n## Deploy\n\nText\n\n## Verify\n\nMore text', { toc: true, tocPosition: 'left' }).root;
  const layout = root.querySelector('.document-layout');
  assert.equal(layout.dataset.tocPosition, 'left');
  assert.ok(layout.querySelector(':scope > .toc'));
  assert.equal(layout.querySelector('.document-content .toc'), null);
  assert.equal(layout.querySelectorAll('.document-content h1,.document-content h2').length, 3);
  for (const link of layout.querySelectorAll('.toc a')) assert.ok(root.querySelector(`[id="${link.getAttribute('href').slice(1)}"]`));
  assert.equal(prepareDocument('# Runbook', { toc: false, tocPosition: 'left' }).root.querySelector('.document-layout').dataset.tocPosition, 'top');
});

test('print groups keep short heading introductions with code without swallowing sections', () => {
  const root = prepareDocument('# Runbook\n\n## Ingress\n\nFinal working ingress:\n\n```yaml\nkind: Ingress\n```\n\nApply:\n\n```bash\nkubectl apply -f ingress.yaml\n```\n\n## Next section\n\nSummary.', { toc: false }).root;
  const text = root.textContent;
  groupPrintIntroductions(root);
  const groups = [...root.querySelectorAll('.print-lead')];
  assert.equal(groups.length, 2);
  assert.ok(groups[0].querySelector('h2'));
  assert.match(groups[0].textContent, /Final working ingress:/);
  assert.ok(groups[0].querySelector('.codeblock'));
  assert.equal(groups[1].querySelector('h2'), null);
  assert.equal(root.querySelectorAll('.print-lead h2').length, 1);
  assert.equal(root.textContent, text);
  groupPrintIntroductions(root);
  assert.equal(root.querySelectorAll('.print-lead').length, 2);
});
