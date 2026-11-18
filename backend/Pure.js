// Pure logic. Plain global functions so Apps Script can run it as-is;
// the footer lets Node tests load the same file.

// The trip's fixed facts. The phone's copy is js/trip.js; tests/trip.test.js
// fails when the two differ. The Sheet's Trip tab has tz, home and currency
// too: they must agree with these (tripMismatch), and editing them never
// changes the app's zone or currencies.
var TRIP_TZ_ = "America/Chicago";
// Chicago is UTC−6 for the whole trip (no clock change from Dec 26 to Jan 1):
// the stamp windows use this fixed offset, as the phone does.
var TRIP_UTC_OFFSET_MS_ = -6 * 3600000;
var TRIP_ZONE_WORD_ = "Chicago time";
var HOME_CURRENCY_ = "CAD";
var TRIP_CURRENCY_ = "USD";
var TRIP_FIRST_DAY_ = "2026-12-26";
var TRIP_LAST_DAY_ = "2027-01-01";

// The Trip tab ({ key: value }) against the constants above: null when tz,
// home and currency agree (an empty cell agrees), else one sentence saying
// which disagree, for setup's log and load's refusal.
function tripMismatch(trip) {
  var want = { tz: TRIP_TZ_, home: HOME_CURRENCY_, currency: TRIP_CURRENCY_ };
  var wrong = [];
  Object.keys(want).forEach(function (k) {
    var v = trip && trip[k] !== undefined && trip[k] !== null ? String(trip[k]).trim() : "";
    if (v !== "" && v !== want[k]) wrong.push(k + " is " + v + ", not " + want[k]);
  });
  if (!wrong.length) return null;
  return "The Trip tab doesn\u2019t match this app (" + wrong.join("; ") + "). This app\u2019s zone and currencies are fixed in its code: put the Trip tab back as it was.";
}

var TABS = {
  Trip: ["key", "value"],
  People: ["name", "initials", "order", "etransfer", "simplify", "email", "photo"],
  Days: ["date", "city", "title", "line_jp", "line_en", "line_colour", "from_jp", "from_en", "to_jp", "to_en"],
  Stops: ["id", "date", "time", "title", "detail", "getting_there", "travel_min", "fixed", "place", "sign_jp", "booked", "link", "photo", "note", "deleted_at"],
  Stays: ["id", "name", "name_jp", "address_jp", "first_night", "last_night", "note", "place", "link", "photo", "deleted_at"],
  Expenses: ["id", "day", "title", "amount", "currency", "rate", "paid_by", "split", "split_mode", "split_vals", "note", "kind", "receipt", "added_by", "added_at", "deleted_at"],
  Settlements: ["id", "from", "to", "cad", "stamped_by", "stamped_at", "seed", "rot", "removed_at"],
  Log: ["id", "at", "who", "via", "action", "kind", "ref", "summary", "before", "after", "undoes", "undone_by"],
  StampDefs: ["id", "date", "name_ja", "name_en", "place", "motif", "ink", "shape"],
  Stamps: ["id", "def", "who", "at", "seed", "gone"],
};

var KINDS = ["food", "transport", "stay", "activity", "shopping"];

// Every column is plain text (so Sheets never turns "1/2" into a date or
// "0012" into 12) except these numbers and booleans.
var NUMBER_COLUMNS_ = ["amount", "rate", "cad", "seed", "rot", "order", "travel_min"];
var LOG_NUMBER_COLUMNS_ = ["id", "undoes", "undone_by"];
var BOOLEAN_COLUMNS_ = ["simplify", "fixed", "booked"];

function isTextColumn(tab, header) {
  if (NUMBER_COLUMNS_.indexOf(header) !== -1 || BOOLEAN_COLUMNS_.indexOf(header) !== -1) return false;
  if (tab === "Log" && LOG_NUMBER_COLUMNS_.indexOf(header) !== -1) return false;
  return true;
}

var ID_RE_ = /^[A-Za-z0-9][A-Za-z0-9_-]{7,39}$/;
var DAY_RE_ = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeCell(v) {
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

// Undoes sanitizeCell on read, whether or not Sheets kept the apostrophe in a
// plain-text cell: "'" followed by = + - @ tab or CR loses that one apostrophe.
function unsanitizeCell(v) {
  if (typeof v === "string" && /^'[=+\-@\t\r]/.test(v)) return v.slice(1);
  return v;
}

function rowToObj(headers, row) {
  var o = {};
  for (var i = 0; i < headers.length; i++) o[headers[i]] = i < row.length ? unsanitizeCell(row[i]) : "";
  return o;
}

function objToRow(headers, obj) {
  return headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? "" : sanitizeCell(v);
  });
}

// ---- input checking ----

function fail_(message) { return { ok: false, message: message }; }

function isObj_(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function round2_(n) {
  var s = String(n);
  if (s.indexOf("e") !== -1) return Math.round(n * 100) / 100;
  return Number(Math.round(Number(s + "e2")) + "e-2");
}

function cents_(n) { return Math.round(Number(String(round2_(n)) + "e2")); }

function realDay_(s) {
  var y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  if (m < 1 || m > 12 || d < 1) return false;
  var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  var dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1];
}

