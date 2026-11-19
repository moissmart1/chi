/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// scripts/scan.mjs: which private-list entries are checked. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { worthChecking, privateWords, findings } from "../scripts/scan.mjs";

test("entries of 6 or more characters are checked; under 4 never", () => {
  assert.equal(worthChecking("harbor"), true);
  assert.equal(worthChecking("AB1"), false);
  assert.equal(worthChecking("abc"), false);
});

test("a 4 or 5 character entry is checked when it has a digit or is all upper case", () => {
  for (const w of ["R2D2", "AB12", "X9Y8Z", "ABCD", "QWERT"]) assert.equal(worthChecking(w), true, w);
});

test("a common 4 or 5 letter word is not checked", () => {
  for (const w of ["rail", "Loop", "hotel", "Mo", "tea", "Izzah"]) assert.equal(worthChecking(w), false, w);
});

test("privateWords reads the list with that rule, and a short code is found in a file", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  const file = join(dir, "private.txt");
  writeFileSync(file, ["ZK47", "loop", "longer entry", "ab"].join("\n"));
  const words = privateWords(file);
  assert.deepEqual(words, ["ZK47", "longer entry"]);
  assert.equal(findings("booked under zk47 today", { words }).length, 1);
  assert.equal(findings("nothing here, the loop is fine", { words }).length, 0);
});
