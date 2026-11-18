// The gate every release passes before anything is published:
//
//   npm run gate            everything, and a receipt for this exact tree
//   npm run gate -- --quick everything but the browser tests; no receipt
//
// It stops at the first thing that is wrong and says what to do. The receipt
// (in .git/chi-gate/, never committed) is what `npm run ship` and the push
// check ask for: no receipt for the commit, no release.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, backendHash, config, git, gitOk, needsBump, readConfig, receiptDir, writtenBackendStamp } from "./release-lib.mjs";
import { scanTree } from "./scan.mjs";
import { readSw, shellHash, shellList, writtenVersion } from "./stamp-sw.mjs";

const quick = process.argv.includes("--quick");
const step = (s) => console.log("gate: " + s);
const stop = (why, fix) => {
  console.error("\ngate: STOPPED. " + why + (fix ? "\n      " + fix : ""));
  process.exit(1);
};

// 1. Nothing uncommitted: the receipt is for a commit, not for a working copy.
if (git(["status", "--porcelain"])) stop("There are uncommitted changes.", "Commit them (or stash them) and run the gate again.");
const head = git(["rev-parse", "HEAD"]);
const tree = git(["rev-parse", "HEAD^{tree}"]);
step("commit " + head.slice(0, 7));

// 2. Both stamps match the files.
if (shellHash() !== writtenVersion(readSw())) stop("sw.js is not stamped for these files.", "Run `npm run stamp`, commit, and run the gate again.");
if (backendHash() !== writtenBackendStamp()) stop("backend/Stamp.js is not stamped for these files.", "Run `npm run stamp`, commit, and run the gate again.");
step("stamps match");

// 3. What the phones run has a new version number, and nothing is lost.
const cfg = readConfig();
if (gitOk(["rev-parse", "--verify", "origin/main"])) {
  if (!gitOk(["merge-base", "--is-ancestor", "origin/main", "HEAD"])) {
    stop("This commit does not contain what is published (origin/main).", "Merge or rebase onto origin/main first.");
  }
  const changed = git(["diff", "--name-only", "origin/main", "HEAD"]).split("\n").filter(Boolean);
  const was = config(git(["show", "origin/main:js/config.js"])).appVersion;
  if (needsBump(changed, shellList()) && !(Number(cfg.appVersion) > Number(was))) {
    stop("Files the phones run have changed but APP_VERSION is still " + cfg.appVersion + ".",
      "Raise APP_VERSION in js/config.js, run `npm run stamp`, commit, and run the gate again.");
  }
  step("version " + cfg.appVersion + " (published: " + was + "), " + changed.length + " files changed");
} else {
  step("no origin/main here: version check skipped");
}

// 4. Nothing private in a public repository.
const found = scanTree();
if (found.length) {
  for (const f of found) console.error("gate: " + f.file + ":" + f.line + "  " + f.rule);
  stop("The private-data scan found " + found.length + " problem(s).", "Take them out of the tracked files.");
}
step("nothing private in the tracked files");

// 5. Unit tests, then the browser tests, alone.
const dir = receiptDir();
mkdirSync(dir, { recursive: true });
function run(name, cmd, args) {
  step(name + " running (log: " + join(dir, name + ".log") + ")");
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const text = (r.stdout || "") + (r.stderr || "");
  writeFileSync(join(dir, name + ".log"), text);
  return { code: r.status, text };
}

const unit = run("unit", "npm", ["test"]);
const unitPass = Number((unit.text.match(/^(?:#|ℹ) pass (\d+)/m) || [])[1] || 0);
const unitFail = Number((unit.text.match(/^(?:#|ℹ) fail (\d+)/m) || [])[1] || 0);
if (unit.code !== 0 || unitFail || !unitPass) stop("Unit tests: " + unitPass + " passed, " + unitFail + " failed.", "See " + join(dir, "unit.log"));
step("unit tests: " + unitPass + " passed");

if (quick) {
  console.log("\ngate: quick run passed. No receipt: run `npm run gate` before a release.");
  process.exit(0);
}

// The runner waits in line by itself (tests/e2e/queue.cjs), so nothing to check here.
const e2e = run("e2e", "node", ["tests/e2e/run.cjs"]);
const m = e2e.text.match(/^(\d+) passed, (\d+) failed$/m);
const secondTry = e2e.text.split("\n").filter((l) => l.startsWith("second try: ")).map((l) => l.slice(12));
const e2ePass = m ? Number(m[1]) : 0;
const e2eFail = m ? Number(m[2]) : 0;
if (e2e.code !== 0 || e2eFail || !e2ePass) {
  const fails = e2e.text.split("\n").filter((l) => l.startsWith("FAIL ")).slice(0, 12).join("\n      ");
  stop("Browser tests: " + e2ePass + " passed, " + e2eFail + " failed.", (fails || "No summary line: the run did not finish.") + "\n      See " + join(dir, "e2e.log"));
}
step("browser tests: " + e2ePass + " passed");
if (secondTry.length) step("UNRELIABLE, passed only on a second try (fix these): " + secondTry.join("; "));

// 6. The receipt. The tree must still be the one that was tested.
if (git(["status", "--porcelain"]) || git(["rev-parse", "HEAD^{tree}"]) !== tree) stop("The files changed while the tests ran.", "Run the gate again.");
const receipt = {
  tree,
  head,
  at: new Date().toISOString(),
  appVersion: cfg.appVersion,
  backendStamp: writtenBackendStamp(),
  unit: { pass: unitPass, fail: unitFail },
  e2e: { pass: e2ePass, fail: e2eFail, secondTry },
};
writeFileSync(join(dir, tree + ".json"), JSON.stringify(receipt, null, 2) + "\n");
console.log("\ngate: PASSED for " + head.slice(0, 7) + " (version " + cfg.appVersion + "): " + unitPass + " unit, " + e2ePass + " browser. Next: `npm run ship`.");