function validateExpense(input, peopleNames) {
  if (!isObj_(input)) return fail_("That didn’t come through properly.");
  var id = input.id, day = input.day, title = input.title, amount = input.amount;
  if (typeof id !== "string" || !ID_RE_.test(id)) return fail_("That line has a bad id.");
  if (typeof day !== "string" || (day !== "pre" && (!DAY_RE_.test(day) || !realDay_(day)))) return fail_("Pick a day.");
  if (typeof title !== "string") return fail_("Say what it was for.");
  title = title.trim();
  if (!title) return fail_("Say what it was for.");
  if (title.length > 80) return fail_("Keep the name under 80 letters.");
  if (typeof amount !== "number" || !isFinite(amount)) return fail_("Put in an amount.");
  if (input.currency !== TRIP_CURRENCY_ && input.currency !== HOME_CURRENCY_) return fail_("Use US or Canadian dollars.");
  var currency = input.currency;
  // Both currencies have cents.
  amount = round2_(amount);
  if (!(amount > 0)) return fail_("The amount has to be more than zero.");
  if (amount > 10000000) return fail_("That amount is too big.");
  if (typeof input.paidBy !== "string" || peopleNames.indexOf(input.paidBy) === -1) return fail_("Pick who paid.");
  var split = input.split;
  if (!Array.isArray(split) || split.length === 0) return fail_("Pick who shares it.");
  for (var i = 0; i < split.length; i++) {
    if (typeof split[i] !== "string" || peopleNames.indexOf(split[i]) === -1) return fail_("Someone in the split isn’t on this trip.");
    if (split.indexOf(split[i]) !== i) return fail_("Someone is in the split twice.");
  }
  var note = input.note === undefined || input.note === null ? "" : input.note;
  if (typeof note !== "string") return fail_("The note didn’t come through properly.");
  note = note.trim();
  if (note.length > 200) return fail_("Keep the note under 200 letters.");
  var kind = input.kind === undefined || input.kind === null ? "" : input.kind;
  if (kind !== "" && KINDS.indexOf(kind) === -1) return fail_("That kind isn’t one we know.");
  var mode = input.splitMode === undefined || input.splitMode === null || input.splitMode === "" ? "equal" : input.splitMode;
  var vals = input.splitVals === undefined || input.splitVals === null ? [] : input.splitVals;
  if (!Array.isArray(vals)) return fail_("The split didn’t come through properly.");
  if (mode === "equal") {
    vals = [];
  } else if (mode === "parts") {
    if (vals.length !== split.length) return fail_("Give every person a share.");
    for (var p = 0; p < vals.length; p++) {
      if (typeof vals[p] !== "number" || vals[p] % 1 !== 0 || vals[p] < 1 || vals[p] > 99) return fail_("Shares must be whole numbers from 1 to 99.");
    }
  } else if (mode === "exact") {
    if (vals.length !== split.length) return fail_("Give every person an amount.");
    var sum = 0;
    var rounded = [];
    for (var x = 0; x < vals.length; x++) {
      var v = vals[x];
      if (typeof v !== "number" || !isFinite(v) || !(v > 0)) return fail_("Every amount has to be more than zero.");
      var units = cents_(v);
      if (units < 1) return fail_("Every amount has to be at least one cent.");
      sum += units;
      rounded.push(units / 100);
    }
    var total = cents_(amount);
    if (sum !== total) return fail_("The amounts don’t add up to the total.");
    vals = rounded;
  } else {
    return fail_("That way of splitting isn’t one we know.");
  }
  return {
    ok: true,
    value: { id: id, day: day, title: title, amount: amount, currency: currency, paidBy: input.paidBy, split: split.slice(), splitMode: mode, splitVals: vals.slice(), note: note, kind: kind },
  };
}

function validatePayment(input, peopleNames) {
  if (!isObj_(input)) return fail_("That didn’t come through properly.");
  if (typeof input.id !== "string" || !ID_RE_.test(input.id)) return fail_("That payment has a bad id.");
  if (typeof input.from !== "string" || peopleNames.indexOf(input.from) === -1) return fail_("Pick who paid.");
  if (typeof input.to !== "string" || peopleNames.indexOf(input.to) === -1) return fail_("Pick who got paid.");
  if (input.from === input.to) return fail_("Nobody can pay themselves.");
  if (typeof input.cad !== "number" || !isFinite(input.cad)) return fail_("Put in an amount.");
  var cad = round2_(input.cad);
  if (!(cad > 0)) return fail_("The amount has to be more than zero.");
  if (cad > 100000) return fail_("That amount is too big.");
  if (typeof input.seed !== "number" || input.seed % 1 !== 0 || input.seed < 1) return fail_("That payment is missing its stamp.");
  if (typeof input.rot !== "number" || !isFinite(input.rot)) return fail_("That payment is missing its stamp.");
  return { ok: true, value: { id: input.id, from: input.from, to: input.to, cad: cad, seed: input.seed, rot: input.rot } };
}

