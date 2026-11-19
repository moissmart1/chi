/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Add tickets: many ticket files at once (and the list, a CSV, if you have
// it), opened from You. Look F ("stapled to the check", Mo's pick,
// 2026-11-19): the files go in an envelope; the sure ones come out clipped
// together; the odd ones are held up one at a time asking "Which check?";
// the red stapler adds them all. The behaviour is the Japan app's bulk add
// (its version 31, with its fixes), the list in the same format.
//
// mountBulkAdd(root, store, keep, { onOpenDay(date), onClose() }) -> { open(), close(restoreFocus), isOpen(), isBusy() }
//
// Steps: empty (the envelope, Choose files, Choose list) -> reading ->
// sorted (the clipped bundle, the loose ones, the quiet lines, Staple) ->
// adding -> added. Nothing is sent before Staple. Matching is js/bulk.js.
// Each picture goes in through the same path as one added from a stop's
// Edit sheet (js/views/ticketpart.js upload): store.addTicket, then
// store.ticketOutcome; a PDF is made into pictures of its pages here, as
// there. Every picture is made first (in memory), then handed over one at a
// time, each put in the keep right before its own add; the stop's ticket
// facts (only the empty ones, worked out as each is sent) follow through
// store.updateStop, as the Edit sheet's Save does, and never hold the
// pictures up. With no signal the pictures wait on the phone as a single
// add does, after a reload too.
//
// The list and the files never leave the phone except as those pictures and
// facts; nothing from them is logged. Text from them goes in with
// textContent; a thumbnail is an <img> of a picture the phone made itself.
// Closing the sheet any way but Cancel keeps what was sorted (or the adding
// going on); Cancel throws it away, Done after adding starts afresh. The
// trip taken off this phone empties it, open or not.

import { LIMITS, sniff, shrink, shrinkCanvas, pdfPages } from "../tickets.js";
import { parseList, sortFiles, factsFor, seatFor, stopLabel } from "../bulk.js";
import { newId } from "../time.js";
import { minutesOf, checkDate } from "../plan.js";
import { el, stockOf, stubEl, staple } from "./stubs.js";

// The red stapler (look F's bold key), drawn: closed and at rest, or its arm
// lifted a little on the key that staples. Numbers only, so it is set as markup.
let staplers = 0;
function stapler(open) {
  const n = ++staplers;
  const wrap = el("span", "stapler");
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = '<svg viewBox="0 0 124 58" focusable="false"><defs>' +
    '<linearGradient id="bkS' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAFBFA"/><stop offset=".45" stop-color="#C3CAC5"/><stop offset=".6" stop-color="#8B948E"/><stop offset="1" stop-color="#D6DBD7"/></linearGradient>' +
    '<linearGradient id="bkR' + n + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E35A4D"/><stop offset=".5" stop-color="#C2362B"/><stop offset="1" stop-color="#8E2018"/></linearGradient></defs>' +
    '<rect x="3" y="46" width="118" height="9" rx="4.5" fill="#262B28"/><rect x="10" y="42.5" width="96" height="4.5" rx="2" fill="url(#bkS' + n + ')"/>' +
    '<path d="M98 47 L98 30 Q98 25 103 25 L113 25 Q118 25 118 30 L118 47 Z" fill="#39403C"/>' +
    '<g class="arm" transform="rotate(' + (open ? 9 : 0) + ' 109 32)"><rect x="12" y="33" width="98" height="7" rx="2" fill="url(#bkS' + n + ')"/>' +
    '<path d="M7 34 Q6 18 24 16.500 L98 14 Q117 14 117 26 L117 34 Z" fill="url(#bkR' + n + ')" stroke="#7d1b14" stroke-width=".8"/>' +
    '<path d="M16 22 Q32 19 96 18" stroke="rgba(255,255,255,.5)" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>' +
    '<circle cx="109" cy="32" r="4.6" fill="#111"/><circle cx="109" cy="32" r="1.8" fill="#9aa39d"/></svg>';
  return wrap;
}
// The paper clip on the pile.
const CLIP = '<svg class="gem" viewBox="0 0 18 50" aria-hidden="true" focusable="false"><path d="M4 47 V9 a5 5 0 0 1 10 0 V40 a3.500 3.500 0 0 1 -7 0 V15" fill="none" stroke="#5f6863" stroke-width="2.6" stroke-linecap="round"/><path d="M4 47 V9 a5 5 0 0 1 10 0 V40 a3.500 3.500 0 0 1 -7 0 V15" fill="none" stroke="#EEF1EF" stroke-width="1.3" stroke-linecap="round"/></svg>';
const btn = (cls, text) => {
  const b = el("button", cls, text);
  b.type = "button";
  return b;
};
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const initial = (name) => ([...String(name || "")][0] || "").toUpperCase();
const isCsv = (f) => /\.csv$/i.test(String(f.name || "")) || f.type === "text/csv";

async function hashOf(blob) {
  try {
    const d = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

const NOTHING_SENT = "Nothing is sent until Staple.";

export function mountBulkAdd(root, store, keep, { onOpenDay = () => {}, onClose = () => {} } = {}) {
  const scrim = el("div", "scrim");
  scrim.id = "bulkScrim";
  scrim.hidden = true;
  const sheet = el("div", "sheet");
  sheet.id = "bulk";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Add tickets");
  sheet.inert = true;
  const top = el("div", "sheet-top");
  const topT = el("span", "", "Add tickets");
  const topI = el("i", "", "");
  topT.append(topI);
  const topB = btn("", "Cancel");
  topB.id = "bulkTop";
  top.append(topT, topB);
  const body = el("div", "ba-body");
  const say = el("p", "ba-vh");
  say.setAttribute("role", "status");
  const fileIn = el("input");
  fileIn.type = "file";
  fileIn.multiple = true;
  fileIn.accept = "application/pdf,image/png,image/jpeg";
  fileIn.id = "bulkFiles";
  fileIn.hidden = true;
  fileIn.tabIndex = -1;
  const listIn = el("input");
  listIn.type = "file";
  listIn.accept = ".csv,text/csv";
  listIn.id = "bulkList";
  listIn.hidden = true;
  listIn.tabIndex = -1;
  sheet.append(top, body, say, fileIn, listIn);
  root.append(scrim, sheet);

  let opened = false;
  // phase: "empty" | "reading" | "sorted" | "adding" | "added"
  let phase = "empty";
  let files = []; // { key, name, raw, kind, pages, sig, pic, url, unreadable }
  let list = null; // { rows, error, name }
  let answers = new Map();
  let checked = new Set(); // placement keys answered on a card
  let untied = false;
  let openLine = null; // the untied line being changed
  let other = null; // the card whose "another stop" picker is open
  let reading = { done: 0, total: 0 };
  let hashes = new Map(); // ticket id -> hash of the bytes this phone keeps
  let adding = null; // { done, total, items, ... } while adding and after
  let seeAll = false;
  let urls = [];
  let gen = 0; // one per Cancel / Done: work begun before it is dropped

  const url = (blob) => {
    const u = URL.createObjectURL(blob);
    urls.push(u);
    return u;
  };

  // ---- matching ----

  const liveTickets = () => (store.state.tickets || []).filter((t) => t && !t.gone);
  function isThere(fileKey, stopId, who = "") {
    const f = files.find((x) => x.key === fileKey);
    if (!f || !f.sig) return false;
    return liveTickets().some((t) => t.stop === stopId && (t.who || "") === (who || "") && t.mime === f.sig.mime && Number(t.w) === f.sig.w && Number(t.h) === f.sig.h && Number(t.size) === f.sig.size && (!hashes.has(t.id) || !f.sig.hash || hashes.get(t.id) === f.sig.hash));
  }
  // The bytes of every kept picture that could be the same as a dropped one, hashed once.
  async function hashKept() {
    const want = liveTickets().filter((t) => !hashes.has(t.id) && keep.have(t.id) && files.some((f) => f.sig && f.sig.mime === t.mime && f.sig.w === Number(t.w) && f.sig.h === Number(t.h) && f.sig.size === Number(t.size)));
    for (const t of want) {
      const b = await keep.get(t.id);
      if (b) hashes.set(t.id, await hashOf(b));
    }
  }

  const sorted = () => sortFiles({ files, rows: list && !list.error ? list.rows : [], listError: list ? list.error : null, state: store.state, answers, isThere });

  // ---- reading what was picked or dropped ----

  async function readList(file) {
    const mine = gen;
    let text = "";
    try {
      text = await file.text();
    } catch {
      text = "";
    }
    if (mine !== gen || (phase !== "empty" && phase !== "reading" && phase !== "sorted")) return;
    const got = parseList(text);
    list = { ...got, name: String(file.name || "list.csv").slice(0, 60) };
    // Fix round 1, M4: answers were given to the cards of the old list (or of none): they start again.
    answers = new Map();
    checked = new Set();
    openLine = null;
    other = null;
    if (phase === "empty") draw();
    else afterChange();
  }

  // One pick or drop at a time, in the order they came.
  let queue = Promise.resolve();
  function take(picked) {
    queue = queue.then(() => takeNow(picked)).catch(() => {
      // Anything else that went wrong reading: what was read is kept and sorted, and it is said.
      if (phase === "reading") phase = "sorted";
      draw();
      say.textContent = "A file couldn’t be read on this phone. Try a screenshot of the ticket instead.";
    });
    return queue;
  }
  async function takeNow(picked) {
    const all = [...picked];
    const csv = all.filter(isCsv);
    const rest = all.filter((f) => !isCsv(f));
    const mine = gen;
    if (csv.length) await readList(csv[0]);
    if (!rest.length || mine !== gen) return;
    if (phase !== "empty" && phase !== "sorted") return;
    phase = "reading";
    reading = { done: 0, total: rest.length };
    draw();
    for (const raw of rest) {
      const f = { key: newId(), name: String(raw.name || "A file").slice(0, 80), raw, kind: null, pages: 0, sig: null, pic: null, url: "", unreadable: "" };
      try {
        f.kind = await sniff(raw);
        if (f.kind === "image/png" || f.kind === "image/jpeg") {
          f.pic = await shrink(raw);
          f.pages = 1;
        } else if (f.kind === "application/pdf") {
          // The first page only, for its picture and already-there; the rest are drawn at Staple.
          const got = await pdfPages(raw, {
            max: 1,
            each: async (canvas) => {
              f.pic = await shrinkCanvas(canvas);
            },
          });
          f.pages = got.total;
          if (!f.pic) throw new Error("no page");
        }
      } catch {
        f.unreadable = "couldn’t be read on this phone";
        f.kind = null;
        f.pic = null;
      }
      if (f.pic) f.sig = { mime: f.pic.mime, w: f.pic.w, h: f.pic.h, size: f.pic.data.length, hash: await hashOf(f.pic.blob) };
      if (mine !== gen) return;
      files.push(f);
      reading.done += 1;
      drawReading();
    }
    await hashKept();
    if (mine !== gen) return;
    phase = "sorted";
    afterChange();
    say.textContent = plural(files.length, "file", "files") + " sorted.";
  }

  // ---- drawing ----

  const dayLabel = (stop) => stopLabel(stop, store.state.days || []);
  const stopOf = (id) => (store.state.stops || []).find((s) => s && s.id === id && !s.deleted);
  const people = () => (store.state.people || []).map((p) => p.name).filter(Boolean);

  function drawTop() {
    if (phase === "empty") topI.textContent = "";
    else if (phase === "adding" || phase === "added") topI.textContent = "stapled";
    else topI.textContent = plural(files.length, "file", "files") + (list && !list.error ? " · list of " + list.rows.length : "");
    topB.textContent = phase === "adding" || phase === "added" ? "Done" : "Cancel";
  }

  // "Yours or Izzah’s", by who else is on the trip.
  function whose() {
    const others = people().filter((p) => p !== store.state.me);
    return others.length === 1 ? "Yours or " + others[0] + "’s." : "Yours, or anyone’s on the trip.";
  }
  const phones = () => (people().length === 2 ? "on both phones" : "on every phone");

  // The envelope the files go in.
  function emptyZone() {
    const z = el("div", "env");
    z.append(el("div", "dz-h", "Drop the ticket files here."), el("div", "dz-p", "PDFs and pictures, all at once. Add the list (.csv) too if you have it: fewer to check by hand."));
    const two = el("div", "btn2");
    const f = btn("kb", "Choose files");
    f.id = "bulkChoose";
    f.append(el("small", "", "PDF · PNG · JPG"));
    const l = btn("kb out", list && !list.error ? "List chosen" : "Choose list");
    l.id = "bulkChooseList";
    l.append(el("small", "", list && !list.error ? plural(list.rows.length, "line", "lines") : ".csv, optional"));
    two.append(f, l);
    z.append(two);
    return z;
  }

  function drawReading() {
    const p = body.querySelector(".prog");
    if (!p) return;
    p.querySelector("b").textContent = "Reading " + reading.done + " of " + reading.total + "…";
    p.querySelector(".m i").style.width = (reading.total ? Math.round((100 * reading.done) / reading.total) : 0) + "%";
  }

  function progress(head, small, part, whole) {
    const p = el("div", "prog");
    p.append(el("b", "", head), el("span", "", small));
    const bar = el("div", "m");
    const fill = el("i");
    fill.style.width = (whole ? Math.round((100 * part) / whole) : 0) + "%";
    bar.append(fill);
    p.append(bar);
    return p;
  }

  // A small round seal with a person's initial; what it means is in the text, for a screen reader.
  const seal = (name) => {
    const s = el("span", "chip");
    s.append(el("em", "", initial(name)));
    s.append(el("span", "ba-vh", " for " + name));
    return s;
  };

  // The stub a sure one is drawn as in the pile (its stop's stock).
  function pileStub(it, mine, lab) {
    const st = stopOf(it.stop) || {};
    const stock = stockOf(st);
    const each = mine.filter((i) => i.who).length > 1;
    const ids = el("span", "ts-s");
    for (const i of mine.slice(0, 4)) {
      const one = el("span", "ba-id");
      if (i.who) one.append(seal(i.who));
      one.append(i.rowIds.length ? i.rowIds.join(" ") : i.file.name);
      ids.append(one);
    }
    return stubEl({ stock, edge: { word: { game: "ADMIT", boat: "BOARD", mus: "ADMIT", fly: "PASS" }[stock], n: each ? String(mine.filter((i) => i.who).length) : "" }, kicker: ([lab.when, each ? "ONE EACH" : mine.length > 1 ? mine.length + " FILES" : ""].filter(Boolean).join(" · ")).toUpperCase(), name: lab.title, extra: ids });
  }

  // The sure ones, clipped together: up to three stubs in a pile under a
  // paper clip (one with a code each on top), then the count and Unclip.
  function bundle(items, { stapled = false, band, small, action, actionLabel, expanded }) {
    const wrap = el("div", "ba-bundle" + (stapled ? " is-stapled" : ""));
    if (!stapled) {
      const pile = el("div", "pile");
      pile.setAttribute("aria-hidden", "true");
      const pp = items.find((i) => i.who && items.filter((j) => j.stop === i.stop && j.who).length > 1);
      const stops = [...new Set(items.map((i) => i.stop))];
      const topStop = (pp || items[0]).stop;
      const order = [...stops.filter((x) => x !== topStop).slice(0, 2).reverse(), topStop];
      for (const id of order) {
        const mine = items.filter((i) => i.stop === id);
        pile.append(pileStub(mine[0], mine, dayLabel(stopOf(id) || {})));
      }
      pile.insertAdjacentHTML("beforeend", CLIP);
      wrap.append(pile);
    } else wrap.append(stapler(false));
    const b = el("div", "d-band");
    const t = el("div", "", band);
    t.append(el("small", "", small));
    b.append(t);
    if (action) {
      const u = btn("ba-untie", actionLabel);
      u.dataset.act = action;
      u.setAttribute("aria-expanded", String(!!expanded));
      b.append(u);
    }
    wrap.append(b);
    return wrap;
  }

  // The stops as a picker: one group per day.
  function stopPicker(selected) {
    const s = el("select", "ba-pick");
    s.append(new Option("Pick a stop…", ""));
    const days = store.state.days || [];
    days.forEach((d, i) => {
      const stops = (store.state.stops || []).filter((x) => x && !x.deleted && x.date === d.date);
      if (!stops.length) return;
      stops.sort((a, b) => (minutesOf(a.time) ?? 9999) - (minutesOf(b.time) ?? 9999));
      const g = el("optgroup");
      g.label = "D" + (i + 1) + " " + dayLabel({ date: d.date }).when;
      for (const st of stops) {
        const o = new Option([st.time, st.title].filter(Boolean).join(" ") || "A stop", st.id);
        o.selected = st.id === selected;
        g.append(o);
      }
      s.append(g);
    });
    s.setAttribute("aria-label", "Stop");
    return s;
  }

  // A choice on the loose one: a line of that day's check.
  function choiceBtn(c, i, card) {
    const st = stopOf(c.stop) || {};
    const lab = dayLabel(st);
    const b = btn("f-ch");
    b.dataset.choice = card.key + "|" + i;
    const dt = el("span", "dt");
    dt.append(el("small", "", "Date"), el("b", "", st.date ? checkDate(st.date) : "—"));
    const nm = el("span", "nm");
    nm.append(el("b", "", c.pages ? "First " + plural(c.pages, "page", "pages") : lab.when || "No time"), (c.pages ? lab.d + " " : "") + lab.title + (c.who ? " · for " + c.who : ""));
    b.append(dt, nm, el("span", "go", "›"));
    return b;
  }

  // The loose one held up: Which check?
  function cardNode(card, n, of) {
    const c = el("div", "f-odd");
    c.dataset.card = card.key;
    const q = el("div", "odd-h");
    q.append(el("b", "", card.kind === "limit" ? "Too many" : "Which check?"), el("span", "", card.onList ? card.rowIds.join(" ") || "on the list" : "not on the list"));
    const big = el("div", "odd-b");
    const pv = el("div", "thumb");
    if (card.file.pic) {
      const img = el("img");
      img.alt = "";
      img.src = card.file.url || (card.file.url = url(card.file.pic.blob));
      pv.append(img);
    }
    pv.append(el("small", "", card.file.name));
    const words = el("div", "odd-t");
    words.append(card.onList ? "On the list:" : "The file:", el("span", "pr", card.onList ? card.label : card.file.kind === "application/pdf" ? "A PDF · " + plural(card.file.pages || 1, "page", "pages") : "A picture"), el("b", "", card.ask), card.hint);
    big.append(pv, words);
    const opts = el("div", "ba-opts");
    card.choices.forEach((ch, i) => opts.append(choiceBtn(ch, i, card)));
    const showOther = other === card.key || !card.choices.length;
    if (!showOther) {
      const soft = btn("f-ch alt");
      soft.dataset.other = card.key;
      soft.append(el("span", "", "Another stop, or leave it out"), el("span"), el("span", "go", "›"));
      opts.append(soft);
    } else {
      const box = el("div", "ba-other");
      const pick = stopPicker("");
      pick.dataset.pickFor = card.key;
      const put = btn("ba-put", "Put it on this stop");
      put.dataset.put = card.key;
      const out = btn("ba-out", "Leave it out");
      out.dataset.out = card.key;
      box.append(pick, put, out);
      opts.append(box);
    }
    c.append(q, big, opts);
    c.setAttribute("role", "group");
    c.setAttribute("aria-label", "To look at, " + n + " of " + of);
    return c;
  }

  // A quiet line: a small ring, what it is, and the rest.
  function aside(sealText, strong, rest, cls = "") {
    const a = el("div", "quiet-l" + (cls ? " " + cls : ""));
    const ring = el("em", "", sealText);
    ring.setAttribute("aria-hidden", "true");
    a.append(ring);
    const t = el("span");
    if (strong) t.append(el("b", "", strong), " ");
    t.append(rest);
    a.append(t);
    return a;
  }

  function untiedList(items) {
    const box = el("div", "ba-list");
    const days = store.state.days || [];
    let lastDay = null;
    for (const it of items) {
      const st = stopOf(it.stop) || {};
      if (st.date !== lastDay) {
        lastDay = st.date;
        const i = days.findIndex((d) => d.date === st.date);
        box.append(el("div", "ba-lh", "D" + (i + 1) + " " + dayLabel({ date: st.date }).when));
      }
      const line = el("div", "ba-line" + (openLine === it.key ? " is-open" : ""));
      const b = btn("ba-lb");
      b.dataset.line = it.key;
      b.setAttribute("aria-expanded", String(openLine === it.key));
      const lab = dayLabel(st);
      b.append(el("b", "", (st.time || "—")), el("span", "", lab.title), el("small", "", (it.rowIds.length ? it.rowIds.join(" ") + " · " : "") + it.file.name + (it.pages > 1 ? " · " + it.pages + " pages" : "")));
      if (it.who) b.append(seal(it.who));
      line.append(b);
      if (openLine === it.key) {
        const ed = el("div", "ba-ed");
        const pick = stopPicker(it.stop);
        pick.dataset.move = it.key;
        const fr = el("div", "ba-for");
        fr.append("For ");
        const ppl = people();
        for (const [v, label] of [["", ppl.length === 2 ? "Both" : "Everyone"], ...ppl.map((p) => [p, initial(p)])]) {
          const w = btn(it.who === v ? "is-on" : "", label);
          w.dataset.who = it.key + "|" + v;
          w.setAttribute("aria-pressed", String(it.who === v));
          if (v) w.setAttribute("aria-label", "For " + v);
          fr.append(w);
        }
        const out = btn("ba-out", "Leave it out");
        out.dataset.out = it.key;
        ed.append(pick, fr, out);
        line.append(ed);
      }
      box.append(line);
    }
    return box;
  }

  function drawSorted(r) {
    const nodes = [];
    if (phase === "reading") nodes.push(progress("Reading " + reading.done + " of " + reading.total + "…", "Made into pictures on this phone. " + NOTHING_SENT, reading.done, reading.total));
    const sure = r.items;
    if (sure.length) {
      const days = sure.map((i) => (store.state.days || []).findIndex((d) => d.date === (stopOf(i.stop) || {}).date) + 1).filter((n) => n > 0);
      const lo = days.length ? Math.min(...days) : 0;
      const hi = days.length ? Math.max(...days) : 0;
      const stops = new Set(sure.map((i) => i.stop)).size;
      const each = sure.filter((i) => i.who).length;
      nodes.push(bundle(sure, {
        band: sure.length + " sorted, clipped together",
        small: (lo === hi ? "D" + lo : "D" + lo + " to D" + hi) + " · " + plural(stops, "stop", "stops") + (each ? " · " + each + " one each" : ""),
        action: "untie",
        actionLabel: untied ? "Clip ‹" : "Unclip ›",
        expanded: untied,
      }));
      if (untied) nodes.push(untiedList(sure));
    }
    const total = checked.size + r.cards.length;
    if (r.cards.length) {
      const h = el("div", "secl");
      h.append(el("span", "", "Loose ones to look at · " + (checked.size + 1) + " of " + total));
      const dots = el("span", "pips");
      dots.setAttribute("aria-hidden", "true");
      for (let i = 0; i < Math.min(total, 8); i++) dots.append(el("i", i < checked.size ? "is-done" : i === checked.size ? "on" : ""));
      h.append(dots);
      nodes.push(h, cardNode(r.cards[0], checked.size + 1, total));
      for (const c of r.cards.slice(1, 3)) {
        const d = el("div", "f-nxo");
        d.append(el("span", "", c.label), el("i", "", c.short));
        nodes.push(d);
      }
    } else if (checked.size) {
      nodes.push(el("div", "secl", "All " + checked.size + " looked at"));
    }
    const quiet = el("div", "quiet");
    const there = r.out.filter((o) => o.kind === "there");
    if (there.length) {
      const names = there.map((o) => o.label + " is on " + ((stopOf(o.stop) || {}).title || "its stop")).join("; ");
      quiet.append(aside("2×", there.length + " already there:", names + ". Left out."));
    }
    const notT = r.out.filter((o) => o.kind === "notTicket");
    if (notT.length) {
      const bad = notT.filter((o) => o.file.unreadable);
      const odd = notT.filter((o) => !o.file.unreadable);
      if (odd.length) quiet.append(aside("×", plural(odd.length, "isn’t a ticket file:", "aren’t ticket files:"), odd.map((o) => o.file.name).join(", ") + ". Left out."));
      if (bad.length) quiet.append(aside("×", plural(bad.length, "file couldn’t be read", "files couldn’t be read") + " on this phone:", bad.map((o) => o.file.name).join(", ") + ". Try a screenshot instead."));
    }
    const inactive = r.out.filter((o) => o.kind === "inactive");
    if (inactive.length) quiet.append(aside("–", plural(inactive.length, "not active", "not active") + " on the list:", inactive.map((o) => o.label + " (" + o.why.replace(/^on the list as /, "") + ")").join(", ") + ". Left out."));
    const mineOut = r.out.filter((o) => o.kind === "leftOut");
    if (mineOut.length) quiet.append(aside("–", plural(mineOut.length, "left out", "left out") + ":", mineOut.map((o) => o.label).join(", ") + "."));
    if (list && list.error) quiet.append(aside("!", "", list.error, "is-warn"));
    else if (list && list.warn && list.warn.length) quiet.append(aside("!", "", list.warn.join(" "), "is-warn"));
    if (list && !list.error && r.quiet) quiet.append(aside("–", "", plural(r.quiet, "line", "lines") + " on the list " + (r.quiet === 1 ? "has" : "have") + " no file here."));
    else if (!list) {
      const a = aside("≡", "", "No list: every file not matched is looked at by hand. ");
      const b = btn("ba-link", "Choose list");
      b.id = "bulkChooseList";
      a.lastChild.append(b);
      quiet.append(a);
    }
    if (quiet.childNodes.length) nodes.push(quiet);
    // The trip's room for pictures: now, and after this.
    const meter = el("div", "meter");
    meter.append("Pictures on the trip: ", el("b", "", r.now + " now, " + r.after + " after this"), " · of " + LIMITS.perTrip);
    const m = el("div", "m");
    m.setAttribute("aria-hidden", "true");
    const a = el("i");
    const b2 = el("i");
    const pct = (v) => Math.max(0, Math.min(100, Math.round((100 * v) / LIMITS.perTrip)));
    a.style.width = pct(r.now) + "%";
    b2.style.left = pct(r.now) + "%";
    b2.style.width = Math.max(0, pct(r.after) - pct(r.now)) + "%";
    m.append(a, b2);
    meter.append(m);
    nodes.push(meter);
    // The red stapler: adds them all.
    const n = sure.length;
    const key = btn("staplek");
    key.id = "bulkPunch";
    key.disabled = n === 0 || phase === "reading";
    key.append(stapler(true));
    const sp = el("span");
    const small = (r.cards.length ? (r.cards.length === 1 ? "the 1 not looked at stays out" : "the " + r.cards.length + " not looked at stay out") + " · " : "") + phones();
    sp.append(el("b", "", n ? "Staple " + n + " now" : "Nothing to staple yet"), el("small", "", small));
    key.append(sp);
    nodes.push(key);
    return nodes;
  }

  // A mini stub per added ticket, stapled in a row: its stock, its day and time.
  function stapledRow(ok) {
    const row = el("div", "f-row");
    row.setAttribute("aria-hidden", "true");
    for (const it of ok) {
      const st = stopOf(it.stop) || {};
      const stock = stockOf(st);
      const lab = dayLabel(st);
      const [wd, tm] = [lab.when.split(" ")[0] || "", st.time || ""];
      const i = el("i", stock);
      i.append(staple(), (wd || lab.d).toUpperCase(), el("br"), tm);
      row.append(i);
    }
    return row;
  }

  function drawAdded() {
    const a = adding;
    const nodes = [];
    if (phase === "adding") {
      // Until every picture is kept on this phone, Wendy’s must stay open; after that nothing confirmed is lost.
      if (a.step === "making") nodes.push(progress("Making pictures: " + a.made + " of " + a.total, "Keep Wendy’s open until they are all added. Nothing is sent yet.", a.made, a.total));
      else if (a.step === "sending") nodes.push(progress("While adding: " + a.settled + " of " + plural(a.pics, "picture", "pictures"), "Keep Wendy’s open; each one is kept as soon as it lands. One that can’t go up now is kept on this phone and goes up when Wendy’s next has signal.", a.settled, a.pics));
      else nodes.push(progress("Filling in the stops’ details…", "From the list, only where a stop’s field is empty.", 1, 1));
    }
    if (phase === "added") {
      const ok = a.items.filter((i) => i.saved + i.waiting > 0);
      const stops = new Set(ok.map((i) => i.stop)).size;
      const pics = ok.reduce((s, i) => s + i.saved + i.waiting, 0);
      const waiting = ok.reduce((s, i) => s + i.waiting, 0);
      nodes.push(el("p", "big", ok.length ? plural(ok.length, "ticket", "tickets") + " added to " + plural(stops, "stop", "stops") + "." : "No ticket was added."));
      if (ok.length) {
        const s = el("p", "after");
        const others = people().filter((p) => p !== store.state.me);
        s.append(el("b", "", plural(pics, "picture", "pictures")), ", kept in the trip. " + (others.length === 1 ? others[0] + "’s phone shows" : "Every phone shows") + " them on its stops the next time it opens Wendy’s with signal.");
        if (waiting) s.append(" " + (waiting === pics ? "They wait" : waiting + " wait") + " on this phone" + (a.busy && a.busy === waiting ? " and go up in a moment." : " and go up when there is signal."));
        nodes.push(s, stapledRow(ok));
        const sure = ok.filter((i) => i.from === "sure").length;
        const rest = el("div", "f-rest is-done");
        rest.append(bundle(ok, { stapled: true, band: ok.length + " stapled", small: sure + " sorted + " + (ok.length - sure) + " you checked", action: "seeall", actionLabel: seeAll ? "Hide ‹" : "See all ›", expanded: seeAll }));
        nodes.push(rest);
        if (seeAll) {
          const box = el("div", "ba-list");
          for (const it of ok) {
            const st = stopOf(it.stop) || {};
            const lab = dayLabel(st);
            const row = el("div", "ba-line");
            const d = el("div", "ba-lb");
            d.append(el("b", "", lab.d), el("span", "", lab.title), el("small", "", (it.rowIds.length ? it.rowIds.join(" ") + " · " : "") + plural(it.saved + it.waiting, "picture", "pictures") + (it.waiting ? ", waiting" : "")));
            if (it.who) d.append(seal(it.who));
            row.append(d);
            box.append(row);
          }
          nodes.push(box);
        }
      }
      // Which ones wait on this phone for signal, by name.
      const waitingNow = ok.filter((i) => i.waiting > 0);
      if (waitingNow.length) {
        nodes.push(el("div", "secl", "Waiting for signal · " + waitingNow.length));
        const box = el("div", "nol ba-wait");
        for (const it of waitingNow) {
          const d = el("div");
          const st = stopOf(it.stop) || {};
          d.append(el("span", "nol-n", [it.rowIds.join(" ") || it.file.name, st.title].filter(Boolean).join(" · ")), el("span", "nol-w is-g", (it.waiting === it.saved + it.waiting ? "" : it.waiting + " of " + (it.saved + it.waiting) + " ") + "on this phone, goes up " + (it.busy === it.waiting ? "in a moment" : "when there is signal")));
          box.append(d);
        }
        nodes.push(box);
      }
      const notAdded = a.notAdded;
      if (notAdded.length) {
        nodes.push(el("div", "secl", "Not added · " + notAdded.length));
        const box = el("div", "nol");
        for (const x of notAdded) {
          const d = el("div");
          d.append(el("span", "nol-n", x.label), el("span", "nol-w" + (x.grey ? " is-g" : ""), x.why));
          box.append(d);
        }
        nodes.push(box);
      }
      if (notAdded.some((x) => x.why.startsWith("details not filled"))) {
        const q = el("div", "quiet");
        q.append(aside("!", "", "Details not filled can be added from the stop’s Edit sheet.", "is-warn"));
        nodes.push(q);
      }
      const firstDay = ok.map((i) => (stopOf(i.stop) || {}).date).filter(Boolean).sort()[0];
      if (firstDay) {
        const n = (store.state.days || []).findIndex((d) => d.date === firstDay) + 1;
        const go = btn("openday", "Open Day " + n + " · see the tickets");
        go.id = "bulkOpenDay";
        go.dataset.day = firstDay;
        nodes.push(go);
      }
    }
    return nodes;
  }

  let lastSig = "";
  function draw() {
    drawTop();
    const focusKey = document.activeElement && sheet.contains(document.activeElement) ? focusId(document.activeElement) : null;
    let nodes;
    if (phase === "empty") {
      nodes = [emptyZone()];
      if (list && (list.error || (list.warn && list.warn.length))) {
        const q = el("div", "quiet");
        q.append(aside("!", "", list.error || list.warn.join(" "), "is-warn"));
        nodes.push(q);
      }
      const p = el("p", "fine");
      p.append(whose() + " Wendy’s finds each one’s check; you only look at the odd ones. ", el("b", "", NOTHING_SENT));
      const rest = el("div", "f-rest");
      rest.append(stapler(false), p);
      nodes.push(rest);
    } else if (phase === "reading" || phase === "sorted") {
      const r = sorted();
      lastSig = sigOf(r);
      noteStops();
      nodes = drawSorted(r);
    }
    else nodes = drawAdded();
    body.replaceChildren(...nodes);
    if (focusKey) refocus(focusKey);
  }
  // A redraw keeps focus on the same control (keyboard on a computer).
  const ATTRS = ["choice", "other", "put", "out", "line", "who", "act", "pickFor", "move"];
  function focusId(n) {
    if (n.id) return "#" + n.id;
    for (const a of ATTRS) if (n.dataset && n.dataset[a] !== undefined) return "[data-" + a.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) + '="' + CSS.escape(n.dataset[a]) + '"]';
    return null;
  }
  function refocus(sel) {
    const n = body.querySelector(sel) || sheet.querySelector(sel);
    if (n && !n.disabled) n.focus({ preventScroll: true });
    else if (body.querySelector(".ba-card button")) body.querySelector(".ba-card button").focus({ preventScroll: true });
    else topB.focus({ preventScroll: true });
  }

  const sigOf = (r) => JSON.stringify([r.items.map((i) => [i.key, i.stop, i.who, i.pages]), r.cards.map((c) => [c.key, c.kind, c.choices.map((x) => x.stop)]), r.out.map((o) => o.kind + (o.key || "")), r.now, r.after, (store.state.stops || []).map((x) => x.id + x.date + x.time + x.title + !!x.deleted)]);

  // After an answer or a change of the trip: sort again and draw.
  function afterChange() {
    draw();
  }

  // ---- Staple: adding ----
  //
  // Three steps, so that nothing the person confirmed hangs on anything else.
  // Closing Wendy’s part way loses the pictures not yet handed over (fix round 3).
  // 1. Every picture is made (a PDF's pages drawn here), in memory only.
  // 2. Then the pictures are handed to store.addTicket one at a time (fix
  //    round 2, R1), each one's outcome awaited before the next, as the
  //    single add does; each is put in the keep right before its own add
  //    (fix round 3, R2). One with no signal waits on the phone (in chi.queue,
  //    its data in the keep) and goes up later through the store's flush,
  //    which is one at a time, after a reload too.
  // 3. Then the stops' facts, each worked out as it is sent (I1).
  // A wipe (Forget, a refused key) or Cancel stops waiting at once (aborts).

  let aborts = new Set();
  const orAbort = (p) => new Promise((resolve) => {
    aborts.add(resolve);
    Promise.resolve(p).then((v) => {
      aborts.delete(resolve);
      resolve(v);
    }, () => {
      aborts.delete(resolve);
      resolve(null);
    });
  });

  // Every stop as it was when the sort was last drawn (I1): a stop changed
  // since then gets no facts from the list.
  let seenStops = new Map();
  const stopKey = (st) => {
    const b = { ...st };
    delete b.pending;
    delete b.failed;
    return JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
  };
  const noteStops = () => {
    seenStops = new Map((store.state.stops || []).filter((x) => x && x.id).map((x) => [x.id, stopKey(x)]));
  };

  const FACTS_WHY = { notSent: "no signal", notLanded: "it didn’t land", unsure: "no reply yet, look at the stop later", gone: "the stop was removed", changed: "changed on another phone" };

  async function punch() {
    if (phase !== "sorted") return;
    const r = sorted();
    if (!r.items.length) return;
    // Fix round 1, M7: what is added is what was shown; a trip changed since is drawn again first.
    if (sigOf(r) !== lastSig) {
      draw();
      say.textContent = "The trip changed while you looked. Check it again, then Staple.";
      return;
    }
    const mine = gen;
    const at = keep.gen;
    const dead = () => mine !== gen || at !== keep.gen || store.state.status === "nokey";
    const rows = list && !list.error ? list.rows : [];
    phase = "adding";
    adding = {
      step: "making", made: 0, pics: 0, settled: 0, total: r.items.length, busy: 0,
      items: r.items.map((i) => ({ ...i, saved: 0, waiting: 0, busy: 0, failed: 0, message: "", short: 0 })),
      notAdded: [],
    };
    // What the sort left out goes on the Not added list: cards not looked at, then the rest.
    for (const c of r.cards) adding.notAdded.push({ label: c.label, why: "left out: " + c.short });
    for (const o of r.out) {
      if (o.kind === "there") adding.notAdded.push({ label: [o.label.split(" · ")[0], (stopOf(o.stop) || {}).title].filter(Boolean).join(" · "), why: "already there", grey: true });
      else if (o.kind === "notTicket") adding.notAdded.push({ label: o.file.name, why: o.file.unreadable || "not a ticket file", grey: true });
      else adding.notAdded.push({ label: o.label, why: o.why });
    }
    draw();
    say.textContent = "Adding " + plural(r.items.length, "ticket", "tickets") + ".";

    // 1. Every picture made (in memory only), nothing kept or sent yet.
    const pics = []; // { it, id, pic, k }
    const hold = (it, pic, k) => {
      pics.push({ it, id: newId(), pic, k });
    };
    for (const it of adding.items) {
      if (dead()) break;
      try {
        if (it.file.kind === "application/pdf") {
          let bad = false;
          await pdfPages(it.file.raw, {
            max: it.pages,
            each: async (canvas, k) => {
              if (bad || dead()) return;
              try {
                hold(it, await shrinkCanvas(canvas), k);
              } catch {
                bad = true;
                it.short = it.pages - k;
              }
            },
          });
        } else if (it.file.pic) hold(it, it.file.pic, 0);
      } catch {
        it.failed += 1;
        it.message = "That PDF couldn’t be read here. Try a screenshot of the ticket instead.";
      }
      adding.made += 1;
      if (mine === gen) draw();
    }
    if (dead()) return;

    // 2. Handed over ONE AT A TIME, each one's outcome awaited before the next, as the single add does (fix round 2, R1): never two ticket sends of ours in flight. One that cannot go up (no signal, busy) settles as waiting and the next is handed over; with no signal the store keeps each without sending it.
    adding.step = "sending";
    adding.pics = pics.length;
    const liveOn = (id) => (store.state.tickets || []).filter((t) => t && t.stop === id && !t.gone);
    draw();
    for (const { it, id, pic, k } of pics.splice(0)) {
      if (dead()) break;
      // Into the keep right before its own add, as the single add does (fix round 3, R2): a load's cleanup of the keep can never take a picture this loop has not reached. Not waited for: a keep that never answers must not hold the rest up; the data travels with the add.
      keep.put(id, pic.blob, { gen: at });
      const sameWho = liveOn(it.stop).filter((t) => (t.who || "") === it.who).length;
      const token = store.addTicket({ id, stop: it.stop, who: it.who, seat: seatFor(it, rows), page: Math.min(LIMITS.perStop, Math.max(k + 1, sameWho + 1)), mime: pic.mime, w: pic.w, h: pic.h, data: pic.data });
      const res = await orAbort(store.ticketOutcome(token));
      if (mine !== gen) return;
      if (res && res.saved) it.saved += 1;
      else if (res && res.reason === "queued") {
        it.waiting += 1;
        if (res.busy) {
          it.busy += 1;
          adding.busy += 1;
        }
      } else {
        it.failed += 1;
        it.message = (res && res.message) || "That picture wasn’t saved.";
        keep.drop(id);
      }
      adding.settled += 1;
      draw();
    }
    if (mine !== gen) return;
    for (const it of adding.items) {
      // Fix round 1, M9: which limit cut a PDF.
      if (it.pages < it.file.pages) adding.notAdded.push({ label: (it.rowIds[0] || it.file.name) + " · pages " + (it.pages + 1) + (it.file.pages > it.pages + 1 ? "–" + it.file.pages : ""), why: it.cut === "trip" ? "trip full, " + LIMITS.perTrip + " of " + LIMITS.perTrip : "stop full, " + LIMITS.perStop + " of " + LIMITS.perStop });
      if (it.short) adding.notAdded.push({ label: it.label, why: it.short + " pages couldn’t be made into pictures here" });
      else if (it.failed) adding.notAdded.push({ label: it.label, why: it.message });
    }

    // 3. The stops' facts, each from the stop as this phone has it now.
    adding.step = "facts";
    draw();
    const missed = (id, why) => adding.notAdded.push({ label: (stopOf(id) || {}).title || (r.items.find((i) => i.stop === id) || {}).label || "A stop", why: "details not filled: " + FACTS_WHY[why] });
    const stopIds = [...new Set(adding.items.map((i) => i.stop))];
    for (const id of stopIds) {
      if (dead()) break;
      const now = stopOf(id);
      const mineHere = adding.items.filter((i) => i.stop === id);
      const want = factsFor(mineHere, rows, now ? [now] : [{ id }])[id];
      if (!want) continue;
      if (!now) {
        missed(id, "gone");
        continue;
      }
      if (seenStops.get(id) !== stopKey(now)) {
        missed(id, "changed");
        continue;
      }
      let unsure = null;
      const noReply = new Promise((resolve) => {
        unsure = resolve;
      });
      const token = store.updateStop(id, want, { quiet: true, onUnsure: () => unsure({ saved: false, reason: "unsure" }) });
      if (!token) {
        missed(id, "gone");
        continue;
      }
      const out = await orAbort(Promise.race([store.outcome(token), noReply]));
      if (mine !== gen) return;
      if (!out || !out.saved) {
        if (out && out.reason === "refused") adding.notAdded.push({ label: now.title || "A stop", why: "details not filled: " + (out.message || "refused") });
        else missed(id, out ? out.reason : "unsure");
      }
    }
    if (mine !== gen) return;
    phase = "added";
    draw();
    const ok = adding.items.filter((i) => i.saved + i.waiting > 0).length;
    say.textContent = plural(ok, "ticket", "tickets") + " added.";
  }

  // ---- taps ----

  function answerCard(key, a) {
    answers.set(key, a);
    checked.add(key);
    other = null;
    afterChange();
  }

  body.addEventListener("click", (ev) => {
    const t = ev.target.closest("button");
    if (!t || t.disabled) return;
    if (t.id === "bulkChoose") return fileIn.click();
    if (t.id === "bulkChooseList") return listIn.click();
    if (t.id === "bulkPunch") return punch();
    if (t.id === "bulkOpenDay") {
      const day = t.dataset.day;
      close(false);
      onOpenDay(day);
      return;
    }
    const d = t.dataset;
    if (d.act === "untie") {
      untied = !untied;
      openLine = null;
      return draw();
    }
    if (d.act === "seeall") {
      seeAll = !seeAll;
      return draw();
    }
    const r = phase === "sorted" ? sorted() : null;
    if (!r) return;
    if (d.choice) {
      const [key, i] = d.choice.split("|");
      const card = r.cards.find((c) => c.key === key);
      const ch = card && card.choices[Number(i)];
      if (ch) answerCard(key, { stop: ch.stop, who: ch.who, rowIds: ch.rowIds, pages: ch.pages || null });
      return;
    }
    if (d.other) {
      other = d.other;
      draw();
      const p = body.querySelector('[data-pick-for="' + CSS.escape(d.other) + '"]');
      if (p) p.focus();
      return;
    }
    if (d.put) {
      const card = r.cards.find((c) => c.key === d.put);
      const p = body.querySelector('[data-pick-for="' + CSS.escape(d.put) + '"]');
      if (!card || !p || !p.value) {
        say.textContent = "Pick a stop first.";
        if (p) p.focus();
        return;
      }
      answerCard(card.key, { stop: p.value, who: card.who || "", rowIds: card.rowIds || [] });
      return;
    }
    if (d.out) {
      const card = r.cards.find((c) => c.key === d.out);
      if (card) answerCard(card.key, { out: true, why: card.short });
      else {
        answers.set(d.out, { out: true });
        openLine = null;
        afterChange();
      }
      return;
    }
    if (d.line) {
      openLine = openLine === d.line ? null : d.line;
      return draw();
    }
    if (d.who) {
      const [key, who] = d.who.split("|");
      const it = r.items.find((i) => i.key === key);
      if (it) {
        answers.set(key, { stop: it.stop, who, rowIds: it.rowIds, pages: it.pages });
        afterChange();
      }
    }
  });
  body.addEventListener("change", (ev) => {
    const s = ev.target.closest && ev.target.closest("select[data-move]");
    if (!s || !s.value || phase !== "sorted") return;
    const it = sorted().items.find((i) => i.key === s.dataset.move);
    if (!it) return;
    answers.set(it.key, { stop: s.value, who: it.who, rowIds: it.rowIds });
    openLine = it.key;
    afterChange();
  });

  fileIn.addEventListener("change", () => {
    const f = [...(fileIn.files || [])];
    fileIn.value = "";
    if (f.length) take(f);
  });
  listIn.addEventListener("change", () => {
    const f = listIn.files && listIn.files[0];
    listIn.value = "";
    if (f) readList(f);
  });
  // A computer: files dropped anywhere on the sheet, before Staple.
  sheet.addEventListener("dragover", (ev) => {
    if (phase === "adding" || phase === "added") return;
    ev.preventDefault();
    sheet.classList.add("is-drop");
  });
  sheet.addEventListener("dragleave", (ev) => {
    if (ev.target === sheet) sheet.classList.remove("is-drop");
  });
  sheet.addEventListener("drop", (ev) => {
    sheet.classList.remove("is-drop");
    if (phase === "adding" || phase === "added") return;
    ev.preventDefault();
    const f = [...((ev.dataTransfer && ev.dataTransfer.files) || [])];
    if (f.length) take(f);
  });

  // Starts afresh: everything sorted is dropped (nothing was sent).
  function reset() {
    gen += 1;
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    files = [];
    list = null;
    answers = new Map();
    checked = new Set();
    untied = false;
    openLine = null;
    other = null;
    reading = { done: 0, total: 0 };
    hashes = new Map();
    adding = null;
    seenStops = new Map();
    // Work waiting on the store (outcomes, facts) stops waiting.
    for (const done of [...aborts]) done(null);
    aborts = new Set();
    seeAll = false;
    phase = "empty";
    say.textContent = "";
  }

  topB.addEventListener("click", () => {
    // Cancel throws away what was sorted; Done after adding starts afresh. Adding goes on behind a close.
    if (phase === "added" || phase === "empty" || phase === "sorted" || phase === "reading") reset();
    close();
  });
  scrim.addEventListener("click", () => close());
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && opened) close();
  });

  // The trip taken off this phone (Forget this phone, a refused key; fix
  // round 1, I3): as every other view, nothing of it stays: the list, the
  // files, their pictures' addresses, the answers and what was drawn, open
  // or not. Work begun before it is dropped.
  let wiped = false;
  function wipe() {
    reset();
    body.replaceChildren();
    say.textContent = "";
    topI.textContent = "";
    topB.textContent = "Cancel";
    fileIn.value = "";
    listIn.value = "";
    queue = Promise.resolve();
    close(false);
  }

  // Another phone's change (a stop moved, a picture added): sorted again, and
  // drawn when it shows differently (never under an open stop picker).
  store.subscribe(() => {
    if (store.state.status === "nokey") {
      if (!wiped) {
        wiped = true;
        wipe();
      }
      return;
    }
    wiped = false;
    if (!opened || phase !== "sorted") return;
    if (sigOf(sorted()) === lastSig) return;
    const a = document.activeElement;
    if (a && a.tagName === "SELECT" && sheet.contains(a)) return;
    draw();
  });

  function open() {
    if (opened) return;
    opened = true;
    draw();
    sheet.classList.add("is-open");
    sheet.inert = false;
    scrim.hidden = false;
    root.classList.add("bulk-open");
    sheet.scrollTop = 0;
    topB.focus({ preventScroll: true });
  }

  function close(restoreFocus = true) {
    if (!opened) return;
    opened = false;
    sheet.classList.remove("is-open", "is-drop");
    sheet.inert = true;
    scrim.hidden = true;
    root.classList.remove("bulk-open");
    if (sheet.contains(document.activeElement)) document.activeElement.blur();
    onClose(restoreFocus === true);
  }

  // Reading files or adding (fix round 1, I4): a new release waits, open or not.
  const isBusy = () => phase === "reading" || phase === "adding";

  return { open, close: (restoreFocus) => close(restoreFocus), isOpen: () => opened, isBusy };
}
