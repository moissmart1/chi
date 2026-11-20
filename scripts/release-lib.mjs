// Shared by the release gate (gate.mjs), the release itself (ship.mjs), the
// push check (prepush.mjs) and the private-data scan (scan.mjs). Nothing here
// holds a key or anything from the trip's Sheet: those live outside the
// repository, in ~/.config/chi/ (see privateEnv and scan.mjs).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SITE = "https://moissmart1.github.io/chi/";
export const PRIVATE_DIR = process.env.CHI_PRIVATE_DIR || join(homedir(), ".config", "chi");

export function git(args, root = ROOT) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function gitOk(args, root = ROOT) {
  try {
    git(args, root);
    return true;
  } catch {
    return false;
  }
}

// What js/config.js says: where the backend is and which version this is.
export function config(src) {
  const url = (src.match(/API_URL = "([^"]*)"/) || [])[1] || "";
  return {
    apiUrl: url,
    deployId: (url.match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/) || [])[1] || "",
    appVersion: (src.match(/APP_VERSION = "([^"]*)"/) || [])[1] || "",
  };
}

export function readConfig(root = ROOT) {
  return config(readFileSync(join(root, "js", "config.js"), "utf8"));
}

// KEY=value lines of ~/.config/chi/env; the process environment wins.
export function privateEnv() {
  const out = {};
  const file = join(PRIVATE_DIR, "env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  }
  for (const k of KEY_NAMES) if (process.env[k]) out[k] = process.env[k];
  return out;
}

// The env names that hold a key (never printed).
export const KEY_NAMES = ["CHI_KEY", "CHI_CHECK_KEY", "CHI_OWNER_KEY"];

// The key the release checks use (security, 2026-11-18): the read-only check
// key, CHI_CHECK_KEY (it may load, rev, history and migrate, nothing else);
// the old shared CHI_KEY only when there is no check key. "" when neither.
export function checkKey(env) {
  return (env && (env.CHI_CHECK_KEY || env.CHI_KEY)) || "";
}

// The key that reads the whole trip for the private list: the owner's own
// key (CHI_OWNER_KEY), else the old shared CHI_KEY (the check key's load
// leaves out the e-Transfer addresses, which the list must hold).
export function ownerKey(env) {
  return (env && (env.CHI_OWNER_KEY || env.CHI_KEY)) || "";
}

// text with every key in env blanked, for a message that could carry one.
export function withoutKeys(text, env) {
  let s = String(text);
  for (const k of KEY_NAMES) {
    const v = env && env[k];
    if (typeof v === "string" && v.length >= 6) {
      s = s.split(v).join("(key)");
      s = s.split(encodeURIComponent(v)).join("(key)");
    }
  }
  return s;
}

// --- the backend stamp: ten hex digits over every file clasp pushes ---------

export const STAMP_LINE = /^var BACKEND_STAMP = "([^"]*)";$/m;

export function backendFiles(root = ROOT) {
  const dir = join(root, "backend");
  return readdirSync(dir)
    .filter((f) => (f.endsWith(".js") && f !== "Stamp.js") || f === "appsscript.json")
    .sort();
}

export function backendHash(root = ROOT) {
  const h = createHash("sha256");
  for (const f of backendFiles(root)) {
    h.update(f + "\0");
    h.update(readFileSync(join(root, "backend", f)));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 10);
}

export function stampIn(src) {
  const m = String(src || "").match(STAMP_LINE);
  return m ? m[1] : "";
}

export function writtenBackendStamp(root = ROOT) {
  const file = join(root, "backend", "Stamp.js");
  return existsSync(file) ? stampIn(readFileSync(file, "utf8")) : "";
}

// --- receipts: proof that the gate passed for one exact tree ----------------

export function receiptDir(root = ROOT) {
  const common = git(["rev-parse", "--git-common-dir"], root);
  return join(isAbsolute(common) ? common : join(root, common), "chi-gate");
}

export function readReceipt(tree, root = ROOT) {
  const file = join(receiptDir(root), tree + ".json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// --- the live backend --------------------------------------------------------

// The stamp the live backend answers with ("" from a backend older than the
// stamp, or one that cannot be reached).
export async function liveStamp(apiUrl) {
  if (!apiUrl) return "";
  try {
    const r = await fetch(apiUrl, { redirect: "follow" });
    const j = await r.json();
    return (j && j.data && typeof j.data.stamp === "string" && j.data.stamp) || "";
  } catch {
    return "";
  }
}

// One action, posted the way the phone posts it: the key in the body only,
// never in the address.
export async function call(apiUrl, key, action, args = {}) {
  const r = await fetch(apiUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ key, actor: "Mo", via: "app", action, args }),
  });
  return r.json();
}