// A person's picture (Task 16): a square JPEG the phone has already shrunk,
// as a data address, or "" for none. Nothing else is ever stored or drawn.
var PHOTO_RE_ = /^data:image\/jpeg;base64,[A-Za-z0-9+\/]+={0,2}$/;
var PHOTO_MAX_ = 12000;
var PHOTO_BAD_ = "That picture couldn\u2019t be used. Try another.";
var PHOTO_HEAD_ = "data:image/jpeg;base64,";
// The address's shape, and its base64 part in whole 4-character groups.
function isPhoto_(ph) {
  return PHOTO_RE_.test(ph) && (ph.length - PHOTO_HEAD_.length) % 4 === 0;
}

function validatePersonPatch(patch) {
  if (!isObj_(patch)) return fail_("That didn’t come through properly.");
  var out = {};
  var keys = Object.keys(patch);
  if (keys.length === 0) return fail_("Nothing to change.");
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "etransfer") {
      if (typeof patch.etransfer !== "string") return fail_("The e-Transfer address didn’t come through properly.");
      var t = patch.etransfer.trim();
      if (t.length > 80) return fail_("Keep the e-Transfer address under 80 letters.");
      out.etransfer = t;
    } else if (k === "simplify") {
      if (typeof patch.simplify !== "boolean") return fail_("Simplify has to be on or off.");
      out.simplify = patch.simplify;
    } else if (k === "photo") {
      var ph = patch.photo;
      if (typeof ph !== "string" || ph.length > PHOTO_MAX_ || (ph !== "" && !isPhoto_(ph))) return fail_(PHOTO_BAD_);
      out.photo = ph;
    } else {
      return fail_("You can only change the e-Transfer address, Simplify and your picture.");
    }
  }
  return { ok: true, value: out };
}

// ---- stops, stays and day headers ----

var DAY_PATCH_KEYS = ["city", "title", "lineJp", "lineEn", "lineColour", "fromJp", "fromEn", "toJp", "toEn"];
var TIME_RE_ = /^([01]\d|2[0-3]):[0-5]\d$/;
var COLOUR_RE_ = /^#[0-9A-Fa-f]{6}$/;

// The trimmed link when it is http(s) with no spaces and not too long, else "".
function safeUrl(v) {
  if (typeof v !== "string") return "";
  var t = v.trim();
  return t.length <= 500 && /^https?:\/\/\S+$/i.test(t) ? t : "";
}

// A picture address has to be https (a stop's photo is only checked as a link;
// a stay's is held to the https the message promises).
function safeHttpsUrl(v) {
  var u = safeUrl(v);
  return /^https:/i.test(u) ? u : "";
}

function optPhoto_(v, message) {
  if (v === undefined || v === null) return { ok: true, value: "" };
  if (typeof v !== "string") return fail_(message);
  if (v.trim() === "") return { ok: true, value: "" };
  var u = safeHttpsUrl(v);
  return u ? { ok: true, value: u } : fail_(message);
}

function dayLabel(date) {
  var s = String(date);
  if (!DAY_RE_.test(s) || !realDay_(s)) return s;
  var d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))));
  var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  var mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return wd + " " + mo + " " + d.getUTCDate();
}

function validDay_(v) { return typeof v === "string" && DAY_RE_.test(v) && realDay_(v); }

// Optional text: absent is "", otherwise a string trimmed and kept to max letters.
function optText_(v, max, tooLong) {
  if (v === undefined || v === null) return { ok: true, value: "" };
  if (typeof v !== "string") return fail_("That didn’t come through properly.");
  var t = v.trim();
  if (t.length > max) return fail_(tooLong);
  return { ok: true, value: t };
}

// Optional link: absent or blank is "", otherwise it has to be http(s).
function optLink_(v, message) {
  if (v === undefined || v === null) return { ok: true, value: "" };
  if (typeof v !== "string") return fail_(message);
  if (v.trim() === "") return { ok: true, value: "" };
  var u = safeUrl(v);
  return u ? { ok: true, value: u } : fail_(message);
}

// A place is plain words or a pasted Maps link; anything starting http has to be a good link.
function optPlace_(v) {
  var r = optText_(v, 200, "Keep the place under 200 letters.");
  if (!r.ok) return r;
  if (/^https?:/i.test(r.value) && !safeUrl(r.value)) return fail_("That map link didn’t come through properly.");
  return r;
}

function optFlag_(v, message) {
  if (v === undefined || v === null) return { ok: true, value: false };
  if (typeof v !== "boolean") return fail_(message);
  return { ok: true, value: v };
}

