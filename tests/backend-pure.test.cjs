const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../backend/Pure.js");
const NAMES = ["Mo", "Izzah", "Sam"];
const good = { id: "a1b2c3d4e5", day: "2026-12-27", title: "Ramen", amount: 42, currency: "USD", paidBy: "Mo", split: NAMES };

test("cells that look like formulas are neutralised", () => {
  assert.equal(P.sanitizeCell("=1+1"), "'=1+1");
  assert.equal(P.sanitizeCell("+81 3"), "'+81 3");
  assert.equal(P.sanitizeCell("Ramen"), "Ramen");
  assert.equal(P.sanitizeCell(42), 42);
});

test("a good expense passes, US dollars keep their cents, and the defaults are filled", () => {
  const r = P.validateExpense({ ...good, amount: 42.006 }, NAMES);
  assert.equal(r.ok, true);
  assert.equal(r.value.amount, 42.01);
  assert.equal(r.value.currency, "USD");
  assert.equal(r.value.splitMode, "equal");
  assert.deepEqual(r.value.splitVals, []);
  assert.equal(r.value.note, "");
  assert.equal(r.value.kind, "");
});

test("bad expenses are refused with a message", () => {
  for (const bad of [
    { title: "" }, { title: "x".repeat(81) }, { amount: 0 }, { amount: -5 }, { amount: 10000001 },
    { amount: NaN }, { currency: "JPY" }, { currency: "usd" }, { currency: "" }, { paidBy: "Nobody" }, { split: [] }, { split: ["Mo", "Nobody"] },
    { split: ["Mo", "Mo"] }, { day: "tomorrow" }, { id: "short" }, { id: "has spaces in it" }, { id: "-abc12345" }, { id: "_abc12345" },
    { note: "x".repeat(201) }, { kind: "misc" }, { splitMode: "percent" },
    { splitMode: "parts", splitVals: [2, 3] }, { splitMode: "parts", splitVals: [2, 0, 3] },
    { splitMode: "parts", splitVals: [2, 1.5, 3] }, { splitMode: "parts", splitVals: [2, 100, 3] },
    { splitMode: "exact", splitVals: [20, 10, 10] }, { splitMode: "exact", splitVals: [42, 0, 0] },
  ]) {
    const r = P.validateExpense({ ...good, ...bad }, NAMES);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(typeof r.message, "string");
  }
  assert.equal(P.validateExpense({ ...good, day: "pre" }, NAMES).ok, true);
  assert.equal(P.validateExpense({ ...good, currency: "CAD", amount: 12.345 }, NAMES).value.amount, 12.35);
  assert.equal(P.validateExpense({ ...good, splitMode: "parts", splitVals: [2, 3, 3] }, NAMES).ok, true);
  assert.equal(P.validateExpense({ ...good, splitMode: "exact", splitVals: [20, 12, 10] }, NAMES).ok, true);
  assert.equal(P.validateExpense({ ...good, currency: "JPY" }, NAMES).message, "Use US or Canadian dollars.");
  assert.equal(P.validateExpense({ ...good, currency: "CAD", amount: 100, splitMode: "exact", splitVals: [33.34, 33.33, 33.33] }, NAMES).ok, true);
  assert.equal(P.validateExpense({ ...good, kind: "food", note: "ref 8841" }, NAMES).value.kind, "food");
});

test("exact splits are rounded, each at least one unit, and must sum exactly", () => {
  const cad = { ...good, currency: "CAD", splitMode: "exact" };
  assert.equal(P.validateExpense({ ...cad, amount: 0.01, splitVals: [0.004, 0.004, 0.01] }, NAMES).ok, false);
  assert.equal(P.validateExpense({ ...cad, amount: 100, splitVals: [33.334, 33.333, 33.333] }, NAMES).ok, false);
  const r = P.validateExpense({ ...cad, amount: 100, splitVals: [33.334, 33.336, 33.33] }, NAMES);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.splitVals, [33.33, 33.34, 33.33]);
  // US dollars the same way: cents, each at least one.
  const u = { ...good, splitMode: "exact" };
  assert.equal(P.validateExpense({ ...u, amount: 0.01, splitVals: [0.004, 0.004, 0.01] }, NAMES).message, "Every amount has to be at least one cent.");
  const y3 = P.validateExpense({ ...u, amount: 100, splitVals: [50.004, 48.996, 1] }, NAMES);
  assert.equal(y3.ok, true);
  assert.deepEqual(y3.value.splitVals, [50, 49, 1]);
});

test("a day must be a real calendar date", () => {
  for (const day of ["2026-13-45", "2026-02-30", "2026-00-10", "2026-04-31", "2026-12-00", "2027-02-29"]) {
    assert.equal(P.validateExpense({ ...good, day }, NAMES).ok, false, day);
  }
  for (const day of ["2026-12-31", "2028-02-29", "pre"]) {
    assert.equal(P.validateExpense({ ...good, day }, NAMES).ok, true, day);
  }
});

