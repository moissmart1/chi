// One-time setup, run by hand from the script editor. Safe to run twice.
// The trip key goes only to Script Properties (and, from showInvite, to the
// execution log). It is never returned and never written into the Sheet.
// The owner functions further down (issueLinks and the rest) are also run
// from the script editor: no menu, no dialog, no new permission.

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (tab) {
    var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
    var wanted = TABS[tab];
    var have = sh.getLastColumn() === 0 ? [] : headersOf_(sh);
    wanted.forEach(function (h) {
      if (have.indexOf(h) === -1) {
        sh.getRange(1, have.length + 1).setValue(h);
        have.push(h);
      }
    });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, have.length).setFontWeight("bold");
    have.forEach(function (h, i) {
      if (isTextColumn(tab, h)) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat("@");
    });
  });

  var seed = setupSeedRows();
  seedIfEmpty_("Trip", seed.Trip);
  seedIfEmpty_("People", seed.People);
  seedIfEmpty_("Days", seed.Days);
  // A Trip tab typed for another trip is said now, not found later by the app.
  var wrong = tripMismatch(tripInfo_());
  if (wrong) throw new Error(wrong);

  var plain = ss.getSheetByName("Sheet1");
  if (plain && plain.getLastRow() === 0 && plain.getLastColumn() === 0 && ss.getSheets().length > 1) ss.deleteSheet(plain);

  var props = PropertiesService.getScriptProperties();
  // A shared key only for a brand-new trip: once anyone has a personal link,
  // or the shared one was ever retired (SHARED_RETIRED, set by
  // retireSharedLink), setup never brings a shared key back.
  if (!props.getProperty("TRIP_KEY") && props.getProperty("SHARED_RETIRED") !== "yes" && !props.getProperty("PERSON_KEYS")) props.setProperty("TRIP_KEY", Utilities.getUuid().replace(/-/g, "").slice(0, 24));
  // The Claude connector's token. Not shown here: the app's Settings copies it.
  ensureClaudeToken_();

  // Last, so the tabs are there either way: a rate host that refuses Google's
  // servers must show up now, not as a silent stand-in rate on every line.
  requireLiveRate_();
}