function validateStop(input, dayDates) {
  if (!isObj_(input)) return fail_("That didn’t come through properly.");
  if (typeof input.id !== "string" || !ID_RE_.test(input.id)) return fail_("That stop has a bad id.");
  if (!validDay_(input.date) || dayDates.indexOf(input.date) === -1) return fail_("Pick a day of the trip.");
  if (typeof input.title !== "string" || input.title.trim() === "") return fail_("Say what it is.");
  var title = input.title.trim();
  if (title.length > 80) return fail_("Keep the name under 80 letters.");
  var time = input.time === undefined || input.time === null ? "" : input.time;
  if (typeof time !== "string" || (time !== "" && !TIME_RE_.test(time))) return fail_("Use a time like 14:30.");
  var travel = input.travelMin === undefined || input.travelMin === null || input.travelMin === "" ? 0 : input.travelMin;
  if (typeof travel !== "number" || travel % 1 !== 0 || travel < 0 || travel > 600) return fail_("Minutes to get there must be a whole number from 0 to 600.");
  var detail = optText_(input.detail, 120, "Keep the detail under 120 letters.");
  if (!detail.ok) return detail;
  var there = optText_(input.gettingThere, 300, "Keep the directions under 300 letters.");
  if (!there.ok) return there;
  var fixed = optFlag_(input.fixed, "Fixed has to be on or off.");
  if (!fixed.ok) return fixed;
  var place = optPlace_(input.place);
  if (!place.ok) return place;
  var sign = optText_(input.signJp, 20, "Keep the sign name under 20 letters.");
  if (!sign.ok) return sign;
  var booked = optFlag_(input.booked, "Booked has to be on or off.");
  if (!booked.ok) return booked;
  var link = optLink_(input.link, "That link has to start with https://.");
  if (!link.ok) return link;
  var photo = optLink_(input.photo, "That photo link has to start with https://.");
  if (!photo.ok) return photo;
  var note = optText_(input.note, 300, "Keep the note under 300 letters.");
  if (!note.ok) return note;
  return {
    ok: true,
    value: { id: input.id, date: input.date, time: time, title: title, detail: detail.value, gettingThere: there.value, travelMin: travel, fixed: fixed.value, place: place.value, signJp: sign.value, booked: booked.value, link: link.value, photo: photo.value, note: note.value },
  };
}

function validateStay(input) {
  if (!isObj_(input)) return fail_("That didn’t come through properly.");
  if (typeof input.id !== "string" || !ID_RE_.test(input.id)) return fail_("That stay has a bad id.");
  if (typeof input.name !== "string" || input.name.trim() === "") return fail_("Say where you’re staying.");
  var name = input.name.trim();
  if (name.length > 80) return fail_("Keep the name under 80 letters.");
  var nameJp = optText_(input.nameJp, 80, "Keep the second name under 80 letters.");
  if (!nameJp.ok) return nameJp;
  var addressJp = optText_(input.addressJp, 200, "Keep the address under 200 letters.");
  if (!addressJp.ok) return addressJp;
  if (!validDay_(input.firstNight) || !validDay_(input.lastNight)) return fail_("Pick the first and last night.");
  if (input.lastNight < input.firstNight) return fail_("The last night can’t be before the first.");
  var note = optText_(input.note, 300, "Keep the note under 300 letters.");
  if (!note.ok) return note;
  var place = optPlace_(input.place);
  if (!place.ok) return place;
  var link = optLink_(input.link, "That link has to start with https://.");
  if (!link.ok) return link;
  var photo = optPhoto_(input.photo, "That photo link has to start with https://.");
  if (!photo.ok) return photo;
  return {
    ok: true,
    value: { id: input.id, name: name, nameJp: nameJp.value, addressJp: addressJp.value, firstNight: input.firstNight, lastNight: input.lastNight, note: note.value, place: place.value, link: link.value, photo: photo.value },
  };
}

function validateDayPatch(patch) {
  if (!isObj_(patch)) return fail_("That didn’t come through properly.");
  var keys = Object.keys(patch);
  if (keys.length === 0) return fail_("Nothing to change.");
  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (DAY_PATCH_KEYS.indexOf(k) === -1) return fail_("Only a day’s city, title, line and places can be changed.");
    var v = patch[k];
    if (typeof v !== "string") return fail_("That didn’t come through properly.");
    v = v.trim();
    if (k === "lineColour") {
      if (v !== "" && !COLOUR_RE_.test(v)) return fail_("Use a colour like #2FB6E8.");
    } else if (k === "title") {
      if (v.length > 80) return fail_("Keep the title under 80 letters.");
    } else if (v.length > 60) {
      return fail_("Keep each line, city and place under 60 letters.");
    }
    out[k] = v;
  }
  return { ok: true, value: out };
}

// ---- sheet row -> API shape ----

function cellDate_(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    if (typeof Utilities !== "undefined" && typeof Session !== "undefined") return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
    return v.toISOString().slice(0, 10);
  }
  return v === undefined || v === null ? "" : String(v);
}

function cellStamp_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  return v === undefined || v === null ? "" : String(v);
}

function cellText_(v) { return v === undefined || v === null ? "" : String(v); }

function cellNum_(v) {
  if (v === "" || v === undefined || v === null) return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function cellList_(v) {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(cellText_);
  return String(v).split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s !== ""; });
}

function cellSet_(v) { return v !== undefined && v !== null && v !== "" && !(v instanceof Date && isNaN(v.getTime())); }

