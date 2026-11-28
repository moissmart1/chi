import test from "node:test";
import assert from "node:assert/strict";
import { reportText, inviteFor } from "../js/views/you.js";
import { freshText, historySentence, localDay } from "../js/format.js";

const base = { me: "Izzah", screen: "Money", version: "7", when: "Mon Dec 28, 13:20" };

test("reportText names who, which screen, the version, the time and the newest history sentences", () => {
  const sentences = ["Mo rang up Ramen US$12.00", "Izzah deleted Taxi US$30.00"];
  const t = reportText({ ...base, sentences });
  assert.deepEqual(t.split("\n"), [
    "Wendy’s: a problem to look at",
    "Who: Izzah",
    "Screen: Money",
    "App version: 7",
    "Time: Mon Dec 28, 13:20",
    "Latest changes, newest first:",
    "- Mo rang up Ramen US$12.00",
    "- Izzah deleted Taxi US$30.00",
    "What went wrong: ",
  ]);
});

test("reportText keeps only the five newest sentences", () => {
  const sentences = Array.from({ length: 8 }, (_, i) => "change " + i);
  const lines = reportText({ ...base, sentences }).split("\n").filter((l) => l.startsWith("- "));
  assert.deepEqual(lines, ["- change 0", "- change 1", "- change 2", "- change 3", "- change 4"]);
});

test("reportText says history unavailable with no signal, and none yet for an empty tape", () => {
  assert.match(reportText({ ...base, sentences: null }), /^Latest changes: history unavailable$/m);
  assert.match(reportText({ ...base, sentences: [] }), /^Latest changes: none yet$/m);
  assert.match(reportText({ ...base, me: null, sentences: [] }), /^Who: nobody chosen$/m);
});

test("freshText and historySentence", () => {
  assert.equal(freshText(Date.parse("2026-12-28T13:20:00")), "Up to date 13:20");
  assert.equal(historySentence({ who: "Izzah", summary: "rang up Tempura US$1.01", via: "app" }), "Izzah rang up Tempura US$1.01");
  assert.equal(historySentence({ who: "Izzah", summary: "renamed A to B", via: "claude" }), "Izzah renamed A to B (through Claude)");
  // A line a planner pull brought in says so.
  assert.equal(historySentence({ who: "Mo", summary: "rang up Rail pass $221.52", via: "planner" }), "Mo rang up Rail pass $221.52 (from the planner)");
});

test("localDay is the phone's own day, and empty for no time", () => {
  assert.equal(localDay(Date.parse("2026-12-28T13:20:00")), "2026-12-28");
  assert.equal(localDay(NaN), "");
});

test("reportText lists the ids of Sheet lines the app left out (F3)", () => {
  const t = reportText({ ...base, sentences: [], setAside: [{ kind: "expense", id: "exp00001", title: "Lodge", reason: "name" }, { kind: "payment", id: "pay00002", title: "Izzah → Moe", reason: "name" }] });
  assert.ok(t.split("\n").includes("Lines in the Sheet the app can’t read: exp00001, pay00002"), t);
  assert.equal(reportText({ ...base, sentences: [] }).includes("can’t read"), false);
});

test("inviteFor: the one other person by name; two others, or more, by count", () => {
  assert.equal(inviteFor(["Mo", "Izzah"], "Mo"), "For Izzah. Keep it between you.");
  assert.equal(inviteFor(["Mo", "Izzah"], "Izzah"), "For Mo. Keep it between you.");
  assert.equal(inviteFor(["Mo", "Izzah", "Sam"], "Mo"), "For the other two. Keep it between you.");
  assert.equal(inviteFor(["Mo", "Izzah", "Sam", "Lee"], "Mo"), "For the others. Keep it between you.");
  assert.equal(inviteFor(["Mo", "Izzah"], null), "For the other one. Keep it between you.");
  assert.equal(inviteFor(["Mo", "Izzah", "Sam"], null), "For the other two. Keep it between you.");
});

test("plannerWord: the few words the Planner row says after a pull", async () => {
  const { plannerWord } = await import("../js/views/you.js");
  assert.equal(plannerWord(null), "Not pulled");
  assert.equal(plannerWord({ added: 2, changed: 1, problems: [1] }), "Added 2");
  assert.equal(plannerWord({ added: 0, changed: 1, problems: [1] }), "Changed 1");
  assert.equal(plannerWord({ added: 0, changed: 0, problems: [{}] }), "1 needs a look");
  assert.equal(plannerWord({ added: 0, changed: 0, problems: [{}, {}] }), "2 need a look");
  assert.equal(plannerWord({ added: 0, changed: 0, problems: [] }), "Nothing new");
  assert.equal(plannerWord({}), "Nothing new");
});

test("problemHead: id, row and what, each left out when there is none", async () => {
  const { problemHead } = await import("../js/views/you.js");
  assert.equal(problemHead({ id: "P11", row: 14, what: "Made-up deposit" }), "P11 · row 14 · Made-up deposit");
  assert.equal(problemHead({ row: 3 }), "row 3");
  assert.equal(problemHead({ id: "", what: "Made-up deposit" }), "Made-up deposit");
  assert.equal(problemHead({}), "A payment row");
  assert.equal(problemHead(), "A payment row");
});

test("pullWord: today's word for payments, Plan updated when only the plan changed, Not pulled when either failed (chi#16)", async () => {
  const { pullWord } = await import("../js/views/you.js");
  const quiet = { added: 0, changed: 0, problems: [] };
  assert.equal(pullWord(quiet, null), "Nothing new", "not following: as today");
  assert.equal(pullWord(quiet, { ok: true, added: 0, changed: 0, removed: 0, restored: 0, adopted: 3 }), "Nothing new", "adoption alone is no change");
  for (const k of ["added", "changed", "removed", "restored"]) assert.equal(pullWord(quiet, { ok: true, [k]: 1 }), "Plan updated", k);
  assert.equal(pullWord({ added: 2, changed: 0, problems: [] }, { ok: true, changed: 1 }), "Added 2", "the payments' word first");
  assert.equal(pullWord(null, { ok: true, changed: 1 }), "Not pulled");
  assert.equal(pullWord(quiet, { ok: false, code: "planner_unreadable" }), "Not pulled");
});

test("the plan lists' headings, one and more (chi#16)", async () => {
  const { planRowsHead, appStopsHead } = await import("../js/views/you.js");
  assert.equal(planRowsHead(1), "1 row of the Plan tab needs a look");
  assert.equal(planRowsHead(3), "3 rows of the Plan tab need a look");
  assert.equal(appStopsHead(1), "1 stop is only in the app");
  assert.equal(appStopsHead(2), "2 stops are only in the app");
});