// Whether a live load answered with the trip (days and stops).
export function tripLoaded(r) {
  return !!r && r.ok === true && !!r.data && Array.isArray(r.data.days) && r.data.days.length > 0 && Array.isArray(r.data.stops);
}

// Asks ask() until ok(answer), at most `tries` times, waiting `waitMs`
// between: right after a deploy a request can still land on the old version
// (which refuses the check key). Resolves with the last answer.
export async function askUntil(ask, ok, { tries = 7, waitMs = 5000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    last = await ask().catch(() => null);
    if (ok(last)) return last;
    if (i < tries - 1) await sleep(waitMs);
  }
  return last;
}

// Calls migrate until an answer comes from the backend that carries `wanted`
// (this commit's stamp), then trusts that answer's `added` list. Right after a
// deploy a request can still land on the previous version, which answers ok with
// "nothing to add" (2026-11-18, and again 2026-11-20); such an answer, and a
// refusal from the old version, are asked again with a growing wait (3 s, then
// 1.5 times longer, at most 15 s each) until about `budgetMs` of waiting has
// passed. Resolves { ok: true, added, calls } or { ok: false, why, calls }.
// ask and sleep stand in for the network and the clock in tests.
export async function migrateUntilCurrent(ask, wanted, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), budgetMs = 120000 } = {}) {
  let waited = 0;
  let calls = 0;
  let seen = "no answer";
  for (let wait = 3000; ; wait = Math.min(Math.round(wait * 1.5), 15000)) {
    const r = await ask().catch(() => null);
    calls++;
    if (r && r.ok === true && r.data && r.data.stamp === wanted) {
      return { ok: true, added: Array.isArray(r.data.added) ? r.data.added : [], calls };
    }
    seen = !r ? "no answer" : r.ok === true ? "answered by backend " + ((r.data && r.data.stamp) || "older than the stamp") : "refused (" + (r.error || r.message || "no reason") + ")";
    if (waited + wait > budgetMs) break;
    await sleep(wait);
    waited += wait;
  }
  return { ok: false, why: "migrate was only ever answered by the wrong backend (last: " + seen + "; wanted " + wanted + ") after " + calls + " calls over about " + Math.round(waited / 1000) + " seconds.", calls };
}

// --- rules that are pure, so tests can pin them -----------------------------

// A change the phones must fetch needs a new APP_VERSION, or they keep the old one.
export function needsBump(changed, shell) {
  const files = new Set(shell.map((f) => (f === "./" ? "index.html" : f)));
  files.add("sw.js");
  return changed.some((f) => files.has(f));
}