function expenseFromRow(o) {
  return {
    id: cellText_(o.id),
    day: cellDate_(o.day),
    title: cellText_(o.title),
    amount: cellNum_(o.amount),
    currency: cellText_(o.currency),
    rate: cellNum_(o.rate),
    paidBy: cellText_(o.paid_by),
    split: cellList_(o.split),
    splitMode: cellText_(o.split_mode) || "equal",
    splitVals: cellList_(o.split_vals).map(Number),
    note: cellText_(o.note),
    kind: cellText_(o.kind),
    addedBy: cellText_(o.added_by),
    addedAt: cellStamp_(o.added_at),
    deleted: cellSet_(o.deleted_at),
  };
}

function paymentFromRow(o) {
  return {
    id: cellText_(o.id),
    from: cellText_(o.from),
    to: cellText_(o.to),
    cad: cellNum_(o.cad),
    stampedBy: cellText_(o.stamped_by),
    stampedAt: cellStamp_(o.stamped_at),
    seed: cellNum_(o.seed),
    rot: cellNum_(o.rot),
    removed: cellSet_(o.removed_at),
  };
}

function personFromRow(o) {
  var off = o.simplify === false || String(o.simplify).trim().toUpperCase() === "FALSE";
  return { name: cellText_(o.name), initials: cellText_(o.initials), etransfer: cellText_(o.etransfer), simplify: !off, photo: cellText_(o.photo) };
}

function cellBool_(v) { return v === true || String(v).trim().toUpperCase() === "TRUE"; }

// A stop's time cell as "HH:MM", or "" when it holds no readable time. Typed
// by hand it may lack the leading zero (9:30). Sheets may hand a time cell
// back as a fraction of a day (0.5 is 12:00) or as a Date on its zero day in
// the sheet's zone: like cellDate_, that Date is read in the script's zone,
// and only on Apps Script; a reading with stray seconds (an old zone's local
// mean time on that 1899 day) is not trusted and counts as no time.
function cellTime_(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime()) || typeof Utilities === "undefined" || typeof Session === "undefined") return "";
    var hms = Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm:ss");
    return /^([01]\d|2[0-3]):[0-5]\d:00$/.test(hms) ? hms.slice(0, 5) : "";
  }
  if (typeof v === "number") {
    if (!isFinite(v) || v < 0 || v >= 1) return "";
    var m = Math.round(v * 1440);
    if (m >= 1440) return "";
    return (m < 600 ? "0" : "") + Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + (m % 60);
  }
  var t = cellText_(v).trim();
  if (/^\d:[0-5]\d$/.test(t)) t = "0" + t;
  return TIME_RE_.test(t) ? t : "";
}

// Minutes to get there: a whole number from 0 up (rounded); anything else 0.
function cellMinutes_(v) {
  var n = cellNum_(v);
  return n > 0 ? Math.round(n) : 0;
}

function stopFromRow(o) {
  return {
    id: cellText_(o.id),
    date: cellDate_(o.date),
    time: cellTime_(o.time),
    title: cellText_(o.title),
    detail: cellText_(o.detail),
    gettingThere: cellText_(o.getting_there),
    travelMin: cellMinutes_(o.travel_min),
    fixed: cellBool_(o.fixed),
    place: cellText_(o.place),
    signJp: cellText_(o.sign_jp),
    booked: cellBool_(o.booked),
    link: safeUrl(cellText_(o.link)),
    photo: safeUrl(cellText_(o.photo)),
    note: cellText_(o.note),
    deleted: cellSet_(o.deleted_at),
  };
}

function stayFromRow(o) {
  return {
    id: cellText_(o.id),
    name: cellText_(o.name),
    nameJp: cellText_(o.name_jp),
    addressJp: cellText_(o.address_jp),
    firstNight: cellDate_(o.first_night),
    lastNight: cellDate_(o.last_night),
    note: cellText_(o.note),
    place: cellText_(o.place),
    link: safeUrl(cellText_(o.link)),
    photo: safeHttpsUrl(cellText_(o.photo)),
    deleted: cellSet_(o.deleted_at),
  };
}

function dayFromRow(o) {
  var colour = cellText_(o.line_colour).trim();
  return {
    date: cellDate_(o.date),
    city: cellText_(o.city),
    title: cellText_(o.title),
    lineJp: cellText_(o.line_jp),
    lineEn: cellText_(o.line_en),
    lineColour: COLOUR_RE_.test(colour) ? colour : "",
    fromJp: cellText_(o.from_jp),
    fromEn: cellText_(o.from_en),
    toJp: cellText_(o.to_jp),
    toEn: cellText_(o.to_en),
  };
}

// ---- API shape -> sheet row ----
// Timestamps (added_at, deleted_at, stamped_at, removed_at) are left to the
// action that writes the row. Optional fields that are absent are left out, so
// the result can also be used as a patch.

function put_(o, key, v) { if (v !== undefined) o[key] = v; }

function expenseToRow(e) {
  var o = {};
  put_(o, "id", e.id);
  put_(o, "day", e.day);
  put_(o, "title", e.title);
  put_(o, "amount", e.amount);
  put_(o, "currency", e.currency);
  put_(o, "rate", e.rate);
  put_(o, "paid_by", e.paidBy);
  put_(o, "split", Array.isArray(e.split) ? e.split.join(",") : undefined);
  put_(o, "split_mode", e.splitMode);
  put_(o, "split_vals", Array.isArray(e.splitVals) ? e.splitVals.join(",") : undefined);
  put_(o, "note", e.note);
  put_(o, "kind", e.kind);
  put_(o, "added_by", e.addedBy);
  return o;
}

