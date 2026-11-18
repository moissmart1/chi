// The Apps Script glue (Env.js, Rate.js, Setup.js) evaluated over stand-ins
// for the Google services, to pin down the order of calls and the messages.
// Not proof that Google behaves this way: that needs the real thing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BACKEND = path.join(__dirname, "..", "backend");
const src = (f) => fs.readFileSync(path.join(BACKEND, f), "utf8");

function world({ props = {}, fetch } = {}) {
  const calls = [];
  const cache = new Map();
  const ctx = vm.createContext({
    calls,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => { calls.push("prop:" + k); return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
      setProperty: (k, v) => { props[k] = String(v); },
    }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v, s) => { calls.push("cache.put:" + k + ":" + s); cache.set(k, v); },
      remove: (k) => cache.delete(k),
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => calls.push("release") }) },
    SpreadsheetApp: { flush: () => calls.push("flush") },
    Utilities: { formatDate: () => "2026-12-26" },
    UrlFetchApp: { fetch: (url, opts) => { calls.push("fetch:" + url); return fetch(); } },
  });
  for (const f of ["Pure.js", "Env.js", "Rate.js"]) vm.runInContext(src(f), ctx, { filename: f });
  ctx.props = props;
  return ctx;
}

const reply = (code, body) => () => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

test("withLock_ flushes pending Sheet writes before it lets go of the lock, even when fn throws (F8)", () => {
  const w = world();
  assert.equal(w.withLock_(() => 7), 7);
  assert.deepEqual(w.calls.slice(-2), ["flush", "release"]);
  assert.throws(() => w.withLock_(() => { throw new Error("boom"); }), /boom/);
  assert.deepEqual(w.calls.slice(-2), ["flush", "release"]);
});

test("tripKey_ keeps the key in the script cache for six hours, reading Script Properties only on a miss (F12)", () => {
  const w = world({ props: { TRIP_KEY: "k1" } });
  assert.equal(w.tripKey_(), "k1");
  assert.equal(w.tripKey_(), "k1");
  assert.equal(w.tripKey_(), "k1");
  assert.equal(w.calls.filter((c) => c === "prop:TRIP_KEY").length, 1);
  assert.ok(w.calls.includes("cache.put:TRIP_KEY:21600"));
  const none = world();
  assert.equal(none.tripKey_(), null);
});

test("getRateInfo_ says live for a fetched rate, last for an earlier day's, fallback for 0.72 (F7)", () => {
  const live = world({ fetch: reply(200, { rates: { USD: 0.7234, JPY: 108.4 } }) });
  assert.deepEqual(JSON.parse(JSON.stringify(live.getRateInfo_())), { rate: 0.7234, source: "live" });
  assert.equal(live.getRate_(), 0.7234);
  assert.ok(live.calls.includes("fetch:https://open.er-api.com/v6/latest/CAD"), "asks for Canadian dollars");
  const last = world({ props: { RATE_LAST: "0.7189" }, fetch: reply(500, {}) });
  assert.deepEqual(JSON.parse(JSON.stringify(last.getRateInfo_())), { rate: 0.7189, source: "last" });
  const none = world({ fetch: () => { throw new Error("DNS error"); } });
  assert.deepEqual(JSON.parse(JSON.stringify(none.getRateInfo_())), { rate: 0.72, source: "fallback" });
});

test("the rate is kept to four decimals, and only between 0.5 and 1.0 US dollars a Canadian dollar", () => {
  const long = world({ fetch: reply(200, { rates: { USD: 0.723456 } }) });
  assert.equal(long.getRate_(), 0.7235);
  assert.equal(long.props["RATE_2026-12-26"], "0.7235");
  assert.equal(long.props.RATE_LAST, "0.7235");
  for (const bad of [0.5, 1.0, 1.38, 0.2, 111, "x"]) {
    const w = world({ fetch: reply(200, { rates: { USD: bad } }) });
    assert.deepEqual(JSON.parse(JSON.stringify(w.getRateInfo_())), { rate: 0.72, source: "fallback" }, String(bad));
    assert.equal(w.props["RATE_2026-12-26"], undefined, String(bad));
  }
  // a feed that answers yen only has no US dollar rate
  const yenOnly = world({ fetch: reply(200, { rates: { JPY: 108.4 } }) });
  assert.equal(yenOnly.getRate_(), 0.72);
});

test("requireLiveRate_ (run by setup) fetches once and fails loudly with the reason (F7)", () => {
  const ok = world({ fetch: reply(200, { rates: { USD: 0.7234 } }) });
  ok.requireLiveRate_();
  assert.equal(ok.props["RATE_2026-12-26"], "0.7234");

  const blocked = world({ props: { RATE_FAIL_AT: new Date().toISOString() }, fetch: reply(403, {}) });
  assert.throws(() => blocked.requireLiveRate_(), (e) => e.message === "Couldn’t fetch today’s US dollar rate from open.er-api.com: HTTP 403. The app would fall back to 0.72.");
  assert.equal(blocked.calls.filter((c) => c.startsWith("fetch:")).length, 1, "tried even within the hour after a failure");

  const down = world({ fetch: () => { throw new Error("Address unavailable"); } });
  assert.throws(() => down.requireLiveRate_(), /: Address unavailable\. The app would fall back to 0\.72\.$/);

  const odd = world({ fetch: reply(200, { rates: { USD: 5 } }) });
  assert.throws(() => odd.requireLiveRate_(), /: an unexpected rate \(5\)\./);

  const stored = world({ props: { "RATE_2026-12-26": "0.72" }, fetch: () => { throw new Error("not called"); } });
  stored.requireLiveRate_();
});

