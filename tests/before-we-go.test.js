/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// "Before we go" (Task 20), the pure part: the due line's wording, counted on
// the Toronto calendar, and the order of the open and done items. Every item
// here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { homeToday, dueLine, dueText, openTodos, doneTodos, isDone, plannerPending, tickedLine, isStale, showBeforeTab, tabName } from "../js/todos.js";

const item = (o) => ({ id: "1", item: "x", bookBy: "", status: "", note: "", link: "", claimedBy: "", tickedBy: "", tickedAt: "", done: false, ...o });

test("homeToday is the date on the Toronto calendar, whatever the instant's date in Japan", () => {
  // 2026-12-02 23:30 in Toronto is already Dec 3 in UTC.
  assert.equal(homeToday(Date.parse("2026-12-03T04:30:00Z")), "2026-12-02");
  assert.equal(homeToday(Date.parse("2026-12-03T05:30:00Z")), "2026-12-03");
});

test("the due line: in N days, tomorrow, today, late; heavier within 3 days", () => {
  const today = "2026-12-02";
  assert.equal(dueText(dueLine("2026-12-21", today)), "by Mon Dec 21 · in 19 days");
  assert.equal(dueLine("2026-12-21", today).state, "later");
  assert.equal(dueLine("2026-12-21", today).strong, false);

  const d4 = dueLine("2026-12-06", today);
  assert.equal(dueText(d4), "by Sun Dec 6 · in 4 days");
  assert.equal(d4.strong, false);
  const d3 = dueLine("2026-12-05", today);
  assert.equal(dueText(d3), "by Sat Dec 5 · in 3 days");
  assert.equal(d3.state, "soon");
  assert.equal(d3.strong, true);

  const tomorrow = dueLine("2026-12-03", today);
  assert.equal(dueText(tomorrow), "by Thu Dec 3 · tomorrow");
  assert.equal(tomorrow.state, "tomorrow");
  assert.equal(tomorrow.strong, true);

  const now = dueLine("2026-12-02", today);
  assert.equal(dueText(now), "by Wed Dec 2 · today");
  assert.equal(now.state, "today");
  assert.equal(now.strong, true);

  const late1 = dueLine("2026-12-01", today);
  assert.equal(dueText(late1), "was due Tue Dec 1 · 1 day late");
  assert.equal(late1.state, "late");
  const late2 = dueLine("2026-11-30", today);
  assert.equal(dueText(late2), "was due Mon Nov 30 · 2 days late");
});

test("the due line counts whole calendar days across a month and a year end", () => {
  assert.equal(dueText(dueLine("2026-12-17", "2026-12-16")), "by Thu Dec 17 · tomorrow");
  assert.equal(dueText(dueLine("2027-01-02", "2026-12-31")), "by Sat Jan 2 · in 2 days");
});

test("no date, or a date that is not one, gives no due line", () => {
  for (const v of ["", null, undefined, "Dec 21", "2026-13-01", "2026-02-30", 42]) {
    assert.equal(dueLine(v, "2026-12-02"), null, String(v));
    assert.equal(dueText(dueLine(v, "2026-12-02")), "");
  }
});

test("open items: earliest book-by first, undated last, ties and undated in planner order; done ones left out", () => {
  const list = [
    item({ id: "1", bookBy: "" }),
    item({ id: "2", bookBy: "2026-12-17" }),
    item({ id: "3", bookBy: "2026-12-06" }),
    item({ id: "4", bookBy: "", tickedBy: "Mo", done: true }),
    item({ id: "5", bookBy: "" }),
    item({ id: "6", bookBy: "2026-12-17" }),
    item({ id: "7", bookBy: "2026-11-17", status: "Booked", done: true }),
    item({ id: "8", bookBy: "2026-11-18" }),
  ];
  assert.deepEqual(openTodos(list).map((t) => t.id), ["8", "3", "2", "6", "1", "5"]);
});

test("done items: ticked ones newest first, then the planner's own bookings in planner order", () => {
  const list = [
    item({ id: "1", status: "Booked" }),
    item({ id: "2", tickedBy: "Mo", tickedAt: "2026-12-06T10:00:00.000Z", status: "Booked" }),
    item({ id: "3" }),
    item({ id: "4", tickedBy: "Izzah", tickedAt: "2026-12-07T09:00:00.000Z" }),
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

test("a tick on a Status the planner computes is done and never pending, and its line says the planner works it out", () => {
  const t = item({ tickedBy: "Mo", tickedAt: new Date(2026, 11, 19, 9, 30).toISOString(), status: "Not booked", plannerComputes: true });
  assert.equal(isDone(t), true);
  assert.equal(plannerPending(t), false);
  assert.equal(tickedLine(t), "Ticked by Mo. The planner works this one out itself.");
  assert.equal(tickedLine({ ...t, status: "Booked" }), "Ticked by Mo. The planner works this one out itself.");
});

test("the done line: who ticked it and the day (the phone's own calendar), or booked in the planner", () => {
  const at = new Date(2026, 11, 19, 9, 30).toISOString(); // Dec 19, 09:30 on this machine's clock
  assert.equal(tickedLine(item({ tickedBy: "Mo", tickedAt: at })), "済 Mo · Dec 19");
  assert.equal(tickedLine(item({ tickedBy: "Mo", tickedAt: "" })), "済 Mo");
  assert.equal(tickedLine(item({ status: "Booked" })), "Booked in the planner");
});

test("stale: never fetched, or fetched 60 minutes ago or more", () => {
  const now = Date.parse("2026-12-02T15:00:00Z");
  assert.equal(isStale("", now), true);
  assert.equal(isStale(undefined, now), true);
  assert.equal(isStale("not a time", now), true);
  assert.equal(isStale("2026-12-02T14:01:00Z", now), false);
  assert.equal(isStale("2026-12-02T14:00:00Z", now), true);
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

test("the Before tab's accessible name carries the open count, and none at 0", () => {
  assert.equal(tabName(18), "Before we go, 18 open");
  assert.equal(tabName(1), "Before we go, 1 open");
  assert.equal(tabName(0), "Before we go");
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
