/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Settings (the "You" sheet): who you are, your e-Transfer address, your
// picture (it shows in your seal; js/picture.js shrinks it first), the stamp
// sound, History, when the figures were last fetched, how this works,
// the invite link, the Claude link, the Google Sheet and "Report a problem".
// One sheet, no sub-pages.
//
// mountYou(root, store, { onHistory(), onDemo(date), getKey(), screen(), onForget(), onTixMode(mode), onBulk(), where }) -> { open(), close(restoreFocus), isOpen() }
// where: the phone's position (js/where.js). Its row, Location, says whether
// it is on, off or refused by the phone, and, when refused, where to change
// it (Safari, or the Home Screen app). Only the choice is shown, never a
// position; the phone's own answer to a refusal is shown as text, in memory
// only (never in Report a problem). A tap turns it off when on, else asks
// the phone. A phone with no geolocation has no row.
// Ticket pictures (only once the trip has the ticket tabs): every picture
// fetched in the background, or only when one is opened (js/tickets.js
// fetchMode); onTixMode(mode) is told of a change. Add tickets (the same):
// onBulk() opens bulk add (js/views/bulkadd.js).
// onDemo(date): a trip day was picked under "Try another day". demo: the trip's
// clock (js/clock.js), so the row can say a demo is running.
// screen(): the screen showing, "Days" or "Money", for Report a problem.
// Planner (only when a planner is linked): when its payments were last pulled
// and a key that pulls them again, and the Before list with them; what could
// not be brought in is listed under it, with the same count in red.
// root is the phone. getKey() gives the trip key for the invite link; the key
// is only ever put on the clipboard, never drawn, logged or put in the report.
// The same goes for the Claude connector's token (the Claude link row), which
// is fetched on each tap and kept nowhere.
// Text from people or the Sheet goes in with textContent / .value only.
//
// Security (2026-11-18): on a phone opened from its own person's link
// (store.state.personal) the top shows only that person, with no choice;
// the Invite link row is not there (it would hand over your own link); the
// Claude link row is there only for the trip's first person. On the shared
// link, the e-Transfer field is read-only with a line saying to open your
// own link. The last row, Forget this phone (onForget), asks once more in
// the row itself, then takes the trip, the key and the offline copy off.

import { API_URL, APP_VERSION } from "../config.js";
import { screenNumbers } from "../diag.js";
import { soundOn, setSound } from "../sound.js";
import { fetchMode, setFetchMode } from "../tickets.js";
import { clock, dayHead, dayShort, localDay, freshText, historySentence } from "../format.js";
import { HOW_LINES, standalone } from "./first.js";
import { copyText } from "../clip.js";
import { fillSeal, choosePicture, isPicture } from "../picture.js";

const NOT_YET = "Not updated yet";
const WHERE_FOR = "For leave-by times, distances and the stamp. Your position stays on this phone. A stamp pressed in the day’s place gets a small mark, saved with the trip.";
const WHERE_NO = "To change it: iPhone Settings, Apps, Safari, Location. Then tap here to try again.";
const WHERE_NO_APP = "On the Home Screen app, iPhone won’t ask again here. Open your own link in Safari, go to You and tap Location. If Safari doesn’t ask, tap the page menu beside the address (aA), then Website Settings, Location, Allow. Then come back here and tap Location.";
const HISTORY_UNAVAILABLE = "history unavailable";
const NO_KEY = "This phone has no trip key, so there is no link to copy.";
const COPY_FAILED = "Couldn’t copy. Try again.";
const NO_SIGNAL = "No signal. Try again.";
const REPORT_LINES = 5;

// The word on the right of a row that copies or fetches answers the tap:
// at once, then with what happened for a moment, then back to its own word.
const COPY = "Copy";
const COPIED = "Copied ✓";
const NOT_COPIED = "Not copied";
const GETTING = "Getting…";
const FETCHING = "Fetching…";
const PULL = "Pull now";
const PULLING = "Pulling…";
const PLANNER_SAID_MS = 4000; // how long the Planner row says how a pull went
const FETCHED = "Up to date ✓";
const NO_SIGNAL_WORD = "No signal";
const SAID_MS = 2000; // how long a row says it worked
const FAILED_MS = 3000; // how long a row says it did not

