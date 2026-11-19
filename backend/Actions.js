// Every request is handled here: handle_(body) -> response envelope.
// This file reaches the outside world only through these primitives, defined
// elsewhere (Sheets.js, Env.js, Rate.js on Apps Script; in memory in
// tests/fake-backend.cjs):
//   readTable_, appendObj_, updateById_, updateWhere_, ensureColumns_, hasColumn_,
//   getProp_, setProp_, withLock_, getRate_, getRateInfo_, tripKey_, nowIso_, sheetUrl_,
//   claudeToken_, ensureClaudeToken_, newId_, hasTab_, holderOf_ (Keys.js),
//   readTableOrNull_, appendObjs_, columnValues_, cellsAt_, deleteRowsAt_ (ticket pictures)
// It also uses the pure helpers from Pure.js.

var MSG_ = {
  badRequest: "That request didn’t come through properly.",
  badKey: "This link’s trip key doesn’t match. Ask for a fresh invite link.",
  badAction: "The app asked for something the trip sheet doesn’t know how to do.",
  badActor: "Pick who you are first.",
  badId: "That didn’t say which line it meant.",
  badPatch: "That change didn’t come through properly.",
  patchKey: "Only a line’s details can be changed.",
  editDeleted: "Bring it back first.",
  noExpense: "That line isn’t there any more.",
  noPayment: "That payment isn’t there any more.",
  noPerson: "That person isn’t on this trip.",
  noStop: "That stop isn’t there any more.",
  noStay: "That stay isn’t there any more.",
  noDay: "That day isn’t on this trip.",
  stopPatchKey: "Only a stop’s details can be changed.",
  badLogId: "That didn’t say which change to undo.",
  noLog: "That change isn’t in the history.",
  undone: "That’s already been undone.",
  newer: "That was changed again since. Undo the newer change first.",
  cantUndo: "That change can’t be undone.",
  badHistory: "That history request didn’t come through properly.",
  server: "Something went wrong on our side. Try again.",
  noClaude: "The Claude link isn’t set up yet. Ask Mo to run migrate.",
  needsMigrate: "The trip sheet needs updating first. Ask Mo to run migrate.",
  notYourPicture: "You can only change your own picture.",
  claudeStamp: "Press this one in the app.",
  noStamp: "That stamp isn’t in the book.",
  stampNotOpen: "That stamp isn’t open yet.",
  stampClosed: "That stamp’s day has closed.",
  stampLate: "That press took too long to arrive.",
  stampFuture: "This phone’s clock is ahead of the trip’s. Check its date and time.",
  stampLifted: "That stamp was lifted in History.",
  notYourStamp: "You can only change your own stamp.",
  noTicket: "That ticket picture isn’t there any more.",
  ticketsPerStop: "A stop can hold at most 8 ticket pictures.",
  ticketsPerTrip: "The trip can hold at most 120 ticket pictures.",
  claudeTicket: "Ticket pictures are added and removed in the app.",
  ticketNeverSent: "That ticket picture never reached the trip sheet. Add it again.",
  // Security (2026-11-18).
  checkOnly: "This key can only read the trip.",
  claudeOwnerOnly: "Only {owner} can copy the Claude link.",
  notYours: "You can only change your own settings.",
  ownLink: "Open your own link to change an e-Transfer address.",
};
var STAMP_REFUSALS_ = { not_open: "stampNotOpen", closed: "stampClosed", late: "stampLate", future: "stampFuture" };

// The trip plan: stops, stays and day headers differ only in these. `key` is
// the column a row is found by (and the Log's ref); `fields` are the API
// fields a person can change; `deletable` ones have a deleted_at column.
// Built on call, not at load: Apps Script runs Actions.js before Pure.js.
// Any other kind gives null.
function planKind_(kind) {
  if (kind === "stop") {
    return {
      tab: "Stops", key: "id", deletable: true, fromRow: stopFromRow, toRow: stopToRow, missing: MSG_.noStop,
      fields: ["date", "time", "title", "detail", "gettingThere", "travelMin", "fixed", "place", "signJp", "booked", "link", "photo", "note", "lat", "lng", "tkRef", "tkName", "tkPeople", "tkSeat"],
    };
  }
  if (kind === "stay") {
    return {
      tab: "Stays", key: "id", deletable: true, fromRow: stayFromRow, toRow: stayToRow, missing: MSG_.noStay,
      fields: ["name", "nameJp", "addressJp", "firstNight", "lastNight", "note", "place", "link", "photo", "lat", "lng"],
    };
  }
  if (kind === "day") return { tab: "Days", key: "date", deletable: false, fromRow: dayFromRow, toRow: dayToRow, missing: MSG_.noDay, fields: DAY_PATCH_KEYS.concat(["lat", "lng"]) };
  return null;
}

var EXPENSE_PATCH_KEYS_ = ["title", "amount", "currency", "paidBy", "split", "splitMode", "splitVals", "day", "note", "kind"];

// Security (2026-11-18): who is calling is decided first, from the key alone
// (holderOf_, Keys.js), before anything else is read or done. A person's key
// makes the request theirs; the release check's key may only read; the old
// shared key works as before (with the e-Transfer rule in setPerson_) until
// it is retired. A request that is not one of these is bad_key, as before.
function handle_(body) {
  if (!isObj_(body)) return err_("bad_input", MSG_.badRequest);
  var holder;
  try {
    holder = holderOf_(body.key);
  } catch (e) {
    // PERSON_KEYS broken by hand: nobody in, and not bad_key, which would
    // make every phone clear itself.
    reportError_("holderOf_", e, [body.key]);
    return err_("server", MSG_.server);
  }
  if (!holder) return err_("bad_key", MSG_.badKey);
  return handleAs_(holder, body);
}

// The rest of a request once its holder is known: { kind: "person", name },
// { kind: "check" }, { kind: "shared" }, or { kind: "claude", name } (the
// Claude connector, Mcp.js, after its own token check: never reachable from
// outside, and it does not need the shared key to exist).
// A thrown error answers the plain server sentence only; its detail goes to
// the owner's log with anything secret blanked (reportError_).
function handleAs_(holder, body) {
  var env;
  try {
    // A person's key whose name is no longer on the trip opens nothing.
    if (holder.kind === "person" && peopleNames_().indexOf(holder.name) === -1) env = err_("bad_key", MSG_.badKey);
    else env = dispatch_(body, holder);
  } catch (e) {
    reportError_("handle_", e, [body && body.key]);
    env = err_("server", MSG_.server);
  }
  if (typeof env.rev !== "number") env.rev = rev_();
  return env;
}

// The detail of an error, for the owner only (the script's executions log),
// with every key, token and id blanked: the "anywhere" list the connector
// keeps out of its replies (secretsAnywhere_ in Mcp.js) plus `extra` (the
// key that came with the request). Never in a reply.
function reportError_(where, e, extra) {
  try {
    var secrets = secretsAnywhere_().concat((extra || []).filter(function (x) { return typeof x === "string"; }));
    var text = blankSecrets(String((e && e.stack) || (e && e.message) || e), secrets);
    if (typeof console !== "undefined" && console.error) console.error(where + ": " + text);
  } catch (e2) {
    // the log is best effort: the reply is the same either way
  }
}

// What the check key and the connector may ask for; a person's key and the
// shared key may ask for anything. The check key reads only what a phone's
// start needs, and runs migrate.
var CHECK_ACTIONS_ = ["load", "rev", "history", "migrate"];
// The connector reads and writes through its tools only.
var CLAUDE_ACTIONS_ = ["load", "history", "addExpense", "addStop", "updateStop", "deleteStop", "saveStay", "deleteStay", "setDay", "undo",
  // Listed only so it answers its own "press this one in the app" sentence.
  "pressStamp"];