function paymentToRow(p) {
  var o = {};
  put_(o, "id", p.id);
  put_(o, "from", p.from);
  put_(o, "to", p.to);
  put_(o, "cad", p.cad);
  put_(o, "stamped_by", p.stampedBy);
  put_(o, "seed", p.seed);
  put_(o, "rot", p.rot);
  return o;
}

function stopToRow(s) {
  var o = {};
  put_(o, "id", s.id);
  put_(o, "date", s.date);
  put_(o, "time", s.time);
  put_(o, "title", s.title);
  put_(o, "detail", s.detail);
  put_(o, "getting_there", s.gettingThere);
  put_(o, "travel_min", s.travelMin);
  put_(o, "fixed", s.fixed);
  put_(o, "place", s.place);
  put_(o, "sign_jp", s.signJp);
  put_(o, "booked", s.booked);
  put_(o, "link", s.link);
  put_(o, "photo", s.photo);
  put_(o, "note", s.note);
  return o;
}

function stayToRow(s) {
  var o = {};
  put_(o, "id", s.id);
  put_(o, "name", s.name);
  put_(o, "name_jp", s.nameJp);
  put_(o, "address_jp", s.addressJp);
  put_(o, "first_night", s.firstNight);
  put_(o, "last_night", s.lastNight);
  put_(o, "note", s.note);
  put_(o, "place", s.place);
  put_(o, "link", s.link);
  put_(o, "photo", s.photo);
  return o;
}

function dayToRow(d) {
  var o = {};
  put_(o, "date", d.date);
  put_(o, "city", d.city);
  put_(o, "title", d.title);
  put_(o, "line_jp", d.lineJp);
  put_(o, "line_en", d.lineEn);
  put_(o, "line_colour", d.lineColour);
  put_(o, "from_jp", d.fromJp);
  put_(o, "from_en", d.fromEn);
  put_(o, "to_jp", d.toJp);
  put_(o, "to_en", d.toEn);
  return o;
}

// The rows setup() writes into an empty Sheet (also used by the test backend):
// the trip, its two people, and one Days row per date from the first day to
// the last, each in Chicago with no title yet.
function setupSeedRows() {
  var days = [];
  var first = TRIP_FIRST_DAY_, last = TRIP_LAST_DAY_;
  var t = Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, Number(first.slice(8, 10)));
  for (var date = first; date <= last; date = new Date(t).toISOString().slice(0, 10)) {
    days.push({ date: date, city: "Chicago", title: "" });
    t += 86400000;
  }
  return {
    Trip: [
      { key: "name", value: "Chicago 2026" }, { key: "start", value: TRIP_FIRST_DAY_ }, { key: "end", value: TRIP_LAST_DAY_ },
      { key: "home", value: HOME_CURRENCY_ }, { key: "currency", value: TRIP_CURRENCY_ }, { key: "tz", value: TRIP_TZ_ },
    ],
    People: [
      { name: "Mo", initials: "MO", order: 1, etransfer: "", simplify: true, email: "", photo: "" },
      { name: "Izzah", initials: "IZ", order: 2, etransfer: "", simplify: true, email: "", photo: "" },
    ],
    Days: days,
  };
}

// ---- exchange rate ----

// A rate as it is stored and stamped on a line: four decimals (0.7234).
function rateRounded(x) {
  return Math.round(x * 10000) / 10000;
}

// Where the rate in use came from: today's stored rate is "live", an earlier
// day's (RATE_LAST) is "last", none at all means the stand-in 0.72, "fallback".
function rateSource(todayKeyValue, lastValue) {
  if (Number(todayKeyValue) > 0) return "live";
  if (Number(lastValue) > 0) return "last";
  return "fallback";
}

