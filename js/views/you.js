/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Settings (the "You" sheet): who you are, your e-Transfer address, your
// picture (it shows in your seal; js/picture.js shrinks it first), the stamp
// sound, History, when the figures were last fetched, how this works,
// the invite link, the Claude link, planner payments (only once a planner
// sheet is linked), the Google Sheet and "Report a problem".
// One sheet, no sub-pages.
//
// mountYou(root, store, { onHistory(), onDemo(date), getKey(), screen() }) -> { open(), close(restoreFocus), isOpen() }
// onDemo(date): a trip day was picked under "Try another day". demo: the trip's
// clock (js/clock.js), so the row can say a demo is running.
// screen(): the screen showing, "Days" or "Money", for Report a problem.
// root is the phone. getKey() gives the trip key for the invite link; the key
// is only ever put on the clipboard, never drawn, logged or put in the report.
// The same goes for the Claude connector's token (the Claude link row), which
// is fetched on each tap and kept nowhere.
// Text from people or the Sheet goes in with textContent / .value only.

import { API_URL, APP_VERSION } from "../config.js";
import { screenNumbers } from "../diag.js";
import { soundOn, setSound } from "../sound.js";
import { clock, dayHead, dayShort, localDay, freshText, historySentence } from "../format.js";
import { HOW_LINES, standalone } from "./first.js";
import { copyText } from "../clip.js";
import { fillSeal, choosePicture, isPicture } from "../picture.js";

const NOT_YET = "Not updated yet";
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
const FETCH = "Fetch";
const FETCHING = "Fetching…";
const FETCHED = "Up to date ✓";
const NO_SIGNAL_WORD = "No signal";
const SAID_MS = 2000; // how long a row says it worked
const FAILED_MS = 3000; // how long a row says it did not
const PULLED_MS = 4000; // how long Planner payments says what came in

