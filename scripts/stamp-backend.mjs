// Writes BACKEND_STAMP in backend/Stamp.js: a short hash of every backend
// file. The live backend answers a plain GET with it, so a release can tell
// whether the backend that is live is the backend in this commit, and refuse
// to publish the phone side ahead of it. `npm run stamp` runs this.
//
// tests/release.test.js fails when the stamp no longer matches the files.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, backendHash, writtenBackendStamp } from "./release-lib.mjs";

const before = writtenBackendStamp();
const now = backendHash();
if (before === now) {
  console.log("backend already stamped " + now);
} else {
  writeFileSync(
    join(ROOT, "backend", "Stamp.js"),
    "// Written by scripts/stamp-backend.mjs (npm run stamp). Do not edit.\n" +
      'var BACKEND_STAMP = "' + now + '";\n'
  );
  console.log("backend stamped " + now + " (was " + (before || "nothing") + ")");
}