test("an expense value carries exactly the client-settable fields, trimmed", () => {
  const r = P.validateExpense({ ...good, title: "  Ramen ", note: " n ", rate: 99, addedBy: "Izzah", addedAt: "t", deleted: true }, NAMES);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value).sort(), ["amount", "currency", "day", "id", "kind", "note", "paidBy", "split", "splitMode", "splitVals", "title"]);
  assert.equal(r.value.title, "Ramen");
  assert.equal(r.value.note, "n");
});

test("odd input is refused with a message, never thrown", () => {
  for (const bad of [null, undefined, "text", 5, [], { ...good, split: "Mo" }, { ...good, title: 5 }, { ...good, paidBy: ["Mo"] }, { ...good, amount: "4200" }, { ...good, note: 7 }]) {
    let r;
    assert.doesNotThrow(() => { r = P.validateExpense(bad, NAMES); }, JSON.stringify(bad));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(typeof r.message, "string");
    assert.ok(r.message.length > 0);
  }
});

test("payments need two different known people and a sane amount", () => {
  const pay = { id: "p1p2p3p4p5", from: "Izzah", to: "Mo", cad: 250.304, seed: 7, rot: -4.2 };
  assert.equal(P.validatePayment(pay, NAMES).value.cad, 250.3);
  assert.equal(P.validatePayment({ ...pay, to: "Izzah" }, NAMES).ok, false);
  assert.equal(P.validatePayment({ ...pay, cad: 0 }, NAMES).ok, false);
  assert.equal(P.validatePayment({ ...pay, cad: 100001 }, NAMES).ok, false);
});

test("a payment carries seed and rot, and refuses missing or odd ones", () => {
  const pay = { id: "p1p2p3p4p5", from: "Izzah", to: "Mo", cad: 250.304, seed: 7, rot: -4.2 };
  assert.deepEqual(P.validatePayment(pay, NAMES).value, { id: "p1p2p3p4p5", from: "Izzah", to: "Mo", cad: 250.3, seed: 7, rot: -4.2 });
  const { seed, ...noSeed } = pay;
  const { rot, ...noRot } = pay;
  for (const bad of [noSeed, noRot, { ...pay, seed: 0 }, { ...pay, seed: 1.5 }, { ...pay, seed: "7" }, { ...pay, rot: NaN }, { ...pay, rot: Infinity }, { ...pay, rot: "1" }, null, "x", { ...pay, id: "short" }, { ...pay, id: "-abc12345" }, { ...pay, id: "_abc12345" }, { ...pay, from: "Nobody" }]) {
    const r = P.validatePayment(bad, NAMES);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(typeof r.message, "string");
  }
  assert.equal(P.validatePayment({ ...pay, seed: 1, rot: 0 }, NAMES).ok, true);
});

test("a person can change only their e-Transfer address and Simplify", () => {
  assert.deepEqual(P.validatePersonPatch({ etransfer: "  mo@example.com ", simplify: false }).value, { etransfer: "mo@example.com", simplify: false });
  assert.equal(P.validatePersonPatch({ etransfer: "x".repeat(81) }).ok, false);
  assert.equal(P.validatePersonPatch({ simplify: "no" }).ok, false);
  assert.equal(P.validatePersonPatch({ initials: "XX" }).ok, false);
  assert.equal(P.validatePersonPatch({}).ok, false);
});

test("rows round-trip between sheet and API shapes", () => {
  const h = P.TABS.Expenses;
  const row = P.objToRow(h, { id: "x", title: "=evil", split: "Mo,Izzah", deleted_at: "" });
  assert.equal(row[h.indexOf("title")], "'=evil");
  const e = P.expenseFromRow({ id: "x", day: "pre", title: "T", amount: 80, currency: "CAD", rate: 0.72, paid_by: "Mo", split: "Mo,Izzah", split_mode: "parts", split_vals: "1,3", note: "n", kind: "food", added_by: "Mo", added_at: "t", deleted_at: "" });
  assert.deepEqual(e.split, ["Mo", "Izzah"]);
  assert.deepEqual(e.splitVals, [1, 3]);
  assert.equal(e.paidBy, "Mo");
  assert.equal(e.deleted, false);
  assert.equal(P.expenseFromRow({ id: "y", split: "Mo", split_mode: "", split_vals: "" }).splitMode, "equal");
  const who = P.personFromRow({ name: "Mo", initials: "MO", order: 1, etransfer: "mo@example.com", simplify: false, email: "private@example.com" });
  assert.deepEqual(who, { name: "Mo", initials: "MO", etransfer: "mo@example.com", simplify: false, photo: "" });
  assert.equal(P.personFromRow({ name: "Izzah", initials: "IZ", simplify: "" }).simplify, true);
});

// ---- Task 16: a picture in each person's seal ----
const JPEG = require("./fixtures/picture.json").jpeg;

