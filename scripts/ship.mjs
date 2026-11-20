// The release, in the only order that is safe, each step checked against the
// real thing before the next one starts:
//
//   npm run ship                 backend first (when it changed), then the site
//   npm run ship -- --migrate    also runs the backend's `migrate` (new tabs or columns)
//   npm run ship -- --check      says what it would do and changes nothing
//   npm run ship -- --backend-only   steps 1 to 3, then stops before the push
//                                (to check something by hand against the new
//                                backend; `npm run ship` again does the rest)
//   npm run ship -- --scopes-approved   Mo has approved the new permission a
//                                backend asks for (below): deploy it
//
// 1. This commit is main, clean, and has the gate's receipt (npm run gate).
// 2. If the live backend is not this commit's backend: clasp push, new version
//    on the same deployment, then wait until the live backend answers with
//    this commit's stamp. But when backend/appsscript.json asks Google for a
//    scope or an advanced service that origin/main's (the last release) does
//    not, and --scopes-approved was not given: clasp push only (the script's
//    head), say what Mo must approve, and stop with an error. The live
//    deployment is not touched: a version needing a permission the deployer
//    has not granted fails every request, for everyone (review, 2026-11-20).
// 3. The live trip still loads, read with the release check's read-only key
//    (CHI_CHECK_KEY from ~/.config/chi/env; CHI_KEY only when there is none).
// 4. git push origin main (the push check runs again there).
// 5. Wait until the site serves this version, then compare every file the
//    phones cache, byte for byte, with this commit.
// 6. Open the live site in a headless browser with the check key in the fragment
//    (never in the query string): the trip loads and there is no script error.
//
// It never prints a key. If a step fails it stops and says where things stand.
//
// Once issueLinks has run (the security release, 2026-11-18), never roll the
// backend back past that version: an older backend knows only the shared key,
// refuses every personal key, and each phone that hears that clears itself.
// Fix forward.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, SITE, approvalNote, askUntil, backendPath, call, checkKey, headOnlySteps, manifestGains, shipBackend, tripLoaded, git, gitOk, liveStamp, migrateUntilCurrent, privateEnv, readConfig, readReceipt, withoutKeys, writtenBackendStamp } from "./release-lib.mjs";
import { shellList } from "./stamp-sw.mjs";

