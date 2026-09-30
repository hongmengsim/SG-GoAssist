// Updates a region of the page to match new HTML while keeping the elements that did not change.
//
// Replacing a region's innerHTML throws away every element in it: the field the operator is
// typing in loses its focus and its text, an open drop-down closes, and a banner that has not
// changed is announced again. Here the new HTML is compared with what is on the page and only the
// differences are written, so an element that is still the same element is never recreated.

function syncAttributes(current, next) {
  for (const { name } of [...current.attributes])
    if (!next.hasAttribute(name)) current.removeAttribute(name);
  for (const { name, value } of [...next.attributes])
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  // A typed value or a chosen option is a property, not an attribute: leave the user's alone.
}

function sameKind(current, next) {
  return (
    current.nodeType === next.nodeType &&
    (current.nodeType !== 1 || current.tagName === next.tagName)
  );
}

function syncNode(current, next) {
  if (current.nodeType === 3 || current.nodeType === 8) {
    if (current.data !== next.data) current.data = next.data;
    return;
  }
  syncAttributes(current, next);
  syncChildren(current, next);
}

function syncChildren(target, source) {
  const wanted = [...source.childNodes];
  const existing = [...target.childNodes];
  wanted.forEach((node, index) => {
    const current = existing[index];
    if (!current) {
      target.appendChild(node);
    } else if (sameKind(current, node)) {
      syncNode(current, node);
    } else {
      target.replaceChild(node, current);
    }
  });
  for (const extra of existing.slice(wanted.length)) target.removeChild(extra);
}

/** Makes `target`'s contents equal `html`, changing as little of the page as possible. */
export function patchInner(target, html) {
  const holder = target.ownerDocument.createElement("template");
  holder.innerHTML = html;
  syncChildren(target, holder.content);
}