test("a picture is a small JPEG data address, or \"\" to take it away", () => {
  assert.deepEqual(P.validatePersonPatch({ photo: JPEG }), { ok: true, value: { photo: JPEG } });
  assert.deepEqual(P.validatePersonPatch({ photo: "" }), { ok: true, value: { photo: "" } });
  const head = "data:image/jpeg;base64,";
  const bad = [
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "javascript:alert(1)",
    "https://example.test/me.jpg",
    head,
    head + "AAAA\nAAAA",
    head + "AAAA\"AAAA",
    head + "AAAA'AAAA",
    head + "AAAA===",
    " " + JPEG,
    head + "A".repeat(12001 - head.length),
    head + "A",
    head + "AAAAA",
    head + "AA=",
    12,
    null,
    { src: JPEG },
  ];
  for (const photo of bad) {
    const v = P.validatePersonPatch({ photo });
    assert.equal(v.ok, false, String(photo).slice(0, 40));
    assert.equal(v.message, "That picture couldn’t be used. Try another.");
  }
  assert.equal(P.validatePersonPatch({ photo: head + "A".repeat(11976) }).ok, true, "11,999 characters, whole 4-character groups, is the most");
  assert.equal(P.validatePersonPatch({ photo: head + "A".repeat(11980) }).ok, false, "past 12,000 characters");
  assert.equal(P.validatePersonPatch({ photo: head + "AA==" }).ok, true);
  assert.deepEqual(P.validatePersonPatch({ etransfer: "a@example.com", photo: "" }).value, { etransfer: "a@example.com", photo: "" });
});

test("the People row keeps the picture, after email, as text", () => {
  const h = P.TABS.People;
  assert.equal(h.indexOf("photo"), h.indexOf("email") + 1);
  assert.equal(P.isTextColumn("People", "photo"), true);
  const row = P.objToRow(h, { name: "Mo", initials: "MO", order: 1, etransfer: "", simplify: true, email: "", photo: JPEG });
  const back = P.personFromRow(P.rowToObj(h, row));
  assert.equal(back.photo, JPEG);
  assert.equal(P.personFromRow({ name: "Izzah", initials: "IZ" }).photo, "", "an older row with no photo cell has none");
});

test("rows coped with as Sheets really hands them back", () => {
  const e = P.expenseFromRow({ id: "x", day: new Date(Date.UTC(2026, 11, 27, 12)), title: "T", amount: "80.5", currency: "CAD", rate: "0.7234", paid_by: "Mo", split: "Mo", split_mode: "parts", split_vals: 3, note: "", kind: "", added_by: "Mo", added_at: new Date(Date.UTC(2026, 11, 27, 3, 4, 5)), deleted_at: new Date(Date.UTC(2026, 11, 28)) });
  assert.deepEqual(e.splitVals, [3]);
  assert.equal(e.amount, 80.5);
  assert.equal(e.rate, 0.7234);
  assert.equal(e.day, "2026-12-27");
  assert.equal(e.addedAt, "2026-12-27T03:04:05.000Z");
  assert.equal(e.deleted, true);
  assert.equal(P.personFromRow({ name: "A", simplify: "FALSE" }).simplify, false);
  assert.equal(P.personFromRow({ name: "A", simplify: "TRUE" }).simplify, true);
  assert.equal(P.personFromRow({ name: "A", simplify: true }).simplify, true);
  const p = P.paymentFromRow({ id: "p", from: "Izzah", to: "Mo", cad: "250.3", stamped_by: "Izzah", stamped_at: new Date(Date.UTC(2026, 11, 29)), seed: "7", rot: "-4.2", removed_at: "" });
  assert.deepEqual(p, { id: "p", from: "Izzah", to: "Mo", cad: 250.3, stampedBy: "Izzah", stampedAt: "2026-12-29T00:00:00.000Z", seed: 7, rot: -4.2, removed: false });
  assert.equal(P.paymentFromRow({ id: "q", removed_at: "2026-12-30T00:00:00.000Z" }).removed, true);
});

test("expense and payment rows round-trip from the API shape", () => {
  const x = { id: "a1b2c3d4e5", day: "2026-12-27", title: "Taxi", amount: 23.4, currency: "USD", rate: 0.72, paidBy: "Izzah", split: ["Izzah", "Sam"], splitMode: "parts", splitVals: [1, 2], note: "late", kind: "transport", addedBy: "Izzah", addedAt: "2026-12-27T01:00:00.000Z", deleted: true };
  const row = P.expenseToRow(x);
  assert.equal(row.paid_by, "Izzah");
  assert.equal(row.split, "Izzah,Sam");
  assert.equal(row.split_vals, "1,2");
  for (const k of ["added_at", "deleted_at", "deleted", "paidBy"]) assert.equal(k in row, false, k);
  const back = P.expenseFromRow(row);
  for (const k of Object.keys(x)) if (k !== "addedAt" && k !== "deleted") assert.deepEqual(back[k], x[k], k);
  assert.equal(P.expenseToRow({ ...x, splitMode: "equal", splitVals: [] }).split_vals, "");
  assert.deepEqual(P.expenseFromRow(P.expenseToRow({ ...x, currency: "CAD", amount: 100, splitMode: "exact", splitVals: [33.34, 66.66] })).splitVals, [33.34, 66.66]);
  const noExtras = P.expenseToRow({ id: "a1b2c3d4e5", day: "pre", title: "T", amount: 1, currency: "USD", paidBy: "Mo", split: ["Mo"], splitMode: "equal", splitVals: [], note: "", kind: "" });
  assert.equal("rate" in noExtras, false);
  assert.equal("added_by" in noExtras, false);

  const pay = { id: "p1p2p3p4p5", from: "Izzah", to: "Mo", cad: 250.3, stampedBy: "Izzah", stampedAt: "2026-12-29T00:00:00.000Z", seed: 7, rot: -4.2, removed: true };
  const prow = P.paymentToRow(pay);
  assert.equal(prow.stamped_by, "Izzah");
  for (const k of ["stamped_at", "removed_at", "removed"]) assert.equal(k in prow, false, k);
  const pback = P.paymentFromRow(prow);
  for (const k of Object.keys(pay)) if (k !== "stampedAt" && k !== "removed") assert.deepEqual(pback[k], pay[k], k);
});

