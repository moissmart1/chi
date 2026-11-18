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
  if (process.env.CHI_KEY) out.CHI_KEY = process.env.CHI_KEY;
  return out;
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

// One action, posted the way the phone posts it.
export async function call(apiUrl, key, action, args = {}) {
  const r = await fetch(apiUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ key, actor: "Mo", via: "app", action, args }),
  });
  return r.json();
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