const MARKUP = `
<div class="sheet-top"><span>You</span><button type="button" id="youDone">Done</button></div>
<div class="set">
  <div class="set-h" id="setWhoH">Which one are you?</div>
  <div class="set-who" id="setWho"></div>
  <div class="set-r set-col">
    <label for="setMail">Your e-Transfer address<small id="setMailS">The others see it when they owe you money</small></label>
    <div class="set-mail">
      <input id="setMail" type="email" inputmode="email" maxlength="80" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="name@example.com">
      <button type="button" id="setMailSave">Save</button>
    </div>
  </div>
  <div class="set-r set-pic" id="setPic">
    <span>Your picture<small>Shows in your seal, on every phone</small></span>
    <span class="seal is-on" id="setPicSeal" hidden></span>
    <span class="set-pic-b">
      <button type="button" id="setPicPick">Add</button>
      <button type="button" id="setPicDel" hidden>Remove</button>
    </span>
    <input type="file" accept="image/*" id="setPicFile" tabindex="-1" aria-hidden="true" hidden>
  </div>
  <button type="button" class="set-r" id="setSound"><span>Stamp sound</span><b id="setSoundV">On</b></button>
  <button type="button" class="set-r set-where" id="setWhere" hidden><span><span class="set-where-l"><span class="g-bl pl" id="setWhereM" aria-hidden="true">FROM HERE</span>Location</span><small id="setWhereS"></small><small id="setWhereWhy" hidden></small></span><b id="setWhereV" data-w="Phone said no"></b></button>
  <button type="button" class="set-r" id="setBulk" hidden><span>Add tickets<small>Many ticket files at once, yours or anyone’s on the trip</small></span><b>Open</b></button>
  <button type="button" class="set-r" id="setTix" hidden><span>Ticket pictures<small id="setTixS"></small></span><b id="setTixV">On Wi‑Fi and mobile</b></button>
  <button type="button" class="set-r" id="setHist"><span>History<small>Every change, with undo</small></span><b>Open</b></button>
  <button type="button" class="set-r" id="setFreshRow"><span>Last updated<small>Tap to fetch the latest</small></span><b id="setFresh" aria-live="polite" data-w="Up to date 00:00"></b></button>
  <button type="button" class="set-r" id="setPlanner" hidden><span>Planner<small id="setPlannerS">Not pulled yet</small></span><b id="setPlannerV" aria-live="polite" data-w="2 need a look">Pull now</b></button>
  <div class="set-pp" id="setPlannerP" hidden></div>
  <button type="button" class="set-r" id="setDemo" aria-expanded="false" aria-controls="setDemoDays"><span>Try another day<small>See how a day will look before you go</small></span><b id="setDemoV">Pick</b></button>
  <div class="set-days" id="setDemoDays" hidden></div>
  <button type="button" class="set-r" id="setHow" aria-expanded="false" aria-controls="setHowLines"><span>How this works</span><b id="setHowV">Show</b></button>
  <div class="how" id="setHowLines" hidden></div>
  <button type="button" class="set-r" id="setInstall" aria-expanded="false"><span>Add to Home Screen<small>Opens like an app, full screen</small><span class="set-steps" id="setInstallHow" hidden><span>1. Tap Share, then Add to Home Screen.</span><span>2. If it asks for your trip link, paste: it’s already copied.</span></span></span><b>Set up</b></button>
  <button type="button" class="set-r" id="setInvite"><span>Invite link<small id="setInviteFor">For the others. Keep it between you.</small></span><b id="setInviteV" aria-live="polite" data-w="Not copied">Copy</b></button>
  <button type="button" class="set-r" id="setClaude"><span>Claude link<small>Lets your Claude add stops and expenses. Keep it to yourself.</small></span><b id="setClaudeV" aria-live="polite" data-w="Not copied">Copy</b></button>
  <a class="set-r" id="setSheet" target="_blank" rel="noopener" hidden><span>Google Sheet<small>Where all of this is kept</small></span><b>Open ↗</b></a>
  <button type="button" class="set-r" id="setReport"><span>Report a problem<small>Copies a short note to paste to Mo or Claude</small></span><b id="setReportV" aria-live="polite" data-w="Not copied">Copy</b></button>
  <button type="button" class="set-r" id="setForget"><span>Forget this phone<small id="setForgetS">Takes the trip and your link off this phone</small></span><b id="setForgetV" aria-live="polite" data-w="Tap again">Forget</b></button>
</div>`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// The note "Report a problem" copies. Pure: the view gathers the inputs.
// sentences: the newest history sentences, newest first, or null when the
// history could not be fetched. setAside: the Sheet rows the app left out
// (store.state.setAside). The trip key is never part of it.
// The few words the Planner row shows after a pull, from what
// store.syncPayments resolved with (null: it did not go through). The full
// sentence goes to the notice.
export function plannerWord(r) {
  if (!r) return "Not pulled";
  if (r.added) return "Added " + r.added;
  if (r.changed) return "Changed " + r.changed;
  if (Array.isArray(r.problems) && r.problems.length) return needsLook(r.problems.length);
  return "Nothing new";
}