test("the setup seed rows are the trip, two people (Mo and Izzah) and one day per date", () => {
  const s = P.setupSeedRows();
  assert.deepEqual(s.Trip.map((r) => r.key), ["name", "start", "end", "home", "currency", "tz"]);
  assert.deepEqual(s.People.map((r) => [r.name, r.initials, r.order, r.simplify]), [["Mo", "MO", 1, true], ["Izzah", "IZ", 2, true]]);
  assert.deepEqual(Object.fromEntries(s.Trip.map((r) => [r.key, r.value])), { name: "Chicago 2026", start: "2026-12-26", end: "2027-01-01", home: "CAD", currency: "USD", tz: "America/Chicago" });
  assert.deepEqual(s.Days, ["2026-12-26", "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"].map((date) => ({ date, city: "Chicago", title: "" })));
  assert.notEqual(P.setupSeedRows().People[0], s.People[0]);
});

test("every column is plain text except the numbers and the on/off flags", () => {
  const numbers = { Expenses: ["amount", "rate"], Settlements: ["cad", "seed", "rot"], Stamps: ["seed"], People: ["order"], Stops: ["travel_min"], Log: ["id", "undoes", "undone_by"] };
  const flags = { People: ["simplify"], Stops: ["fixed", "booked"] };
  for (const [tab, headers] of Object.entries(P.TABS)) {
    for (const h of headers) {
      const notText = (numbers[tab] || []).includes(h) || (flags[tab] || []).includes(h);
      assert.equal(P.isTextColumn(tab, h), !notText, tab + "." + h);
    }
  }
  assert.equal(P.isTextColumn("Expenses", "id"), true);
  assert.equal(P.isTextColumn("Settlements", "id"), true);
  assert.equal(P.isTextColumn("Expenses", "split_vals"), true);
  assert.equal(P.isTextColumn("Expenses", "title"), true);
});

test("rows read back from text columns still give numbers where the API wants them", () => {
  const e = P.expenseFromRow({ id: "x", day: "2026-12-27", title: "0012", amount: 42, currency: "USD", rate: 0.72, paid_by: "Mo", split: "Mo,Izzah", split_mode: "parts", split_vals: "1,3", note: "3-4", kind: "", added_by: "Mo", added_at: "t", deleted_at: "" });
  assert.deepEqual(e.splitVals, [1, 3]);
  assert.equal(P.expenseFromRow({ id: "x", split: "Mo", split_mode: "parts", split_vals: "3" }).splitVals[0], 3);
  assert.equal(e.title, "0012");
  assert.equal(e.note, "3-4");
  assert.equal(P.parseLogRow({ id: 7, undoes: 3, undone_by: "" }).undoes, 3);
});

test("unsanitizeCell drops only the escape apostrophe that sanitizeCell adds", () => {
  for (const typed of ["=probe", "-5% off", "+81 3", "@home", "\tx", "\rx"]) {
    assert.equal(P.unsanitizeCell(P.sanitizeCell(typed)), typed, JSON.stringify(typed));
    assert.equal(P.unsanitizeCell(typed), typed);
  }
  for (const v of ["'hello", "''", "'", "it's", "Ramen", "", 42, true, null]) assert.equal(P.unsanitizeCell(v), v, JSON.stringify(v));
  assert.equal(P.unsanitizeCell("''=x"), "''=x");
});

test("rowToObj reads escaped cells back as typed", () => {
  const h = ["id", "title", "note", "amount"];
  assert.deepEqual(P.rowToObj(h, ["a1", "'=probe", "'-probe", 5]), { id: "a1", title: "=probe", note: "-probe", amount: 5 });
  assert.deepEqual(P.rowToObj(h, P.objToRow(h, { id: "a1", title: "@home", note: "+81 3", amount: 5 })), { id: "a1", title: "@home", note: "+81 3", amount: 5 });
  assert.equal(P.rowToObj(h, ["a1", "'plain"]).title, "'plain");
});

