// git's pre-push check (scripts/hooks/pre-push; `npm run hooks` turns it on).
// A push goes out only when it is main, the commit has the gate's receipt,
// and the live backend is already that commit's backend. `npm run ship` does
// those in order; this is what stops a push made any other way.

import { config, git, judgePush, liveStamp, readReceipt, stampIn } from "./release-lib.mjs";

const here = process.cwd();
let input = "";
for await (const chunk of process.stdin) input += chunk;

const show = (sha, path) => {
  try {
    return git(["show", sha + ":" + path], here);
  } catch {
    return "";
  }
};

for (const line of input.split("\n").filter(Boolean)) {
  const [, localSha, remoteRef] = line.split(" ");
  const zero = /^0+$/.test(localSha);
  const commitStamp = zero ? "" : stampIn(show(localSha, "backend/Stamp.js"));
  const why = judgePush({
    remoteRef,
    localSha,
    receipt: zero ? null : readReceipt(git(["rev-parse", localSha + "^{tree}"], here), here),
    commitStamp,
    live: commitStamp ? await liveStamp(config(show(localSha, "js/config.js")).apiUrl) : "",
  });
  if (why) {
    console.error("\npush refused: " + why + "\n");
    process.exit(1);
  }
}