const check = process.argv.includes("--check");
const migrate = process.argv.includes("--migrate");
const backendOnly = process.argv.includes("--backend-only");
// This run only: read from the command line, never written anywhere.
const scopesApproved = process.argv.includes("--scopes-approved");
const step = (s) => console.log("ship: " + s);
const stop = (why, fix) => {
  console.error("\nship: STOPPED. " + why + (fix ? "\n      " + fix : ""));
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

// 1 ---------------------------------------------------------------------------
const cfg = readConfig();
if (!cfg.apiUrl) stop("This app is not connected to a backend yet (API_URL in js/config.js is empty).", "Connect a backend first; there is nothing to deploy or check until then.");
if (git(["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") stop("Releases go out from main.", "Merge the work into main first.");
if (git(["status", "--porcelain"])) stop("There are uncommitted changes.", "Commit them, then `npm run gate`.");
const head = git(["rev-parse", "HEAD"]);
const receipt = readReceipt(git(["rev-parse", "HEAD^{tree}"]));
if (!receipt) stop("This commit has not passed the gate.", "Run `npm run gate` (about 15 minutes).");
git(["fetch", "origin", "main"]);
if (!gitOk(["merge-base", "--is-ancestor", "origin/main", "HEAD"])) stop("origin/main has commits this one does not.", "Merge them, then `npm run gate` again.");
const env = privateEnv();
const KEY = checkKey(env);
if (!KEY) stop("No key to check the live trip with.", "Put CHI_CHECK_KEY=... in ~/.config/chi/env (never in the repository).");
if (!env.CHI_CHECK_KEY) step("no CHI_CHECK_KEY: checking with the old shared CHI_KEY");
step("commit " + head.slice(0, 7) + ", version " + cfg.appVersion + ", gate passed " + receipt.at + " (" + receipt.unit.pass + " unit, " + receipt.e2e.pass + " browser)");

// 2 ---------------------------------------------------------------------------
const want = writtenBackendStamp();
let live = await liveStamp(cfg.apiUrl);
if (live === want) {
  step("backend: the live one is already this commit's (" + want + ")");
  if (scopesApproved) step(approvalNote([], true));
} else {
  step("backend: live is " + (live || "older than the stamp") + ", this commit is " + want + ": it must be deployed first");
  // What the manifest asks for beyond the last release's (origin/main, fetched above).
  let released = null;
  try {
    released = git(["show", "origin/main:backend/appsscript.json"]);
  } catch {
    released = null;
  }
  let gains;
  try {
    gains = manifestGains(released, readFileSync(join(ROOT, "backend", "appsscript.json"), "utf8"));
  } catch (e) {
    stop(String(e.message || e), "Nothing was pushed or deployed.");
  }
  const path = backendPath(gains, scopesApproved);
  const note = approvalNote(gains, scopesApproved);
  if (note) step(note);
  if (gains.length) step("backend: the manifest asks for more than the last release: " + gains.join("; ") + (scopesApproved ? " (--scopes-approved: Mo has approved it)" : ""));
  if (!check && !existsSync(join(ROOT, ".clasp.json"))) stop("No .clasp.json here, so the backend cannot be deployed.", "It is git-ignored and lives only in /Users/owner/Projects/chi.");
  const clasp = (args) => spawnSync("npx", ["clasp", ...args], { cwd: ROOT, encoding: "utf8" });
  let was = null;
  if (!check) {
    const before = clasp(["list-deployments"]);
    was = ((before.stdout || "").split("\n").find((l) => l.includes(cfg.deployId)) || "").match(/@(\d+)/);
    step("backend: live deployment is at version " + (was ? was[1] : "unknown") + " (fix forward: once issueLinks has run, never roll back past the security release)");
  }
  const out = shipBackend({ path, check, clasp, deployId: cfg.deployId, label: "v" + cfg.appVersion + " " + head.slice(0, 7) });
  if (out.did === "would-head") {
    step("--check: the new permission is not approved yet (no --scopes-approved): would run clasp push to the script's head only and stop there, with no new version on the live deployment, no migrate and no site push. With --scopes-approved it would deploy as usual. Nothing was changed.");
    process.exit(0);
  }
  if (out.did === "would-deploy") {
    step("--check: would run clasp push and a new version on the same deployment" + (migrate ? ", then migrate" : ""));
  } else if (!out.ok) {
    stop(out.why, out.detail);
  } else if (out.did === "head") {
    const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
    stop(headOnlySteps(gains, flags).join("\n      "), "Nothing else was done: no new version, no migrate, no push.");
  } else {
    for (let i = 0; i < 30 && live !== want; i++) {
      await sleep(3000);
      live = await liveStamp(cfg.apiUrl);
    }
    if (live !== want) {
      stop("The live backend still answers " + (live || "with no stamp") + " after the deploy.",
        "The site was NOT published. Look at `npx clasp list-deployments`" + (was ? "; version " + was[1] + " is the one that was live." : "."));
    }
    step("backend: live and answering " + want);
  }
}

// 3 ---------------------------------------------------------------------------
if (migrate && !check) {
  // Only an answer that carries THIS commit's stamp counts. Right after a deploy
  // a request can still land on the old version, whose migrate adds nothing and
  // says ok (2026-11-18, and again 2026-11-20, issue #55: the new tab and column
  // only went in on a later call by hand). The backend's migrate answers with its
  // stamp; the old version's answer has none, or an older one, and is asked again.
  const m = await migrateUntilCurrent(() => call(cfg.apiUrl, KEY, "migrate"), want);
  if (!m.ok) stop(withoutKeys(m.why, env), "The site was NOT published, and the Sheet may not have the new tabs or columns. Run `npm run ship -- --migrate` again in a few minutes; fix forward, do not roll the backend back.");
  step("backend: migrate ran on this commit's backend (" + m.calls + " call" + (m.calls === 1 ? "" : "s") + ")" + (m.added.length ? ", added " + m.added.join(", ") : ", nothing to add"));
}
// Asked for about 30 seconds: right after a deploy a request can still land
// on the old version, which refuses the check key.
const load = await askUntil(() => call(cfg.apiUrl, KEY, "load"), tripLoaded);
if (!tripLoaded(load)) {
  stop("The live trip does not load (" + withoutKeys((load && (load.message || load.error)) || "no answer", env) + ").",
    "The site was NOT published. Run `npm run ship` again in a minute. If it still does not load, fix forward: do not roll the backend back once issueLinks has run (every phone on a personal link would clear itself).");
}
step("live trip loads: " + load.data.days.length + " days, " + load.data.stops.length + " stops, rev " + load.rev);

// 4 ---------------------------------------------------------------------------
if (backendOnly && !check) {
  console.log("\nship: the backend is live and the trip loads. Stopped before the push, as asked. `npm run ship` does the rest.");
  process.exit(0);
}
const ahead = git(["rev-list", "--count", "origin/main..HEAD"]);
if (check) {
  step("--check: would push " + ahead + " commit(s) to origin/main, then check the live site. Nothing was changed.");
  process.exit(0);
}
if (ahead !== "0") {
  const push = spawnSync("git", ["push", "origin", "main"], { cwd: ROOT, stdio: "inherit" });
  if (push.status !== 0) stop("git push was refused.", "Read the message above. The backend is already live; the site is not.");
  step("pushed " + ahead + " commit(s)");
} else {
  step("nothing to push: origin/main is already this commit");
}

// 5 ---------------------------------------------------------------------------
const get = async (path) => {
  const r = await fetch(SITE + path + (path.includes("?") ? "&" : "?") + "ship=" + Date.now(), { cache: "no-store" });
  return { status: r.status, body: Buffer.from(await r.arrayBuffer()) };
};
let served = "";
for (let i = 0; i < 48; i++) {
  const r = await get("js/config.js").catch(() => null);
  served = r && r.status === 200 ? (r.body.toString("utf8").match(/APP_VERSION = "([^"]*)"/) || [])[1] || "" : "";
  if (served === cfg.appVersion && sha(r.body) === sha(readFileSync(join(ROOT, "js", "config.js")))) break;
  served = served === cfg.appVersion ? "" : served;
  await sleep(10000);
}
if (served !== cfg.appVersion) stop("After 8 minutes the site still serves version " + (served || "unknown") + ".", "Look at the repository's Pages build. The push itself went through.");
const wrong = [];
for (const entry of [...shellList(), "sw.js"]) {
  const file = entry === "./" ? "index.html" : entry;
  const r = await get(entry === "./" ? "" : entry).catch(() => null);
  if (!r || r.status !== 200 || sha(r.body) !== sha(readFileSync(join(ROOT, file)))) wrong.push(file);
}
if (wrong.length) stop("The site serves " + wrong.length + " file(s) that differ from this commit: " + wrong.slice(0, 8).join(", "), "Wait a minute and run `npm run ship` again (it only re-checks).");
step("site: version " + served + ", every cached file matches this commit");

// 6 ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  // The key goes in the fragment, as an invite link has it: a fragment is never
  // sent to the site's server (a query string is, and until 2026-11-18 this
  // step put the key in one). The app reads it there, so this is also the only
  // way the check really signs in: it waits for the trip's own day count.
  // The check key's phone has no one chosen (me is "") and shows the trip read-only.
  await page.goto(SITE + "#k=" + encodeURIComponent(KEY), { waitUntil: "load", timeout: 45000 });
  await page.waitForSelector("#phone", { timeout: 20000 });
  await page.waitForSelector("#dayCount", { state: "visible", timeout: 30000 });
  await sleep(4000);
} catch (e) {
  errors.push("the page did not start: " + withoutKeys(String(e.message || e).split("\n")[0], env));
} finally {
  await browser.close();
}
if (errors.length) stop("The live site started with " + errors.length + " error(s): " + withoutKeys(errors.slice(0, 3).join(" | "), env), "This is live now. Fix forward or revert the commit and ship again.");
step("live site starts with no script error");

console.log("\nship: DONE. Version " + cfg.appVersion + " (" + head.slice(0, 7) + ") is live, backend " + want + ". Record it in the ledger and MEMORY.md.");