test("the rate is fetched only when today's is missing and no failure in the last hour", () => {
  const now = "2026-12-26T12:00:00.000Z";
  assert.equal(P.shouldFetchRate(null, null, now), true);
  assert.equal(P.shouldFetchRate("", "", now), true);
  assert.equal(P.shouldFetchRate("108.4", null, now), false);
  assert.equal(P.shouldFetchRate("108.4", "2026-12-26T11:59:00.000Z", now), false);
  assert.equal(P.shouldFetchRate(null, "2026-12-26T11:30:00.000Z", now), false);
  assert.equal(P.shouldFetchRate(null, "2026-12-26T11:00:00.001Z", now), false);
  assert.equal(P.shouldFetchRate(null, "2026-12-26T11:00:00.000Z", now), true);
  assert.equal(P.shouldFetchRate(null, "2026-12-25T12:00:00.000Z", now), true);
  assert.equal(P.shouldFetchRate("0", null, now), true);
  assert.equal(P.shouldFetchRate("junk", null, now), true);
  assert.equal(P.shouldFetchRate(null, "junk", now), true);
  assert.equal(P.shouldFetchRate(null, "2026-12-26T13:00:00.000Z", now), true);
});

test("rateSource: today's stored rate is live, an earlier day's is last, none is the stand-in (F7)", () => {
  assert.equal(P.rateSource("108.4", "108.4"), "live");
  assert.equal(P.rateSource(null, "107.9"), "last");
  assert.equal(P.rateSource("", "107.9"), "last");
  assert.equal(P.rateSource(null, null), "fallback");
  assert.equal(P.rateSource("junk", "0"), "fallback");
});

test("sameKey compares whole keys and is false for any difference (F12)", () => {
  assert.equal(P.sameKey("abc123", "abc123"), true);
  assert.equal(P.sameKey("abc123", "abc124"), false);
  assert.equal(P.sameKey("abc123", "abc12"), false);
  assert.equal(P.sameKey("abc12", "abc123"), false);
  assert.equal(P.sameKey("", ""), false, "an empty key never matches");
  assert.equal(P.sameKey(null, "abc"), false);
  assert.equal(P.sameKey("abc", undefined), false);
});

test("every message the backend can show uses the curly apostrophe (R20, F10)", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(__dirname, "..", "backend");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const lit of src.match(/"(?:[^"\\\n]|\\.)*"/g) || []) {
      assert.equal(/[A-Za-z]'[A-Za-z]/.test(lit), false, f + ": " + lit);
    }
  }
});

const DATES = ["2026-12-26", "2026-12-27", "2026-12-28"];
const STOP = { id: "stopAAAA0001", date: "2026-12-28", title: " Shibuya Sky ", time: "14:00" };