function dispatch_(body, holder) {
  var args = body.args === undefined || body.args === null ? {} : body.args;
  if (!isObj_(args)) return err_("bad_input", MSG_.badRequest);
  var action = body.action;
  if (holder.kind === "check" && CHECK_ACTIONS_.indexOf(action) === -1) return err_("bad_input", MSG_.checkOnly);
  if (holder.kind === "claude" && CLAUDE_ACTIONS_.indexOf(action) === -1) return err_("bad_input", MSG_.badAction);
  if (action === "load") return load_(holder);
  if (action === "rev") return ok_({}, rev_());
  if (action === "history") return history_(args);
  // One ticket picture's data, for a phone to keep: a read, no lock, no Log.
  // (The check key and the connector never get here: neither may ask for it.)
  if (action === "ticket") return ticket_(args);
  if (action === "migrate") {
    return withLock_(function () {
      var added = ensureColumns_();
      ensureClaudeToken_();
      return ok_({ added: added }, rev_());
    });
  }
  // Where things are: run from a terminal like migrate (a person's key; the
  // check key and the connector never get here: neither list names it).
  if (action === "locate") return withLock_(locate_);
  // The Claude connector's token, for Settings to copy into a link. Never
  // logged. Only for the trip's first person (the owner), on their own key.
  if (action === "claudeLink") {
    var owner = peopleNames_()[0];
    if (holder.kind !== "person" || holder.name !== owner) return err_("bad_input", MSG_.claudeOwnerOnly.replace("{owner}", owner || "the trip’s organiser"));
    var token = claudeToken_();
    return token ? ok_({ token: token }, rev_()) : err_("not_found", MSG_.noClaude);
  }

  var write;
  switch (action) {
    case "addExpense": write = addExpense_; break;
    case "updateExpense": write = updateExpense_; break;
    case "deleteExpense": write = function (a, c) { return setExpenseDeleted_(a, c, true); }; break;
    case "restoreExpense": write = function (a, c) { return setExpenseDeleted_(a, c, false); }; break;
    case "addPayment": write = addPayment_; break;
    case "removePayment": write = function (a, c) { return setPaymentRemoved_(a, c, true); }; break;
    case "restorePayment": write = function (a, c) { return setPaymentRemoved_(a, c, false); }; break;
    case "setPerson": write = setPerson_; break;
    case "addStop": write = addStop_; break;
    case "updateStop": write = updateStop_; break;
    case "deleteStop": write = function (a, c) { return setPlanDeleted_("stop", a, c, true); }; break;
    case "restoreStop": write = function (a, c) { return setPlanDeleted_("stop", a, c, false); }; break;
    case "saveStay": write = saveStay_; break;
    case "deleteStay": write = function (a, c) { return setPlanDeleted_("stay", a, c, true); }; break;
    case "restoreStay": write = function (a, c) { return setPlanDeleted_("stay", a, c, false); }; break;
    case "setDay": write = setDay_; break;
    case "undo": write = undo_; break;
    case "pressStamp": write = pressStamp_; break;
    case "addTicket": write = addTicket_; break;
    case "removeTicket": write = removeTicket_; break;
    default: return err_("bad_input", MSG_.badAction);
  }
  var names = peopleNames_();
  // Who the write is made as: a person's key is that person whatever the
  // phone says (an old phone's queued write still carries an actor: it is
  // written as the key's person); the connector is the name Mcp.js gives;
  // only the shared key still takes the phone's word, as before.
  var actor = holder.kind === "person" || holder.kind === "claude" ? holder.name : body.actor;
  if (typeof actor !== "string" || names.indexOf(actor) === -1) return err_("bad_input", MSG_.badActor);
  // Only the connector's own path is "through Claude".
  var via = holder.kind === "claude" ? "claude" : "app";
  var ctx = { actor: actor, via: via, names: names, holder: holder.kind };
  // Fetching the day's rate can take a few seconds; do it before taking the lock.
  if (action === "addExpense") ctx.rate = getRate_();
  return withLock_(function () { return write(args, ctx); });
}

// ---- envelopes, rev, log ----

function ok_(data, rev) { return { ok: true, rev: rev, data: data }; }

function err_(code, message) { return { ok: false, error: code, message: message }; }

// REV from Script Properties. If the property is missing (properties were
// reset), start from the Log's highest id so rev never goes backwards.
function rev_() {
  var raw = getProp_("REV");
  var n = Number(raw);
  if (raw !== null && raw !== "" && isFinite(n) && n >= 0) return Math.floor(n);
  return maxLogId_();
}

function maxLogId_() {
  var max = 0;
  logRows_().forEach(function (r) {
    var id = Number(r.id);
    if (isFinite(id) && id > max) max = id;
  });
  return max;
}

function bumpRev_() {
  var n = rev_() + 1;
  setProp_("REV", String(n));
  return n;
}

// Appends one Log row and returns it as written. Called inside the write lock.
// The id is one above both LOGSEQ and the Log's highest id, so ids stay unique
// even if Script Properties were reset.
function appendLog_(ctx, action, kind, ref, summary, before, after, undoes) {
  var seq = Number(getProp_("LOGSEQ"));
  var id = Math.max(isFinite(seq) ? Math.floor(seq) : 0, maxLogId_()) + 1;
  setProp_("LOGSEQ", String(id));
  var row = {
    id: id, at: nowIso_(), who: ctx.actor, via: ctx.via, action: action, kind: kind, ref: ref, summary: summary,
    before: before ? JSON.stringify(before) : "", after: after ? JSON.stringify(after) : "",
    undoes: undoes === null || undoes === undefined ? "" : undoes, undone_by: "",
  };
  appendObj_("Log", row);
  return row;
}

function logRows_() {
  return readTable_("Log").filter(function (r) { return cellText_(r.id) !== ""; });
}

// The id of the Log row that first added this item (for a repeated add).
function firstLogId_(kind, ref, action) {
  var best = null;
  logRows_().forEach(function (r) {
    var id = Number(r.id);
    if (cellText_(r.kind) === kind && cellText_(r.ref) === ref && cellText_(r.action) === action && (best === null || id < best)) best = id;
  });
  return best;
}

// ---- table helpers ----

function peopleRows_() {
  return readTable_("People")
    .filter(function (r) { return cellText_(r.name) !== ""; })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); });
}

function peopleNames_() {
  return peopleRows_().map(function (r) { return cellText_(r.name); });
}

function findRow_(tab, id) {
  var rows = readTable_(tab);
  for (var i = 0; i < rows.length; i++) if (cellText_(rows[i].id) === id) return rows[i];
  return null;
}

function idArg_(args) {
  return typeof args.id === "string" && args.id !== "" ? args.id : null;
}

// The fields of an expense a person can change, as a fresh object.
function editableOf_(e) {
  return {
    day: e.day, title: e.title, amount: e.amount, currency: e.currency, paidBy: e.paidBy,
    split: Array.isArray(e.split) ? e.split.slice() : undefined,
    splitMode: e.splitMode,
    splitVals: Array.isArray(e.splitVals) ? e.splitVals.slice() : undefined,
    note: e.note, kind: e.kind,
  };
}

function paymentEditableOf_(p) {
  return { from: p.from, to: p.to, cad: p.cad, seed: p.seed, rot: p.rot };
}

// ---- reads ----

// The Trip tab as { key: value }.
function tripInfo_() {
  var trip = {};
  readTable_("Trip").forEach(function (r) {
    var k = cellText_(r.key).trim();
    if (k) trip[k] = cellDate_(r.value);
  });
  return trip;
}

