import test from "node:test";
import assert from "node:assert/strict";
import { reportText, plannerWord, problemHead } from "../js/views/you.js";
import { freshText, historySentence, localDay } from "../js/format.js";

const base = { me: "Ajen", screen: "Money", version: "7", when: "Sat Dec 12, 13:20" };

test("reportText names who, which screen, the version, the time and the newest history sentences", () => {
  const sentences = ["Mo rang up Ramen US$12.00", "Ajen deleted Taxi US$30.00"];
  const t = reportText({ ...base, sentences });
  assert.deepEqual(t.split("\n"), [
    "MAT: a problem to look at",
    "Who: Ajen",
    "Screen: Money",
    "App version: 7",
    "Time: Sat Dec 12, 13:20",
    "Latest changes, newest first:",
    "- Mo rang up Ramen US$12.00",
    "- Ajen deleted Taxi US$30.00",
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
  assert.equal(freshText(Date.parse("2026-12-12T13:20:00")), "Up to date 13:20");
  assert.equal(historySentence({ who: "Ajen", summary: "rang up Tempura US$1.01", via: "app" }), "Ajen rang up Tempura US$1.01");
  assert.equal(historySentence({ who: "Ajen", summary: "renamed A to B", via: "claude" }), "Ajen renamed A to B (through Claude)");
  assert.equal(historySentence({ who: "Mo", summary: "rang up Rail pass $221.52", via: "planner" }), "Mo rang up Rail pass $221.52 (from the planner)");
});

test("localDay is the phone's own day, and empty for no time", () => {
  assert.equal(localDay(Date.parse("2026-12-12T13:20:00")), "2026-12-12");
  assert.equal(localDay(NaN), "");
});

test("reportText lists the ids of Sheet lines the app left out (F3)", () => {
  const t = reportText({ ...base, sentences: [], setAside: [{ kind: "expense", id: "exp00001", title: "Lodge", reason: "name" }, { kind: "payment", id: "pay00002", title: "Ajen → Moe", reason: "name" }] });
  assert.ok(t.split("\n").includes("Lines in the Sheet the app can’t read: exp00001, pay00002"), t);
  assert.equal(reportText({ ...base, sentences: [] }).includes("can’t read"), false);
});

test("plannerWord: the few words the Planner payments row shows after a pull", () => {
  const r = (o) => ({ added: 0, changed: 0, same: 0, removed: 0, notCounted: 0, problems: [], more: false, capped: false, ...o });
  assert.equal(plannerWord(r({ added: 2, problems: [{ id: "P5" }] })), "Added 2");
  assert.equal(plannerWord(r({ added: 1, changed: 3 })), "Added 1");
  assert.equal(plannerWord(r({ changed: 1 })), "Changed 1");
  assert.equal(plannerWord(r({ same: 4, problems: [{ id: "P5" }] })), "Needs a look");
  assert.equal(plannerWord(r({ same: 4 })), "Nothing new");
  assert.equal(plannerWord(r({})), "Nothing new");
  assert.equal(plannerWord(null), "Not fetched");
  assert.equal(plannerWord(undefined), "Not fetched");
});

test("problemHead: id, row and description, each left out when missing; all three missing is A payment row", () => {
  const cases = [
    [{ id: "P011", row: 14, what: "Ryokan deposit" }, "P011 · row 14 · Ryokan deposit"],
    [{ id: "P011", row: 14, what: "" }, "P011 · row 14"],
    [{ id: "P011", row: null, what: "Ryokan deposit" }, "P011 · Ryokan deposit"],
    [{ id: "P011", row: null, what: "" }, "P011"],
    [{ id: "", row: 14, what: "Ryokan deposit" }, "row 14 · Ryokan deposit"],
    [{ id: "", row: 14, what: "" }, "row 14"],
    [{ id: "", row: null, what: "Ryokan deposit" }, "Ryokan deposit"],
    [{ id: "", row: null, what: "" }, "A payment row"],
  ];
  for (const [p, said] of cases) assert.equal(problemHead(p), said, JSON.stringify(p));
  assert.equal(problemHead({}), "A payment row", "fields that are not there at all");
});
