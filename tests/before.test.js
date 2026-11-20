/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The rail's rules (js/before.js). Every name and date here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { slipNo, slipTone, statusWord, slipTilt, printText, railWords, emptyWords, spikeShown, lookWords, daysToGo } from "../js/before.js";

test("slipNo: the planner's own number for one to three digits, else the place on the rail", () => {
  assert.equal(slipNo("7", 0), "#7");
  assert.equal(slipNo("012", 3), "#12");
  assert.equal(slipNo("1234", 2), "#3");
  assert.equal(slipNo("x9", 0), "#1");
  assert.equal(slipNo("", 4), "#5");
  assert.equal(slipNo(undefined, 1), "#2");
});

test("slipTone: pink to decide, white pending, yellow otherwise", () => {
  for (const [status, tone] of [["Decide", "pink"], ["decide soon", "pink"], ["Pending", "white"], ["To book", ""], ["", ""], ["Maybe", ""], [undefined, ""]]) assert.equal(slipTone(status), tone, String(status));
});

test("statusWord: the status trimmed, or To book when blank", () => {
  assert.equal(statusWord("  Decide "), "Decide");
  assert.equal(statusWord(""), "To book");
  assert.equal(statusWord("   "), "To book");
  assert.equal(statusWord(undefined), "To book");
});

test("slipTilt: -1.0 to 1.0 in tenths, the same for an id every time", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const r = slipTilt("id" + i);
    assert.equal(r, slipTilt("id" + i));
    assert.ok(r >= -1 && r <= 1, String(r));
    assert.equal(Math.round(r * 10) / 10, r, "in tenths");
    seen.add(r);
  }
  assert.ok(seen.size > 10, "they differ");
  assert.equal(slipTilt("7"), slipTilt(7));
});

test("printText: the day and the name in capitals, cut to six; PLANNER with no name", () => {
  const day = (ms) => (ms === Date.parse("2026-12-01T20:07:00Z") ? "2026-12-01" : "2026-11-28");
  assert.deepEqual(printText({ tickedBy: "Izzah", tickedAt: "2026-12-01T20:07:00Z" }, day), { big: "BOOKED", small: "DEC 01 IZZAH" });
  assert.deepEqual(printText({ tickedBy: "Bartholomew", tickedAt: "2026-12-01T20:07:00Z" }, day), { big: "BOOKED", small: "DEC 01 BARTHO" });
  assert.deepEqual(printText({ tickedBy: "", tickedAt: "" }, day), { big: "BOOKED", small: "PLANNER" });
  assert.deepEqual(printText({}, day), { big: "BOOKED", small: "PLANNER" });
  assert.deepEqual(printText({ tickedBy: "Mo", tickedAt: "not a time" }, day), { big: "BOOKED", small: "MO" });
  assert.equal(printText({ tickedBy: "Mo", tickedAt: "2026-12-01T20:07:00Z" }, day, "14:07").small, "DEC 01 14:07 MO");
  assert.equal(printText({ tickedBy: "Mo", tickedAt: "2026-11-28T20:07:00Z" }, day).small, "NOV 28 MO");
});

test("printText: the day is the phone's own by default", () => {
  const ms = Date.parse("2026-12-01T12:00:00");
  const r = printText({ tickedBy: "Mo", tickedAt: new Date(ms).toISOString() });
  assert.equal(r.small, "DEC 01 MO");
});

test("railWords", () => {
  assert.equal(railWords(6, 25), "6 on the rail · 25 days to go");
  assert.equal(railWords(1, 1), "1 on the rail · 1 day to go");
  assert.equal(railWords(3, 0), "3 on the rail");
  assert.equal(railWords(3, null), "3 on the rail");
  assert.equal(railWords(0, 25), "25 days to go");
  assert.equal(railWords(0, null), "");
});

test("emptyWords", () => {
  assert.deepEqual(emptyWords(8), { h: "Nothing left to book.", s: "All 8 are on the spike." });
  assert.deepEqual(emptyWords(1), { h: "Nothing left to book.", s: "It’s on the spike." });
  assert.equal(emptyWords(0).s, "");
});

test("spikeShown: all of three or fewer; more than three: the newest three, unless all", () => {
  const d = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
  assert.deepEqual([spikeShown(d(3), false).list.length, spikeShown(d(3), false).more], [3, 0]);
  assert.deepEqual([spikeShown(d(5), false).list.map((x) => x.id), spikeShown(d(5), false).more], [["0", "1", "2"], 2]);
  assert.deepEqual([spikeShown(d(5), true).list.length, spikeShown(d(5), true).more], [5, 0]);
  assert.deepEqual([spikeShown([], false).list.length, spikeShown(null, false).more], [0, 0]);
});

test("lookWords", () => {
  assert.equal(lookWords(1), "1 planner line needs a look");
  assert.equal(lookWords(2), "2 planner lines need a look");
});

test("daysToGo: whole days to the trip's first day; null once it is 0 or less or there is no start", () => {
  assert.equal(daysToGo({ start: "2026-12-26" }, "2026-12-01"), 25);
  assert.equal(daysToGo({ start: "2026-12-26" }, "2026-12-25"), 1);
  assert.equal(daysToGo({ start: "2026-12-26" }, "2026-12-26"), null);
  assert.equal(daysToGo({ start: "2026-12-26" }, "2026-12-30"), null);
  assert.equal(daysToGo({}, "2026-12-01"), null);
  assert.equal(daysToGo(null, "2026-12-01"), null);
});

// The small words the screens print under and beside a slip (js/views/before.js, no DOM needed).
import { onWords, slipSmall, shortDay, PENDING, COMPUTES } from "../js/views/before.js";

test("onWords: who is on it", () => {
  assert.equal(onWords({ claimedBy: "" }, "Mo"), "");
  assert.equal(onWords({ claimedBy: "Mo" }, "Mo"), "You’re on it");
  assert.equal(onWords({ claimedBy: "Izzah" }, "Mo"), "Izzah’s on it");
});

test("slipSmall: the planner computing it, the planner not updated yet; else nothing (no waiting line: an offline tick is not saved)", () => {
  const up = { online: true };
  const down = { online: false };
  assert.equal(slipSmall({ pending: true, tickedBy: "Mo" }, down), "", "no signal: nothing (the store puts the slip back)");
  assert.equal(slipSmall({ pending: true, tickedBy: "Mo" }, up), "", "in flight with signal: nothing to say yet");
  assert.equal(slipSmall({ tickedBy: "Mo", plannerComputes: true, status: "To book" }, up), COMPUTES);
  assert.equal(slipSmall({ tickedBy: "Mo", status: "To book" }, up), PENDING);
  assert.equal(slipSmall({ tickedBy: "Mo", status: "Booked" }, up), "", "the planner has it");
  assert.equal(slipSmall({ tickedBy: "", status: "Booked" }, up), "", "booked in the planner by hand");
  assert.equal(PENDING, "The planner hasn’t been updated yet.");
  assert.equal(COMPUTES, "The planner works this one out itself, so the app left it as it was.");
});

test("shortDay: Nov 28 on the phone's own calendar, empty for no time", () => {
  assert.equal(shortDay(Date.parse("2026-11-28T12:00:00")), "Nov 28");
  assert.equal(shortDay(NaN), "");
});