// holder: who asked (handle_). me is the key's person ("" for the shared or
// check key) and personal whether it is a person's own key, so a phone on
// its own link is that person and offers no choice. Under the check key
// the e-Transfer addresses are left out: it only checks a release.
function load_(holder) {
  // A Trip tab whose zone or currencies differ from the app's would show every
  // figure and day wrongly: refused, with what to put back.
  var trip = tripInfo_();
  var wrong = tripMismatch(trip);
  if (wrong) return err_("wrong_trip", wrong);
  var rev = rev_();
  var rate = getRateInfo_();
  var book = stampBook_();
  var data = {
    trip: trip,
    people: peopleRows_().map(personFromRow).map(function (p) {
      if (holder && holder.kind === "check") p.etransfer = "";
      return p;
    }),
    me: holder && holder.kind === "person" ? holder.name : "",
    personal: !!holder && holder.kind === "person",
    days: readTable_("Days").filter(function (r) { return cellDate_(r.date) !== ""; }).map(dayFromRow),
    stops: readTable_("Stops").filter(function (r) { return cellText_(r.id) !== ""; }).map(stopFromRow).map(function (st) {
      // The release check's key reads no booking reference and no name on a booking (as no address).
      if (holder && holder.kind === "check") {
        st.tkRef = "";
        st.tkName = "";
      }
      return st;
    }),
    stays: readTable_("Stays").filter(function (r) { return cellText_(r.id) !== ""; }).map(stayFromRow),
    expenses: readTable_("Expenses").filter(function (r) { return cellText_(r.id) !== ""; }).map(expenseFromRow),
    payments: readTable_("Settlements").filter(function (r) { return cellText_(r.id) !== ""; }).map(paymentFromRow),
    rateToday: rate.rate,
    rateSource: rate.source,
    sheetUrl: sheetUrl_(),
    stampDefs: book.defs,
    stamps: book.stamps,
  };
  // The ticket pictures (never their data), once migrate has made the tabs;
  // until then the key is left out and the phones show no tickets.
  // Not those on a removed stop: putting the stop back brings them back.
  var removed = {};
  data.stops.forEach(function (st) { if (st.deleted) removed[st.id] = true; });
  var tickets = ticketsShown_(removed);
  if (tickets !== null) data.tickets = tickets;
  return ok_(data, rev);
}

function history_(args) {
  var ref = args.ref;
  if (ref !== undefined && ref !== null && typeof ref !== "string") return err_("bad_input", MSG_.badHistory);
  var before = args.before === undefined || args.before === null ? null : Number(args.before);
  if (before !== null && !isFinite(before)) return err_("bad_input", MSG_.badHistory);
  var limit = Number(args.limit);
  if (args.limit === undefined || args.limit === null || args.limit === "" || !isFinite(limit)) limit = 200;
  limit = Math.max(1, Math.min(500, Math.floor(limit)));

  var rev = rev_();
  var all = logRows_().map(logShape_);
  var picked = all
    .filter(function (e) { return (ref === undefined || ref === null || e.ref === ref) && (before === null || e.id < before); })
    .sort(function (a, b) { return b.id - a.id; });
  var entries = picked.slice(0, limit).map(function (e) {
    e.canUndo = canUndo(e, all);
    return e;
  });
  return ok_({ entries: entries, more: picked.length > limit }, rev);
}

// ---- expenses ----

function addExpense_(args, ctx) {
  var v = validateExpense(args.expense, ctx.names);
  if (!v.ok) return err_("bad_input", v.message);
  var id = v.value.id;
  var existing = findRow_("Expenses", id);
  if (existing) return ok_({ expense: expenseFromRow(existing), logId: firstLogId_("expense", id, "add") }, rev_());

  var e = v.value;
  e.rate = ctx.rate;
  e.addedBy = ctx.actor;
  var row = expenseToRow(e);
  row.added_at = nowIso_();
  appendObj_("Expenses", row);
  var saved = expenseFromRow(findRow_("Expenses", id));
  var log = appendLog_(ctx, "add", "expense", id, summarize("add", "expense", null, saved), null, saved);
  return ok_({ expense: saved, logId: log.id }, bumpRev_());
}

function updateExpense_(args, ctx) {
  var id = idArg_(args);
  if (!id) return err_("bad_input", MSG_.badId);
  var patch = args.patch;
  if (!isObj_(patch)) return err_("bad_input", MSG_.badPatch);
  var keys = Object.keys(patch);
  for (var i = 0; i < keys.length; i++) {
    if (EXPENSE_PATCH_KEYS_.indexOf(keys[i]) === -1) return err_("bad_input", MSG_.patchKey);
  }
  return editExpense_(id, patch, ctx);
}

// The edit itself: every editable column is written.
function editExpense_(id, patch, ctx) {
  var row = findRow_("Expenses", id);
  if (!row) return err_("not_found", MSG_.noExpense);
  var cur = expenseFromRow(row);
  if (cur.deleted) return err_("bad_input", MSG_.editDeleted);

  // Validate the whole line as it would be, not the patch alone.
  var merged = editableOf_(cur);
  Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
  merged.id = id;
  var v = validateExpense(merged, ctx.names);
  if (!v.ok) return err_("bad_input", v.message);

  var cols = expenseToRow(editableOf_(v.value));
  var was = expenseToRow(editableOf_(cur));
  if (same_(cols, was)) return ok_({ expense: cur, logId: null }, rev_());
  var saved = expenseFromRow(updateById_("Expenses", id, cols));
  var log = appendLog_(ctx, "edit", "expense", id, summarize("edit", "expense", cur, saved), cur, saved);
  return ok_({ expense: saved, logId: log.id }, bumpRev_());
}

function setExpenseDeleted_(args, ctx, deleted) {
  var id = idArg_(args);
  if (!id) return err_("bad_input", MSG_.badId);
  var row = findRow_("Expenses", id);
  if (!row) return err_("not_found", MSG_.noExpense);
  var cur = expenseFromRow(row);
  if (cur.deleted === deleted) return ok_({ expense: cur, logId: null }, rev_());
  var saved = expenseFromRow(updateById_("Expenses", id, { deleted_at: deleted ? nowIso_() : "" }));
  var action = deleted ? "delete" : "restore";
  var log = appendLog_(ctx, action, "expense", id, summarize(action, "expense", cur, saved), cur, saved);
  return ok_({ expense: saved, logId: log.id }, bumpRev_());
}

// ---- payments ----

function addPayment_(args, ctx) {
  var v = validatePayment(args.payment, ctx.names);
  if (!v.ok) return err_("bad_input", v.message);
  var id = v.value.id;
  var existing = findRow_("Settlements", id);
  if (existing) return ok_({ payment: paymentFromRow(existing), logId: firstLogId_("payment", id, "stamp") }, rev_());

  var p = v.value;
  p.stampedBy = ctx.actor;
  var row = paymentToRow(p);
  row.stamped_at = nowIso_();
  appendObj_("Settlements", row);
  var saved = paymentFromRow(findRow_("Settlements", id));
  var log = appendLog_(ctx, "stamp", "payment", id, summarize("stamp", "payment", null, saved), null, saved);
  return ok_({ payment: saved, logId: log.id }, bumpRev_());
}

function setPaymentRemoved_(args, ctx, removed) {
  var id = idArg_(args);
  if (!id) return err_("bad_input", MSG_.badId);
  var row = findRow_("Settlements", id);
  if (!row) return err_("not_found", MSG_.noPayment);
  var cur = paymentFromRow(row);
  if (cur.removed === removed) return ok_({ payment: cur, logId: null }, rev_());
  var saved = paymentFromRow(updateById_("Settlements", id, { removed_at: removed ? nowIso_() : "" }));
  var action = removed ? "unstamp" : "restamp";
  var log = appendLog_(ctx, action, "payment", id, summarize(action, "payment", cur, saved), cur, saved);
  return ok_({ payment: saved, logId: log.id }, bumpRev_());
}