const MARKUP = `
<div class="sheet-top"><span>You</span><button type="button" id="youDone">Done</button></div>
<div class="set">
  <div class="set-h">Which one are you?</div>
  <div class="set-who" id="setWho"></div>
  <div class="set-r set-col">
    <label for="setMail">Your e-Transfer address<small>The others see it when they owe you money</small></label>
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
  <button type="button" class="set-r" id="setHist"><span>History<small>Every change, with undo</small></span><b>Open</b></button>
  <button type="button" class="set-r" id="setFreshRow"><span>Last updated<small>Tap to fetch the latest</small></span><b id="setFresh" aria-live="polite" data-w="Up to date 00:00"></b></button>
  <button type="button" class="set-r" id="setDemo" aria-expanded="false" aria-controls="setDemoDays"><span>Try another day<small>See how a day will look before you go</small></span><b id="setDemoV">Pick</b></button>
  <div class="set-days" id="setDemoDays" hidden></div>
  <button type="button" class="set-r" id="setHow" aria-expanded="false" aria-controls="setHowLines"><span>How this works</span><b id="setHowV">Show</b></button>
  <div class="how" id="setHowLines" hidden></div>
  <button type="button" class="set-r" id="setInstall" aria-expanded="false"><span>Add to Home Screen<small>Opens like an app, full screen</small><span class="set-steps" id="setInstallHow" hidden><span>1. Tap Share, then Add to Home Screen.</span><span>2. If it asks for your trip link, paste: it’s already copied.</span></span></span><b>Set up</b></button>
  <button type="button" class="set-r" id="setInvite"><span>Invite link<small id="setInviteFor">For the others. Keep it between you.</small></span><b id="setInviteV" aria-live="polite" data-w="Not copied">Copy</b></button>
  <button type="button" class="set-r" id="setClaude"><span>Claude link<small>Lets your Claude add stops and expenses. Keep it to yourself.</small></span><b id="setClaudeV" aria-live="polite" data-w="Not copied">Copy</b></button>
  <button type="button" class="set-r" id="setPlanner" hidden><span>Planner payments<small>Brings in what’s been paid from the planner sheet</small></span><b id="setPlannerV" aria-live="polite" data-w="Needs a look">Fetch</b></button>
  <div class="set-pp" id="setPlannerP" hidden></div>
  <a class="set-r" id="setSheet" target="_blank" rel="noopener" hidden><span>Google Sheet<small>Where all of this is kept</small></span><b>Open ↗</b></a>
  <button type="button" class="set-r" id="setReport"><span>Report a problem<small>Copies a short note to paste to Mo or Claude</small></span><b id="setReportV" aria-live="polite" data-w="Not copied">Copy</b></button>
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
export function reportText({ me, screen, version, when, sentences, setAside = [], sizes = [] }) {
  const lines = ["MAT: a problem to look at", "Who: " + (me || "nobody chosen"), "Screen: " + screen, "App version: " + version, "Time: " + when];
  if (setAside.length) lines.push("Lines in the Sheet the app can’t read: " + setAside.map((x) => x.id).join(", "));
  if (sentences === null || sentences === undefined) lines.push("Latest changes: " + HISTORY_UNAVAILABLE);
  else if (!sentences.length) lines.push("Latest changes: none yet");
  else lines.push("Latest changes, newest first:", ...sentences.slice(0, REPORT_LINES).map((x) => "- " + x));
  if (sizes.length) lines.push("This phone’s screen:", ...sizes.map((x) => "  " + x)); // not "- ": those lines are the changes
  lines.push("What went wrong: ");
  return lines.join("\n");
}

// The few words the Planner payments row shows after a pull, from what
// store.syncPayments resolved with (null: it did not go through). The full
// sentence goes to the notice.
export function plannerWord(r) {
  if (!r) return "Not fetched";
  if (r.added) return "Added " + r.added;
  if (r.changed) return "Changed " + r.changed;
  if (Array.isArray(r.problems) && r.problems.length) return "Needs a look";
  return "Nothing new";
}

// The first line of a payment that was not brought in: "P011 · row 14 · Ryokan
// deposit". Each part is left out when the backend had none.
export function problemHead({ id, row, what } = {}) {
  const parts = [];
  if (typeof id === "string" && id !== "") parts.push(id);
  if (typeof row === "number" && Number.isFinite(row)) parts.push("row " + row);
  if (typeof what === "string" && what !== "") parts.push(what);
  return parts.length ? parts.join(" · ") : "A payment row";
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

export function mountYou(root, store, { onHistory = () => {}, onDemo = () => {}, demo = null, getKey = () => null, screen = () => "Money" } = {}) {
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
  const mail = $("setMail");
  const mailSave = $("setMailSave");
  const picRow = $("setPic");
  const picSeal = $("setPicSeal");
  const picPick = $("setPicPick");
  const picDel = $("setPicDel");
  const picFile = $("setPicFile");
  const soundV = $("setSoundV");
  const fresh = $("setFresh");
  const how = $("setHow");
  const howV = $("setHowV");
  const howLines = $("setHowLines");
  const demoRow = $("setDemo");
  const demoV = $("setDemoV");
  const demoDays = $("setDemoDays");
  const sheetLink = $("setSheet");
  const planner = $("setPlanner");
  const plannerP = $("setPlannerP");
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
    const sig = JSON.stringify(s.people.map((p) => [p.name, p.initials, p.photo || ""]));
    if (sig !== shownWho) {
      shownWho = sig;
      who.replaceChildren(
        ...s.people.map((p) => {
          const b = el("button");
          b.type = "button";
          b.dataset.me = p.name;
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
    mail.disabled = !s.me;
    mailSave.disabled = !s.me || mail.value.trim() === shownMail;
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

  // The payments the last pull could not bring in, under the Planner payments
  // row. Planner text is untrusted: textContent only. Redrawn only when the
  // list changes, so a screen reader is not read it again on every store change.
  let shownProblems = null;
  function drawProblems(s) {
    const pp = s.paymentProblems && typeof s.paymentProblems === "object" ? s.paymentProblems : {};
    const list = Array.isArray(pp.list) ? pp.list : [];
    const more = Number.isFinite(pp.more) && pp.more > 0 ? pp.more : 0;
    const show = s.plannerLinked === true && list.length > 0;
    const key = show ? JSON.stringify([pp.at, list, more]) : "";
    plannerP.hidden = !show;
    if (key === shownProblems) return;
    shownProblems = key;
    plannerP.replaceChildren();
    if (!show) return;
    const head = el("div", "set-pp-h", "Not brought in from the planner");
    const at = Date.parse(pp.at || "");
    if (Number.isFinite(at)) head.append(el("small", "", whenText(at)));
    plannerP.append(head);
    for (const p of list) {
      const one = el("div", "set-pp-i");
      one.append(el("div", "set-pp-w", problemHead(p)), el("div", "set-pp-m", typeof p.message === "string" ? p.message : ""));
      plannerP.append(one);
    }
    if (more) plannerP.append(el("div", "set-pp-more", "and " + more + " more"));
  }

  const freshWord = (s) => (s.loadedAt === null ? NOT_YET : freshText(s.loadedAt));

  function render(s) {
    drawWho(s);
    $("setInviteFor").textContent = inviteFor(s.people.map((p) => p.name), s.me);
    drawMail(s);
    drawPic(s);
    soundV.textContent = soundOn() ? "On" : "Off";
    drawDemoDays(s);
    setDemo(!demoDays.hidden);
    if (!fetching && !saying.has(fresh)) fresh.textContent = freshWord(s);
    planner.hidden = s.plannerLinked !== true;
    drawProblems(s);
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
    if (!me) return;
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

  $("setHist").addEventListener("click", () => onHistory());
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

  // ---- planner payments ----
  // One pull at a time: while it runs the row says so and a tap does nothing.
  // The store says what came in (or why not) on the undo bar; the row says
  // it in a few words for a moment (plannerWord), then goes back to Fetch.
  const plannerV = $("setPlannerV");
  let pulling = false;
  planner.addEventListener("click", async () => {
    if (pulling) return;
    pulling = true;
    planner.disabled = true;
    say(plannerV, FETCHING);
    let r = null;
    try {
      r = await store.syncPayments();
    } catch {
      r = null;
    } finally {
      pulling = false;
      planner.disabled = false;
    }
    say(plannerV, plannerWord(r), PULLED_MS, () => FETCH);
  });

  // ---- Add to Home Screen ----
  // An app on the iPhone Home Screen keeps storage of its own, without the key
  // Safari kept. So while the steps show, the key is back in the address bar
  // and the manifest's start_url carries it; closing Settings takes both away
  // again (and so does the next load). The key is never drawn.
  let shownManifest = null; // the page's own <link rel="manifest">, while a keyed one stands in
  let keyedManifestUrl = null;

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
    const keyed = document.querySelector('link[rel="manifest"][data-keyed]');
    if (shownManifest && keyed) keyed.replaceWith(shownManifest);
    shownManifest = null;
    if (keyedManifestUrl) URL.revokeObjectURL(keyedManifestUrl);
    keyedManifestUrl = null;
  }

  // A blob: manifest built from the real one, with absolute URLs and a
  // start_url that opens with the key.
  async function useKeyedManifest(key) {
    const own = shownManifest || document.querySelector('link[rel="manifest"]:not([data-keyed])');
    if (!own) return;
    const base = new URL(own.getAttribute("href"), location.href).href;
    let m;
    try {
      const res = await fetch(base);
      m = await res.json();
    } catch {
      return; // the address bar still carries the key
    }
    if (!opened || installHow.hidden) return; // closed meanwhile
    const abs = (u) => new URL(u, base).href;
    const keyed = {
      ...m,
      id: abs(m.id || m.start_url || "./"),
      start_url: inviteLink(key),
      scope: abs(m.scope || "./"),
      icons: (m.icons || []).map((i) => ({ ...i, src: abs(i.src) })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(keyed)], { type: "application/manifest+json" }));
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = url;
    link.dataset.keyed = "1";
    const current = document.querySelector('link[rel="manifest"][data-keyed]') || own;
    if (!shownManifest) shownManifest = own;
    current.replaceWith(link);
    if (keyedManifestUrl) URL.revokeObjectURL(keyedManifestUrl);
    keyedManifestUrl = url;
  }

  install.addEventListener("click", async () => {
    const key = getKey();
    const copying = copyInvite(); // first, while the tap still counts for the clipboard
    if (!key) return;
    history.replaceState(history.state, "", location.pathname + location.search + "#k=" + encodeURIComponent(key));
    installHow.hidden = false;
    install.setAttribute("aria-expanded", "true");
    await Promise.all([copying, useKeyedManifest(key)]);
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
