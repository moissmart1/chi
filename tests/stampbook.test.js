/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The stamp book without a screen: when a stamp is open (in Chicago time,
// whatever zone the phone is in), how a stamp is drawn, and the small texts.
// Every definition here is invented.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INKS, MOTIFS, bookStampSVG, placemat, windowOf, stateOf, countText, tiltOf, usableDefs, spanText, lockedLine, tripClock, tripDate, esc, summary } from "../js/stampbook.js";

const D1 = { id: "d1", date: "2030-01-05", name_ja: "試験", name_en: "Testville", place: "Test Hall", motif: "lantern", ink: "shu", shape: "round" };
const D2 = { id: "d2", date: "2030-01-06", name_ja: "二", name_en: "Second", place: "Second Place", motif: "tower", ink: "ai", shape: "square" };
const ISS = { id: "iss", date: "", name_ja: "発行", name_en: "Issued", place: "", motif: "crest", ink: "shu", shape: "round" };
const DEFS = [D1, D2, ISS];
const OPENS = Date.UTC(2030, 0, 5, 6); // 00:00 Jan 5 in Chicago

// The same checks in this process and in one whose zone is Toronto's.
function checks() {
  assert.equal(stateOf(D1, DEFS, [], OPENS), "open");
  assert.equal(stateOf(D1, DEFS, [], OPENS - 1), "soon");
  assert.equal(stateOf(D1, DEFS, [], Date.UTC(2030, 0, 6, 9) - 1), "open");
  assert.equal(stateOf(D1, DEFS, [], Date.UTC(2030, 0, 6, 9)), "missed");
  assert.equal(stateOf(D1, DEFS, ["d1"], Date.UTC(2030, 0, 6, 9)), "have", "a stamp you hold stays held");
  assert.deepEqual(windowOf(D1, DEFS), { opens: OPENS, closes: Date.UTC(2030, 0, 6, 9) });
  assert.deepEqual(windowOf(ISS, DEFS), { opens: 0, closes: Date.UTC(2030, 0, 7, 9) });
}

test("stateOf: open from 00:00 Chicago time on the date, missed at 03:00 the next day", () => checks());

test("stateOf does not depend on the phone's zone (a phone still on Toronto time)", () => {
  const src = `
    import assert from "node:assert/strict";
    import { stateOf, windowOf, tripDate } from ${JSON.stringify(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "js", "stampbook.js"))};
    assert.notEqual(new Date(2030, 0, 5).getTimezoneOffset(), 360, "the phone is not on Chicago time");
    const D1 = ${JSON.stringify(D1)}, DEFS = ${JSON.stringify(DEFS)};
    const OPENS = Date.UTC(2030, 0, 5, 6);
    assert.equal(stateOf(D1, DEFS, [], OPENS), "open");
    assert.equal(stateOf(D1, DEFS, [], OPENS - 1), "soon");
    assert.equal(stateOf(D1, DEFS, [], Date.UTC(2030, 0, 6, 9)), "missed");
    // 00:30 in Toronto on Jan 5 is still 23:30 on Jan 4 in Chicago.
    assert.equal(tripDate(Date.UTC(2030, 0, 5, 5, 30)), "2030-01-04");
    assert.equal(stateOf(D1, DEFS, [], Date.UTC(2030, 0, 5, 5, 30)), "soon");
    // 12:00 in Toronto on Jan 5 is 11:00 in Chicago: open.
    assert.equal(tripDate(Date.UTC(2030, 0, 5, 17)), "2030-01-05");
    assert.equal(stateOf(D1, DEFS, [], Date.UTC(2030, 0, 5, 17)), "open");
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", src], { env: { ...process.env, TZ: "America/Toronto" }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("stateOf: the issue stamp is open from the start until the last day closes; a bad date is never open", () => {
  assert.equal(stateOf(ISS, DEFS, [], 1), "open");
  assert.equal(stateOf(ISS, DEFS, [], Date.UTC(2030, 0, 7, 9) - 1), "open");
  assert.equal(stateOf(ISS, DEFS, [], Date.UTC(2030, 0, 7, 9)), "missed");
  assert.equal(stateOf({ id: "x", date: "someday" }, DEFS, [], Date.UTC(2030, 0, 5)), "soon");
  assert.equal(stateOf(ISS, [ISS], [], 4e12), "open", "no day stamps: it does not close");
});

test("stateOf takes who holds what as ids, stamps or a set", () => {
  assert.equal(stateOf(D1, DEFS, [{ def: "d1", who: "Mo" }], 0), "have");
  assert.equal(stateOf(D1, DEFS, new Set(["d1"]), 0), "have");
  assert.equal(stateOf(D1, DEFS, [{ def: "d2" }], 0), "soon");
  assert.equal(stateOf(D1, DEFS, undefined, 0), "soon");
});

test("bookStampSVG: the same seed and definition draw the same string; another seed wears differently", () => {
  assert.equal(bookStampSVG(7, D1, DEFS), bookStampSVG(7, D1, DEFS));
  assert.notEqual(bookStampSVG(7, D1, DEFS), bookStampSVG(8, D1, DEFS));
  assert.match(bookStampSVG(7, D1, DEFS), /^<svg /);
});

test("bookStampSVG: markup in a name is text, never markup", () => {
  for (const field of ["name_en", "name_ja", "place"]) {
    const svg = bookStampSVG(7, { ...D1, [field]: "<img src=x onerror=alert(1)>" }, DEFS);
    assert.equal(/<img/i.test(svg), false, field);
    if (field === "name_en") assert.match(svg, /&lt;IMG|&lt;img/i, field);
  }
  assert.equal(esc('<a href="x">&\'</a>'), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  // an id with markup cannot break out of an attribute either
  assert.equal(/"[^"]*<script/.test(bookStampSVG(7, { ...D1, id: '"><script>x</script>' }, DEFS)), false);
});

test("bookStampSVG: the placemat's stamp: a double ring, the date and weekday in the middle, the name on the arc; an unknown ink is red", () => {
  const svg = bookStampSVG(9, { ...D1, motif: "no-such-drawing", ink: "no-such-ink" }, DEFS);
  assert.match(svg, /^<svg /);
  assert.match(svg, /<circle cx="60" cy="60" r="55"/);
  assert.match(svg, />JAN 5</);
  assert.match(svg, />SAT</);
  assert.match(svg, /TESTVILLE/);
  assert.match(svg, new RegExp('color="' + INKS.shu + '"'));
  // names that are keys of Object.prototype are not inks
  const odd = bookStampSVG(9, { ...D1, motif: "constructor", ink: "__proto__" }, DEFS);
  assert.match(odd, new RegExp('color="' + INKS.shu + '"'));
  assert.match(bookStampSVG(9, {}, DEFS), /^<svg /);
  assert.match(bookStampSVG(9, null, DEFS), /^<svg /);
});

test("bookStampSVG: no Japanese face and no Japanese name; the date is the picture (no drawing from a library)", () => {
  const svg = bookStampSVG(9, { ...D1, motif: "lantern" }, DEFS);
  assert.equal(/Zen|Hiragino|Mincho|試験/.test(svg), false, svg);
  assert.match(svg, /Zilla Slab/);
  assert.deepEqual(Object.keys(MOTIFS), ["crest"]);
});

test("bookStampSVG: a square has a rounded-square frame and no outer circle frame; the ink follows the definition", () => {
  const sq = bookStampSVG(3, D2, DEFS);
  assert.match(sq, /<rect x="5" y="5" width="110" height="110"/);
  assert.equal(/<circle cx="60" cy="60" r="55"/.test(sq), false);
  assert.match(sq, new RegExp('color="' + INKS.ai + '"'));
  const round = bookStampSVG(3, D1, DEFS);
  assert.match(round, /<circle cx="60" cy="60" r="55"/);
  assert.equal(/<rect x="5" y="5" width="110"/.test(round), false);
});

test("bookStampSVG: New Year's Eve is a fireworks burst; the issue stamp is the crest with the app's name and the year", () => {
  const nye = bookStampSVG(3, { ...D1, date: "2030-12-31" }, DEFS);
  assert.match(nye, /class="burst"/);
  assert.match(nye, />DEC 31</);
  assert.equal(/<circle cx="60" cy="60" r="55"/.test(nye), false);
  const iss = bookStampSVG(3, ISS, DEFS);
  assert.match(iss, />WENDY’S</);
  assert.match(iss, />2030</);
  assert.equal((MOTIFS.crest.match(/M[\d.]+ [\d.]+L/g) || []).length, 12, "twelve ticks");
  assert.equal(/MAT/.test(iss), false);
  assert.match(bookStampSVG(3, ISS, [ISS]), />WENDY’S</);
});

test("bookStampSVG: a long name is made to fit its arc", () => {
  const long = bookStampSVG(5, { ...D1, name_en: "A very long station name indeed and then some more" }, DEFS);
  assert.match(long, /font-size="[0-5]\.\d+"/);
});

test("the inks are exactly three: the check's red, the placemat's blue and the rules' green", () => {
  assert.deepEqual(INKS, { shu: "#C2362B", matsu: "#2E7A57", ai: "#2F5FA8" });
});

test("placemat: a known Chicago place sits on its own spot of the map; others get free spots; the book's own stamp its corner", () => {
  const day = (i, place) => ({ id: "p" + i, date: "2030-01-0" + i, place, name_en: place });
  const defs = [day(1, "Midway"), day(2, "Millennium Park"), day(3, "West Loop"), day(4, "the loop"), day(5, "Somewhere New"), day(6, "Another Unknown"), day(7, "O'Hare"), ISS];
  const at = placemat(defs);
  assert.deepEqual(at.map((p) => p.id), ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "iss"]);
  const of = (id) => at.find((p) => p.id === id);
  assert.deepEqual([of("p1").x, of("p1").y], [58, 372]);
  assert.deepEqual([of("p2").x, of("p2").y], [250, 306]);
  assert.deepEqual([of("p3").x, of("p3").y], [90, 252]);
  assert.deepEqual([of("p4").x, of("p4").y], [212, 256], "the case and a leading The do not matter");
  assert.deepEqual([of("p7").x, of("p7").y], [64, 104], "a straight or curly apostrophe");
  assert.equal(of("p1").dir, "sw");
  assert.equal(of("iss").issue, true);
  // No two spots on top of each other, every spot inside the map, the same answer every time.
  for (let i = 0; i < at.length; i++) {
    assert.ok(at[i].x >= 30 && at[i].x <= 290 && at[i].y >= 90 && at[i].y <= 400, JSON.stringify(at[i]));
    for (let j = i + 1; j < at.length; j++) assert.ok(Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y) >= 40, at[i].id + " " + at[j].id);
  }
  assert.deepEqual(placemat(defs), at);
  // Two days in the same place: the second moves to a free spot.
  const twice = placemat([day(1, "The Loop"), day(2, "The Loop")]);
  assert.ok(Math.hypot(twice[0].x - twice[1].x, twice[0].y - twice[1].y) >= 40);
  // Thirty days still all fit, each on a spot of its own.
  const many = placemat(Array.from({ length: 30 }, (_, i) => ({ id: "m" + i, date: "2030-03-" + String(i + 1).padStart(2, "0"), place: "Nowhere " + i })));
  assert.equal(new Set(many.map((p) => p.x + "," + p.y)).size, 30);
});

test("countText and tiltOf", () => {
  assert.equal(countText(3, 12), "3 of 12");
  assert.equal(countText(0, 12), "0 of 12");
  for (let s = 1; s <= 500; s++) {
    const t = tiltOf(s);
    assert.ok(t >= -6 && t <= 6, s + " -> " + t);
  }
  assert.equal(tiltOf(77), tiltOf(77));
  assert.equal(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(tiltOf)).size > 4, true, "different seeds tilt differently");
  assert.ok(Math.abs(tiltOf("nonsense")) <= 6);
});

test("usableDefs: day stamps by date, the issue stamp last; a repeat, no id or a bad date is left out", () => {
  const got = usableDefs([ISS, D2, { id: "", date: "2030-01-01" }, D1, { ...D1, name_en: "again" }, { id: "bad", date: "next week" }, null, "x", { id: "x2", date: "2030-02-30" }]);
  assert.deepEqual(got.map((d) => d.id), ["d1", "d2", "iss"]);
  assert.deepEqual(usableDefs(undefined), []);
  assert.deepEqual(usableDefs([]), []);
});

test("spanText comes from the definitions", () => {
  assert.equal(spanText(DEFS), "2030.01.05 → 01.06");
  assert.equal(spanText([D1]), "2030.01.05");
  assert.equal(spanText([ISS]), "");
});

test("lockedLine and Chicago clock text", () => {
  assert.equal(lockedLine(D2, "soon"), "Jan 6 opens on the day.");
  assert.equal(lockedLine(D1, "missed"), "Jan 5 has closed.");
  assert.equal(lockedLine(ISS, "missed"), "The book has closed.");
  assert.equal(tripClock(Date.UTC(2030, 0, 6, 1, 2)), "19:02");
  assert.equal(tripClock(Date.UTC(2030, 0, 6, 6, 5)), "00:05");
  assert.equal(tripDate(Date.UTC(2030, 0, 6, 6, 5)), "2030-01-06");
});

test("summary: the count, and today's stamp only while it is open and not yet pressed", () => {
  const s = { stampDefs: DEFS, stamps: [{ def: "d2", who: "Izzah" }, { def: "iss", who: "Mo" }, { def: "d1", who: "Mo", gone: true }], me: "Mo" };
  const noon5 = Date.UTC(2030, 0, 5, 18); // noon in Chicago on Jan 5
  assert.deepEqual(summary(s, noon5), { total: 3, n: 1, openToday: "2030-01-05" });
  // pressed: no line any more
  assert.equal(summary({ ...s, stamps: [{ def: "d1", who: "Mo" }] }, noon5).openToday, "");
  // another person's press is not mine
  assert.equal(summary({ ...s, stamps: [{ def: "d1", who: "Izzah" }] }, noon5).openToday, "2030-01-05");
  // 02:00 on Jan 6 in Chicago: Jan 5 is still open (grace) but today is Jan 6
  assert.equal(summary(s, Date.UTC(2030, 0, 6, 8)).openToday, "2030-01-06");
  // a day with no stamp, before the trip, after it
  assert.equal(summary(s, Date.UTC(2029, 5, 1)).openToday, "");
  assert.equal(summary(s, Date.UTC(2030, 0, 8)).openToday, "");
  // nothing defined: nothing to show
  assert.deepEqual(summary({ stampDefs: [], stamps: [], me: "Mo" }, noon5), { total: 0, n: 0, openToday: "" });
  assert.deepEqual(summary({}, noon5), { total: 0, n: 0, openToday: "" });
});
