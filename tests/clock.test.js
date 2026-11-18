import test from "node:test";
import assert from "node:assert/strict";
import { createClock } from "../js/clock.js";
import { nowIn } from "../js/plan.js";

test("the demo clock starts at 07:00 on the chosen day, runs fast and holds at 23:30", () => {
  let real = 1000;
  const told = [];
  const clock = createClock({ now: () => real, getTz: () => "America/Chicago" });
  clock.subscribe(() => told.push(clock.demoDay()));
  assert.equal(clock.now(), 1000);
  clock.start("2026-12-28");
  assert.deepEqual(nowIn("America/Chicago", clock.now()), { date: "2026-12-28", minutes: 420 });
  real += 30000; // 30 real seconds is one trip hour
  assert.equal(nowIn("America/Chicago", clock.now()).minutes, 480);
  real += 3600000;
  assert.deepEqual(nowIn("America/Chicago", clock.now()), { date: "2026-12-28", minutes: 23 * 60 + 30 });
  clock.stop();
  assert.equal(clock.now(), real);
  assert.deepEqual(told, ["2026-12-28", null]);
});

test("holding is true only once a demo has reached its end of day", () => {
  let t = Date.parse("2026-12-01T03:00:00Z");
  const clock = createClock({ now: () => t, getTz: () => "America/Chicago" });
  assert.equal(clock.holding(), false, "no demo");
  clock.start("2026-12-28");
  assert.equal(clock.holding(), false);
  t += 4 * 60000;
  assert.equal(clock.holding(), false);
  t += 5 * 60000;
  assert.equal(clock.holding(), true);
  clock.stop();
  assert.equal(clock.holding(), false);
});
