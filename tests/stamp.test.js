import test from "node:test";
import assert from "node:assert/strict";
import { rng, paidStampSVG, gateStampSVG } from "../js/stamp.js";
import { remindText, sentCents } from "../js/views/slip.js";

test("a stamp is drawn from its seed: the same seed, the same stamp", () => {
  assert.equal(paidStampSVG(42), paidStampSVG(42));
  assert.notEqual(paidStampSVG(42), paidStampSVG(43));
  assert.ok(paidStampSVG(42).startsWith("<svg"));
});

test("the paid stamp is the time-clock's PAID print, with the day and time it was stamped", () => {
  // 13:22 on Dec 28 on the phone's own clock (the test runs in any zone: build the instant locally).
  const at = new Date(2026, 11, 28, 13, 22).getTime();
  const svg = paidStampSVG(42, at);
  assert.ok(svg.includes(">PAID<") && svg.includes("12/28 13:22"), svg.slice(-400));
  assert.ok(svg.includes("#6B2A8C") && svg.includes("VT323"));
  assert.equal(/済|Zen|Mincho/.test(svg), false);
  // No time known: PAID alone.
  assert.equal(/\d\/\d/.test(paidStampSVG(42, NaN)), false);
  assert.equal(paidStampSVG(42, "<x>"), paidStampSVG(42, NaN), "the time is read as a number");
});

test("rng is deterministic and stays between 0 and 1", () => {
  const a = rng(7);
  const b = rng(7);
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
  for (const v of first) assert.ok(v >= 0 && v < 1, String(v));
  assert.notDeepEqual([rng(8)(), rng(8)(), rng(8)()], first);
});

test("the stamp SVG is built only from numbers and constants", () => {
  // No text from outside ever reaches it, so innerHTML is safe for it.
  const svg = paidStampSVG(123456);
  assert.equal(/[<>]\s*script/i.test(svg), false);
  assert.equal(paidStampSVG("1<x>"), paidStampSVG(1), "a seed is read as a number");
});

test("the served print says SERVED with its date, place and mark, the same from the same seed", () => {
  const svg = gateStampSVG(1211, "West Loop", "12.11", "Wendy’s");
  for (const s of ["SERVED", "West Loop", "12.11", "WENDY’S"]) assert.ok(svg.includes(s), s);
  // The time-clock print of the guest check: purple ink in the register face, no Japanese face.
  assert.ok(svg.includes("#6B2A8C") && svg.includes("VT323"), svg.slice(0, 300));
  assert.equal(/Zen|Hiragino|Mincho/.test(svg), false);
  assert.ok(svg.startsWith("<svg"));
  assert.equal(gateStampSVG(1211, "West Loop", "12.11", "Wendy’s"), svg);
  assert.notEqual(gateStampSVG(1212, "West Loop", "12.11", "Wendy’s"), svg);
});

test("the gate stamp escapes what it prints", () => {
  const svg = gateStampSVG(1, "<b>", "x", "y");
  assert.ok(svg.includes("&lt;b&gt;"));
  assert.equal(svg.includes("<b>"), false);
  const quoted = gateStampSVG(1, "a", '"&', "'");
  assert.ok(quoted.includes("&quot;&amp;") && quoted.includes("&#39;"));
});

test("Remind says who, how much and where to send it", () => {
  const people = [{ name: "Mo", etransfer: "mo@example.com" }];
  assert.equal(
    remindText("Mo", { from: "Izzah", to: "Mo", cents: 25030 }, people),
    "Izzah, you owe me $250.30 for the Chicago trip. e-Transfer: mo@example.com",
  );
  assert.equal(remindText("Mo", { from: "Izzah", to: "Mo", cents: 25030 }, [{ name: "Mo", etransfer: "" }]), "Izzah, you owe me $250.30 for the Chicago trip.");
  assert.equal(remindText("Mo", { from: "Izzah", to: "Mo", cents: 25030 }, []), "Izzah, you owe me $250.30 for the Chicago trip.");
});

test("what was sent is read as dollars and cents, on the string", () => {
  assert.equal(sentCents("250"), 25000);
  assert.equal(sentCents("250.3"), 25030);
  assert.equal(sentCents("250.30"), 25030);
  assert.equal(sentCents(" 0.29 "), 29);
  assert.equal(sentCents("100000"), 10000000);
  assert.equal(sentCents("1121.35"), 112135);
  // A decimal comma (some iPhone keypads) and a leading dot.
  assert.equal(sentCents("250,30"), 25030);
  assert.equal(sentCents("250,3"), 25030);
  assert.equal(sentCents(".5"), 50);
  assert.equal(sentCents(",05"), 5);
  for (const bad of ["", ".", ",", "0", "0.00", ",00", "-5", "100000.01", "250.301", "250,301", "2,500", "1,2,3", "1.2,3", "$250", "abc", "1e3", "5.", "5,", "12 3", "Infinity"]) {
    assert.equal(sentCents(bad), null, JSON.stringify(bad));
  }
});

test("the routing sentence says who is paid through whom, from the viewer's side", async () => {
  const { routeSentence } = await import("../js/views/working.js");
  const row = { from: "Mo", to: "Sam", cents: 1000 };
  assert.equal(routeSentence(row, "Izzah", "Mo"), "You pay Sam because you owe Izzah and Izzah owes Sam. Fewer payments, same totals.");
  assert.equal(routeSentence(row, "Izzah", "Sam"), "Mo pays you because Mo owes Izzah and Izzah owes you. Fewer payments, same totals.");
  assert.equal(routeSentence(row, "Izzah", "Izzah"), "Mo pays Sam because Mo owes you and you owe Sam. Fewer payments, same totals.");
  assert.equal(routeSentence(row, "others", "Mo"), "You pay Sam to cover what the others owe. Fewer payments, same totals.");
});

test("the working: paid, share, sent, and received only when not zero", async () => {
  const { workingLines } = await import("../js/views/working.js");
  const w = { paid: 0, share: 1000, sent: 0, received: 0 };
  assert.deepEqual(workingLines("Mo", w, "Mo").map((l) => l.label), ["You paid", "Your share came to", "Already sent"]);
  const other = workingLines("Izzah", { ...w, received: 400 }, "Mo");
  assert.deepEqual(other.map((l) => [l.label, l.cents]), [["Izzah paid", 0], ["Izzah’s share came to", 1000], ["Already sent", 0], ["Already received", 400]]);
  assert.equal(other[0].paid, true);
});
