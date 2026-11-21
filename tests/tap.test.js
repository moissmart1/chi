import test from "node:test";
import assert from "node:assert/strict";
import { tapOnRelease } from "../js/views/tap.js";

function gesture() {
  const listeners = new Map();
  const actions = [];
  const target = { isConnected: true, id: "stop" };
  const host = { addEventListener: (name, fn) => listeners.set(name, fn) };
  const tap = tapOnRelease(host, { pick: el => el.id, act: id => actions.push(id) });
  function fire(type, changes = {}) {
    listeners.get(type)({ target, pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, ...changes });
  }
  return { tap, target, actions, fire };
}

test("a replaced target gets one action on release and consumes its pointer click", () => {
  const { tap, target, actions, fire } = gesture();
  fire("pointerdown");
  target.isConnected = false;
  fire("pointerup", { clientX: 9 });
  fire("pointerup");
  assert.deepEqual(actions, ["stop"]);
  assert.equal(tap.skip({ detail: 1 }), true);
  assert.equal(tap.skip({ detail: 1 }), false);
});

test("connected targets keep their native click and keyboard clicks always pass", () => {
  for (const connected of [true, false]) {
    const { tap, target, actions, fire } = gesture();
    fire("pointerdown");
    target.isConnected = connected;
    fire("pointerup");
    assert.equal(tap.skip({ detail: connected ? 1 : 0 }), false);
    assert.equal(actions.length, connected ? 0 : 1);
  }
});

test("ignores secondary buttons and pointers, drags, cancellations and cleared gestures", () => {
  for (const [down, up, end] of [
    [{ button: 2 }, {}], [{ isPrimary: false }, {}], [{}, { pointerId: 2 }],
    [{}, { clientX: 6, clientY: 8 }], [{}, {}, "cancel"], [{}, {}, "clear"],
  ]) {
    const { tap, target, actions, fire } = gesture();
    fire("pointerdown", down);
    target.isConnected = false;
    if (end === "cancel") fire("pointercancel");
    if (end === "clear") tap.clear();
    fire("pointerup", up);
    assert.deepEqual(actions, []);
  }
});
