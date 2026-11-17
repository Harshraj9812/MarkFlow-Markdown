import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMarkdown } from '../src/markdown.js';
import { imageKey, findImage } from '../src/images.js';

test('runbook retains rich structures, diagrams and generated math', () => {
  const result = parseMarkdown(readFileSync(new URL('../src/example.md', import.meta.url), 'utf8'));
  assert.equal(result.diagrams.length, 2);
  assert.ok(result.math.length >= 4);
  assert.match(result.math.join(''), /katex/);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /task-list-item/);
  assert.match(result.html, /<details>/);
  assert.match(result.html, /footnotes/);
  assert.match(result.html, /hljs-attr/);
});

test('duplicate and non-ASCII headings have unique usable anchors', () => {
  const result = parseMarkdown('# Setup\n\n## Setup\n\n## उपयोग\n\n## !!!');
  const ids = result.headings.map(heading => heading.id);
  assert.equal(new Set(ids).size, 4);
  assert.ok(ids.includes('उपयोग'));
  assert.ok(ids.includes('heading'));
});

test('fenced HTML and unknown code languages remain escaped', () => {
  const result = parseMarkdown('```unknown\n<script>alert(1)</script>\n```\n\n```bash\necho "$HOME"\n```');
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.html, /hljs-/);
});

test('math does not permit trusted HTML extensions', () => {
  const result = parseMarkdown('$\\href{javascript:alert(1)}{bad}$');
  assert.doesNotMatch(result.math.join(''), /href="javascript:/i);
});

test('local image matching handles paths, URL encoding and ambiguous basenames', () => {
  const a = { name: 'screen shot.png', data: 'a' };
  const assets = new Map([['screen shot.png', a]]);
  assert.equal(imageKey('./images/screen%20shot.png?v=1'), 'images/screen shot.png');
  assert.equal(findImage('./images/screen%20shot.png', assets), a);
  assets.set('other/screen shot.png', { name: 'screen shot.png', data: 'b' });
  assert.equal(findImage('unknown/screen shot.png', assets), undefined);
});