function seedIfEmpty_(tab, objs) {
  var sh = sheet_(tab);
  if (sh.getLastRow() >= 2) return;
  var headers = headersOf_(sh);
  var rows = objs.map(function (o) { return objToRow(headers, o); });
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

// The old shared key, printed only while it exists. Personal links replace
// it (issueLinks, below).
function showInvite() {
  // The key is cached for six hours (tripKey_ in Env.js): forget the cached
  // copy so a key changed by hand in Script Properties takes effect now.
  forgetTripKey_();
  var key = getProp_("TRIP_KEY");
  if (!key) {
    Logger.log("There is no shared link any more: personal links replace it. Run linksStatus to see who has one, issueLinks for anyone without.");
    return;
  }
  Logger.log("Shared trip key (personal links replace it: run issueLinks, then retireSharedLink once everyone uses theirs): " + key);
}

// ---- personal links (security, 2026-11-18) ----
// Each person has their own link (#k=<their key>). Only each key's SHA-256
// is kept (PERSON_KEYS, Keys.js). A new key is written once, to this run's
// log, which only the script's owner can open: copy it from there and send
// it to that person. No function here ever prints a key again.

// The app's address for a link: the Script Property SITE_URL when it is a
// plain https:// address, else "" (the log then says to put it in front).
function siteUrl_() {
  var site = getProp_("SITE_URL");
  return typeof site === "string" && /^https:\/\/[^\s#?]+$/.test(site.replace(/#.*$/, "")) ? site.replace(/#.*$/, "") : "";
}

function logLink_(name, key) {
  Logger.log(name + "’s link: " + siteUrl_() + "#k=" + key);
}

// Once, after the links, when they lack the app's address.
function logSiteHint_() {
  if (!siteUrl_()) Logger.log("(Put the app’s address in front of each link, or set the Script Property SITE_URL to that address for next time.)");
}

function dayOf_(iso) {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "an unknown date";
}

// Whether `keys` (PERSON_KEYS as read) holds a working link for this name, as
// its own entry (never an inherited one such as "constructor"). A link still
// waiting for the mail desk (only a next, mailLinks) is not one yet.
function hasLink_(keys, name) {
  return Object.prototype.hasOwnProperty.call(keys, name) && keys[name].hash !== "";
}

// A name a link can be kept under (fix round 1): a string that is not
// "__proto__" (which a plain object cannot hold as its own key).
function linkableName_(name) {
  return typeof name === "string" && name !== "" && name !== "__proto__";
}

var LINKS_UNREADABLE_ = "PERSON_KEYS can’t be read (it is not what issueLinks writes). Nobody can open the trip until it is fixed. If only its punctuation is broken (a quote, brace or comma), mend the text in Project Settings → Script Properties: every link keeps working. Deleting or emptying it cancels every personal link: each phone then clears itself, and issueLinks makes new links to send to everyone.";

// PERSON_KEYS, or null after saying in the log that it can't be read.
function personKeysOrSay_() {
  try {
    return personKeys_();
  } catch (e) {
    Logger.log(LINKS_UNREADABLE_);
    return null;
  }
}

// Makes a link for everyone on the trip who has none, and logs each new one
// once. Those who already have one are listed, without a key. Links kept for
// names no longer on the trip are removed (named in the log).
function issueLinks() {
  if (personKeysOrSay_() === null) return;
  // Fix round 2: with nobody in the People tab (or no People tab), the
  // leftover removal below would delete every link: change nothing.
  var listed;
  try {
    listed = peopleNames_();
  } catch (e) {
    Logger.log("Not done: the People tab can’t be read. Nothing was changed.");
    return;
  }
  if (!listed.length) {
    Logger.log("Not done: the People tab lists nobody. Nothing was changed.");
    return;
  }
  var made = [];
  var had = [];
  var gone = [];
  var odd = [];
  var r = withLock_(function () {
    var keys = personKeys_();
    var names = peopleNames_();
    Object.keys(keys).forEach(function (name) {
      if (names.indexOf(name) === -1) {
        delete keys[name];
        gone.push(name);
      }
    });
    names.forEach(function (name) {
      if (!linkableName_(name)) {
        odd.push(name);
        return;
      }
      if (hasLink_(keys, name)) {
        had.push(name + ": already has a link (issued " + dayOf_(keys[name].at) + ").");
        return;
      }
      var key = newPersonKey_();
      keys[name] = { hash: sha256Hex_(key), at: nowIso_() };
      made.push({ name: name, key: key });
    });
    if (made.length || gone.length) setPersonKeys_(keys);
    return { ok: true };
  });
  if (!r || r.ok !== true) {
    Logger.log("The app is busy saving. Run issueLinks again in a moment.");
    return;
  }
  gone.forEach(function (name) { Logger.log("Removed the link of someone no longer on the trip: " + name + "."); });
  odd.forEach(function (name) { Logger.log(name + ": no link made: that name can’t be used. Change it in the People tab."); });
  had.forEach(function (line) { Logger.log(line); });
  made.forEach(function (m) { logLink_(m.name, m.key); });
  if (made.length) logSiteHint_();
  else Logger.log("Nobody needed a new link.");
}

// The person at this place in the People tab's order (1 = the first), or null.
function personAt_(n) {
  var names = peopleNames_();
  return n >= 1 && n <= names.length ? names[n - 1] : null;
}

// Replaces person n's link: the old one stops working at once.
function newLinkFor_(n) {
  var name = personAt_(n);
  if (name === null) {
    Logger.log("There is no person " + n + " on this trip.");
    return;
  }
  if (!linkableName_(name)) {
    Logger.log(name + ": no link made: that name can’t be used. Change it in the People tab.");
    return;
  }
  if (personKeysOrSay_() === null) return;
  var key = newPersonKey_();
  var r = withLock_(function () {
    var keys = personKeys_();
    keys[name] = { hash: sha256Hex_(key), at: nowIso_() };
    setPersonKeys_(keys);
    return { ok: true };
  });
  if (!r || r.ok !== true) {
    Logger.log("The app is busy saving. Run it again in a moment.");
    return;
  }
  Logger.log(name + "’s old link no longer works.");
  logLink_(name, key);
  logSiteHint_();
}

// Cancels person n's link: it stops working on the next request.
function cancelLinkFor_(n) {
  var name = personAt_(n);
  if (name === null) {
    Logger.log("There is no person " + n + " on this trip.");
    return;
  }
  if (personKeysOrSay_() === null) return;
  var had = false;
  var r = withLock_(function () {
    var keys = personKeys_();
    // Any entry, a link still waiting for the mail desk too.
    had = Object.prototype.hasOwnProperty.call(keys, name);
    if (had) {
      delete keys[name];
      setPersonKeys_(keys);
    }
    return { ok: true };
  });
  if (!r || r.ok !== true) {
    Logger.log("The app is busy saving. Run it again in a moment.");
    return;
  }
  Logger.log(had ? name + ": link cancelled." : name + " had no link.");
}

function newLinkForPerson1() { newLinkFor_(1); }
function newLinkForPerson2() { newLinkFor_(2); }
function newLinkForPerson3() { newLinkFor_(3); }
function newLinkForPerson4() { newLinkFor_(4); }
function newLinkForPerson5() { newLinkFor_(5); }
function newLinkForPerson6() { newLinkFor_(6); }
function cancelLinkForPerson1() { cancelLinkFor_(1); }
function cancelLinkForPerson2() { cancelLinkFor_(2); }
function cancelLinkForPerson3() { cancelLinkFor_(3); }
function cancelLinkForPerson4() { cancelLinkFor_(4); }
function cancelLinkForPerson5() { cancelLinkFor_(5); }
function cancelLinkForPerson6() { cancelLinkFor_(6); }

// ---- mailing each person their own link (2026-11-18) ----
// mailLinks gives each person a new link and hands it to the mail desk (the
// owner's newsletter script, at the Script Property DESK_URL), which mails it
// to that person alone. Running it is the owner's go-ahead for those mails.
// The link is made here, posted once, and written nowhere: not in a log, a
// Sheet cell or a Script Property (PERSON_KEYS keeps only its hash). The desk
// holds no key of this app and needs none: it checks the link with this app's
// own load before it mails it. Request: { action: "link", app, name, link };
// answer: { ok: true } when the mail went, else { ok: false, error: <word> }.

var LINK_APP_ = "chi";
var DESK_URL_RE_ = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
// The app's address for a mailed link: https, plain characters, ending in "/".
var MAIL_SITE_RE_ = /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._~-]+)*\/$/;
// A word from the desk that may go into the log: lower-case letters and spaces, short.
var DESK_WORD_RE_ = /^[a-z][a-z ]{0,29}$/;

