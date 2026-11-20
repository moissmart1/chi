// The sign's markup (js/views/sign.js), with a very small stand-in for the DOM.
import test from "node:test";
import assert from "node:assert/strict";

function node(tag) {
  const n = { tag, attrs: {}, kids: [], cls: "" };
  n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
  n.append = (...k) => { for (const x of k) n.kids.push(x); };
  n.appendChild = (x) => { n.kids.push(x); return x; };
  Object.defineProperty(n, "className", { get: () => n.cls, set: (v) => { n.cls = v; } });
  Object.defineProperty(n, "textContent", { set: (v) => { n.kids = [String(v)]; }, get: () => n.kids.map((k) => (typeof k === "string" ? k : k.textContent)).join("") });
  n.classList = { add: (...c) => { n.cls = (n.cls ? n.cls + " " : "") + c.join(" "); } };
  return n;
}
const html = (n) => (typeof n === "string" ? n : "<" + n.tag + (n.cls ? ' class="' + n.cls + '"' : "") + Object.entries(n.attrs).map(([k, v]) => " " + k + '="' + v + '"').join("") + ">" + n.kids.map(html).join("") + "</" + n.tag + ">");

globalThis.document = { createElement: (t) => node(t), createElementNS: (_ns, t) => node(t), createTextNode: (t) => String(t) };
const { bladeEl, plainBlade, nearestEl } = await import("../js/views/sign.js");

test("bladeEl: one block, several, this block, and past sixteen", () => {
  assert.equal(html(bladeEl({ blocks: 1, dir: "N" })), '<span class="g-bl" role="img" aria-label="1 block north"><b>1</b>BLOCK<i>N</i></span>');
  assert.equal(html(bladeEl({ blocks: 4, dir: "S" })), '<span class="g-bl" role="img" aria-label="4 blocks south"><b>4</b>BLOCKS<i>S</i></span>');
  assert.equal(html(bladeEl({ blocks: 16, dir: "E" })), '<span class="g-bl" role="img" aria-label="16 blocks east"><b>16</b>BLOCKS<i>E</i></span>');
  assert.equal(html(bladeEl({ blocks: 0, dir: "W" })), '<span class="g-bl pl" role="img" aria-label="On this block">THIS BLOCK</span>');
  assert.equal(html(bladeEl({ blocks: null, dir: "W" })), '<span class="g-bl far" role="img" aria-label="west"><i>W</i></span>');
});

test("plainBlade: words on a sign, hidden from a screen reader", () => {
  assert.equal(html(plainBlade("FROM HERE")), '<span class="g-bl pl" aria-hidden="true">FROM HERE</span>');
  assert.equal(html(plainBlade("NO CORNER YET", { off: true })), '<span class="g-bl pl off" aria-hidden="true">NO CORNER YET</span>');
  assert.equal(html(plainBlade("West Loop", { cls: "g-cap" })), '<span class="g-bl pl g-cap" aria-hidden="true">West Loop</span>');
});

test("nearestEl: the NEAREST sign", () => {
  const s = nearestEl();
  assert.equal(s.tag, "svg");
  assert.equal(s.attrs["aria-label"], "Nearest");
  assert.equal(s.attrs.role, "img");
  assert.equal(s.attrs.viewBox, "0 0 96 24");
  assert.equal(s.attrs.class, "g-ow");
  assert.equal(s.textContent, "NEAREST");
});
