// The real backend in memory. createFakeBackend(seed, { clock }) evaluates the
// actual backend/Pure.js, Actions.js, Money.js and Mcp.js source over
// in-memory versions of the storage primitives they use, so tests exercise
// the real action and connector code. The in-memory sheet helpers mirror backend/Sheets.js: same sanitising
// on write, only patched columns written, same return values, and cells read
// back the way Sheets hands them back (a stored "'=x" reads as "=x").
//
// seed = { expenses?, payments?, people?, addPeople?, days?, stops?, stays?,
// missingColumns?, missingTabs? } (see constraints R6). addPeople: more
// People rows ({ name, initials, ... }) after the seed's Mo and Izzah;
// missingColumns: ["Tab.column", ...] an older Sheet lacks until migrate
// (ensureColumns_) adds them; missingTabs: ["Tab", ...] an older Sheet lacks
// altogether until migrate adds them.
// stops and stays are arrays in API shape (deleted: true marks
// one deleted), each logged as added by Mo; days is a per-date patch in the
// Sheet's own column names.
// The returned function takes a request body and resolves to the envelope.
// Options: clock (() => ISO string); test-only: lockFails (() => boolean;
// each true is a busy lock that made the caller wait 8 s: fake.lockWaitedMs()),
// keepsApostrophe (Sheets hands back a text cell's leading ' verbatim).
// Test handles: fake.tables (live rows per tab), fake.requests (every body
// received, including those the connector hands to handle_), fake.mcp(msg,
// params) (the Claude connector: mcp_, as doPost calls it for a JSON-RPC body),
// fake.beforeConnectorWrite (test-only: set it to run code just before a
// request the connector makes reaches handle_), fake.primitives (the in-memory helpers), fake.props (Script
// Properties), fake.propReads (every Script Properties key read, in order),
// fake.setRate(rate, source) (today's rate and where it came from: "live",
// "last" or "fallback"; default 0.72, "live"), fake.tableReads
// (readTable_ calls per tab), fake.geocoder ({ answer(query, region) }: the
// stand-in for Apps Script's geocoder; default finds nothing).

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const BACKEND = path.join(__dirname, "..", "backend");
const script = (name) => new vm.Script(fs.readFileSync(path.join(BACKEND, name), "utf8"), { filename: path.join(BACKEND, name) });
const PURE = script("Pure.js");
const ACTIONS = script("Actions.js");
const MONEY = script("Money.js");
const MCP = script("Mcp.js");
const KEYS = script("Keys.js");
const SETUP = script("Setup.js");

const TRIP_KEY = "test-key";
// The release check's key in tests (the real one lives outside the repo):
// the fake's CHECK_KEY_HASH is this key's hash, not CheckKey.js's.
const CHECK_KEY = "test-check-key";
const sha256 = (t) => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const CLAUDE_TOKEN = "claude-token";
const RATE = 0.72;
const SHEET_URL = "https://example.test/sheet";

const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// What Sheets hands back for a stored cell under setup()'s formatting (see
// isTextColumn in Pure.js). Which way Sheets treats a leading apostrophe in a
// plain-text cell is not yet verified, so both are modelled: by default it is
// the "treat as text" marker and is dropped; with keepsApostrophe a text cell
// hands it back verbatim. (rowToObj then undoes the escape either way.)
// A plain-text column gives back a string even when a number or boolean was
// written; any other column turns a string that looks like a number or
// TRUE/FALSE into a number or boolean.
function readCell(text, v, keepsApostrophe) {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" && v.charAt(0) === "'") return text && keepsApostrophe ? v : v.slice(1);
  if (text) {
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^(true|false)$/i.test(t)) return t.toUpperCase() === "TRUE";
  }
  return v;
}