test("setup() checks the rate after building the tabs", () => {
  const s = src("Setup.js");
  const body = s.slice(s.indexOf("function setup()"), s.indexOf("function seedIfEmpty_"));
  assert.match(body, /requireLiveRate_\(\);\s*\}\s*$/);
});

// ---------- the planner sheet (Task 12, R39) ----------
// Made-up id and rows. Setup.js and Env.js over stand-ins for Sheets and Logger.
const PLANNER_ID = "fakePlannerSheet_0123456789abcdefXYZ";
const PHEAD = ["payment_id", "date_paid", "payer", "description", "category", "vendor", "booking_ref", "amount", "currency", "amount_cad", "cad_is_exact", "split_between", "split_type", "status", "include_in_split", "source", "added_by", "notes"];

// cells(id, opt): what Spreadsheets.get answers for a read of cells (opt.ranges);
// by default every cell is empty.
function plannerWorld({ props = {}, get, tabs = ["Payments"], noAccess = false, update, append, cells }) {
  const logged = [];
  const asked = [];
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    Utilities: { formatDate: (d, tz, fmt) => { asked.push(["formatDate", tz, fmt]); return "2026-12-06 10:00"; } },
    Sheets: { Spreadsheets: {
      Values: {
        get: (...a) => { asked.push(a); return get(...a); },
        update: (...a) => { asked.push(["update", ...a]); return update ? update(...a) : {}; },
        append: (...a) => { asked.push(["append", ...a]); return append ? append(...a) : {}; },
      },
      get: (...a) => {
        asked.push(a);
        if (a[1] && a[1].ranges) return cells ? cells(...a) : { sheets: [{ data: [{}] }] };
        if (noAccess) throw new Error("no access");
        return { sheets: tabs.map((title) => ({ properties: { title } })) };
      },
    } },
    Logger: { log: (x) => logged.push(String(x)) },
  });
  for (const f of ["Pure.js", "Env.js", "Setup.js"]) vm.runInContext(src(f), ctx, { filename: f });
  return { ctx, logged, asked, props };
}

// Book Now and Change Log as the planner holds them (made up), for checkPlanner.
const BOOK = [["Before we go"], ["#", "Item", "Book by", "Status"], [1, "Secret Tour", "Dec 21", ""], [2, "Hidden Inn", "", "Booked"], ["* footnote"]];
const CLOG = [["#", "Tab", "Old value", "New value"], [1, "Book Now", "Private old", "Private new"]];
const byRange = (payments, book = BOOK, log = CLOG) => (id, range) => {
  if (range.startsWith("Payments!")) return { values: payments };
  if (range.startsWith("'Book Now'!")) { if (book instanceof Error) throw book; return { values: book }; }
  if (range.startsWith("'Change Log'!")) { if (log instanceof Error) throw log; return { values: log }; }
  throw new Error("Unable to parse range: " + range);
};

// What Spreadsheets.get answers for one cell, by what the cell holds.
const oneCell = (v) => ({ sheets: [{ data: [v === undefined ? {} : { rowData: [{ values: [v] }] }] }] });
const CELLS = {
  E4: oneCell({ userEnteredValue: { formulaValue: "=A1&B1" }, effectiveValue: { stringValue: "ab" } }),
  E5: oneCell({ effectiveValue: { stringValue: "Booked" } }), // spilled by an array formula placed elsewhere
  E6: oneCell({ userEnteredValue: { stringValue: "Booked" }, effectiveValue: { stringValue: "Booked" } }),
  E7: oneCell({}),
  E8: oneCell(),
  E9: { sheets: [{ data: [{ rowData: [{}] }] }] },
};

test("no planner: the script asks only for its own Sheet and outside fetches, with no advanced Sheets service, and nothing uses either", () => {
  const manifest = JSON.parse(src("appsscript.json"));
  assert.deepEqual(manifest.oauthScopes, [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.external_request",
  ]);
  assert.equal("dependencies" in manifest, false, "no advanced services");
  for (const f of fs.readdirSync(BACKEND).filter((n) => n.endsWith(".js"))) {
    const code = src(f);
    assert.equal(/\bSheets\.Spreadsheets\b/.test(code), false, f + " uses the advanced Sheets service");
    assert.equal(/openById|SpreadsheetApp\.open\(/.test(code), false, f + " opens another spreadsheet");
    assert.equal(/\bplanner(Id|Rows|Tab|SetCell|AppendRow)_\b|checkPlanner|linkPlanner|syncPayments|syncTodos|tickTodo|claimTodo/.test(code), false, f + " still has planner code");
  }
});

test("no planner: the old planner actions are unknown to the backend, load carries no planner fields, and the Sheet has no Todos tab or planner_id", async () => {
  const { createFakeBackend } = require("./fake-backend.cjs");
  const fake = createFakeBackend();
  for (const action of ["linkPlanner", "syncPayments", "syncTodos", "tickTodo", "claimTodo"]) {
    const r = await fake({ key: "test-key", actor: "Mo", action, args: { id: "1", on: true } });
    assert.deepEqual([r.ok, r.error], [false, "bad_input"], action);
  }
  const d = (await fake({ key: "test-key", actor: "Mo", action: "load", args: {} })).data;
  for (const k of ["plannerLinked", "todos", "todosPulledAt", "paymentsPulledAt", "paymentProblems"]) assert.equal(k in d, false, k);
  const P = require("../backend/Pure.js");
  assert.equal("Todos" in P.TABS, false);
  assert.equal(P.TABS.Expenses.includes("planner_id"), false);
});