// Why a push must not go out, or null when it may.
//   remoteRef, localSha: what git hands a pre-push hook
//   receipt: the gate's receipt for that commit's tree, or null
//   commitStamp: BACKEND_STAMP in that commit ("" before the stamp existed)
//   live: the stamp the live backend answers with
export function judgePush({ remoteRef, localSha, receipt, commitStamp, live }) {
  if (/refs\/original\//.test(remoteRef)) return "refs/original is never pushed: it holds history that was removed on purpose.";
  if (remoteRef !== "refs/heads/main") return "Only main is published (" + remoteRef + " is not main).";
  if (/^0+$/.test(localSha)) return "main is never deleted.";
  if (!receipt) return "This commit has not passed the gate. Run `npm run gate`, then `npm run ship`.";
  if (receipt.unit.fail || receipt.e2e.fail) return "The gate's receipt for this commit records failing tests.";
  if (commitStamp && commitStamp !== live) {
    return "The live backend (" + (live || "no stamp") + ") is not this commit's backend (" + commitStamp +
      "). The backend goes first: run `npm run ship`, which deploys it and checks it before publishing.";
  }
  return null;
}

// --- the permission gate (review of the planner port, 2026-11-20, C1) --------
// The web app runs as its deployer (Mo). A version whose manifest asks Google
// for a permission he has not granted fails every request, for everyone, until
// he approves it in the script editor. So a backend that asks for more than the
// last release did goes to the script's head only; the live deployment moves
// only once ship is told the new permission was approved (--scopes-approved).

// What a manifest (backend/appsscript.json, as text) asks Google for: its
// oauthScopes and its advanced services ("sheets v4"), each sorted, and whether
// it lists them at all (hasScopes, hasServices). null when the text is not a
// manifest.
export function manifestAsks(src) {
  let m;
  try {
    m = JSON.parse(src);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const scopes = Array.isArray(m.oauthScopes) ? m.oauthScopes.filter((s) => typeof s === "string") : [];
  const deps = m.dependencies && Array.isArray(m.dependencies.enabledAdvancedServices) ? m.dependencies.enabledAdvancedServices : [];
  const services = deps.filter((s) => s && typeof s.serviceId === "string").map((s) => s.serviceId + " " + (s.version || ""));
  const hasServices = !!(m.dependencies && Array.isArray(m.dependencies.enabledAdvancedServices));
  return { scopes: [...new Set(scopes)].sort(), services: [...new Set(services)].sort(), hasScopes: Array.isArray(m.oauthScopes), hasServices };
}

// What the next manifest asks for that the released one did not, as words for
// the owner ([] when nothing new). released: the manifest at origin/main, or
// null when there is none (then everything it asks for is new). Throws when
// the next manifest can't be read: ship must not guess.
export function manifestGains(released, next) {
  const now = manifestAsks(next);
  if (!now) throw new Error("backend/appsscript.json can't be read as a manifest.");
  const was = (released !== null && released !== undefined && manifestAsks(released)) || { scopes: [], services: [], hasScopes: false, hasServices: false };
  // A list taken out of the manifest is a change too (re-check 1, R1-M2):
  // without oauthScopes Apps Script works out the scopes from the code, which
  // can be more than the released list; the advanced services likewise.
  const removed = [];
  if (was.hasScopes && !now.hasScopes) removed.push("the permissions Apps Script works out from the code (oauthScopes was removed from the manifest)");
  if (was.hasServices && was.services.length && !now.hasServices) removed.push("whatever Apps Script works out without the advanced service list (it was removed from the manifest)");
  return [
    ...removed,
    ...now.scopes.filter((s) => !was.scopes.includes(s)).map((s) => "the permission " + s),
    ...now.services.filter((s) => !was.services.includes(s)).map((s) => "the advanced service " + s),
  ];
}

// How the backend goes out: "deploy" (push, then a new version on the live
// deployment) or "head" (push to the script's head only, then stop).
// approved is this run's --scopes-approved only: it is never stored, so the
// next run with a new permission stops at the head again unless given it again.
export function backendPath(gains, approved) {
  return gains.length && !approved ? "head" : "deploy";
}

// The plain line ship says when --scopes-approved was given for a backend that
// asks for nothing new (re-check 1, R1-M1), or null. Ship carries on as usual.
export function approvalNote(gains, approved) {
  return approved && !gains.length ? "--scopes-approved was not needed: this backend asks Google for nothing new. It counts for this run only and changes nothing." : null;
}

// The owner's next steps after a push to the head only, in plain words.
// flags: the other ship flags given this time (kept in the command to run next).
export function headOnlySteps(gains, flags = []) {
  const next = ["npm", "run", "ship", "--", ...flags.filter((f) => f !== "--scopes-approved" && f !== "--check"), "--scopes-approved"].join(" ");
  return [
    "This backend asks Google for something the live one does not: " + gains.join("; ") + ".",
    "It was pushed to the script's head only. The live deployment was not changed and the site was not published: the app keeps working as before.",
    "Next:",
    "  1. Mo: open the Chicago script in the script editor (script.google.com), pick checkPlanner and press Run. Google asks for the new permission: approve it. If that run only asked, run it again.",
    "  2. Then: " + next,
  ];
}

// Step 2 of ship, the backend's own part, with clasp passed in (tests stub it):
// clasp(args) -> { status, stdout, stderr }. -> { ok, did, why }: did is
// "would-deploy" or "would-head" (--check: nothing run), "head" (pushed to the
// head only) or "deployed" (pushed and a new version made on deployId).
export function shipBackend({ path, check, clasp, deployId, label }) {
  if (check) return { ok: true, did: path === "head" ? "would-head" : "would-deploy" };
  const tail = (r) => ((r && (r.stderr || r.stdout)) || "").trim().split("\n").slice(-3).join("\n      ");
  const push = clasp(["push", "-f"]);
  if (push.status !== 0) return { ok: false, did: "none", why: "clasp push failed.", detail: tail(push) };
  if (path === "head") return { ok: true, did: "head" };
  const dep = clasp(["create-deployment", "-i", deployId, "-d", label]);
  if (dep.status !== 0) return { ok: false, did: "pushed", why: "The new backend version was pushed but not deployed.", detail: tail(dep) };
  return { ok: true, did: "deployed" };
}