// "1 needs a look", "2 need a look".
export function needsLook(n) {
  return n === 1 ? "1 needs a look" : n + " need a look";
}

// The first line of a payment that was not brought in: "P011 · row 14 ·
// Made-up deposit". Each part is left out when the backend had none.
export function problemHead({ id, row, what } = {}) {
  const parts = [];
  if (typeof id === "string" && id !== "") parts.push(id);
  if (typeof row === "number" && Number.isFinite(row)) parts.push("row " + row);
  if (typeof what === "string" && what !== "") parts.push(what);
  return parts.length ? parts.join(" · ") : "A payment row";
}

export function reportText({ me, screen, version, when, sentences, setAside = [], sizes = [] }) {
  const lines = ["Wendy’s: a problem to look at", "Who: " + (me || "nobody chosen"), "Screen: " + screen, "App version: " + version, "Time: " + when];
  if (setAside.length) lines.push("Lines in the Sheet the app can’t read: " + setAside.map((x) => x.id).join(", "));
  if (sentences === null || sentences === undefined) lines.push("Latest changes: " + HISTORY_UNAVAILABLE);
  else if (!sentences.length) lines.push("Latest changes: none yet");
  else lines.push("Latest changes, newest first:", ...sentences.slice(0, REPORT_LINES).map((x) => "- " + x));
  if (sizes.length) lines.push("This phone’s screen:", ...sizes.map((x) => "  " + x)); // not "- ": those lines are the changes
  lines.push("What went wrong: ");
  return lines.join("\n");
}

// Who the invite link is for, as the Invite link row says it: the one other
// person by name, else how many others there are.
export function inviteFor(names, me) {
  const all = Array.isArray(names) ? names : [];
  const others = all.filter((n) => n !== me);
  const count = all.includes(me) ? others.length : all.length - 1;
  if (count === 1) return (others.length === 1 ? "For " + others[0] : "For the other one") + ". Keep it between you.";
  if (count === 2) return "For the other two. Keep it between you.";
  return "For the others. Keep it between you.";
}

// "Sat Dec 12, 13:20", in the phone's own clock.
function whenText(ms) {
  return dayHead(localDay(ms), []).en + ", " + clock(ms);
}

// The e-Transfer line on the shared link (security, 2026-11-18).
const MAIL_FOR = "The others see it when they owe you money";
const MAIL_OWN_LINK = "Open your own link to change this.";
const WHO_PICK = "Which one are you?";
const WHO_IS = "This phone is";
const FORGET_FOR = "Takes the trip and your link off this phone";
const FORGET_SURE = "Tap again to take everything off this phone";
const FORGET_MS = 5000; // how long the row waits for the second tap

