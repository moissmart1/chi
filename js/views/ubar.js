/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The undo bar: the one place the store's lastChange and notice are shown.
// mountUndoBar(root, store) adds #ubar to root. Each new change shows its
// line (changeText) for 6 seconds, with Undo only while the change can be
// undone; a newer change replaces it and starts the 6 seconds again. A
// notice from the store shows the same way, without Undo, and is cleared. A
// quiet notice (store.state.noticeQuiet: the plan changed in the planner,
// chi#16) never replaces anything still showing (a notice, or a change line
// and its Undo); it is dropped.

import { changeText } from "../format.js";

const SHOW_MS = 6000;

export function mountUndoBar(root, store) {
  const bar = document.createElement("div");
  bar.className = "ubar";
  bar.id = "ubar";
  bar.setAttribute("role", "status");
  bar.hidden = true;
  const words = document.createElement("span");
  words.id = "ubarT";
  const undo = document.createElement("button");
  undo.type = "button";
  undo.id = "ubarU";
  undo.textContent = "Undo";
  bar.append(words, undo);
  root.append(bar);

  let seen = store.state.lastChange ? store.state.lastChange.token : null; // the change last shown
  let undoToken = null; // what Undo undoes, while it shows
  let timer = null;

  function hide() {
    clearTimeout(timer);
    timer = null;
    bar.hidden = true;
    undoToken = null;
  }

  function show(text, token) {
    clearTimeout(timer);
    words.textContent = text;
    undoToken = token;
    undo.hidden = !token;
    bar.hidden = false;
    bar.style.animation = "none";
    void bar.offsetWidth; // play the arrival again for a new message
    bar.style.animation = "";
    timer = setTimeout(hide, SHOW_MS);
  }

  undo.addEventListener("click", () => {
    const token = undoToken;
    if (!token) return;
    undo.hidden = true;
    undoToken = null;
    store.undo(token); // its "Undone." replaces this line
  });

  function render(s) {
    const c = s.lastChange;
    if (s.notice) {
      const text = s.notice;
      const quiet = s.noticeQuiet === true;
      if (quiet && !bar.hidden) {
        store.clearNotice();
        return;
      }
      seen = c ? c.token : seen; // the notice is newer than the change
      show(text, null);
      store.clearNotice();
      return;
    }
    if (c && c.token !== seen) {
      seen = c.token;
      show(changeText(c), c.canUndo ? c.token : null);
    } else if (c && c.token === seen && undoToken === c.token) {
      words.textContent = changeText(c); // the saved version of the same change
    }
  }

  store.subscribe(render);
}