test("validateStop fills the blanks and trims", () => {
  const v = P.validateStop(STOP, DATES);
  assert.deepEqual(v.value, { id: "stopAAAA0001", date: "2026-12-28", time: "14:00", title: "Shibuya Sky", detail: "", gettingThere: "", travelMin: 0, fixed: false, place: "", signJp: "", booked: false, link: "", photo: "", note: "", lat: "", lng: "", tkRef: "", tkName: "", tkPeople: "", tkSeat: "" });
});
test("validateStop refuses what it must", () => {
  const bad = (patch, message) => assert.deepEqual(P.validateStop({ ...STOP, ...patch }, DATES), { ok: false, message });
  bad({ date: "2027-01-05" }, "Pick a day of the trip.");
  bad({ title: "  " }, "Say what it is.");
  bad({ title: "x".repeat(81) }, "Keep the name under 80 letters.");
  bad({ time: "9:5" }, "Use a time like 14:30.");
  bad({ time: "25:00" }, "Use a time like 14:30.");
  bad({ travelMin: 12.5 }, "Minutes to get there must be a whole number from 0 to 600.");
  bad({ travelMin: 601 }, "Minutes to get there must be a whole number from 0 to 600.");
  bad({ link: "javascript:alert(1)" }, "That link has to start with https://.");
  bad({ photo: "data:image/png;base64,AAAA" }, "That photo link has to start with https://.");
  bad({ place: "http://" }, "That map link didn’t come through properly.");
  bad({ fixed: "yes" }, "Fixed has to be on or off.");
  bad({ id: "x" }, "That stop has a bad id.");
});
test("validateStop length limits", () => {
  const bad = (patch, message) => assert.deepEqual(P.validateStop({ ...STOP, ...patch }, DATES), { ok: false, message });
  bad({ detail: "x".repeat(121) }, "Keep the detail under 120 letters.");
  bad({ gettingThere: "x".repeat(301) }, "Keep the directions under 300 letters.");
  bad({ place: "x".repeat(201) }, "Keep the place under 200 letters.");
  bad({ signJp: "x".repeat(21) }, "Keep the sign name under 20 letters.");
  bad({ note: "x".repeat(301) }, "Keep the note under 300 letters.");
  bad({ booked: 1 }, "Booked has to be on or off.");
  assert.equal(P.validateStop({ ...STOP, detail: "x".repeat(120), note: "x".repeat(300) }, DATES).ok, true);
});
test("a stop with no time is allowed, and a pasted Maps link is a place", () => {
  assert.equal(P.validateStop({ ...STOP, time: "" }, DATES).value.time, "");
  assert.equal(P.validateStop({ ...STOP, place: "https://maps.app.goo.gl/abc" }, DATES).value.place, "https://maps.app.goo.gl/abc");
});
test("stop rows round-trip, and a hand-typed row reads safely", () => {
  const s = { ...P.validateStop({ ...STOP, travelMin: 30, fixed: true, signJp: "渋谷" }, DATES).value };
  const back = P.stopFromRow(P.stopToRow(s));
  assert.deepEqual(back, { ...s, deleted: false });
  assert.equal("deleted_at" in P.stopToRow(s), false);
  const hand = P.stopFromRow({ id: "h1", date: new Date(Date.UTC(2026, 11, 28)), time: "9:5", title: 7, travel_min: "abc", fixed: "TRUE", link: "javascript:x", photo: "ftp://x", deleted_at: "2026-12-17T00:00:00Z" });
  assert.deepEqual([hand.time, hand.title, hand.travelMin, hand.fixed, hand.link, hand.photo, hand.deleted], ["", "7", 0, true, "", "", true]);
});
test("hand-typed stop times and minutes read as the app writes them (I5)", () => {
  const read = (cells) => P.stopFromRow({ id: "h1", date: "2026-12-28", title: "x", ...cells });
  assert.equal(read({ time: "9:30" }).time, "09:30");
  assert.equal(read({ time: "9:05" }).time, "09:05");
  assert.equal(read({ time: " 7:45 " }).time, "07:45");
  assert.equal(read({ time: "09:30" }).time, "09:30");
  for (const bad of ["9:5", "25:00", "9:60", "930", "nine", "19:30:00x", "-1:00"]) assert.equal(read({ time: bad }).time, "", bad);
  // A time cell Sheets hands back as a fraction of a day.
  assert.equal(read({ time: 0.5 }).time, "12:00");
  assert.equal(read({ time: 0.3958333333 }).time, "09:30");
  assert.equal(read({ time: 0 }).time, "00:00");
  assert.equal(read({ time: 0.99999 }).time, "", "rounds to 24:00: no time");
  for (const bad of [1, 1.5, -0.25, NaN]) assert.equal(read({ time: bad }).time, "", String(bad));
  // A time cell handed back as a Date: read only where the script's own zone
  // can be asked (Apps Script); here in Node there is none, so no time.
  assert.equal(read({ time: new Date(Date.UTC(1899, 11, 30, 0, 30)) }).time, "");
  // Minutes to get there: whole, from 0 up.
  assert.equal(read({ travel_min: 12.5 }).travelMin, 13);
  assert.equal(read({ travel_min: "12.4" }).travelMin, 12);
  assert.equal(read({ travel_min: 20 }).travelMin, 20);
  for (const bad of [-5, "-5", "abc", "", null, undefined, Infinity]) assert.equal(read({ travel_min: bad }).travelMin, 0, String(bad));
});

test("a Date time cell on Apps Script is read in the script's zone, and a seconds offset (an old zone's local mean time) counts as no time", () => {
  const saved = { U: global.Utilities, S: global.Session };
  try {
    global.Session = { getScriptTimeZone: () => "America/Chicago" };
    global.Utilities = { formatDate: (d, tz, fmt) => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d);
      const get = (t) => parts.find((p) => p.type === t).value;
      return fmt.replace("HH", get("hour")).replace("mm", get("minute")).replace("ss", get("second"));
    } };
    // 09:30 on Sheets' zero day in Chicago (UTC−6 by then).
    assert.equal(P.stopFromRow({ id: "h1", time: new Date(Date.UTC(1899, 11, 30, 15, 30)) }).time, "09:30");
    assert.equal(P.stopFromRow({ id: "h1", time: new Date(Date.UTC(1899, 11, 30, 15, 30, 28)) }).time, "");
    assert.equal(P.stopFromRow({ id: "h1", time: new Date(NaN) }).time, "");
  } finally {
    global.Utilities = saved.U;
    global.Session = saved.S;
  }
});