// What is needed before anything changes: { site, desk }, or null after saying why.
function mailReady_() {
  if (personKeysOrSay_() === null) return null;
  var desk = getProp_("DESK_URL");
  if (typeof desk !== "string" || !DESK_URL_RE_.test(desk)) {
    Logger.log("Not done: the Script Property DESK_URL must be the mail desk’s web app address (https://script.google.com/macros/s/…/exec). Nothing was changed.");
    return null;
  }
  var site = getProp_("SITE_URL");
  if (typeof site !== "string" || !MAIL_SITE_RE_.test(site)) {
    Logger.log("Not done: the Script Property SITE_URL must be the app’s address, https://…/ ending in /. Nothing was changed.");
    return null;
  }
  return { site: site, desk: desk };
}

// The People tab's names, or null after saying it can't be read or lists nobody.
function mailNames_() {
  var names;
  try {
    names = peopleNames_();
  } catch (e) {
    Logger.log("Not done: the People tab can’t be read. Nothing was changed.");
    return null;
  }
  if (!names.length) {
    Logger.log("Not done: the People tab lists nobody. Nothing was changed.");
    return null;
  }
  return names;
}

// The desk's answer as one word for the log: "ok", the desk's own plain word,
// or "no answer" for anything else (never the answer's text itself). A
// refusal never reads "ok", whatever its word (fix round 1). Whether the mail
// went is decided from the answer itself (delivered_), never from this word.
function deskWord_(answer) {
  if (!answer || typeof answer !== "object") return "no answer";
  if (answer.ok === true) return "ok";
  return answer.ok === false && typeof answer.error === "string" && DESK_WORD_RE_.test(answer.error) && answer.error !== "ok" ? answer.error : "no answer";
}

// Whether the desk says the mail went: an object whose ok is exactly true.
function delivered_(answer) {
  return !!answer && typeof answer === "object" && answer.ok === true;
}

// The function that mails person n again, as the log names it. There are six
// (mailLinkForPerson1 … 6); nobody is ever told to run one that is not there.
function mailRun_(n) {
  return n >= 1 && n <= 6 ? "mailLinkForPerson" + n : "";
}

