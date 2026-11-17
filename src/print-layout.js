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