// ---- people ----

function setPerson_(args, ctx) {
  if (typeof args.name !== "string") return err_("bad_input", MSG_.badRequest);
  var v = validatePersonPatch(args.patch);
  if (!v.ok) return err_("bad_input", v.message);
  // A picture is only ever set by its owner (Task 16), and needs its column.
  if ("photo" in v.value) {
    if (args.name !== ctx.actor) return err_("bad_input", MSG_.notYourPicture);
    if (!hasColumn_("People", "photo")) return err_("needs_migrate", MSG_.needsMigrate);
  }
  // Security (2026-11-18): on a person's own key, only their own row; on the
  // shared key, no e-Transfer address changes at all (open your own link).
  if (ctx.holder === "person" && args.name !== ctx.actor) return err_("bad_input", MSG_.notYours);
  var row = null;
  peopleRows_().forEach(function (r) { if (!row && cellText_(r.name) === args.name) row = r; });
  if (!row) return err_("not_found", MSG_.noPerson);
  var cur = personFromRow(row);
  if (ctx.holder !== "person" && "etransfer" in v.value && v.value.etransfer !== cur.etransfer) return err_("bad_input", MSG_.ownLink);
  var changed = Object.keys(v.value).some(function (k) { return cur[k] !== v.value[k]; });
  if (!changed) return ok_({ person: cur }, rev_());
  var saved = personFromRow(updateWhere_("People", "name", args.name, v.value));
  // A new e-Transfer address is where money gets sent: it goes in the Log.
  // The address itself is only in the snapshots (the Sheet), never the sentence.
  // A Simplify flip alone is a reading preference and is not logged.
  if (saved.etransfer !== cur.etransfer) {
    var was = { name: cur.name, etransfer: cur.etransfer };
    var now = { name: saved.name, etransfer: saved.etransfer };
    appendLog_(ctx, "edit", "person", saved.name, summarize("edit", "person", was, now), was, now);
  }
  // A picture change is its own entry, kind "picture", so it can be undone
  // without making an e-Transfer change undoable. Its snapshots hold the
  // picture so undo can put it back; History never sends them to the phones.
  if (saved.photo !== cur.photo) {
    var hadPic = { name: cur.name, photo: cur.photo };
    var hasPic = { name: saved.name, photo: saved.photo };
    appendLog_(ctx, "edit", "picture", saved.name, summarize("edit", "picture", hadPic, hasPic), hadPic, hasPic);
  }
  return ok_({ person: saved }, bumpRev_());
}

// Undoing a picture change puts back the picture that was there (or none),
// only when it passes the same check as a new one (validatePersonPatch).
// Only its owner may: nobody changes another person's picture (Task 16).
// Answers like any undo, with the person as the item.
function undoPicture_(entry, rows, ctx) {
  if (entry.ref !== ctx.actor) return err_("bad_input", MSG_.notYourPicture);
  if (entry.undoneBy !== null) return err_("stale", MSG_.undone);
  if (!canUndo(entry, rows.map(logShape_))) return err_("stale", MSG_.newer);
  if (!entry.before || !entry.after) return err_("stale", MSG_.cantUndo);
  var row = null;
  peopleRows_().forEach(function (r) { if (!row && cellText_(r.name) === entry.ref) row = r; });
  if (!row) return err_("not_found", MSG_.noPerson);
  if (!hasColumn_("People", "photo")) return err_("needs_migrate", MSG_.needsMigrate);
  var cur = personFromRow(row);
  var target = undoTarget(entry);
  // What is put back is checked like a new picture: a Log cell changed by
  // hand can never put anything else into the People tab.
  var photo = target.photo === undefined || target.photo === null ? "" : target.photo;
  if (!validatePersonPatch({ photo: photo }).ok) return err_("stale", MSG_.cantUndo); // "" (none) passes
  var saved = personFromRow(updateWhere_("People", "name", entry.ref, { photo: photo }));
  var log = appendLog_(ctx, "undo", "picture", entry.ref, "undid: " + entry.summary, { name: cur.name, photo: cur.photo }, { name: saved.name, photo: saved.photo }, entry.id);
  updateById_("Log", entry.id, { undone_by: log.id });
  var rev = bumpRev_();
  var shown = logShape_(log);
  shown.canUndo = true;
  return ok_({ entry: shown, logId: log.id, person: saved }, rev);
}

// ---- the trip plan: stops, stays, day headers ----

// The row whose key cell (an id, or a day's date) is ref. Dates go through
// cellDate_ in case Sheets hands a date cell back as a Date.
function findPlanRow_(plan, ref) {
  var rows = readTable_(plan.tab);
  for (var i = 0; i < rows.length; i++) if (cellDate_(rows[i][plan.key]) === ref) return rows[i];
  return null;
}

// The fields of an item a person can change, as a fresh object.
function planFields_(plan, item) {
  var out = {};
  plan.fields.forEach(function (f) { out[f] = item[f]; });
  return out;
}

// The columns of next that differ from cur, both cleaned items. Only these
// are written: a column the change leaves alone keeps whatever the Sheet
// holds, even a hand-typed value the reader cleans away (9:30, a bare link).
function changedCols_(plan, cur, next) {
  var was = plan.toRow(planFields_(plan, cur));
  var now = plan.toRow(planFields_(plan, next));
  var out = {};
  Object.keys(now).forEach(function (k) { if (!same_(now[k], was[k])) out[k] = now[k]; });
  return out;
}

function writePlan_(plan, ref, patch) {
  return plan.fromRow(updateWhere_(plan.tab, plan.key, ref, patch));
}

function tripDates_() {
  return readTable_("Days").map(function (r) { return cellDate_(r.date); }).filter(function (d) { return d !== ""; });
}

// Appends a new stop or stay, or returns the one already there with the id
// of the Log row that added it (a repeated add).
function addPlanItem_(kind, value, ctx) {
  var plan = planKind_(kind);
  var id = value.id;
  var existing = findPlanRow_(plan, id);
  if (existing) return ok_(planReply_(kind, plan.fromRow(existing), firstLogId_(kind, id, "add")), rev_());
  var row = plan.toRow(value);
  row.deleted_at = "";
  appendObj_(plan.tab, row);
  var saved = plan.fromRow(findPlanRow_(plan, id));
  var log = appendLog_(ctx, "add", kind, id, summarize("add", kind, null, saved), null, saved);
  return ok_(planReply_(kind, saved, log.id), bumpRev_());
}

// Writes an edit of an existing item (cur) to the values in next, unless
// nothing changes. ref is the item's key (its id, or a day's date).
function editPlanItem_(kind, ref, cur, next, ctx) {
  var plan = planKind_(kind);
  var cols = changedCols_(plan, cur, next);
  if (Object.keys(cols).length === 0) return ok_(planReply_(kind, cur, null), rev_());
  var saved = writePlan_(plan, ref, cols);
  var log = appendLog_(ctx, "edit", kind, ref, summarize("edit", kind, cur, saved), cur, saved);
  return ok_(planReply_(kind, saved, log.id), bumpRev_());
}

function planReply_(kind, item, logId) {
  var data = { logId: logId };
  data[kind] = item;
  return data;
}

// Coordinates come only from the app (a pasted Maps link) or locate: the
// connector reads them but cannot set them.
function claudeCoords_(input, ctx) {
  return ctx.via === "claude" && isObj_(input) && (input.lat !== undefined || input.lng !== undefined);
}

function addStop_(args, ctx) {
  if (claudeCoords_(args.stop, ctx)) return err_("bad_input", MSG_.stopPatchKey);
  var v = validateStop(args.stop, tripDates_());
  if (!v.ok) return err_("bad_input", v.message);
  if (factsNeedMigrate_(v.value)) return err_("needs_migrate", MSG_.needsMigrate);
  return addPlanItem_("stop", v.value, ctx);
}