// The hand-over (review fix, 2026-11-19). The new key's hash waits beside the
// person's old one as `next` (PERSON_KEYS, Pure.js personKeysFrom) while the
// desk works, so the old link keeps working: a phone that asks during the
// desk call is never refused (a refusal clears the trip off it). On the
// desk's ok, next takes the old one's place; on anything else next is
// dropped and the old link is untouched. Both ends act only while next is
// still this run's, so a newLinkFor or cancelLinkFor in between wins, and
// two runs that overlap cannot bring back a key that was never delivered.
// A next left behind (a run cut off, an end that found the app busy) is
// withdrawn by dropWaitingLinks.

// Runs fn(PERSON_KEYS) under the script lock: its answer, "unreadable" when
// PERSON_KEYS can't be read (broken by hand), else "busy" (the lock was not
// had, or anything else failed).
function underLinksLock_(fn) {
  var r;
  var broken = false;
  try {
    r = withLock_(function () {
      var keys;
      try {
        keys = personKeys_();
      } catch (e) {
        broken = true;
        throw e;
      }
      return { ok: true, said: fn(keys) };
    });
  } catch (e) {
    return broken ? "unreadable" : "busy";
  }
  return r && r.ok === true ? r.said : "busy";
}

// Puts `hash` as this person's next: "done", "busy" or "unreadable".
function handOverStart_(name, hash) {
  return underLinksLock_(function (keys) {
    if (Object.prototype.hasOwnProperty.call(keys, name)) keys[name].next = hash;
    else keys[name] = { hash: "", at: "", next: hash };
    setPersonKeys_(keys);
    return "done";
  });
}

// Ends the hand-over of `hash`: delivered, next becomes the person's link
// (the old one stops working); not delivered, next is dropped (the old one,
// if any, stays). "done", "superseded" (next is no longer this run's: the
// link was replaced or cancelled meanwhile; nothing is changed), "busy" or
// "unreadable".
function handOverEnd_(name, hash, delivered) {
  return underLinksLock_(function (keys) {
    if (!Object.prototype.hasOwnProperty.call(keys, name) || keys[name].next !== hash) return "superseded";
    if (delivered) keys[name] = { hash: hash, at: nowIso_() };
    else if (hasLink_(keys, name)) delete keys[name].next;
    else delete keys[name];
    setPersonKeys_(keys);
    return "done";
  });
}

// One person (n: their place in the People tab): a new key, its hash stored
// as next, the link posted, then the hand-over ended as above (tried three
// times when the app is busy). "sent" when the desk says the mail went and
// the mailed link works, "broken" when PERSON_KEYS can't be read before
// anything was posted (the run stops), else "not sent".
function mailLinkTo_(name, n, ready) {
  var key = newPersonKey_();
  var hash = sha256Hex_(key);
  var start = handOverStart_(name, hash);
  if (start === "unreadable") {
    Logger.log("Not sent to " + name + ": PERSON_KEYS can’t be read. Stopped here.");
    Logger.log(LINKS_UNREADABLE_);
    return "broken";
  }
  if (start !== "done") {
    Logger.log("Not sent to " + name + ": the app is busy saving. Nothing changed for " + name + ".");
    return "not sent";
  }
  var answer = null;
  try {
    answer = postJson_(ready.desk, { action: "link", app: LINK_APP_, name: name, link: ready.site + "#k=" + key });
  } catch (e) {
    answer = null;
  }
  key = null;
  var delivered = delivered_(answer);
  var word = delivered ? "ok" : deskWord_(answer);
  if (word === "ok" && !delivered) word = "no answer";
  answer = null;
  var end = "busy";
  for (var tries = 0; tries < 3 && end === "busy"; tries++) end = handOverEnd_(name, hash, delivered);
  var run = mailRun_(n);
  if (delivered) {
    if (end === "done") Logger.log("Sent to " + name + ".");
    else if (end === "superseded") Logger.log("Sent to " + name + ", but " + name + "’s link was replaced or cancelled during this run, so the link just mailed does not work.");
    else if (end === "unreadable") {
      Logger.log("Sent to " + name + ", but PERSON_KEYS can’t be read, so " + name + "’s old link was not turned off.");
      Logger.log(LINKS_UNREADABLE_);
    } else Logger.log("Sent to " + name + ". The app was busy, so " + name + "’s old link was not turned off and both work." + (run ? " To turn the old one off, run " + run + " again (" + name + " gets another mail)." : ""));
    return end === "superseded" ? "not sent" : "sent";
  }
  if (end === "busy") Logger.log("Not sent to " + name + ": " + word + ". The app was busy, so the unsent link could not be withdrawn; " + name + "’s old link still works. Run dropWaitingLinks later to withdraw it.");
  else if (end === "unreadable") {
    Logger.log("Not sent to " + name + ": " + word + ". PERSON_KEYS can’t be read, so the unsent link could not be withdrawn: run dropWaitingLinks once it is mended.");
    Logger.log(LINKS_UNREADABLE_);
  } else Logger.log("Not sent to " + name + ": " + word + ".");
  return "not sent";
}