// The trip key check: whole keys only, and the time taken does not depend on
// where two keys of the same length first differ.
function sameKey(given, key) {
  if (typeof given !== "string" || typeof key !== "string" || key === "" || given.length !== key.length) return false;
  var diff = 0;
  for (var i = 0; i < key.length; i++) diff |= given.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

// Whether to fetch today's rate: only when today's is not stored yet and the
// last failed fetch (failAtIso) was not within the past hour.
function shouldFetchRate(todayKeyValue, failAtIso, nowIso) {
  if (Number(todayKeyValue) > 0) return false;
  var failAt = failAtIso ? Date.parse(failAtIso) : NaN;
  var now = Date.parse(nowIso);
  if (isNaN(failAt) || isNaN(now)) return true;
  var since = now - failAt;
  return !(since >= 0 && since < 60 * 60 * 1000);
}

// ---- history and undo ----

// An amount as History writes it: "$12.50" at home, "US$12.50" for the trip's
// currency (never a bare $ for US dollars).
function money_(n, currency) {
  var neg = n < 0;
  var parts = Math.abs(n).toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + (currency === HOME_CURRENCY_ ? "$" : "US$") + parts.join(".");
}

function same_(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function expenseDiff_(before, after) {
  if (before.amount !== after.amount || before.currency !== after.currency) {
    return "changed " + after.title + " " + money_(before.amount, before.currency) + " \u2192 " + money_(after.amount, after.currency);
  }
  if (before.title !== after.title) return "renamed " + before.title + " to " + after.title;
  var changed = [];
  if (before.paidBy !== after.paidBy) changed.push("payer");
  if (!same_(before.split, after.split) || before.splitMode !== after.splitMode || !same_(before.splitVals, after.splitVals)) changed.push("split");
  if (before.day !== after.day) changed.push("day");
  if (before.note !== after.note) changed.push("note");
  return "changed " + after.title + (changed.length ? ": " + changed.join(", ") : "");
}

var STOP_FIELD_LABELS_ = [["detail", "detail"], ["gettingThere", "directions"], ["travelMin", "travel time"], ["fixed", "fixed time"], ["place", "place"], ["signJp", "sign name"], ["booked", "booked"], ["link", "link"], ["photo", "photo"], ["note", "note"]];

function stopDiff_(before, after) {
  if (before.title !== after.title) return "renamed " + before.title + " to " + after.title;
  if (before.date !== after.date || before.time !== after.time) {
    return "moved " + after.title + " to " + dayLabel(after.date) + (after.time ? " " + after.time : "");
  }
  var changed = [];
  for (var i = 0; i < STOP_FIELD_LABELS_.length; i++) {
    if (before[STOP_FIELD_LABELS_[i][0]] !== after[STOP_FIELD_LABELS_[i][0]]) changed.push(STOP_FIELD_LABELS_[i][1]);
  }
  return "changed " + after.title + (changed.length ? ": " + changed.join(", ") : "");
}

function summarize(action, kind, before, after) {
  // The address itself never goes in a sentence: it stays in the Sheet.
  if (kind === "person") return "changed " + (after || before).name + "\u2019s e-Transfer address";
  // The picture itself never goes in a sentence either, and no pronoun does.
  if (kind === "picture") {
    if (!before || !before.photo) return "set a picture";
    if (!after || !after.photo) return "removed the picture";
    return "changed the picture";
  }
  if (kind === "payment") {
    var pay = after || before;
    var what = pay.from + " \u2192 " + pay.to + " " + money_(pay.cad, "CAD");
    if (action === "stamp") return "stamped " + what;
    if (action === "unstamp") return "removed the stamp " + what;
    if (action === "restamp") return "put back the stamp " + what;
    return "changed the stamp " + what;
  }
  if (kind === "stop") {
    var stop = after || before;
    if (action === "add") return "added " + stop.title + " to " + dayLabel(stop.date);
    if (action === "delete") return "removed " + stop.title + " from " + dayLabel(stop.date);
    if (action === "restore") return "put back " + stop.title + " on " + dayLabel(stop.date);
    if (before && after) return stopDiff_(before, after);
    return "changed " + stop.title;
  }
  if (kind === "stay") {
    var stayName = (after || before).name;
    if (action === "add") return "added the stay " + stayName;
    if (action === "delete") return "removed the stay " + stayName;
    if (action === "restore") return "put back the stay " + stayName;
    return "changed the stay " + stayName;
  }
  // A stamp in the book: the day it is for (a snapshot's `day`), never a place or a drawing.
  if (kind === "stamp") {
    var st = after || before;
    return !st.day ? "stamped the book" : "stamped " + shortDay_(st.day);
  }
  if (kind === "day") return "changed the ticket for " + dayLabel((after || before).date);
  var item = after || before;
  var tag = item.title + " " + money_(item.amount, item.currency);
  if (action === "add") return "rang up " + tag;
  if (action === "delete") return "deleted " + tag;
  if (action === "restore") return "brought back " + tag;
  if (action === "edit" && before && after) return expenseDiff_(before, after);
  return "changed " + item.title;
}

function undoTarget(entry) {
  if (entry.before) return JSON.parse(JSON.stringify(entry.before));
  var t = JSON.parse(JSON.stringify(entry.after));
  if (entry.kind === "payment") t.removed = true;
  else t.deleted = true;
  return t;
}

function canUndo(entry, allEntries) {
  if (entry.kind === "person") return false;
  if (entry.undoneBy !== null && entry.undoneBy !== undefined && entry.undoneBy !== "") return false;
  for (var i = 0; i < allEntries.length; i++) {
    var o = allEntries[i];
    if (Number(o.id) > Number(entry.id) && o.kind === entry.kind && String(o.ref) === String(entry.ref)) return false;
  }
  return true;
}

function cellId_(v) {
  if (v === "" || v === undefined || v === null) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function cellJson_(v) {
  if (v === "" || v === undefined || v === null) return null;
  try { return JSON.parse(String(v)); } catch (e) { return null; }
}

function logShape_(o) {
  return {
    id: Number(o.id),
    at: cellStamp_(o.at),
    who: cellText_(o.who),
    via: o.via === "claude" ? o.via : "app",
    action: cellText_(o.action),
    kind: cellText_(o.kind),
    ref: cellText_(o.ref),
    summary: cellText_(o.summary),
    undoes: cellId_(o.undoes),
    undoneBy: cellId_(o.undone_by),
  };
}

function parseLogRow(o) {
  var e = logShape_(o);
  e.before = cellJson_(o.before);
  e.after = cellJson_(o.after);
  return e;
}

function entryFromRow(o, allRows) {
  var e = logShape_(o);
  e.canUndo = canUndo(e, allRows.map(logShape_));
  return e;
}

// ---- the stamp book ----

// Judged in the trip's time at its fixed offset (TRIP_UTC_OFFSET_MS_ above;
// js/stampbook.js does the same). A day stamp is open from 00:00 on its date
// until 03:00 the next day: 27 hours.
var STAMP_OPEN_MS_ = 27 * 3600000;
var STAMP_LATE_MS_ = 48 * 3600000;
var STAMP_AHEAD_MS_ = 5 * 60000;

function shortDay_(date) {
  var s = String(date);
  if (!validDay_(s)) return s;
  var mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(s.slice(5, 7)) - 1];
  return mo + " " + Number(s.slice(8, 10));
}

// When a stamp can be pressed, as epoch ms { opens, closes }. A day stamp
// (date YYYY-MM-DD): from 00:00 Chicago time on that date for 27 hours. The
// issue stamp (date ""): from the beginning until the last day stamp closes
// (never, when the book has no day stamps). Any other date: never open.
function stampWindow(def, defs) {
  var date = cellDate_(def && def.date);
  if (date === "") {
    var latest = null;
    var list = Array.isArray(defs) ? defs : [];
    for (var i = 0; i < list.length; i++) {
      var d = cellDate_(list[i] && list[i].date);
      if (d === "" || !validDay_(d)) continue;
      var c = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) - TRIP_UTC_OFFSET_MS_ + STAMP_OPEN_MS_;
      if (latest === null || c > latest) latest = c;
    }
    return { opens: 0, closes: latest === null ? Infinity : latest };
  }
  if (!validDay_(date)) return { opens: Infinity, closes: -Infinity };
  var opens = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) - TRIP_UTC_OFFSET_MS_;
  return { opens: opens, closes: opens + STAMP_OPEN_MS_ };
}