function updateStop_(args, ctx) {
  var plan = planKind_("stop");
  var id = idArg_(args);
  if (!id) return err_("bad_input", MSG_.badId);
  var patch = args.patch;
  if (!isObj_(patch)) return err_("bad_input", MSG_.badPatch);
  if (claudeCoords_(patch, ctx)) return err_("bad_input", MSG_.stopPatchKey);
  var keys = Object.keys(patch);
  for (var i = 0; i < keys.length; i++) {
    if (plan.fields.indexOf(keys[i]) === -1) return err_("bad_input", MSG_.stopPatchKey);
  }
  var row = findPlanRow_(plan, id);
  if (!row) return err_("not_found", plan.missing);
  var cur = plan.fromRow(row);
  if (cur.deleted) return err_("bad_input", MSG_.editDeleted);

  // Validate the whole stop as it would be, not the patch alone.
  var merged = planFields_(plan, cur);
  keys.forEach(function (k) { merged[k] = patch[k]; });
  merged.id = id;
  var v = validateStop(merged, tripDates_());
  if (!v.ok) return err_("bad_input", v.message);
  if (factsNeedMigrate_(v.value)) return err_("needs_migrate", MSG_.needsMigrate);
  // A new place: the old coordinates were for the old one (unless new ones came with it).
  if (v.value.place !== cur.place && patch.lat === undefined && patch.lng === undefined) {
    v.value.lat = "";
    v.value.lng = "";
  }
  return editPlanItem_("stop", id, cur, v.value, ctx);
}

// ---- where things are: locate ----
// For each stop, stay and day with no coordinates, asks Apps Script's own
// geocoder (Env.js geocode_, region us). Each row has its forms of question:
// a stop its place with its day's city, then its title with its day's city
// (and when the day has coordinates, an answer more than LOCATE_NEAR_M_ from
// them counts as not found: a common name in another city); a stay its name
// with its place; a day its city. A stop whose place is a Maps link with a
// position is read without asking. (The Japan app asks for a stay's
// Japanese address first; Chicago's stays are asked by name and place only.)
// Fair to every row: a row costs at most one lookup a call; rows never tried
// go first, rows tried before go last (the longest ago first), each trying
// its next form. Which rows found nothing, and how often, is kept in one
// Script Property, LOCATE_TRIED ({ "stop:<id>": { d: day, n: tries } }),
// pruned to rows still without coordinates. At most LOCATE_MAX_ lookups a
// call (the same question twice in a call is asked once). No History line;
// rev moves when something was found, so phones fetch it.
// -> { found, missing, more } (more: rows never tried remain).

var LOCATE_MAX_ = 40;
var LOCATE_KEY_ = "LOCATE_TRIED";
var LOCATE_NEAR_M_ = 30000;
var LOCATE_REGION_ = "us";

function locate_() {
  var tabs = ["Stops", "Stays", "Days"];
  for (var t = 0; t < tabs.length; t++) {
    if (!hasColumn_(tabs[t], "lat") || !hasColumn_(tabs[t], "lng")) return err_("needs_migrate", MSG_.needsMigrate);
  }
  var tried = {};
  try {
    var kept = JSON.parse(getProp_(LOCATE_KEY_) || "{}");
    if (kept && typeof kept === "object" && !Array.isArray(kept)) tried = kept;
  } catch (e) {
    tried = {};
  }
  var placeText = function (v) { var s = cellText_(v).trim(); return safeUrl(s) ? "" : s; };
  var clean = function (list) {
    var out = [];
    list.forEach(function (q) {
      q = String(q || "").replace(/\s+/g, " ").trim();
      if (q !== "" && out.indexOf(q) === -1) out.push(q);
    });
    return out;
  };
  // Every row still without coordinates: { key, tab, col, ref, queries, pin }.
  var rows = [];
  var days = readTable_("Days");
  var cityOf = {};
  var dayAt = {}; // a day's coordinates, as known so far
  days.forEach(function (r) {
    cityOf[cellDate_(r.date)] = cellText_(r.city).trim();
    if (coordsOf_(r).lat !== "") dayAt[cellDate_(r.date)] = coordsOf_(r);
  });
  days.forEach(function (r) {
    var date = cellDate_(r.date);
    if (date === "" || coordsOf_(r).lat !== "") return;
    rows.push({ key: "day:" + date, tab: "Days", col: "date", ref: date, day: date, queries: clean([cityOf[date]]) });
  });
  readTable_("Stays").forEach(function (r) {
    var id = cellText_(r.id);
    if (id === "" || cellSet_(r.deleted_at) || coordsOf_(r).lat !== "") return;
    rows.push({ key: "stay:" + id, tab: "Stays", col: "id", ref: id, queries: clean([cellText_(r.name) + " " + placeText(r.place)]) });
  });
  readTable_("Stops").forEach(function (r) {
    var id = cellText_(r.id);
    if (id === "" || cellSet_(r.deleted_at) || coordsOf_(r).lat !== "") return;
    var city = cityOf[cellDate_(r.date)] || "";
    var place = placeText(r.place);
    rows.push({
      key: "stop:" + id, tab: "Stops", col: "id", ref: id, pin: pointFromLink(cellText_(r.place)), on: cellDate_(r.date),
      queries: clean([place ? place + " " + city : "", cellText_(r.title).trim() + " " + city]),
    });
  });
  // Keep only rows still waiting; untried first (in sheet order), then the longest ago.
  var still = {};
  rows.forEach(function (row) { if (tried[row.key]) still[row.key] = tried[row.key]; });
  tried = still;
  var order = rows.map(function (row, i) { return { row: row, i: i, t: tried[row.key] || null }; });
  order.sort(function (x, y) {
    if (!x.t !== !y.t) return x.t ? 1 : -1;
    if (x.t && y.t && x.t.d !== y.t.d) return x.t.d < y.t.d ? -1 : 1;
    return x.i - y.i;
  });
  var left = LOCATE_MAX_;
  var asked = {};
  var found = 0;
  var missing = 0;
  var more = false;
  var day = today_();
  order.forEach(function (o) {
    var row = o.row;
    var p = row.pin || null;
    if (!p) {
      if (!row.queries.length) return;
      var n = o.t ? Number(o.t.n) || 0 : 0;
      var q = row.queries[n % row.queries.length];
      if (!Object.prototype.hasOwnProperty.call(asked, q)) {
        if (left <= 0) {
          if (!o.t) more = true;
          return;
        }
        left--;
        var got = null;
        try {
          got = geocode_(q, LOCATE_REGION_);
        } catch (e) {
          got = null;
        }
        asked[q] = got ? coordsOf_(got) : null;
        if (asked[q] && asked[q].lat === "") asked[q] = null;
      }
      p = asked[q];
      // A stop's answer far from its day's place is another place of that name.
      if (p && row.on && dayAt[row.on] && !(metresBetween_(p, dayAt[row.on]) <= LOCATE_NEAR_M_)) p = null;
    }
    if (!p) {
      missing++;
      tried[row.key] = { d: day, n: (o.t ? Number(o.t.n) || 0 : 0) + 1 };
      return;
    }
    updateWhere_(row.tab, row.col, row.ref, { lat: p.lat, lng: p.lng });
    if (row.day) dayAt[row.day] = p;
    delete tried[row.key];
    found++;
  });
  setProp_(LOCATE_KEY_, JSON.stringify(tried));
  return ok_({ found: found, missing: missing, more: more }, found > 0 ? bumpRev_() : rev_());
}