test("validateStay", () => {
  const stay = { id: "stayAAAA0001", name: "Asakusa hotel", firstNight: "2026-12-26", lastNight: "2026-12-28" };
  assert.deepEqual(P.validateStay(stay).value, { ...stay, nameJp: "", addressJp: "", note: "", place: "", link: "", photo: "" });
  assert.equal(P.validateStay({ ...stay, lastNight: "2026-12-25" }).message, "The last night can’t be before the first.");
  assert.equal(P.validateStay({ ...stay, name: "" }).message, "Say where you’re staying.");
  assert.equal(P.validateStay({ ...stay, link: "javascript:x" }).message, "That link has to start with https://.");
  assert.equal(P.validateStay({ ...stay, id: "x" }).message, "That stay has a bad id.");
  assert.equal(P.validateStay({ ...stay, firstNight: "nope" }).message, "Pick the first and last night.");
  assert.equal(P.validateStay({ ...stay, name: "x".repeat(81) }).message, "Keep the name under 80 letters.");
  assert.equal(P.validateStay({ ...stay, nameJp: "x".repeat(81) }).message, "Keep the second name under 80 letters.");
  assert.equal(P.validateStay({ ...stay, addressJp: "x".repeat(201) }).message, "Keep the address under 200 letters.");
});
test("validateStay: an optional https photo, like a stop's", () => {
  const stay = { id: "stayAAAA0001", name: "Asakusa hotel", firstNight: "2026-12-26", lastNight: "2026-12-28" };
  assert.equal(P.validateStay({ ...stay, photo: "https://example.org/a.jpg" }).value.photo, "https://example.org/a.jpg");
  assert.equal(P.validateStay(stay).value.photo, "");
  const msg = "That photo link has to start with https://.";
  assert.equal(P.validateStay({ ...stay, photo: "http://example.org/a.jpg" }).message, msg);
  assert.equal(P.validateStay({ ...stay, photo: "javascript:alert(1)" }).message, msg);
  assert.equal(P.validateStay({ ...stay, photo: 5 }).message, msg);
  assert.equal(P.validateStay({ ...stay, photo: 5 }).message, P.validateStay({ ...stay, photo: "x" }).message);
  assert.equal(P.validateStay({ ...stay, link: 5 }).ok, false, "a non-string link is refused too");
});
test("stay photo: column after link, read through safeUrl, written by stayToRow", () => {
  const t = P.TABS.Stays;
  assert.equal(t[t.indexOf("link") + 1], "photo");
  // lat and lng came later: after deleted_at, where migrate adds them.
  assert.deepEqual(t.slice(-3), ["deleted_at", "lat", "lng"]);
  assert.equal(P.isTextColumn("Stays", "photo"), P.isTextColumn("Stops", "photo"));
  assert.equal(P.stayFromRow({ id: "s", photo: "https://example.org/a.jpg" }).photo, "https://example.org/a.jpg");
  for (const bad of ["=HYPERLINK(\"https://example.org/a.jpg\")", "http://example.org/a.jpg", "javascript:x", undefined]) {
    assert.equal(P.stayFromRow({ id: "s", photo: bad }).photo, "", String(bad));
  }
  assert.equal(P.stayToRow({ id: "s", photo: "https://example.org/a.jpg" }).photo, "https://example.org/a.jpg");
});
test("stay rows round-trip and read safely", () => {
  const stay = P.validateStay({ id: "stayAAAA0001", name: "Asakusa hotel", firstNight: "2026-12-26", lastNight: "2026-12-28", link: "https://x.test" }).value;
  assert.deepEqual(P.stayFromRow(P.stayToRow(stay)), { ...stay, deleted: false, lat: "", lng: "" });
  assert.equal("deleted_at" in P.stayToRow(stay), false);
  assert.equal(P.stayFromRow({ id: "s", name: "N", link: "javascript:x", deleted_at: "x" }).link, "");
  assert.equal(P.stayFromRow({ id: "s", deleted_at: "x" }).deleted, true);
  assert.deepEqual(P.TABS.Stays.slice(-3), ["deleted_at", "lat", "lng"]);
});
test("validateDayPatch", () => {
  assert.deepEqual(P.validateDayPatch({ city: " Tokyo ", lineColour: "#2fb6e8" }).value, { city: "Tokyo", lineColour: "#2fb6e8" });
  assert.equal(P.validateDayPatch({ lineColour: "blue" }).message, "Use a colour like #2FB6E8.");
  assert.equal(P.validateDayPatch({ date: "2026-12-27" }).message, "Only a day’s city, title, line and places can be changed.");
  assert.equal(P.validateDayPatch({}).message, "Nothing to change.");
  assert.equal(P.validateDayPatch({ city: "x".repeat(61) }).message, "Keep each line, city and place under 60 letters.");
  assert.equal(P.validateDayPatch({ title: "x".repeat(81) }).message, "Keep the title under 80 letters.");
  assert.equal(P.validateDayPatch({ title: "x".repeat(80) }).ok, true);
  assert.deepEqual(P.validateDayPatch({ lineColour: "" }).value, { lineColour: "" });
});
test("day rows, labels and links", () => {
  const d = { date: "2026-12-28", city: "Tokyo", title: "", lineJp: "山手線", lineEn: "Yamanote", lineColour: "#9ACD32", fromJp: "", fromEn: "", toJp: "", toEn: "", lat: "", lng: "" };
  assert.deepEqual(P.dayFromRow(P.dayToRow(d)), d);
  assert.equal(P.dayFromRow({ date: "2026-12-28", line_colour: "not a colour" }).lineColour, "");
  assert.equal(P.dayLabel("2026-12-28"), "Mon Dec 28");
  assert.equal(P.safeUrl("  https://a.test/x "), "https://a.test/x");
  assert.equal(P.safeUrl("javascript:alert(1)"), "");
  assert.equal(P.safeUrl("https://a b"), "");
  assert.equal(P.safeUrl("https://a.test/" + "x".repeat(500)), "");
  assert.equal(P.safeUrl(5), "");
});

// ---------- payments from the planner sheet (Task 12, R39) ----------
// Every value here is made up: ids, vendors, refs and amounts.