var OWNER_RUN_BUSY_ = "Not done: another mailLinks run is still going. Nothing was changed.";
// No new person is begun after this long, so a run is never cut off by Apps
// Script's six-minute limit in the middle of a hand-over.
var MAIL_BUDGET_MS_ = 4 * 60 * 1000;

// "a", "a and b", "a, b and c".
function andList_(items) {
  return items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// The log line for a run stopped by the time budget before names[from].
function budgetLine_(names, from) {
  var left = [];
  var runs = [];
  var beyond = [];
  var seen = {};
  for (var j = 0; j < names.length; j++) {
    var nm = names[j];
    if (!linkableName_(nm) || Object.prototype.hasOwnProperty.call(seen, nm)) continue;
    seen[nm] = true;
    if (j < from) continue;
    left.push(nm);
    if (mailRun_(j + 1)) runs.push(mailRun_(j + 1));
    else beyond.push(nm);
  }
  var line = "Stopped before the time limit. Not tried: " + left.join(", ") + ".";
  if (runs.length) line += " Run " + andList_(runs) + " for the rest.";
  if (beyond.length) line += " " + andList_(beyond) + " come" + (beyond.length === 1 ? "s" : "") + " after the sixth person, and there is no mailLinkForPerson function for them: add one in Setup.js.";
  return line;
}

// Mails everyone on the trip a new link of their own (each replaces that
// person's previous link once the desk has mailed it). Under the owner's own
// lock for the whole run; stops before the time limit. A name the People tab
// lists twice is mailed once (there is one link per name).
function mailLinks() {
  var start = clockMs_();
  var ran = withOwnerRunLock_(function () {
    var ready = mailReady_();
    if (!ready) return;
    var names = mailNames_();
    if (!names) return;
    var sent = 0;
    var tried = 0;
    var seen = {};
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!linkableName_(name)) {
        Logger.log(name + ": no link made: that name can’t be used. Change it in the People tab.");
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(seen, name)) {
        Logger.log(name + ": listed twice in the People tab; mailed once.");
        continue;
      }
      seen[name] = true;
      if (clockMs_() - start >= MAIL_BUDGET_MS_) {
        Logger.log(budgetLine_(names, i));
        break;
      }
      tried++;
      var did = mailLinkTo_(name, i + 1, ready);
      if (did === "sent") sent++;
      if (did === "broken") break;
    }
    Logger.log("Sent " + sent + " of " + tried + " links.");
    if (getProp_("TRIP_KEY")) Logger.log("The old shared link still works until you run retireSharedLink.");
  });
  if (!ran) Logger.log(OWNER_RUN_BUSY_);
}

// The same for person n only.
function mailLinkFor_(n) {
  var ran = withOwnerRunLock_(function () {
    var ready = mailReady_();
    if (!ready) return;
    var names = mailNames_();
    if (!names) return;
    var name = n >= 1 && n <= names.length ? names[n - 1] : null;
    if (name === null) {
      Logger.log("There is no person " + n + " on this trip.");
      return;
    }
    if (!linkableName_(name)) {
      Logger.log(name + ": no link made: that name can’t be used. Change it in the People tab.");
      return;
    }
    mailLinkTo_(name, n, ready);
  });
  if (!ran) Logger.log(OWNER_RUN_BUSY_);
}