// A new id adds the stay; a known one edits it. With merge: true (the Claude
// connector) the stay must already be there, and the fields given are laid
// over the row as it is now, under the lock, so a field left out keeps
// whatever another phone just saved. The merged stay is validated whole.
function saveStay_(args, ctx) {
  var plan = planKind_("stay");
  if (args.merge !== undefined && typeof args.merge !== "boolean") return err_("bad_input", MSG_.badRequest);
  var input = args.stay;
  if (args.merge === true && isObj_(input) && typeof input.id === "string") {
    var found = input.id === "" ? null : findPlanRow_(plan, input.id);
    if (!found) return err_("not_found", plan.missing);
    var was = plan.fromRow(found);
    if (was.deleted) return err_("bad_input", MSG_.editDeleted);
    var merged = planFields_(plan, was);
    plan.fields.forEach(function (k) { if (input[k] !== undefined) merged[k] = input[k]; });
    merged.id = was.id;
    input = merged;
  }
  var v = validateStay(input);
  if (!v.ok) return err_("bad_input", v.message);
  // An older Sheet has no photo column until migrate: refuse a photo rather than drop it.
  if (v.value.photo !== "" && !hasColumn_("Stays", "photo")) return err_("needs_migrate", MSG_.needsMigrate);
  var row = findPlanRow_(plan, v.value.id);
  if (!row) return addPlanItem_("stay", v.value, ctx);
  var cur = plan.fromRow(row);
  if (cur.deleted) return err_("bad_input", MSG_.editDeleted);
  // A new address or place: the old coordinates were for the old one. A new name alone is no move.
  if (v.value.addressJp !== cur.addressJp || v.value.place !== cur.place) {
    v.value.lat = "";
    v.value.lng = "";
  }
  return editPlanItem_("stay", cur.id, cur, v.value, ctx);
}

function setPlanDeleted_(kind, args, ctx, deleted) {
  var plan = planKind_(kind);
  var id = idArg_(args);
  if (!id) return err_("bad_input", MSG_.badId);
  var row = findPlanRow_(plan, id);
  if (!row) return err_("not_found", plan.missing);
  var cur = plan.fromRow(row);
  if (cur.deleted === deleted) return ok_(planReply_(kind, cur, null), rev_());
  var saved = writePlan_(plan, id, { deleted_at: deleted ? nowIso_() : "" });
  var action = deleted ? "delete" : "restore";
  var log = appendLog_(ctx, action, kind, id, summarize(action, kind, cur, saved), cur, saved);
  return ok_(planReply_(kind, saved, log.id), bumpRev_());
}

function setDay_(args, ctx) {
  var plan = planKind_("day");
  if (typeof args.date !== "string") return err_("bad_input", MSG_.badRequest);
  var v = validateDayPatch(args.patch);
  if (!v.ok) return err_("bad_input", v.message);
  var row = args.date === "" ? null : findPlanRow_(plan, args.date);
  if (!row) return err_("not_found", plan.missing);
  var cur = plan.fromRow(row);
  var next = planFields_(plan, cur);
  Object.keys(v.value).forEach(function (k) { next[k] = v.value[k]; });
  // A new city: the old coordinates were for the old one.
  if (next.city !== cur.city) {
    next.lat = "";
    next.lng = "";
  }
  return editPlanItem_("day", cur.date, cur, next, ctx);
}

// ---- the stamp book ----

// The two tabs live only after migrate; until then the book is empty.
function stampsReady_() {
  return hasTab_("StampDefs") && hasTab_("Stamps") && hasColumn_("StampDefs", "shape") && hasColumn_("Stamps", "gone");
}

function stampDefs_() {
  if (!stampsReady_()) return [];
  return readTable_("StampDefs").filter(function (r) { return cellText_(r.id) !== ""; }).map(stampDefFromRow);
}

// What load shows of the book: the definitions, and everyone's stamps that are
// not lifted. Both empty until migrate has made the tabs; the tabs are checked
// and read once each.
function stampBook_() {
  // Each tab is found and read once, and is ready when that read's header has the columns: no separate checks.
  // A Sheet where migrate has not been run costs one lookup.
  var defs = readTableOrNull_("StampDefs", ["id", "date", "shape"]);
  if (defs === null) return { defs: [], stamps: [] };
  var stamps = readTableOrNull_("Stamps", ["def", "who", "at", "seed", "gone"]);
  return {
    defs: defs.filter(function (r) { return cellText_(r.id) !== ""; }).map(stampDefFromRow),
    stamps: (stamps || [])
      .filter(function (r) { return cellText_(r.def) !== "" && cellText_(r.who) !== "" && cellText_(r.gone) !== "yes"; })
      .map(stampFromRow),
  };
}

var STAMP_AT_RE_ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function randomStampSeed_() {
  return 1 + Math.floor(Math.random() * 4294967295);
}

function stampDefById_(defs, id) {
  for (var i = 0; i < defs.length; i++) if (defs[i].id === id) return defs[i];
  return null;
}

// The caller presses a stamp for themselves: { def, at } (at: the time on
// their phone when they pressed, ISO; seed: optional, how the ink wore, 1 to
// 4294967295). Whether it is open is judged by `at` (Chicago time) and the
// backend's own clock for how late it arrived: see pressRefusal. Pressed
// twice, it is one stamp (a resend answers the first). A lifted stamp is
// pressed again, with a new time and seed, while its window is open. Never
// through Claude.
function pressStamp_(args, ctx) {
  if (ctx.via === "claude") return err_("bad_input", MSG_.claudeStamp);
  if (!stampsReady_()) return err_("needs_migrate", MSG_.needsMigrate);
  var defs = stampDefs_();
  var def = stampDefById_(defs, typeof args.def === "string" ? args.def : "");
  if (!def) return err_("no_such_stamp", MSG_.noStamp);
  if (typeof args.at !== "string" || !STAMP_AT_RE_.test(args.at) || !isFinite(Date.parse(args.at))) return err_("bad_input", MSG_.badRequest);
  var atMs = Date.parse(args.at);
  var at = new Date(atMs).toISOString();
  var id = def.id + "|" + ctx.actor;
  var row = findRow_("Stamps", id);
  if (row && cellText_(row.gone) !== "yes") return ok_({ stamp: stampFromRow(row), logId: null }, rev_());
  // The resend of a press that was lifted since (the same moment and, when
  // the phone sends one, the same seed): not a new press.
  if (row && cellStamp_(row.at) === at && (args.seed === undefined || Number(row.seed) === args.seed)) return err_("stale", MSG_.stampLifted);
  var why = pressRefusal(def, defs, atMs, Date.parse(nowIso_()));
  if (why) return err_(why, MSG_[STAMP_REFUSALS_[why]]);

  var seed = typeof args.seed === "number" && args.seed % 1 === 0 && args.seed >= 1 && args.seed <= 4294967295 ? args.seed : randomStampSeed_();
  var before = row ? stampSnap_(stampFromRow(row), def.date) : null;
  if (before && before.seed === seed) seed = seed === 4294967295 ? 1 : seed + 1;
  var savedRow;
  if (row) savedRow = updateById_("Stamps", id, { at: at, seed: seed, gone: "" });
  else {
    appendObj_("Stamps", { id: id, def: def.id, who: ctx.actor, at: at, seed: seed, gone: "" });
    savedRow = findRow_("Stamps", id);
  }
  var saved = stampFromRow(savedRow);
  var after = stampSnap_(saved, def.date);
  var log = appendLog_(ctx, "press", "stamp", id, summarize("press", "stamp", before, after), before, after);
  return ok_({ stamp: saved, logId: log.id }, bumpRev_());
}