const PLAN_HEAD = ["payment_id", "date_paid", "payer", "description", "category", "vendor", "booking_ref", "amount", "currency", "amount_cad", "cad_is_exact", "split_between", "split_type", "status", "include_in_split", "source", "added_by", "notes"];
// One planner row from named fields; the rest blank.
const planRow = (o, head = PLAN_HEAD) => head.map((h) => (o[h] === undefined ? "" : o[h]));
const X7 = { payment_id: "X7", date_paid: "2026-12-27", payer: "Mo", description: "Rail pass", category: "transport", vendor: "North Rail", booking_ref: "AB12", amount: 160.5, currency: "USD", amount_cad: 221.52, cad_is_exact: "yes", split_between: "Mo, Izzah, Sam", split_type: "equal", include_in_split: "yes" };
const X9 = { payment_id: "X9", date_paid: "2026-11-18", payer: "Izzah", description: "Flight north", category: "flight", vendor: "Sky Air", booking_ref: "ZZ9", amount: 204.25, currency: "USD", amount_cad: 274.05, cad_is_exact: "no — est.", split_between: "Mo,Izzah,Sam", split_type: "equal", include_in_split: "yes" };
const PLAN_DATES = ["2026-12-26", "2026-12-27", "2026-12-28", "2026-12-29"];
const payOf = (o) => {
  const r = P.paymentsFromRows([PLAN_HEAD, planRow(o)]);
  assert.equal(r.payments.length, 1, JSON.stringify(r.problems));
  return r.payments[0];
};
const convert = (o) => P.expenseFromPayment(payOf({ ...X7, ...o }), NAMES, PLAN_DATES);

// ---------- the stamp book: when a stamp is open ----------

const SDEFS = [{ id: "d1", date: "2030-01-05" }, { id: "d2", date: "2030-01-06" }, { id: "iss", date: "" }];
const [SD1, , SISS] = SDEFS;

test("stampWindow: a day stamp is open 27 hours from 00:00 Chicago time; the issue stamp until the last day closes", () => {
  assert.deepEqual(P.stampWindow(SD1, SDEFS), { opens: Date.UTC(2030, 0, 5, 6), closes: Date.UTC(2030, 0, 6, 9) });
  assert.deepEqual(P.stampWindow(SISS, SDEFS), { opens: 0, closes: Date.UTC(2030, 0, 7, 9) });
  // no day stamps at all: the issue stamp does not close
  assert.equal(P.stampWindow(SISS, [SISS]).closes, Infinity);
  // a date that is not a day is never open
  const bad = P.stampWindow({ id: "x", date: "someday" }, SDEFS);
  assert.ok(bad.opens > bad.closes);
});

test("pressRefusal: the window edges, in Chicago time", () => {
  const at = (h, m = 0, s = 0, day = 6) => Date.UTC(2030, 0, day, h, m, s);
  const same = (ms) => P.pressRefusal(SD1, SDEFS, ms, ms);
  assert.equal(same(at(8, 59, 59)), "");
  assert.equal(same(at(9)), "closed");
  assert.equal(same(Date.UTC(2030, 0, 5, 5, 59, 59)), "not_open");
  assert.equal(same(Date.UTC(2030, 0, 5, 6)), "");
});

test("pressRefusal: late after 48 hours, future past 5 minutes", () => {
  const at = Date.UTC(2030, 0, 5, 16);
  assert.equal(P.pressRefusal(SD1, SDEFS, at, Date.UTC(2030, 0, 7, 16, 0, 1)), "late");
  assert.equal(P.pressRefusal(SD1, SDEFS, at, Date.UTC(2030, 0, 7, 16)), "");
  assert.equal(P.pressRefusal(SD1, SDEFS, at + 6 * 60000, at), "future");
  assert.equal(P.pressRefusal(SD1, SDEFS, at + 5 * 60000, at), "");
  assert.equal(P.pressRefusal(SD1, SDEFS, NaN, at), "future");
});

test("pressRefusal: the issue stamp is open from the start until the last day closes", () => {
  assert.equal(P.pressRefusal(SISS, SDEFS, Date.UTC(2029, 5, 1), Date.UTC(2029, 5, 1)), "");
  assert.equal(P.pressRefusal(SISS, SDEFS, Date.UTC(2030, 0, 7, 8, 59), Date.UTC(2030, 0, 7, 8, 59)), "");
  assert.equal(P.pressRefusal(SISS, SDEFS, Date.UTC(2030, 0, 7, 9), Date.UTC(2030, 0, 7, 9)), "closed");
});

test("stamp rows and the History sentence", () => {
  assert.deepEqual(P.stampFromRow({ id: "d1|Mo", def: "d1", who: "Mo", at: "2030-01-05T01:00:00.000Z", seed: 7, gone: "" }), { def: "d1", who: "Mo", at: "2030-01-05T01:00:00.000Z", seed: 7 });
  assert.equal(P.stampFromRow({ def: "d1", who: "Mo", at: "", seed: 7, gone: "yes" }).gone, true);
  assert.equal(P.summarize("press", "stamp", null, { day: "2030-01-05" }), "stamped Jan 5");
  assert.equal(P.summarize("press", "stamp", null, { day: "" }), "stamped the book");
});