// Withdraws every link still waiting for the mail desk (a next left by a run
// that was cut off or found the app busy), without any mail: each person's
// working link, if any, is untouched, and someone whose only link was
// waiting has none again. Names only in the log. Not while a mailing run is
// going (it would cancel a mail in progress).
function dropWaitingLinks() {
  var ran = withOwnerRunLock_(function () {
    if (personKeysOrSay_() === null) return;
    var dropped = [];
    var said = underLinksLock_(function (keys) {
      Object.keys(keys).forEach(function (name) {
        if (typeof keys[name].next !== "string") return;
        dropped.push(name);
        if (hasLink_(keys, name)) delete keys[name].next;
        else delete keys[name];
      });
      if (dropped.length) setPersonKeys_(keys);
      return "done";
    });
    if (said === "unreadable") Logger.log(LINKS_UNREADABLE_);
    else if (said !== "done") Logger.log("The app is busy saving. Run it again in a moment.");
    else if (dropped.length) Logger.log("Withdrew the waiting link of " + andList_(dropped) + ". Working links are unchanged.");
    else Logger.log("No link was waiting. Nothing was changed.");
  });
  if (!ran) Logger.log("Not done: a mailLinks run is still going. Nothing was changed.");
}

function mailLinkForPerson1() { mailLinkFor_(1); }
function mailLinkForPerson2() { mailLinkFor_(2); }
function mailLinkForPerson3() { mailLinkFor_(3); }
function mailLinkForPerson4() { mailLinkFor_(4); }
function mailLinkForPerson5() { mailLinkFor_(5); }
function mailLinkForPerson6() { mailLinkFor_(6); }

// Who has a link and since when, links kept for names no longer on the trip,
// and whether the shared link still works. Never a key.
function linksStatus() {
  var keys = personKeysOrSay_();
  if (keys === null) return;
  var names = peopleNames_();
  // An entry that is there but not a usable { hash, at } (personKeysFrom
  // leaves it out): said as unreadable, not as no link.
  var raw = {};
  try {
    raw = JSON.parse(getProp_("PERSON_KEYS") || "{}") || {};
  } catch (e) {
    raw = {};
  }
  names.forEach(function (name, i) {
    var n = i + 1;
    var waiting = Object.prototype.hasOwnProperty.call(keys, name) && typeof keys[name].next === "string";
    var said = hasLink_(keys, name) ? "has a link (issued " + dayOf_(keys[name].at) + ")"
        + (waiting ? ", and a new one is waiting for the mail desk. If no mailLinks run is going, one stopped half way: both links work until you run dropWaitingLinks (which keeps the old one)" + (mailRun_(n) ? " or " + mailRun_(n) : "") + "." : "")
      : waiting ? "no link yet, but one is waiting for the mail desk. If no mailLinks run is going, one stopped half way: run dropWaitingLinks to withdraw it" + (mailRun_(n) ? ", or " + mailRun_(n) + " again" : "") + "."
      : Object.prototype.hasOwnProperty.call(raw, name) ? "unreadable entry for " + name + " (run newLinkForPerson" + n + " to give a new link)"
      : "no link yet";
    Logger.log((i + 1) + ". " + name + ": " + said);
  });
  var stale = Object.keys(keys).filter(function (name) { return names.indexOf(name) === -1; });
  if (stale.length) Logger.log("Not on the trip any more, still has a link: " + stale.join(", ") + ". Run issueLinks to remove it.");
  Logger.log(getProp_("TRIP_KEY") ? "The shared link still works." : "The shared link is retired.");
}

// Deletes the shared key, only once everyone has a personal link. After
// this only personal links, the check key and the Claude link work, and
// setup() never makes a shared key again (SHARED_RETIRED).
function retireSharedLink() {
  var keys = personKeysOrSay_();
  if (keys === null) return;
  var names = peopleNames_();
  if (!names.length) {
    Logger.log("Not retired: the People tab lists nobody.");
    return;
  }
  var without = names.filter(function (name) { return !hasLink_(keys, name); });
  if (without.length) {
    Logger.log("Not retired: " + without.join(", ") + (without.length === 1 ? " has" : " have") + " no personal link yet. Run issueLinks first.");
    return;
  }
  setProp_("SHARED_RETIRED", "yes");
  if (!getProp_("TRIP_KEY")) {
    forgetTripKey_();
    Logger.log("The shared link was already retired.");
    return;
  }
  delProp_("TRIP_KEY");
  forgetTripKey_();
  Logger.log("The shared link is retired: it stops working now. Personal links, the check key and the Claude link still work.");
}
