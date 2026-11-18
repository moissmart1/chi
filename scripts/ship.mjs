// The release, in the only order that is safe, each step checked against the
// real thing before the next one starts:
//
//   npm run ship                 backend first (when it changed), then the site
//   npm run ship -- --migrate    also runs the backend's `migrate` (new tabs or columns)
//   npm run ship -- --check      says what it would do and changes nothing
//   npm run ship -- --backend-only   steps 1 to 3, then stops before the push
//                                (to check something by hand against the new
//                                backend; `npm run ship` again does the rest)
//
// 1. This commit is main, clean, and has the gate's receipt (npm run gate).
// 2. If the live backend is not this commit's backend: clasp push, new version
//    on the same deployment, then wait until the live backend answers with
//    this commit's stamp.
// 3. The live trip still loads with the trip's key (from ~/.config/chi/env).
// 4. git push origin main (the push check runs again there).
// 5. Wait until the site serves this version, then compare every file the
//    phones cache, byte for byte, with this commit.
// 6. Open the live site in a headless browser: it starts with no script error.
//
// It never prints a key. If a step fails it stops and says where things stand.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, SITE, call, git, gitOk, liveStamp, privateEnv, readConfig, readReceipt, writtenBackendStamp } from "./release-lib.mjs";
import { shellList } from "./stamp-sw.mjs";

const check = process.argv.includes("--check");
const migrate = process.argv.includes("--migrate");
const backendOnly = process.argv.includes("--backend-only");
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
if (!env.CHI_KEY) stop("No trip key to check the live trip with.", "Put CHI_KEY=... in ~/.config/chi/env (never in the repository).");
step("commit " + head.slice(0, 7) + ", version " + cfg.appVersion + ", gate passed " + receipt.at + " (" + receipt.unit.pass + " unit, " + receipt.e2e.pass + " browser)");

// 2 ---------------------------------------------------------------------------
const want = writtenBackendStamp();
let live = await liveStamp(cfg.apiUrl);
if (live === want) {
  step("backend: the live one is already this commit's (" + want + ")");
} else {
  step("backend: live is " + (live || "older than the stamp") + ", this commit is " + want + ": it must be deployed first");
  if (check) {
    step("--check: would run clasp push and a new version on the same deployment" + (migrate ? ", then migrate" : ""));
  } else {
    if (!existsSync(join(ROOT, ".clasp.json"))) stop("No .clasp.json here, so the backend cannot be deployed.", "It is git-ignored and lives only in /Users/owner/Projects/chi.");
    const clasp = (args) => spawnSync("npx", ["clasp", ...args], { cwd: ROOT, encoding: "utf8" });
    const before = clasp(["list-deployments"]);
    const was = ((before.stdout || "").split("\n").find((l) => l.includes(cfg.deployId)) || "").match(/@(\d+)/);
    step("backend: live deployment is at version " + (was ? was[1] : "unknown") + " (the one to go back to if this goes wrong)");
    const push = clasp(["push", "-f"]);
    if (push.status !== 0) stop("clasp push failed.", (push.stderr || push.stdout || "").trim().split("\n").slice(-3).join("\n      "));
    const dep = clasp(["create-deployment", "-i", cfg.deployId, "-d", "v" + cfg.appVersion + " " + head.slice(0, 7)]);
    if (dep.status !== 0) stop("The new backend version was pushed but not deployed.", (dep.stderr || dep.stdout || "").trim().split("\n").slice(-3).join("\n      "));
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
  // Asked until it answers that nothing is left to add. Right after a deploy a
  // request can still land on the old version, whose migrate adds nothing and
  // says ok (seen on 2026-11-18: the new columns only went in on a second call).
  let added = [];
  let settled = false;
  for (let i = 0; i < 6 && !settled; i++) {
    const r = await call(cfg.apiUrl, env.CHI_KEY, "migrate");
    if (!r || r.ok !== true) stop("migrate did not succeed (" + ((r && (r.message || r.error)) || "no answer") + ").", "The site was NOT published.");
    const now = (r.data && r.data.added) || [];
    added = added.concat(now);
    settled = i > 0 && now.length === 0;
    if (!settled) await sleep(5000);
  }
  if (!settled) stop("migrate kept adding columns after six calls.", "Look at the Sheet. The site was NOT published.");
  step("backend: migrate ran" + (added.length ? ", added " + added.join(", ") : ", nothing to add"));
}
const load = await call(cfg.apiUrl, env.CHI_KEY, "load").catch(() => null);
if (!load || load.ok !== true || !Array.isArray(load.data.days) || !load.data.days.length || !Array.isArray(load.data.stops)) {
  stop("The live trip does not load (" + ((load && (load.message || load.error)) || "no answer") + ").", "The site was NOT published. Fix or roll back the backend first.");
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
  await page.goto(SITE + "?k=" + env.CHI_KEY, { waitUntil: "load", timeout: 45000 });
  await page.waitForSelector("#phone", { timeout: 20000 });
  await sleep(4000);
} catch (e) {
  errors.push("the page did not start: " + String(e.message || e).split("\n")[0].replace(env.CHI_KEY, "(key)"));
} finally {
  await browser.close();
}
if (errors.length) stop("The live site started with " + errors.length + " error(s): " + errors.slice(0, 3).join(" | "), "This is live now. Fix forward or revert the commit and ship again.");
step("live site starts with no script error");

console.log("\nship: DONE. Version " + cfg.appVersion + " (" + head.slice(0, 7) + ") is live, backend " + want + ". Record it in the ledger and MEMORY.md.");
