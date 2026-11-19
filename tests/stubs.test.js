// The ticket screens' shared drawing (js/views/stubs.js): which stock a
// ticket is printed on, the boxes its seat is drawn in, and the words on
// it. Pure parts only; the screens themselves are in tests/e2e/tix-*.e2e.cjs.
// Also: no Japanese anywhere in the ticket screens (Chicago has none).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stockOf, seatParts, countLine, edgeOf, kindWord, staffLine } from "../js/views/stubs.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the stock follows the stop's own words: a flight, a boat, a museum, else a game's long stock", () => {
  assert.equal(stockOf({ title: "Flight to Toronto" }), "fly");
  assert.equal(stockOf({ title: "Home", detail: "O’Hare, Terminal 1" }), "fly");
  assert.equal(stockOf({ title: "Architecture river cruise" }), "boat");
  assert.equal(stockOf({ title: "Ferry across" }), "boat");
  assert.equal(stockOf({ title: "Field Museum" }), "mus");
  assert.equal(stockOf({ title: "The Art Institute" }), "mus");
  assert.equal(stockOf({ title: "Shedd Aquarium" }), "mus");
  assert.equal(stockOf({ title: "Blackhawks v. Blues" }), "game");
  assert.equal(stockOf({ title: "Jazz, late set" }), "game");
  assert.equal(stockOf({}), "game");
  assert.equal(stockOf(null), "game");
  // A word inside another word is not it.
  assert.equal(stockOf({ title: "Boathouse brunch" }), "game");
});

test("a seat is drawn in boxes only when its parts can be read; anything else stays as typed", () => {
  assert.deepEqual(seatParts("Sec 112 Row 8 Seats 4–5"), [["SEC", "112"], ["ROW", "8"], ["SEATS", "4–5"]]);
  assert.deepEqual(seatParts("Section 112, Row 8, Seat 4"), [["SEC", "112"], ["ROW", "8"], ["SEAT", "4"]]);
  assert.deepEqual(seatParts("row 8 seat 5"), [["ROW", "8"], ["SEAT", "5"]]);
  assert.deepEqual(seatParts("Table 4"), [["TABLE", "4"]]);
  assert.deepEqual(seatParts("Gate 4"), [["GATE", "4"]]);
  assert.equal(seatParts("Window, near the back"), null);
  assert.equal(seatParts("Sec 112 and a view"), null, "a word the boxes cannot hold keeps the text as typed");
  assert.equal(seatParts(""), null);
  assert.equal(seatParts(undefined), null);
});

test("the count on a stub: tickets, passes for a flight, pages for an e-ticket", () => {
  assert.equal(countLine({ kind: "pp", list: [{ who: "Mo" }, { who: "Izzah" }] }, "game"), "2 tickets");
  assert.equal(countLine({ kind: "pp", list: [{ who: "Mo" }, { who: "Mo", page: 2 }] }, "game"), "1 ticket");
  assert.equal(countLine({ kind: "pp", list: [{ who: "Mo" }, { who: "Izzah" }] }, "fly"), "2 passes");
  assert.equal(countLine({ kind: "one", list: [{}] }, "mus"), "1 ticket for everyone");
  assert.equal(countLine({ kind: "pages", list: [{}, {}, {}] }, "mus"), "3 pages");
  assert.equal(countLine({ kind: null, list: [] }, "game"), "");
});

test("the stub's end: the stock's word and how many it admits, only when that is known", () => {
  assert.deepEqual(edgeOf("mus", { kind: "pp", list: [{ who: "Mo" }, { who: "Izzah" }] }, {}), { word: "ADMIT", n: "2" });
  assert.deepEqual(edgeOf("boat", { kind: "one", list: [{}] }, { tkPeople: "2 adults" }), { word: "BOARD", n: "2" });
  assert.deepEqual(edgeOf("fly", { kind: "pages", list: [{}, {}] }, { tkPeople: "" }), { word: "PASS", n: "" });
  assert.deepEqual(edgeOf("game", { kind: "one", list: [{}] }, { tkPeople: "two" }), { word: "ADMIT", n: "" });
});

test("the word printed across each stock", () => {
  assert.equal(kindWord("game"), "TICKET");
  assert.equal(kindWord("boat"), "BOARDING CARD");
  assert.equal(kindWord("mus"), "ADMISSION");
  assert.equal(kindWord("fly"), "BOARDING PASS");
});

test("the sentence for staff on a reservation, in plain English, only with a name", () => {
  assert.equal(staffLine({ tkName: "MO", tkPeople: "2", time: "22:15" }), "We have a booking for 2 at 22:15 under MO.");
  assert.equal(staffLine({ tkName: "MO" }), "We have a booking under MO.");
  assert.equal(staffLine({ tkName: "", tkPeople: "2" }), null);
});

test("no Japanese in the ticket screens, their styles or their tests", () => {
  const files = [
    "js/views/stubs.js", "js/views/stub.js", "js/views/ticketpart.js", "js/views/tickettab.js", "js/views/bulkadd.js",
    "css/tickets.css", "css/tickettab.css", "css/bulk.css",
  ].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const e2e = fs.readdirSync(path.join(ROOT, "tests", "e2e")).filter((f) => f.startsWith("tix-")).map((f) => "tests/e2e/" + f);
  const found = [];
  for (const f of [...files, ...e2e]) {
    const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/[぀-ヿ㐀-鿿＀-￯]/.test(line)) found.push(f + ":" + (i + 1));
    });
  }
  assert.deepEqual(found, []);
  assert.ok(files.includes("js/views/stubs.js"));
});

test("the USED print never carries a time: the app does not know when a ticket was used", () => {
  const stop = fs.readFileSync(path.join(ROOT, "js/views/ticket.js"), "utf8");
  const tab = fs.readFileSync(path.join(ROOT, "js/views/tickettab.js"), "utf8");
  assert.ok(!/usedText:[^\n]*stop\.time/.test(stop));
  assert.ok(!/tclock\("USED[^\n]*time/.test(tab));
});