// Why a press made at atMs (the phone's time) and received at nowMs is
// refused: "" (it is fine), "future" (the phone's time is ahead of ours by
// more than 5 minutes), "not_open", "closed" (atMs is outside the stamp's
// window) or "late" (it arrived more than 48 hours after it was pressed).
function pressRefusal(def, defs, atMs, nowMs) {
  if (!isFinite(atMs) || !isFinite(nowMs)) return "future";
  if (atMs > nowMs + STAMP_AHEAD_MS_) return "future";
  var w = stampWindow(def, defs);
  if (atMs < w.opens) return "not_open";
  if (atMs >= w.closes) return "closed";
  if (nowMs - atMs > STAMP_LATE_MS_) return "late";
  return "";
}

// A StampDefs row, every column as text.
function stampDefFromRow(o) {
  return {
    id: cellText_(o.id), date: cellDate_(o.date), name_ja: cellText_(o.name_ja), name_en: cellText_(o.name_en),
    place: cellText_(o.place), motif: cellText_(o.motif), ink: cellText_(o.ink), shape: cellText_(o.shape),
  };
}

// A Stamps row as the app sees it ("gone" only on a lifted one).
function stampFromRow(o) {
  var s = { def: cellText_(o.def), who: cellText_(o.who), at: cellStamp_(o.at), seed: cellNum_(o.seed) };
  if (cellText_(o.gone) === "yes") s.gone = true;
  return s;
}

// What the Log keeps of a press: the stamp, whether it is lifted, and the
// day it is for (so History can say "Jan 5" without reading the definitions).
function stampSnap_(s, day) {
  return { def: s.def, who: s.who, at: s.at, seed: s.seed, gone: s.gone === true, day: day };
}

if (typeof module !== "undefined") {
  module.exports = { TABS, KINDS, tripMismatch, rateRounded, TRIP_TZ_, TRIP_UTC_OFFSET_MS_, TRIP_ZONE_WORD_, HOME_CURRENCY_, TRIP_CURRENCY_, TRIP_FIRST_DAY_, TRIP_LAST_DAY_, isTextColumn, sanitizeCell, unsanitizeCell, rowToObj, objToRow, validateExpense, validatePayment, validatePersonPatch, validateStop, validateStay, validateDayPatch, DAY_PATCH_KEYS, safeUrl, safeHttpsUrl, dayLabel, stopFromRow, stopToRow, stayFromRow, stayToRow, dayFromRow, dayToRow, expenseFromRow, paymentFromRow, personFromRow, cellDate_, cellStamp_, summarize, undoTarget, canUndo, entryFromRow, parseLogRow, expenseToRow, paymentToRow, setupSeedRows, shouldFetchRate, rateSource, sameKey, shortDay_, stampWindow, pressRefusal, stampDefFromRow, stampFromRow, stampSnap_ };
}