// "YYYY-MM-DD" at this ISO instant in the zone tz.
function dayIn(iso, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function createFakeBackend(seed, { clock, lockFails, keepsApostrophe = false } = {}) {
  const now = clock || (() => new Date().toISOString());
  const world = vm.createContext({});
  PURE.runInContext(world);
  const P = world;

  const tables = {};
  for (const tab of Object.keys(P.TABS)) tables[tab] = [];
  // Seeded Log rows are not writes, so REV starts at 0 even when seeded (an
  // unset REV would otherwise fall back to the Log's highest id).
  const props = { TRIP_KEY, CLAUDE_TOKEN, REV: "0" };
  const held = { app: false, owner: false };
  const missing = new Set((seed && seed.missingColumns) || []);
  const missingTabs = new Set((seed && seed.missingTabs) || []);
  const tableReads = {};
  const sheetCalls = { hasTab: 0, hasColumn: 0, orNull: 0 };
  const propReads = [];
  const rate = { rate: RATE, source: "live" };
  const cache = {}; // the script cache, for the trip key
  let lockWaited = 0; // ms the in-memory lock has made callers wait
  // The owner's run log (Logger.log) and the executions log (console.error).
  const logged = [];
  // The mail desk at DESK_URL (postJson_ above).
  const deskPosts = [];
  const fakeDesk = { answer: () => ({ ok: true }) };
  const consoleLines = [];
  // The stand-in geocoder (Env.js geocode_): answer(query, region) -> { lat, lng } | null, or throws.
  const geocoder = { answer: () => null };

  const headers = (tab) => {
    const h = P.TABS[tab];
    if (!h || missingTabs.has(tab)) throw new Error("Missing tab: " + tab + ". Run setup().");
    return h.filter((col) => !missing.has(tab + "." + col));
  };
  const cellOut = (tab, h, v) => readCell(P.isTextColumn(tab, h), v, keepsApostrophe);
  // Same path as the real readTable_: cells as Sheets hands them back, then rowToObj.
  const readRow = (tab, stored) => {
    const h = headers(tab);
    return P.rowToObj(h, h.map((col) => cellOut(tab, col, stored[col])));
  };

  const primitives = {
    readTable_(tab) {
      headers(tab);
      tableReads[tab] = (tableReads[tab] || 0) + 1;
      return tables[tab].map((r) => readRow(tab, r));
    },
    appendObj_(tab, obj) {
      const h = headers(tab);
      const cells = P.objToRow(h, obj);
      const stored = {};
      h.forEach((col, i) => { stored[col] = cells[i]; });
      tables[tab].push(stored);
    },
    updateWhere_(tab, column, value, patch) {
      if (value === "" || value === null || value === undefined) return null;
      const h = headers(tab);
      if (h.indexOf(column) === -1) return null;
      for (const stored of tables[tab]) {
        if (P.cellDate_(P.unsanitizeCell(cellOut(tab, column, stored[column]))) !== String(value)) continue;
        for (const key of Object.keys(patch)) {
          if (h.indexOf(key) === -1 || patch[key] === undefined) continue;
          stored[key] = patch[key] === null ? "" : P.sanitizeCell(patch[key]);
        }
        return readRow(tab, stored);
      }
      return null;
    },
    updateById_(tab, id, patch) {
      return primitives.updateWhere_(tab, "id", id, patch);
    },
    // Same as Sheets.js: rows written below the last as one block.
    appendObjs_(tab, objs) {
      for (const obj of objs) primitives.appendObj_(tab, obj);
    },
    // Same as Sheets.js: one column's cells from row 2 down, as Sheets hands them back.
    columnValues_(tab, column) {
      const h = headers(tab);
      if (h.indexOf(column) === -1) return [];
      return tables[tab].map((r) => readRow(tab, r)[column]);
    },
    // Same as Sheets.js: one column's cells in the given sheet rows (2 is the first row under the header).
    cellsAt_(tab, column, rowNums) {
      headers(tab);
      return rowNums.map((n) => (tables[tab][n - 2] ? readRow(tab, tables[tab][n - 2])[column] : ""));
    },
    // Same as Sheets.js: deletes those sheet rows.
    deleteRowsAt_(tab, rowNums) {
      headers(tab);
      for (const n of [...rowNums].sort((x, y) => y - x)) tables[tab].splice(n - 2, 1);
    },
    // Adds the tabs and columns an older Sheet lacked (seed.missingTabs and
    // seed.missingColumns), in TABS order, a new tab's columns one by one.
    ensureColumns_() {
      const added = [];
      for (const tab of Object.keys(P.TABS)) for (const col of P.TABS[tab]) if (missingTabs.has(tab) || missing.has(tab + "." + col)) added.push(tab + "." + col);
      missing.clear();
      missingTabs.clear();
      return added;
    },
    hasColumn_(tab, col) {
      sheetCalls.hasColumn++;
      return headers(tab).indexOf(col) !== -1;
    },
    hasTab_(tab) {
      sheetCalls.hasTab++;
      return Boolean(P.TABS[tab]) && !missingTabs.has(tab);
    },
    // Same as Sheets.js: one lookup and one read of a tab, null when it is missing or lacks a column.
    readTableOrNull_(tab, columns) {
      sheetCalls.orNull++;
      if (!P.TABS[tab] || missingTabs.has(tab)) return null;
      const h = headers(tab);
      if (columns.some((c) => h.indexOf(c) === -1)) return null;
      tableReads[tab] = (tableReads[tab] || 0) + 1;
      return tables[tab].map((r) => readRow(tab, r));
    },
    getProp_(key) {
      propReads.push(key);
      return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null;
    },
    // Same as Env.js: the cached key, Script Properties only on a miss.
    tripKey_() {
      if (cache.TRIP_KEY) return cache.TRIP_KEY;
      const key = Object.prototype.hasOwnProperty.call(props, "TRIP_KEY") ? props.TRIP_KEY : null;
      if (key) cache.TRIP_KEY = key;
      return key;
    },
    setProp_(key, value) {
      props[key] = String(value);
    },
    delProp_(key) {
      delete props[key];
    },
    // Same as Env.js: SHA-256 in hex, a new 64-hex personal key, and the
    // cached shared key forgotten.
    sha256Hex_: (t) => sha256(t),
    newPersonKey_: () => crypto.randomBytes(32).toString("hex"),
    // Same as Env.js: a JSON body POSTed to an address, its JSON answer or
    // null. Test-only: fake.desk(url, body) plays the other end (default
    // { ok: true }; return null or throw for no usable answer); every call is
    // kept in fake.deskPosts with PERSON_KEYS as it was at that moment.
    postJson_(url, body) {
      deskPosts.push({ url, body: copy(body), personKeys: Object.prototype.hasOwnProperty.call(props, "PERSON_KEYS") ? props.PERSON_KEYS : null });
      try {
        const answer = fakeDesk.answer(url, copy(body));
        return answer === undefined ? null : copy(answer);
      } catch (e) {
        return null;
      }
    },
    forgetTripKey_() {
      delete cache.TRIP_KEY;
    },
    // Test-only: lockFails() returning true plays a lock that never frees up
    // (same envelope as Env.js withLock_).
    // A lock that is not freed waits its 8 seconds first (lockWaited), as
    // tryLock(8000) does, so the connector's retry timing can be tested.
    withLock_(fn) {
      if (lockFails && lockFails()) {
        lockWaited += 8000;
        return { ok: false, error: "busy", message: "Someone else is saving right now. Try again in a moment." };
      }
      const was = held.app;
      held.app = true;
      try {
        return fn();
      } finally {
        held.app = was;
      }
    },
    // Same as Env.js: the owner's own lock for a whole mailLinks run; a run
    // started while one holds it (here: from inside the desk's answer) is
    // refused at once.
    withOwnerRunLock_(fn) {
      if (held.owner) return false;
      held.owner = true;
      try {
        fn();
        return true;
      } finally {
        held.owner = false;
      }
    },
    geocode_: (q, region) => geocoder.answer(q, region),
    clockMs_: () => Date.now() + lockWaited,
    getRate_: () => rate.rate,
    getRateInfo_: () => ({ rate: rate.rate, source: rate.source }),
    nowIso_: () => now(),
    sheetUrl_: () => SHEET_URL,
    // Same as Env.js: 20 letters and digits, starting with a letter.
    newId_: () => "m" + crypto.randomBytes(16).toString("hex").slice(0, 19),
    // Today in the trip's zone (Env.js), by this backend's clock.
    today_: () => dayIn(now(), world.TRIP_TZ_),
    claudeToken_: () => (Object.prototype.hasOwnProperty.call(props, "CLAUDE_TOKEN") && props.CLAUDE_TOKEN) || null,
    ensureClaudeToken_() {
      if (!primitives.claudeToken_()) props.CLAUDE_TOKEN = crypto.randomBytes(16).toString("hex");
    },
  };
  Object.assign(world, primitives);
  world.CHECK_KEY_HASH = sha256(CHECK_KEY);
  world.Logger = { log: (t) => logged.push(String(t)) };
  world.console = { error: (t) => consoleLines.push(String(t)), log: (t) => consoleLines.push(String(t)), warn: (t) => consoleLines.push(String(t)) };
  KEYS.runInContext(world);
  SETUP.runInContext(world);
  ACTIONS.runInContext(world);
  MONEY.runInContext(world);
  MCP.runInContext(world);
  // A request the connector hands to handle_ is recorded like one from a phone.
  const handle = world.handle_;

  seedWorld(P, primitives, tables, props, seed || {}, now);

  const requests = [];
  const fake = (request) => {
    const body = copy(request);
    requests.push(copy(body));
    let env;
    try {
      env = handle(body);
    } catch (e) {
      // Same as doPost's last-resort catch.
      env = { ok: false, error: "server", message: "Something went wrong on our side. Try again." };
    }
    return Promise.resolve(copy(env));
  };
  // The connector reaches the actions through handleAs_ with the holder
  // { kind: "claude" } (never with a key): such a request is recorded like
  // one from a phone, as { via: "claude", actor, action, args, holder }.
  const handleAs = world.handleAs_;
  world.handleAs_ = (holder, body) => {
    if (holder && holder.kind === "claude") {
      const seen = { holder: "claude", actor: holder.name, via: "claude", action: body.action, args: copy(body.args) };
      requests.push(copy(seen));
      // Test-only: fake.beforeConnectorWrite(body) runs between whatever the
      // connector did first and its request reaching the actions (another
      // phone's write landing in that gap).
      if (typeof fake.beforeConnectorWrite === "function") fake.beforeConnectorWrite(copy(seen));
    }
    return handleAs(holder, body);
  };
  // Test-only: a request through the connector's own path (handleAs_ as the
  // holder { kind: "claude" }, as Mcp.js makes it after its token check),
  // as `actor` (default the trip's first person). A phone's via: "claude" is
  // ignored by the backend.
  fake.claude = (action, args = {}, actor) => Promise.resolve(copy(world.handleAs_({ kind: "claude", name: actor || world.peopleNames_()[0] }, { action, args: copy(args) })));
  fake.mcp = (msg, params) => copy(world.mcp_(copy(msg), copy(params)));
  fake.tables = tables;
  fake.requests = requests;
  fake.primitives = primitives;
  fake.geocoder = geocoder;
  fake.world = world; // test-only: replace a helper (e.g. make updateById_ throw)
  fake.lockWaitedMs = () => lockWaited;
  // Test-only: what the Plan 1 backend (0a66cbd) answered to load, for a
  // phone still holding that cache: days, stops and stays as plainRow_ made
  // them (the Sheet's columns camel-cased, a Date cell as its date, an empty
  // cell ""; stops with deletedAt and no deleted; stays with no deleted_at
  // column yet), and the rest as now.
  fake.plan1Load = async () => {
    const env = await fake({ key: TRIP_KEY, action: "load", args: {} });
    requests.pop();
    const camel = (k) => k.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
    const plain = (o, drop = []) => {
      const out = {};
      for (const k of Object.keys(o)) {
        if (drop.includes(k)) continue;
        const v = o[k];
        out[camel(k)] = v instanceof Date ? P.cellDate_(v) : v === null || v === undefined ? "" : v;
      }
      return out;
    };
    const rows = (tab) => primitives.readTable_(tab).filter((r) => String(r[tab === "Days" ? "date" : "id"] || "") !== "");
    return {
      rev: env.rev,
      data: {
        ...env.data,
        days: rows("Days").map((r) => plain(r)),
        stops: rows("Stops").map((r) => plain(r)),
        stays: rows("Stays").map((r) => plain(r, ["deleted_at"])),
      },
    };
  };
  fake.deskPosts = deskPosts;
  Object.defineProperty(fake, "desk", { get: () => fakeDesk.answer, set: (fn) => { fakeDesk.answer = fn; } });
  fake.props = props;
  fake.logged = logged;
  fake.consoleLines = consoleLines;
  // Test-only: gives person `name` a personal key (as issueLinks would) and
  // returns it; PERSON_KEYS holds only its hash.
  fake.personKey = (name) => {
    const key = crypto.randomBytes(32).toString("hex");
    const keys = world.personKeys_();
    keys[name] = { hash: sha256(key), at: now() };
    world.setPersonKeys_(keys);
    return key;
  };
  fake.CHECK_KEY = CHECK_KEY;
  fake.tableReads = tableReads;
  fake.sheetCalls = sheetCalls;
  fake.propReads = propReads;
  fake.setRate = (r, source) => {
    rate.rate = r;
    rate.source = source;
  };
  return fake;
}

// Writes what setup() writes, then the seed's patches, items and Log rows.
// Not routed through handle_ (it must be able to set addedAt and the like),
// but every row goes through the same converters and sheet helpers.
function seedWorld(P, prim, tables, props, seed, now) {
  const rows = P.setupSeedRows();
  for (const tab of ["Trip", "People", "Days"]) for (const o of rows[tab]) prim.appendObj_(tab, o);
  // More people than the seed's two, for the cases that need three or more.
  for (const [i, p] of (seed.addPeople || []).entries()) prim.appendObj_("People", { order: rows.People.length + i + 1, etransfer: "", simplify: true, email: "", photo: "", ...p });
  for (const [name, patch] of Object.entries(seed.people || {})) prim.updateWhere_("People", "name", name, patch);
  for (const [date, patch] of Object.entries(seed.days || {})) prim.updateWhere_("Days", "date", date, patch);

  const lastRow = (tab) => prim.readTable_(tab)[tables[tab].length - 1];
  const events = [];

  for (const given of seed.expenses || []) {
    const e = { rate: RATE, splitMode: "equal", splitVals: [], note: "", kind: "", deleted: false, ...copy(given) };
    if (e.addedBy === undefined) e.addedBy = e.paidBy;
    if (e.addedAt === undefined) e.addedAt = now();
    const row = P.expenseToRow(e);
    row.added_at = e.addedAt;
    if (e.deleted) row.deleted_at = e.addedAt;
    prim.appendObj_("Expenses", row);
    const saved = P.expenseFromRow(lastRow("Expenses"));
    const live = { ...saved, deleted: false };
    const base = { at: e.addedAt, who: e.addedBy, kind: "expense", ref: saved.id };
    events.push({ ...base, action: "add", summary: P.summarize("add", "expense", null, live), before: null, after: live });
    if (saved.deleted) events.push({ ...base, action: "delete", summary: P.summarize("delete", "expense", live, saved), before: live, after: saved });
  }

  for (const given of seed.payments || []) {
    const p = { seed: 1, rot: 0, removed: false, ...copy(given) };
    if (p.stampedBy === undefined) p.stampedBy = p.from;
    if (p.stampedAt === undefined) p.stampedAt = now();
    const row = P.paymentToRow(p);
    row.stamped_at = p.stampedAt;
    if (p.removed) row.removed_at = p.stampedAt;
    prim.appendObj_("Settlements", row);
    const saved = P.paymentFromRow(lastRow("Settlements"));
    const live = { ...saved, removed: false };
    const base = { at: p.stampedAt, who: p.stampedBy, kind: "payment", ref: saved.id };
    events.push({ ...base, action: "stamp", summary: P.summarize("stamp", "payment", null, live), before: null, after: live });
    if (saved.removed) events.push({ ...base, action: "unstamp", summary: P.summarize("unstamp", "payment", live, saved), before: live, after: saved });
  }

  for (const kind of ["stop", "stay"]) {
    const tab = kind === "stop" ? "Stops" : "Stays";
    const toRow = kind === "stop" ? P.stopToRow : P.stayToRow;
    const fromRow = kind === "stop" ? P.stopFromRow : P.stayFromRow;
    for (const given of seed[kind + "s"] || []) {
      const at = now();
      const row = toRow(given);
      row.deleted_at = given.deleted ? at : "";
      prim.appendObj_(tab, row);
      const saved = fromRow(lastRow(tab));
      const live = { ...saved, deleted: false };
      const base = { at, who: "Mo", kind, ref: saved.id };
      events.push({ ...base, action: "add", summary: P.summarize("add", kind, null, live), before: null, after: live });
      if (saved.deleted) events.push({ ...base, action: "delete", summary: P.summarize("delete", kind, live, saved), before: live, after: saved });
    }
  }

  // Log ids follow time order (a stable sort keeps each add before its delete).
  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  events.forEach((ev, i) => {
    prim.appendObj_("Log", {
      id: i + 1, at: ev.at, who: ev.who, via: "app", action: ev.action, kind: ev.kind, ref: ev.ref, summary: ev.summary,
      before: ev.before ? JSON.stringify(ev.before) : "", after: JSON.stringify(ev.after), undoes: "", undone_by: "",
    });
  });
  if (events.length) props.LOGSEQ = String(events.length);
}

module.exports = { createFakeBackend, CHECK_KEY, sha256 };