// Lifts a press, or (undoing a lift) puts it back as it was. Putting it back
// is a press, so it needs the stamp's window to be open now, and never comes
// through Claude. Lifting is always allowed.
function undoStamp_(entry, rows, ctx) {
  // Nobody acts on someone else's stamp (as for a picture): the Log keeps whose it is, for a press and for a lift.
  if (!entry.after || entry.after.who !== ctx.actor) return err_("bad_input", MSG_.notYourStamp);
  if (entry.undoneBy !== null) return err_("stale", MSG_.undone);
  if (!canUndo(entry, rows.map(logShape_))) return err_("stale", MSG_.newer);
  if (!entry.after) return err_("stale", MSG_.cantUndo);
  if (!stampsReady_()) return err_("needs_migrate", MSG_.needsMigrate);
  var row = findRow_("Stamps", entry.ref);
  if (!row) return err_("not_found", MSG_.noStamp);
  var cur = stampFromRow(row);
  var target = entry.before ? entry.before : { def: entry.after.def, who: entry.after.who, at: entry.after.at, seed: entry.after.seed, gone: true, day: entry.after.day };
  var lift = target.gone === true;
  if (!lift) {
    if (ctx.via === "claude") return err_("bad_input", MSG_.claudeStamp);
    var defs = stampDefs_();
    var def = stampDefById_(defs, cur.def);
    if (!def) return err_("no_such_stamp", MSG_.noStamp);
    var nowMs = Date.parse(nowIso_());
    var why = pressRefusal(def, defs, nowMs, nowMs);
    if (why) return err_(why, MSG_[STAMP_REFUSALS_[why]]);
  }
  var day = entry.after.day;
  var savedRow = updateById_("Stamps", entry.ref, { at: String(target.at), seed: Number(target.seed), gone: lift ? "yes" : "" });
  var saved = stampFromRow(savedRow);
  var log = appendLog_(ctx, "undo", "stamp", entry.ref, "undid: " + entry.summary, stampSnap_(cur, day), stampSnap_(saved, day), entry.id);
  updateById_("Log", entry.id, { undone_by: log.id });
  var shown = logShape_(log);
  shown.canUndo = true;
  return ok_({ entry: shown, logId: log.id, stamp: saved }, bumpRev_());
}

// ---- the real ticket on a stop ----
// The four facts (booking ref, name, people, seat) are stop fields, saved by
// addStop / updateStop like the others. The pictures are rows of the Tickets
// tab (no data) with their base64 in TicketData, one cell per chunk; load
// reads Tickets only. A picture is added with the phone's own id (a resend
// answers the first), its chunks written before its row, so a failure in
// between leaves chunks no row names; the next add sweeps those. Removing is
// a soft delete (gone), undoable; its data rows stay. Never through Claude.

function ticketsReady_() {
  return hasTab_("Tickets") && hasTab_("TicketData") && hasColumn_("Tickets", "gone") && hasColumn_("TicketData", "data") && hasColumn_("Stops", "tk_seat");
}

// A stop with any fact filled on a Sheet whose Stops tab lacks the columns: refused rather than dropped.
function factsNeedMigrate_(stop) {
  var any = stop.tkRef !== "" || stop.tkName !== "" || stop.tkPeople !== "" || stop.tkSeat !== "";
  return any && !hasColumn_("Stops", "tk_seat");
}

// What load shows: every picture not removed, or null before migrate. One lookup and one read.
function ticketsShown_(removedStops) {
  var rows = readTableOrNull_("Tickets", ["id", "stop", "chunks", "gone"]);
  if (rows === null) return null;
  var off = removedStops || {};
  return rows.filter(function (r) {
    return cellText_(r.id) !== "" && cellText_(r.gone) !== "yes" && !Object.prototype.hasOwnProperty.call(off, cellText_(r.stop));
  }).map(ticketFromRow);
}

// The ids of removed stops, for the limits: their pictures do not count (minor 6).
function removedStops_() {
  var out = {};
  readTable_("Stops").forEach(function (r) { if (cellText_(r.id) !== "" && cellSet_(r.deleted_at)) out[cellText_(r.id)] = true; });
  return out;
}

// Pictures that count: not removed, and not on a removed stop.
function countedTickets_(rows, removed) {
  return rows.filter(function (r) {
    return cellText_(r.id) !== "" && cellText_(r.gone) !== "yes" && !Object.prototype.hasOwnProperty.call(removed, cellText_(r.stop));
  });
}

function liveTickets_() {
  return countedTickets_(readTable_("Tickets"), removedStops_());
}

// Deletes TicketData rows whose ticket no Tickets row names (a failed add's), bottom up.
function sweepTicketChunks_(known) {
  var ids = columnValues_("TicketData", "ticket");
  var gone = [];
  for (var i = 0; i < ids.length; i++) {
    var t = cellText_(ids[i]);
    if (t === "" || !Object.prototype.hasOwnProperty.call(known, t)) gone.push(i + 2);
  }
  if (gone.length) deleteRowsAt_("TicketData", gone);
}

// { ticket: { id, stop, who, seat, page, mime, w, h, data } } -> { ticket, logId }.
function addTicket_(args, ctx) {
  if (ctx.via === "claude") return err_("bad_input", MSG_.claudeTicket);
  if (!ticketsReady_()) return err_("needs_migrate", MSG_.needsMigrate);
  // The id first (fix round 1, I5): a phone that no longer holds a picture's
  // data can still resend its add to learn whether it landed.
  var given = isObj_(args.ticket) ? args.ticket : null;
  if (!given || typeof given.id !== "string" || !ID_RE_.test(given.id)) return err_("bad_input", "That ticket picture has a bad id.");
  var all = readTable_("Tickets");
  var known = {};
  var existing = null;
  all.forEach(function (r) {
    var id = cellText_(r.id);
    if (id === "") return;
    known[id] = true;
    if (id === given.id) existing = r;
  });
  if (existing) return ok_({ ticket: ticketFromRow(existing), logId: firstLogId_("ticket", given.id, "add") }, rev_());
  if (given.data === undefined || given.data === null) return err_("not_found", MSG_.ticketNeverSent);
  var v = validateTicket(given, ctx.names);
  if (!v.ok) return err_("bad_input", v.message);
  var t = v.value;
  var stopRow = findPlanRow_(planKind_("stop"), t.stop);
  if (!stopRow || cellSet_(stopRow.deleted_at)) return err_("not_found", MSG_.noStop);
  var live = countedTickets_(all, removedStops_());
  if (live.length >= TICKET_LIMITS.perTrip) return err_("bad_input", MSG_.ticketsPerTrip);
  if (live.filter(function (r) { return cellText_(r.stop) === t.stop; }).length >= TICKET_LIMITS.perStop) return err_("bad_input", MSG_.ticketsPerStop);

  sweepTicketChunks_(known);
  var chunks = ticketChunks(t.data);
  appendObjs_("TicketData", chunks.map(function (c, i) { return { ticket: t.id, n: String(i), data: c }; }));
  appendObj_("Tickets", {
    id: t.id, stop: t.stop, who: t.who, seat: t.seat, page: String(t.page), mime: t.mime, w: String(t.w), h: String(t.h),
    size: String(t.data.length), chunks: String(chunks.length), by: ctx.actor, at: nowIso_(), gone: "",
  });
  var saved = ticketFromRow(findRow_("Tickets", t.id));
  var after = ticketSnap_(saved, cellText_(stopRow.title));
  var log = appendLog_(ctx, "add", "ticket", t.id, summarize("add", "ticket", null, after), null, after);
  return ok_({ ticket: saved, logId: log.id }, bumpRev_());
}

