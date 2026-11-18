/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// A small effect that needs a class added at the right moment (the rest is
// CSS): wet ink on a stamp that has just landed. It does not run under
// prefers-reduced-motion: reduce.

export const calm = () => !!(globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches);

// How long a stamp stays wet before the ink dries back over 1.8 s (css/money.css .stamp).
export const WET_MS = 500;

// A stamp that has just landed: wet at once, drying after WET_MS.
export function wetInk(stamp) {
  if (calm()) return;
  stamp.classList.add("wet");
  setTimeout(() => stamp.classList.remove("wet"), WET_MS);
}