export function mountYou(root, store, { onHistory = () => {}, onDemo = () => {}, demo = null, getKey = () => null, screen = () => "Money", onForget = async () => {}, onTixMode = () => {}, onBulk = () => {}, where = null } = {}) {
  const scrim = el("div", "scrim");
  scrim.id = "youScrim";
  scrim.hidden = true;
  const sheet = el("div", "sheet");
  sheet.id = "you";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Settings");
  sheet.inert = true;
  sheet.innerHTML = MARKUP;
  root.append(scrim, sheet);
  // iPhone Safari draws a row's pressed look (:active) on touch only when
  // something listens for the touch.
  sheet.addEventListener("touchstart", () => {}, { passive: true });

  const $ = (id) => sheet.querySelector("#" + id);
  const who = $("setWho");
  const whoH = $("setWhoH");
  const inviteRow = $("setInvite");
  const claudeRow = $("setClaude");
  const mailS = $("setMailS");
  const mail = $("setMail");
  const mailSave = $("setMailSave");
  const picRow = $("setPic");
  const picSeal = $("setPicSeal");
  const picPick = $("setPicPick");
  const picDel = $("setPicDel");
  const picFile = $("setPicFile");
  const soundV = $("setSoundV");
  const fresh = $("setFresh");
  const planner = $("setPlanner");
  const plannerS = $("setPlannerS");
  const plannerV = $("setPlannerV");
  const plannerP = $("setPlannerP");
  const how = $("setHow");
  const howV = $("setHowV");
  const howLines = $("setHowLines");
  const demoRow = $("setDemo");
  const demoV = $("setDemoV");
  const demoDays = $("setDemoDays");
  const sheetLink = $("setSheet");
  const report = $("setReport");
  const install = $("setInstall");
  const installHow = $("setInstallHow");
  install.hidden = standalone();
  for (const text of HOW_LINES) howLines.append(el("div", "how-l", text)); // numbered by CSS

  let opened = false;
  let shownWho = ""; // the seals as last built
  let shownMe = null; // whose address the field is following
  let shownMail = ""; // the address as last drawn; the field follows it until it is typed in
  let sentMail = null; // the text last sent with Save, kept in the field if the save fails
  let shownPic = null; // the picture the row's seal was last filled with
  let picBusy = false; // a picture is being shrunk or saved: no second one
  let reporting = false;
  let session = 0; // counts each opening and closing of the sheet

  // say(word, text, ms, back): the row's word reads `text`; after `ms` it
  // reads back() again. A newer say() on the same word replaces the older.
  const saying = new Map(); // word element -> its timer
  function say(word, text, ms = 0, back = null) {
    clearTimeout(saying.get(word));
    saying.delete(word);
    word.textContent = text;
    if (!ms) return;
    saying.set(
      word,
      setTimeout(() => {
        saying.delete(word);
        word.textContent = back();
      }, ms),
    );
  }
  const copyWord = () => COPY;
  const said = (word, ok) => say(word, ok ? COPIED : NOT_COPIED, ok ? SAID_MS : FAILED_MS, copyWord);

  const mePerson = (s) => s.people.find((p) => p.name === s.me) || null;
  const addressOf = (s) => {
    const p = mePerson(s);
    return p && p.etransfer ? String(p.etransfer).trim() : "";
  };

  function drawWho(s) {
    // On its own link the phone is that person: only their seal, no choice.
    const own = s.personal === true && !!mePerson(s);
    const shown = own ? [mePerson(s)] : s.people;
    whoH.textContent = own ? WHO_IS : WHO_PICK;
    const sig = JSON.stringify([own, shown.map((p) => [p.name, p.initials, p.photo || ""])]);
    if (sig !== shownWho) {
      shownWho = sig;
      who.replaceChildren(
        ...shown.map((p) => {
          const b = el("button");
          b.type = "button";
          b.dataset.me = p.name;
          if (own) b.disabled = true;
          b.append(fillSeal(el("span", "seal"), p), document.createTextNode(p.name));
          return b;
        }),
      );
    }
    for (const b of who.children) {
      const on = b.dataset.me === s.me;
      b.classList.toggle("is-on", on);
      b.firstChild.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function drawMail(s) {
    const addr = addressOf(s);
    // Another person: their own address, and whatever was half typed is dropped.
    if (s.me !== shownMe) {
      shownMe = s.me;
      sentMail = null;
      mail.value = addr;
      shownMail = addr;
    }
    // Saved: the field follows the address again. A save that failed keeps what was typed.
    const holdsSent = sentMail !== null && mail.value === sentMail;
    if (mail.value === shownMail && !holdsSent) mail.value = addr;
    shownMail = addr;
    // Only on your own link can an address be changed (the backend refuses it otherwise).
    const mayEdit = !!s.me && s.personal === true;
    mailS.textContent = s.me && !mayEdit ? MAIL_OWN_LINK : MAIL_FOR;
    mail.disabled = !mayEdit;
    mailSave.disabled = !mayEdit || mail.value.trim() === shownMail;
  }

  // Your picture: Add with none; with one, its seal and Change / Remove.
  function drawPic(s) {
    const p = mePerson(s);
    const has = !!p && isPicture(p.photo);
    const pic = has ? p.photo : "";
    if (pic !== shownPic) {
      shownPic = pic;
      if (has) fillSeal(picSeal, p);
      else picSeal.replaceChildren();
    }
    picSeal.hidden = !has;
    picDel.hidden = !has;
    picPick.textContent = picBusy ? "Saving…" : has ? "Change" : "Add";
    picPick.setAttribute("aria-label", picBusy ? "Saving your picture" : has ? "Change your picture" : "Add your picture");
    picDel.setAttribute("aria-label", "Remove your picture");
    picPick.disabled = !s.me || picBusy;
    picDel.disabled = !s.me || picBusy;
    picRow.classList.toggle("is-off", !s.me);
    picRow.classList.toggle("has-pic", has);
  }

  // ---- the planner row ----
  // At rest: when the payments were last pulled, and "Pull now" (red words
  // with how many could not be brought in when some could not). The list of
  // those is redrawn only when it changes. Planner text: textContent only.
  let pulling = false;
  let shownProblems = null;
  const problemsOf = (s) => {
    const pp = s.paymentProblems && typeof s.paymentProblems === "object" ? s.paymentProblems : {};
    const all = Array.isArray(pp.list) ? pp.list.filter((p) => p && typeof p === "object") : [];
    return { pp, all, more: Number.isFinite(pp.more) && pp.more > 0 ? pp.more : 0 };
  };
  const plannerRest = (s) => {
    const { all, more } = problemsOf(s);
    return all.length + more > 0 ? needsLook(all.length + more) : PULL;
  };
  function setPlannerWord(text, red) {
    plannerV.textContent = text;
    plannerV.classList.toggle("red", red);
  }
  function drawPlanner(s) {
    const linked = s.plannerLinked === true;
    planner.hidden = !linked;
    const { pp, all, more } = problemsOf(s);
    const show = linked && all.length > 0;
    plannerP.hidden = !show;
    if (linked) {
      const ms = Date.parse(typeof s.paymentsPulledAt === "string" ? s.paymentsPulledAt : "");
      plannerS.textContent = Number.isFinite(ms) ? "Last pulled " + whenText(ms) : "Not pulled yet";
      if (!pulling && !saying.has(plannerV)) setPlannerWord(plannerRest(s), all.length + more > 0);
    }
    const key = show ? JSON.stringify([pp.at, all, more]) : "";
    if (key === shownProblems) return;
    shownProblems = key;
    plannerP.replaceChildren();
    if (!show) return;
    plannerP.append(el("h4", "", "Not brought in from the planner"));
    for (const p of all) {
      const one = el("div");
      one.append(el("b", "", problemHead(p)), typeof p.message === "string" ? p.message : "");
      plannerP.append(one);
    }
    if (more) plannerP.append(el("div", "", "and " + more + " more"));
  }

  const freshWord = (s) => (s.loadedAt === null ? NOT_YET : freshText(s.loadedAt));

  function render(s) {
    drawWho(s);
    $("setInviteFor").textContent = inviteFor(s.people.map((p) => p.name), s.me);
    drawMail(s);
    drawPic(s);
    soundV.textContent = soundOn() ? "On" : "Off";
    drawTix();
    bulkRow.hidden = store.state.ticketsReady !== true;
    drawDemoDays(s);
    setDemo(!demoDays.hidden);
    drawPlanner(s);
    if (!fetching && !saying.has(fresh)) fresh.textContent = freshWord(s);
    // Your own link is yours: no invite row. The Claude link: the owner only.
    inviteRow.hidden = s.personal === true;
    const owner = s.people.length ? s.people[0].name : null;
    claudeRow.hidden = !(s.personal === true && s.me && s.me === owner);
    const url = typeof s.sheetUrl === "string" && /^https?:\/\//i.test(s.sheetUrl) ? s.sheetUrl : "";
    sheetLink.hidden = !url;
    if (url) sheetLink.href = url;
    else sheetLink.removeAttribute("href");
  }

  // The trip's days as buttons ("Sat 12"), drawn only when they change.
  let shownDays = "";
  function drawDemoDays(s) {
    const dates = (Array.isArray(s.days) ? s.days : []).map((d) => d && d.date).filter((d) => typeof d === "string" && d);
    demoRow.hidden = !dates.length;
    const sig = dates.join(",");
    if (sig === shownDays) return;
    shownDays = sig;
    demoDays.replaceChildren(
      ...dates.map((date) => {
        const b = el("button", "", dayShort(date));
        b.type = "button";
        b.dataset.date = date;
        return b;
      }),
    );
  }

  function setDemo(show) {
    demoDays.hidden = !show;
    demoRow.setAttribute("aria-expanded", show ? "true" : "false");
    demoV.textContent = show ? "Hide" : demo && demo.demoDay() ? "On" : "Pick";
  }

  function setHow(show) {
    howLines.hidden = !show;
    how.setAttribute("aria-expanded", show ? "true" : "false");
    howV.textContent = show ? "Hide" : "Show";
  }

  function open() {
    if (opened) return;
    opened = true;
    session++;
    // A fresh look: the field shows what is saved, the lines are folded away.
    sentMail = null;
    mail.value = addressOf(store.state);
    shownMail = mail.value;
    setHow(false);
    setDemo(false);
    render(store.state);
    drawWhere();
    sheet.classList.add("is-open");
    sheet.inert = false;
    scrim.hidden = false;
    root.classList.add("you-open");
    sheet.scrollTop = 0;
    $("youDone").focus({ preventScroll: true });
  }

  // restoreFocus: give focus back to the You button.
  function close(restoreFocus = true) {
    if (!opened) return;
    opened = false;
    session++; // a Claude link still on its way is dropped, not copied
    sheet.classList.remove("is-open");
    sheet.inert = true;
    scrim.hidden = true;
    root.classList.remove("you-open");
    endInstall();
    if (forgetArmed !== null) disarmForget();
    if (sheet.contains(document.activeElement)) document.activeElement.blur();
    if (restoreFocus === true) {
      const btn = document.getElementById("youBtn");
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  // ---- taps ----

  $("youDone").addEventListener("click", () => close());
  scrim.addEventListener("click", () => close());
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  });

  who.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-me]");
    if (b) store.setMe(b.dataset.me);
  });

  async function saveMail() {
    const me = store.state.me;
    if (!me || store.state.personal !== true) return;
    const text = mail.value.trim();
    if (text === addressOf(store.state)) return; // unchanged: nothing is sent
    sentMail = text;
    mailSave.disabled = true;
    const ok = await store.setPerson(me, { etransfer: text });
    if (ok && store.state.me === me) sentMail = null;
    render(store.state);
  }
  mailSave.addEventListener("click", saveMail);
  mail.addEventListener("input", () => {
    mailSave.disabled = mail.value.trim() === shownMail;
  });
  mail.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      saveMail();
      mail.blur();
    }
  });

  // ---- your picture ----
  // A tap anywhere on the row but Remove opens the phone's own picker.
  picRow.addEventListener("click", (ev) => {
    if (ev.target === picFile || picDel.contains(ev.target) || !store.state.me || picBusy) return;
    picFile.click();
  });
  picDel.addEventListener("click", async () => {
    const me = store.state.me;
    if (!me || picBusy) return;
    picBusy = true;
    drawPic(store.state);
    try {
      await store.setPerson(me, { photo: "" });
    } finally {
      picBusy = false;
      drawPic(store.state);
    }
  });
  picFile.addEventListener("change", async () => {
    const file = picFile.files && picFile.files[0];
    picFile.value = ""; // the same picture can be chosen again
    const me = store.state.me;
    if (!file || !me || picBusy) return;
    picBusy = true;
    drawPic(store.state);
    try {
      await choosePicture(file, { save: (photo) => store.setPerson(me, { photo }), notify: (t) => store.notify(t) });
    } finally {
      picBusy = false;
      drawPic(store.state);
    }
  });

  $("setSound").addEventListener("click", () => {
    setSound(!soundOn());
    soundV.textContent = soundOn() ? "On" : "Off";
  });

  // Location: on, off, or the phone said no (and where to change that).
  const whereRow = $("setWhere");
  const whereM = $("setWhereM");
  const whereS = $("setWhereS");
  const whereWhy = $("setWhereWhy");
  const whereV = $("setWhereV");
  function drawWhere() {
    whereRow.hidden = !where || !where.supported();
    if (whereRow.hidden) return;
    const st = where.state();
    const no = st === "refused";
    const on = st === "on";
    whereV.textContent = no ? "Phone said no" : on ? "On" : "Off";
    whereV.classList.toggle("no", no);
    whereV.classList.toggle("off", !no && !on);
    whereM.classList.toggle("off", !on);
    whereS.textContent = no ? (standalone() ? WHERE_NO_APP : WHERE_NO) : WHERE_FOR;
    // The phone's own answer to the refusal (memory only, js/where.js), as text.
    const why = no ? where.why() : null;
    whereWhy.hidden = !why;
    whereWhy.textContent = why ? (why.message ? "Phone’s answer: " + why.message + " " : "") + "(code " + why.code + ")" : "";
  }
  whereRow.addEventListener("click", () => {
    if (!where) return;
    if (where.state() === "on") where.turnOff();
    else where.ask();
    drawWhere();
  });
  if (where) where.subscribe(() => {
    if (opened) drawWhere();
  });

  $("setHist").addEventListener("click", () => onHistory());
  // Ticket pictures (once the trip has them): every one fetched in the
  // background, or only the one being opened (roaming data).
  const tixRow = $("setTix");
  const bulkRow = $("setBulk");
  bulkRow.addEventListener("click", () => onBulk());
  const tixV = $("setTixV");
  const tixS = $("setTixS");
  const TIX_ALL = "Every phone keeps every ticket, so they open with no signal. Up to about 50 MB in all.";
  const TIX_OPEN = "Fetched when you open one. Each needs signal once.";
  function drawTix() {
    tixRow.hidden = store.state.ticketsReady !== true;
    const all = fetchMode() === "all";
    tixV.textContent = all ? "On Wi‑Fi and mobile" : "Only when I open one";
    tixS.textContent = all ? TIX_ALL : TIX_OPEN;
  }
  tixRow.addEventListener("click", () => {
    const next = fetchMode() === "all" ? "open" : "all";
    setFetchMode(next);
    drawTix();
    onTixMode(next);
  });
  // Last updated: Fetching… while it loads, then Up to date ✓ (or No
  // signal) for a moment, then the time of the last fetch.
  let fetching = false;
  $("setFreshRow").addEventListener("click", async () => {
    if (fetching) return;
    fetching = true;
    say(fresh, FETCHING);
    let ok = false;
    try {
      ok = (await store.refresh()) === true;
    } catch {
      ok = false;
    } finally {
      fetching = false;
    }
    say(fresh, ok ? FETCHED : NO_SIGNAL_WORD, SAID_MS, () => freshWord(store.state));
  });
  // The Planner row: brings in the payments, and fetches the Before list with
  // them (not waited for). The row says how it went for a moment.
  planner.addEventListener("click", async () => {
    if (pulling) return;
    pulling = true;
    planner.disabled = true;
    setPlannerWord(PULLING, false);
    clearTimeout(saying.get(plannerV));
    saying.delete(plannerV);
    let r = null;
    try {
      r = await store.syncPayments();
    } catch {
      r = null;
    }
    store.syncTodos({ force: true, quiet: true }).catch(() => {});
    pulling = false;
    planner.disabled = false;
    const word = plannerWord(r);
    setPlannerWord(word, /need/.test(word));
    saying.set(
      plannerV,
      setTimeout(() => {
        saying.delete(plannerV);
        drawPlanner(store.state);
      }, PLANNER_SAID_MS),
    );
  });
  how.addEventListener("click", () => setHow(howLines.hidden));
  demoRow.addEventListener("click", () => setDemo(demoDays.hidden));
  demoDays.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-date]");
    if (b) onDemo(b.dataset.date);
  });

  const inviteLink = (key) => location.origin + location.pathname + "#k=" + encodeURIComponent(key);

  // Copies the invite link and says so; resolves with whether it was copied.
  async function copyInvite() {
    const key = getKey();
    if (!key) {
      store.notify(NO_KEY);
      return false;
    }
    const ok = await copyText(inviteLink(key));
    store.notify(ok ? "Link copied." : COPY_FAILED);
    return ok;
  }
  const invite = $("setInvite");
  const inviteV = $("setInviteV");
  let inviting = false;
  invite.addEventListener("click", async () => {
    if (inviting) return;
    inviting = true;
    let ok = false;
    try {
      ok = await copyInvite();
    } catch {
      ok = false;
    } finally {
      inviting = false;
    }
    said(inviteV, ok);
  });

  // ---- the Claude link ----
  // The connector's address with its token and the viewer's name. iPhone
  // Safari only lets a tap write the clipboard in the tap's own turn, so the
  // link goes to copyText as a promise: it is handed over as a ClipboardItem
  // at once and filled when the token arrives (older phones fall back to a
  // plain copy). The token is fetched on each tap and kept nowhere: not on
  // screen, not in storage, and a reply that comes after Settings closed is
  // dropped without copying.
  const claude = $("setClaude");
  const claudeV = $("setClaudeV");
  let claudeBusy = false;
  async function copyClaude() {
    if (claudeBusy) return;
    if (globalThis.navigator && navigator.onLine === false) {
      store.notify(NO_SIGNAL);
      said(claudeV, false);
      return;
    }
    claudeBusy = true;
    claude.disabled = true;
    say(claudeV, GETTING);
    let ok = null; // null: Settings closed meanwhile, the row just goes back to Copy
    const asked = session;
    const me = store.state.me;
    let failed = null;
    const link = store.claudeToken().then(
      (token) => {
        if (asked !== session) throw new Error("closed");
        return API_URL + "?t=" + encodeURIComponent(token) + (me ? "&as=" + encodeURIComponent(me) : "");
      },
      (err) => {
        failed = err;
        throw err;
      },
    );
    try {
      const copied = await copyText(link);
      if (asked !== session) return; // Settings closed meanwhile: nothing to say
      ok = copied;
      if (copied) store.notify("Claude link copied.");
      else if (failed) store.notify(failed.code === "network" ? NO_SIGNAL : failed.message || COPY_FAILED);
      else store.notify(COPY_FAILED);
    } catch {
      if (asked === session) ok = false;
    } finally {
      claudeBusy = false;
      claude.disabled = false;
      if (ok === null) say(claudeV, COPY);
      else said(claudeV, ok);
    }
  }
  claude.addEventListener("click", copyClaude);

  // ---- Add to Home Screen ----
  // An app on the iPhone Home Screen keeps storage of its own, without the key
  // Safari kept. So while the steps show, the key is back in the address bar
  // (a fragment: never sent to a server) and the link is on the clipboard to
  // paste if the app asks; closing Settings takes the key out of the address
  // again (and so does the next load). Security (2026-11-18): the key is
  // never written into a manifest or its start_url. The key is never drawn.
  function stripKeyFromAddress() {
    const parts = location.hash.replace(/^#/, "").split("&").filter(Boolean);
    const rest = parts.filter((p) => !p.startsWith("k="));
    if (rest.length === parts.length) return;
    history.replaceState(history.state, "", location.pathname + location.search + (rest.length ? "#" + rest.join("&") : ""));
  }

  function endInstall() {
    installHow.hidden = true;
    install.setAttribute("aria-expanded", "false");
    stripKeyFromAddress();
  }

  install.addEventListener("click", async () => {
    const key = getKey();
    const copying = copyInvite(); // first, while the tap still counts for the clipboard
    if (!key) return;
    history.replaceState(history.state, "", location.pathname + location.search + "#k=" + encodeURIComponent(key));
    installHow.hidden = false;
    install.setAttribute("aria-expanded", "true");
    await copying;
  });

  // ---- Forget this phone ----
  // The first tap asks again in the row itself (no dialog); a second tap
  // within FORGET_MS forgets; otherwise the row goes back to how it was.
  const forget = $("setForget");
  const forgetS = $("setForgetS");
  const forgetV = $("setForgetV");
  let forgetArmed = null; // the timer while the row waits for the second tap
  let forgetting = false;
  const disarmForget = () => {
    clearTimeout(forgetArmed);
    forgetArmed = null;
    forget.classList.remove("is-sure");
    forgetS.textContent = FORGET_FOR;
    forgetV.textContent = "Forget";
  };
  forget.addEventListener("click", async () => {
    if (forgetting) return;
    if (forgetArmed === null) {
      forget.classList.add("is-sure");
      // Say what would be lost: lines not sent yet go with everything else.
      const unsent = typeof store.unsentCount === "function" ? store.unsentCount() : 0;
      forgetS.textContent = FORGET_SURE + (unsent === 1 ? ". 1 entry not sent yet will be lost." : unsent > 1 ? ". " + unsent + " entries not sent yet will be lost." : "");
      forgetV.textContent = "Tap again";
      forgetArmed = setTimeout(disarmForget, FORGET_MS);
      return;
    }
    clearTimeout(forgetArmed);
    forgetArmed = null;
    forgetting = true;
    forget.disabled = true;
    forgetV.textContent = "Forgetting…";
    try {
      await onForget();
    } finally {
      forgetting = false;
      forget.disabled = false;
      disarmForget();
    }
  });

  // The note needs the latest history, so it is built while the copy waits.
  // It uses what its own load fetched: another load may replace the tape.
  // What the phone says about its screen, for the note. Never stops the note.
  const sizesNow = () => {
    try {
      return screenNumbers(document, window);
    } catch {
      return [];
    }
  };
  async function reportNote() {
    const h = await store.loadHistory();
    const sentences = !h || h.error ? null : h.entries.slice(0, REPORT_LINES).map(historySentence);
    return reportText({ me: store.state.me, screen: screen(), version: APP_VERSION, when: whenText(Date.now()), sentences, setAside: store.state.setAside || [], sizes: sizesNow() });
  }
  const reportV = $("setReportV");
  report.addEventListener("click", async () => {
    if (reporting) return;
    reporting = true;
    report.disabled = true;
    say(reportV, GETTING); // the note waits for the latest history
    let ok = false;
    try {
      ok = await copyText(reportNote());
      store.notify(ok ? "Copied. Paste it to Mo or Claude." : COPY_FAILED);
    } catch {
      ok = false;
    } finally {
      reporting = false;
      report.disabled = false;
    }
    said(reportV, ok);
  });

  store.subscribe(render);
  if (demo && demo.subscribe) demo.subscribe(() => render(store.state));
  render(store.state);

  return { open, close: (restoreFocus) => close(restoreFocus), isOpen: () => opened };
}
