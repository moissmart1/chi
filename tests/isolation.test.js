// This app and the Japan one can be served from the same origin, so they share
// localStorage, sessionStorage and Cache Storage. Nothing here may use the
// Japan app's names for any of them, or point at the Japan app's address.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STORAGE_PREFIX, NEW_VERSION_MESSAGE } from "../js/config.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + "/" + entry.name;
    if (entry.isDirectory()) out.push(...jsFiles(rel));
    else if (entry.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

const FILES = [...jsFiles("js"), "sw.js"];
// A Japan storage key in quotes ("mat.key", 'mat.me', `mat.`), the Japan
// worker's cache names, and the Japan app's published address.
const FORBIDDEN = [/["'`]mat\.[A-Za-z]*/, /mat-shell/, /mat-fonts/, /mat-new-version/, /moissmart1\.github\.io\/mat/];

test("no file in js/ or sw.js uses the Japan app's storage keys, caches or address", () => {
  const found = [];
  for (const f of FILES) {
    const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const re of FORBIDDEN) if (re.test(line)) found.push(f + ":" + (i + 1) + "  " + line.trim());
    });
  }
  assert.deepEqual(found, []);
});

test("the storage prefix is written in one place only", () => {
  assert.equal(STORAGE_PREFIX, "chi.");
  const found = [];
  for (const f of jsFiles("js")) {
    if (f === "js/config.js") continue;
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (/["'`](chi|mat)\./.test(src)) found.push(f);
  }
  assert.deepEqual(found, [], "build every key from STORAGE_PREFIX (js/config.js)");
});

test("the worker's caches and message carry this app's own prefix", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  assert.match(sw, /^const PREFIX = "chi-";$/m);
  assert.match(sw, /n\.startsWith\(PREFIX \+ "shell-"\)/, "the purge only ever deletes this app's shells");
  assert.equal(NEW_VERSION_MESSAGE, "chi-new-version");
  assert.match(sw, /const NEW_VERSION = PREFIX \+ "new-version";/);
});

test("the manifest is this app's own", () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
  assert.equal(m.id, "./?app=chi");
  assert.equal(m.start_url, "./");
  assert.equal(m.scope, "./");
  assert.equal(m.short_name, "Wendy’s");
  assert.equal(m.name, "Wendy’s Chicago 2026");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /<title>Wendy’s<\/title>/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Wendy’s">/);
  // The name is a person's word, with a typographic apostrophe; never "CHI" where a person sees it.
  assert.doesNotMatch(html, /\bCHI\b/);
  assert.match(fs.readFileSync(path.join(ROOT, "sw.js"), "utf8"), /<title>Wendy’s<\/title>/);
});