// { id } -> { id, mime, data }: the chunks joined in order. Refused for a removed or unknown one.
function ticket_(args) {
  if (!ticketsReady_()) return err_("needs_migrate", MSG_.needsMigrate);
  var id = idArg_(args);
  if (!id) return err_("bad_input", MSG_.badId);
  var row = findRow_("Tickets", id);
  if (!row || cellText_(row.gone) === "yes") return err_("not_found", MSG_.noTicket);
  var t = ticketFromRow(row);
  var ids = columnValues_("TicketData", "ticket");
  var at = [];
  for (var i = 0; i < ids.length; i++) if (cellText_(ids[i]) === id) at.push(i + 2);
  var ns = cellsAt_("TicketData", "n", at);
  var parts = cellsAt_("TicketData", "data", at);
  var cells = at.map(function (r, k) { return { n: ns[k], data: parts[k] }; });
  var data = joinTicketChunks(cells, t.chunks, t.size);
  if (data === null) return err_("not_found", MSG_.noTicket);
  return ok_({ id: id, mime: t.mime, data: data }, rev_());
}

function stopTitle_(stopId) {
  var row = findPlanRow_(planKind_("stop"), stopId);
  return row ? cellText_(row.title) : "";
}

function removeTicket_(args, ctx) {
  if (ctx.via === "claude") return err_("bad_input", MSG_.claudeTicket);
  if (!ticketsReady_()) return err_("needs_migrate", MSG_.needsMigrate);
  var id = idArg_(args);
  if (!id) return err_("bad_input", MSG_.badId);
  var row = findRow_("Tickets", id);
  if (!row) return err_("not_found", MSG_.noTicket);
  var cur = ticketFromRow(row);
  if (cur.gone) return ok_({ ticket: cur, logId: null }, rev_());
  var saved = ticketFromRow(updateById_("Tickets", id, { gone: "yes" }));
  var title = stopTitle_(cur.stop);
  var log = appendLog_(ctx, "remove", "ticket", id, summarize("remove", "ticket", ticketSnap_(cur, title), ticketSnap_(saved, title)), ticketSnap_(cur, title), ticketSnap_(saved, title));
  return ok_({ ticket: saved, logId: log.id }, bumpRev_());
}

// Undoing an add or a remove (or an undo) puts the picture where the entry
// found it: removed, or back. Coming back, it still has to fit on its stop.
function undoTicket_(entry, rows, ctx) {
  if (ctx.via === "claude") return err_("bad_input", MSG_.claudeTicket);
  if (entry.undoneBy !== null) return err_("stale", MSG_.undone);
  if (!canUndo(entry, rows.map(logShape_))) return err_("stale", MSG_.newer);
  if (!entry.after) return err_("stale", MSG_.cantUndo);
  if (!ticketsReady_()) return err_("needs_migrate", MSG_.needsMigrate);
  var row = findRow_("Tickets", entry.ref);
  if (!row) return err_("not_found", MSG_.noTicket);
  var cur = ticketFromRow(row);
  var gone = entry.before ? entry.before.gone === true : true;
  if (!gone && cur.gone) {
    var others = liveTickets_();
    if (others.length >= TICKET_LIMITS.perTrip) return err_("bad_input", MSG_.ticketsPerTrip);
    if (others.filter(function (r) { return cellText_(r.stop) === cur.stop; }).length >= TICKET_LIMITS.perStop) return err_("bad_input", MSG_.ticketsPerStop);
  }
  var saved = ticketFromRow(updateById_("Tickets", entry.ref, { gone: gone ? "yes" : "" }));
  var title = stopTitle_(cur.stop) || cellText_(entry.after.stopTitle);
  var log = appendLog_(ctx, "undo", "ticket", entry.ref, "undid: " + entry.summary, ticketSnap_(cur, title), ticketSnap_(saved, title), entry.id);
  updateById_("Log", entry.id, { undone_by: log.id });
  var shown = logShape_(log);
  shown.canUndo = true;
  return ok_({ entry: shown, logId: log.id, ticket: saved }, bumpRev_());
}

// ---- undo ----

// Whether a logged change moved an item's coordinates (both sides known and different).
function movedCoords_(entry) {
  var b = entry.before, a = entry.after;
  if (!b || !a || b.lat === undefined || a.lat === undefined) return false;
  return b.lat !== a.lat || b.lng !== a.lng;
}

function undo_(args, ctx) {
  var raw = args.logId;
  var logId = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!isFinite(logId)) return err_("bad_input", MSG_.badLogId);
  var rows = logRows_();
  var row = null;
  for (var i = 0; i < rows.length; i++) if (Number(rows[i].id) === logId) { row = rows[i]; break; }
  if (!row) return err_("not_found", MSG_.noLog);

  var entry = parseLogRow(row);
  if (entry.kind === "picture") return undoPicture_(entry, rows, ctx);
  if (entry.kind === "stamp") return undoStamp_(entry, rows, ctx);
  if (entry.kind === "ticket") return undoTicket_(entry, rows, ctx);
  var plan = planKind_(entry.kind);
  if (entry.kind !== "expense" && entry.kind !== "payment" && !plan) return err_("stale", MSG_.cantUndo);
  if (entry.undoneBy !== null) return err_("stale", MSG_.undone);
  if (!canUndo(entry, rows.map(logShape_))) return err_("stale", MSG_.newer);
  if (!entry.before && !entry.after) return err_("stale", MSG_.cantUndo);

  var isExpense = entry.kind === "expense";
  var tab = isExpense ? "Expenses" : "Settlements";
  var curRow = plan ? findPlanRow_(plan, entry.ref) : findRow_(tab, entry.ref);
  if (!curRow) return err_("not_found", plan ? plan.missing : isExpense ? MSG_.noExpense : MSG_.noPayment);
  var target = undoTarget(entry);
  var cur, patch, saved;
  // Every editable column plus deleted_at / removed_at; never rate, added_by/at or stamped_by/at.
  // An item that is already marked keeps its original timestamp (undefined is not written).
  // A plan item writes back every field that differs from now, blanks included.
  if (plan) {
    cur = plan.fromRow(curRow);
    patch = changedCols_(plan, cur, target);
    // Coordinates are written back only when that change itself moved them:
    // an older entry (or one from before locate ran) must not wipe them.
    if (!movedCoords_(entry)) {
      delete patch.lat;
      delete patch.lng;
      // But a restored place, address or city is not where the coordinates now
      // are (locate may have found the new one since): clear them so locate asks again.
      var posCols = { stop: ["place"], stay: ["address_jp", "place"], day: ["city"] }[entry.kind] || [];
      if (posCols.some(function (c) { return patch[c] !== undefined; })) {
        patch.lat = "";
        patch.lng = "";
      }
    }
    if (plan.deletable) patch.deleted_at = target.deleted ? (cur.deleted ? undefined : nowIso_()) : "";
    saved = writePlan_(plan, entry.ref, patch);
  } else if (isExpense) {
    cur = expenseFromRow(curRow);
    patch = expenseToRow(editableOf_(target));
    patch.deleted_at = target.deleted ? (cur.deleted ? undefined : nowIso_()) : "";
    saved = expenseFromRow(updateById_(tab, entry.ref, patch));
  } else {
    cur = paymentFromRow(curRow);
    patch = paymentToRow(paymentEditableOf_(target));
    patch.removed_at = target.removed ? (cur.removed ? undefined : nowIso_()) : "";
    saved = paymentFromRow(updateById_(tab, entry.ref, patch));
  }

  var log = appendLog_(ctx, "undo", entry.kind, entry.ref, "undid: " + entry.summary, entry.after || cur, saved, entry.id);
  updateById_("Log", entry.id, { undone_by: log.id });
  var rev = bumpRev_();
  var shown = logShape_(log);
  shown.canUndo = true;
  var data = { entry: shown, logId: log.id };
  data[entry.kind] = saved;
  return ok_(data, rev);
}
