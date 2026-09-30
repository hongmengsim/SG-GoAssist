import test from "node:test";
import assert from "node:assert/strict";
import { patchInner } from "../src/domPatch.js";

// jsdom arrives with the workspace's other packages; without it these tests skip rather than fail.
const jsdom = await import("jsdom").catch(() => undefined);
const JSDOM = jsdom?.JSDOM;
const skip = JSDOM ? undefined : "jsdom is not installed";

function page(html) {
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`);
  return { dom, root: dom.window.document.getElementById("root") };
}

test("an unchanged region is left untouched", { skip }, () => {
  const { root } = page("<p>hello</p>");
  const before = root.firstChild;
  patchInner(root, "<p>hello</p>");
  assert.equal(root.firstChild, before);
});

test("a changed text node is updated in place and its element is kept", { skip }, () => {
  const { root } = page('<p class="a">age 5 s</p>');
  const paragraph = root.firstChild;
  patchInner(root, '<p class="a">age 10 s</p>');
  assert.equal(root.firstChild, paragraph);
  assert.equal(paragraph.textContent, "age 10 s");
});

test("a field keeps its focus and what was typed while the rest of the page is redrawn", { skip }, () => {
  const { dom, root } = page('<input id="t"><span>1</span>');
  const input = root.querySelector("#t");
  input.focus();
  input.value = "secret-typed";
  patchInner(root, '<input id="t"><span>2</span>');
  assert.equal(root.querySelector("#t"), input);
  assert.equal(dom.window.document.activeElement, input);
  assert.equal(input.value, "secret-typed");
  assert.equal(root.querySelector("span").textContent, "2");
});

test("attributes are added, changed and removed", { skip }, () => {
  const { root } = page('<button class="a" disabled>Go</button>');
  const button = root.firstChild;
  patchInner(root, '<button class="b" data-x="1">Go</button>');
  assert.equal(root.firstChild, button);
  assert.equal(button.className, "b");
  assert.equal(button.hasAttribute("disabled"), false);
  assert.equal(button.getAttribute("data-x"), "1");
});

test("a different structure is replaced, added to and removed from correctly", { skip }, () => {
  const { root } = page("<p>a</p><p>b</p>");
  patchInner(root, "<div>x</div><p>b</p><p>c</p>");
  assert.equal(root.innerHTML, "<div>x</div><p>b</p><p>c</p>");
  patchInner(root, "<p>only</p>");
  assert.equal(root.innerHTML, "<p>only</p>");
});

test("the result always equals what a plain innerHTML would have produced", { skip }, () => {
  const cases = [
    ["<ul><li>1</li><li>2</li></ul>", "<ul><li>2</li></ul>"],
    ["<p>a</p>", "text only"],
    ["", "<b>new</b>"],
    ["<a href='#x'>go</a>", "<a href='#y' class='z'>go</a>"],
  ];
  for (const [from, to] of cases) {
    const { root } = page(from);
    patchInner(root, to);
    const expected = page(to).root.innerHTML;
    assert.equal(root.innerHTML, expected, `${from} -> ${to}`);
  }
});
