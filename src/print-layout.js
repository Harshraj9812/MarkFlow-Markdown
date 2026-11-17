// Group only the short introduction immediately preceding a code block.
// A whole section may be several pages long and must remain free to paginate.
export function groupPrintIntroductions(root) {
  for (const block of root.querySelectorAll('.codeblock, pre')) {
    if (block.closest('.print-lead') || (block.tagName === 'PRE' && block.closest('.codeblock'))) continue;
    let first = block, previous = block.previousElementSibling, paragraphs = 0;
    while (previous && paragraphs < 4) {
      if (/^H[1-6]$/.test(previous.tagName)) { first = previous; break; }
      if (previous.tagName !== 'P' || previous.textContent.length > 500 || previous.querySelector('img')) break;
      first = previous; previous = previous.previousElementSibling; paragraphs++;
    }
    if (first === block) continue;
    const group = root.ownerDocument.createElement('div'); group.className = 'print-lead';
    first.before(group);
    let node = first;
    while (node) {
      const next = node.nextSibling; group.append(node);
      if (node === block) break;
      node = next;
    }
  }
}

let printCounter = 0;

export function preparePrintContent(html, hostDocument) {
  const parsed = new hostDocument.defaultView.DOMParser().parseFromString(html, 'text/html');
  const main = parsed.querySelector('main.document');
  if (!main) throw new Error('Could not prepare the print document.');
  const container = hostDocument.createElement('section');
  container.className = 'print-document document-host theme-light';
  container.setAttribute('aria-hidden', 'true');
  const content = hostDocument.importNode(main, true);
  const prefix = `markflow-print-${++printCounter}-`;
  const ids = new Map();
  // The live preview remains in the DOM. Give print anchors distinct IDs so a
  // fragment cannot resolve to its hidden preview counterpart instead.
  for (const node of content.querySelectorAll('[id]')) {
    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    const original = node.id; node.id = prefix + original; ids.set(original, node.id);
  }
  for (const link of content.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    if (href.startsWith('#')) {
      let target = href.slice(1);
      try { target = decodeURIComponent(target); } catch { /* Keep literal fragment. */ }
      if (ids.has(target)) link.setAttribute('href', `#${ids.get(target)}`);
    }
    link.removeAttribute('target');
  }
  content.querySelectorAll('details').forEach(details => { details.open = true; });
  container.append(content);
  const style = hostDocument.createElement('style'); style.media = 'print';
  style.textContent = [...parsed.querySelectorAll('head style')].map(node => node.textContent).join('\n') + `
@media print {
  html,body{height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;color-scheme:light!important}
  body{display:block!important;background:#fff!important;padding:0!important;margin:0!important}
  body>:not(.print-document){display:none!important}
  body>.print-document{display:block!important;position:static!important;inset:auto!important;width:auto!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff!important;pointer-events:auto}
}`;
  return { container, style, title: parsed.title };
}
