/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// "Before we go", the pure part (js/todos.js, ported from the Japan app): the
// due line, counted on the Toronto calendar, and the order of the open and
// done items. The Japan file's tests of its look-only words (the "済" ticked
// line, the tab's name) stay there with them. Every item here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { homeToday, dueLine, dueText, openTodos, doneTodos, isDone, plannerPending, isStale, showBeforeTab, untickOutcome, todoProblemHead } from "../js/todos.js";

const item = (o) => ({ id: "1", item: "x", bookBy: "", status: "", note: "", link: "", claimedBy: "", tickedBy: "", tickedAt: "", done: false, ...o });

test("homeToday is the date on the Toronto calendar, whatever the instant's date in UTC", () => {
  // 2026-11-16 23:30 in Toronto is already Nov 17 in UTC.
  assert.equal(homeToday(Date.parse("2026-11-17T04:30:00Z")), "2026-11-16");
  assert.equal(homeToday(Date.parse("2026-11-17T05:30:00Z")), "2026-11-17");
});

test("the due line: in N days, tomorrow, today, late; heavier within 3 days", () => {
  const today = "2026-11-16";
  assert.equal(dueText(dueLine("2026-12-05", today)), "by Sat Dec 5 · in 19 days");
  assert.equal(dueLine("2026-12-05", today).state, "later");
  assert.equal(dueLine("2026-12-05", today).strong, false);

  const d4 = dueLine("2026-11-20", today);
  assert.equal(dueText(d4), "by Fri Nov 20 · in 4 days");
  assert.equal(d4.strong, false);
  const d3 = dueLine("2026-11-19", today);
  assert.equal(dueText(d3), "by Thu Nov 19 · in 3 days");
  assert.equal(d3.state, "soon");
  assert.equal(d3.strong, true);

  const tomorrow = dueLine("2026-11-17", today);
  assert.equal(dueText(tomorrow), "by Tue Nov 17 · tomorrow");
  assert.equal(tomorrow.state, "tomorrow");
  assert.equal(tomorrow.strong, true);

  const now = dueLine("2026-11-16", today);
  assert.equal(dueText(now), "by Mon Nov 16 · today");
  assert.equal(now.state, "today");
  assert.equal(now.strong, true);

  const late1 = dueLine("2026-11-15", today);
  assert.equal(dueText(late1), "was due Sun Nov 15 · 1 day late");
  assert.equal(late1.state, "late");
  const late2 = dueLine("2026-11-14", today);
  assert.equal(dueText(late2), "was due Sat Nov 14 · 2 days late");
});

test("the due line counts whole calendar days across a month and a year end", () => {
  assert.equal(dueText(dueLine("2026-12-01", "2026-11-30")), "by Tue Dec 1 · tomorrow");
  assert.equal(dueText(dueLine("2027-01-02", "2026-12-31")), "by Sat Jan 2 · in 2 days");
});

test("no date, or a date that is not one, gives no due line", () => {
  for (const v of ["", null, undefined, "Dec 5", "2026-13-01", "2026-02-30", 42]) {
    assert.equal(dueLine(v, "2026-11-16"), null, String(v));
    assert.equal(dueText(dueLine(v, "2026-11-16")), "");
  }
});

test("open items: earliest book-by first, undated last, ties and undated in planner order; done ones left out", () => {
  const list = [
    item({ id: "1", bookBy: "" }),
    item({ id: "2", bookBy: "2026-12-01" }),
    item({ id: "3", bookBy: "2026-11-20" }),
    item({ id: "4", bookBy: "", tickedBy: "Mo", done: true }),
    item({ id: "5", bookBy: "" }),
    item({ id: "6", bookBy: "2026-12-01" }),
    item({ id: "7", bookBy: "2026-11-01", status: "Booked", done: true }),
    item({ id: "8", bookBy: "2026-11-02" }),
  ];
  assert.deepEqual(openTodos(list).map((t) => t.id), ["8", "3", "2", "6", "1", "5"]);
});

test("done items: ticked ones newest first, then the planner's own bookings in planner order", () => {
  const list = [
    item({ id: "1", status: "Booked" }),
    item({ id: "2", tickedBy: "Mo", tickedAt: "2026-11-20T10:00:00.000Z", status: "Booked" }),
    item({ id: "3" }),
    item({ id: "4", tickedBy: "Ajen", tickedAt: "2026-11-21T09:00:00.000Z" }),
    item({ id: "5", status: "booked (paid)" }),
  ];
  assert.deepEqual(doneTodos(list).map((t) => t.id), ["4", "2", "1", "5"]);
});

test("done is a tick or the planner saying booked; the planner is pending when a tick is not booked there yet", () => {
  assert.equal(isDone(item({})), false);
  assert.equal(isDone(item({ status: "Pending" })), false);
  assert.equal(isDone(item({ status: " booked " })), true);
  assert.equal(isDone(item({ tickedBy: "Mo" })), true);
  assert.equal(isDone(item({ done: true })), true);
  assert.equal(plannerPending(item({ tickedBy: "Mo", status: "Not booked" })), true);
  assert.equal(plannerPending(item({ tickedBy: "Mo", status: "Booked" })), false);
  assert.equal(plannerPending(item({ tickedBy: "Mo", status: "Not booked", pending: true })), false, "not while the tick is still on its way");
  assert.equal(plannerPending(item({ status: "Booked" })), false);
});

test("a tick on a Status the planner computes is done and never pending", () => {
  const t = item({ tickedBy: "Mo", tickedAt: new Date(2026, 11, 3, 9, 30).toISOString(), status: "Not booked", plannerComputes: true });
  assert.equal(isDone(t), true);
  assert.equal(plannerPending(t), false);
});

test("stale: never fetched, or fetched 60 minutes ago or more", () => {
  const now = Date.parse("2026-11-16T15:00:00Z");
  assert.equal(isStale("", now), true);
  assert.equal(isStale(undefined, now), true);
  assert.equal(isStale("not a time", now), true);
  assert.equal(isStale("2026-11-16T14:01:00Z", now), false);
  assert.equal(isStale("2026-11-16T14:00:00Z", now), true);
});

test("the Before tab shows: always before the trip once the list has loaded, from the first day only while something is open, never before the list has loaded", () => {
  // Before the trip: even with nothing open.
  assert.equal(showBeforeTab({ loaded: true, beforeTrip: true, openCount: 4 }), true);
  assert.equal(showBeforeTab({ loaded: true, beforeTrip: true, openCount: 0 }), true);
  // From the first day on: only while something is open.
  assert.equal(showBeforeTab({ loaded: true, beforeTrip: false, openCount: 1 }), true);
  assert.equal(showBeforeTab({ loaded: true, beforeTrip: false, openCount: 0 }), false);
  // The list has never loaded: no tab, whatever else is true.
  assert.equal(showBeforeTab({ loaded: false, beforeTrip: true, openCount: 3 }), false);
  assert.equal(showBeforeTab({ loaded: false, beforeTrip: false, openCount: 3 }), false);
  assert.equal(showBeforeTab({ loaded: false, beforeTrip: true, openCount: 0 }), false);
  assert.equal(showBeforeTab(), false);
});

test("the undo bar's line for each change to an item", async () => {
  const { changeText } = await import("../js/format.js");
  const it = { item: "Tea class" };
  assert.equal(changeText({ kind: "todo", action: "tick", item: it }), "Ticked off Tea class.");
  assert.equal(changeText({ kind: "todo", action: "claim", item: it }), "You’re on Tea class.");
  assert.equal(changeText({ kind: "todo", action: "takeover", item: it }), "Took over Tea class.");
  assert.equal(changeText({ kind: "todo", action: "unclaim", item: it }), "Handed back Tea class.");
  assert.equal(changeText({ kind: "todo", action: "undo", item: it }), "Undone.");
});

test("wave A 1: a Book Now problem's first line: number, row and a few words, each left out when missing", () => {
  assert.equal(todoProblemHead({ id: "4", row: 7, what: "Made-up item" }), "#4 · row 7 · Made-up item");
  assert.equal(todoProblemHead({ id: "4", row: null, what: "" }), "#4");
  assert.equal(todoProblemHead({ id: "", row: 7, what: "x" }), "row 7 · x");
  assert.equal(todoProblemHead({}), "A Book Now row");
  assert.equal(todoProblemHead(), "A Book Now row");
});

test("wave A 5: untickOutcome: pending, kept after a written tick, and nothing to say otherwise", () => {
  const written = item({ tickedBy: "Mo", status: "Booked", done: true });
  const off = (o) => ({ todo: item({ tickedBy: "", ...o }) });
  assert.equal(untickOutcome(written, { planner: "pending", ...off({ status: "Not booked" }) }), "pending");
  assert.equal(untickOutcome(written, { planner: "kept", ...off({ status: "Not booked" }) }), "kept");
  assert.equal(untickOutcome(written, { planner: "written", ...off({ status: "Not booked" }) }), null);
  assert.equal(untickOutcome(item({ tickedBy: "Mo", status: "Not booked" }), { planner: "kept", ...off({ status: "Not booked" }) }), null, "never written: nothing there to keep");
  assert.equal(untickOutcome(item({ tickedBy: "Mo", status: "Booked" }), { planner: "kept", ...off({ status: "Booked" }) }), null, "booked by hand before the tick: still booked, nothing to say");
  assert.equal(untickOutcome(item({ tickedBy: "Mo", status: "Booked", plannerComputes: true }), { planner: "kept", ...off({ status: "" }) }), null, "a computed Status");
  assert.equal(untickOutcome(item({ tickedBy: "" }), { planner: "pending", todo: item({ tickedBy: "Mo" }) }), null, "an undo that ticks again is no untick");
  assert.equal(untickOutcome(written, { planner: "pending" }), null);
  assert.equal(untickOutcome(null, null), null);
});
