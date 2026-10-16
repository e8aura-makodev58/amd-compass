import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { setHtml } from "../../frontend/render-lifecycle.js";

const frontendRoot = new URL("../../frontend/", import.meta.url);

/**
 * Minimal stand-in for a panel element. `render-lifecycle.js` deliberately never
 * touches the global `document` — it reaches the document via
 * `element.ownerDocument` — so the helper can be exercised here with no browser.
 * `writes` counts real innerHTML assignments so a skipped write is observable.
 */
function stubElement({ selects = [], activeElement = null, contains = false } = {}) {
  const element = {
    writes: 0,
    _html: "",
    get innerHTML() { return this._html; },
    set innerHTML(value) { this.writes += 1; this._html = value; },
    ownerDocument: { activeElement },
    contains: () => contains,
    querySelectorAll: () => selects,
    querySelector: (selector) => selects.find((entry) => `#${entry.id}` === selector) ?? null,
  };
  return element;
}

function stubSelect(id, value, optionValues) {
  return { id, value, options: optionValues.map((entry) => ({ value: entry })), focus() { this.focused = true; } };
}

test("an identical write is skipped entirely", () => {
  const element = stubElement();
  assert.equal(setHtml(element, "<p>same</p>"), true);
  assert.equal(element.writes, 1);
  assert.equal(setHtml(element, "<p>same</p>"), false);
  assert.equal(element.writes, 1, "an identical write must not touch innerHTML");
});

test("a changed write updates the element and advances the cache", () => {
  const element = stubElement();
  setHtml(element, "<p>first</p>");
  assert.equal(setHtml(element, "<p>second</p>"), true);
  assert.equal(element.writes, 2);
  assert.equal(element.innerHTML, "<p>second</p>");
  assert.equal(setHtml(element, "<p>second</p>"), false, "the cache must advance to the newest write");
});

test("each element is cached independently", () => {
  const first = stubElement();
  const second = stubElement();
  setHtml(first, "<p>shared</p>");
  assert.equal(setHtml(second, "<p>shared</p>"), true, "a different element must not read another's cache");
  assert.equal(second.writes, 1);
});

test("a select value survives a changed write when the option still exists", () => {
  const before = stubSelect("live-override-select", "R-TECH216", ["", "R-TECH216", "R-ENGR104"]);
  const after = stubSelect("live-override-select", "", ["", "R-TECH216", "R-ENGR104"]);
  // Pre-write scan sees the select holding the operator's choice; after the
  // write the panel has been rebuilt, so lookups resolve to the fresh select.
  const element = stubElement({ selects: [before] });
  setHtml(element, "<p>first</p>");
  element.querySelector = (selector) => (selector === "#live-override-select" ? after : null);
  setHtml(element, "<p>second</p>");
  assert.equal(after.value, "R-TECH216", "the operator's in-progress choice must survive a re-render");
});

test("a select value is NOT restored when its option has disappeared", () => {
  const before = stubSelect("live-override-select", "R-TECH216", ["", "R-TECH216"]);
  const after = stubSelect("live-override-select", "", ["", "R-ENGR104"]);
  const element = stubElement({ selects: [before] });
  setHtml(element, "<p>first</p>");
  element.querySelector = (selector) => (selector === "#live-override-select" ? after : null);
  setHtml(element, "<p>second</p>");
  assert.equal(after.value, "", "a responder who became ineligible must not be silently re-selected");
});

test("focus is restored to the identified element that held it", () => {
  const focused = stubSelect("live-override-select", "", [""]);
  const element = stubElement({ selects: [focused], activeElement: { id: "live-override-select" }, contains: true });
  setHtml(element, "<p>first</p>");
  setHtml(element, "<p>second</p>");
  assert.equal(focused.focused, true);
});

test("an out-of-band innerHTML write leaves the cache stale, which is why every write must use the helper", () => {
  // perform()'s error path must go through the helper. If it writes innerHTML
  // directly, the cache goes stale and the next identical panel render is
  // skipped, leaving the error frozen on screen.
  const element = stubElement();
  setHtml(element, "<p>panel</p>");
  element.innerHTML = "<p class='load-error'>Compass request failed</p>";
  assert.equal(setHtml(element, "<p>panel</p>"), false, "documents the staleness the app must avoid by routing every write through setHtml");
  assert.equal(element.innerHTML, "<p class='load-error'>Compass request failed</p>");
});

test("control-room panel writes and bindings go through the render lifecycle", async () => {
  const app = await readFile(new URL("app.js", frontendRoot), "utf8");
  assert.match(app, /import \{ setHtml \} from "\.\/render-lifecycle\.js"/);
  assert.match(app, /setHtml\(/);

  // Every polled panel write must be idempotent, or the 1.5s tick destroys
  // in-progress operator input.
  assert.doesNotMatch(app, /elements\["recommendation-panel"\]\.innerHTML\s*=/);
  assert.doesNotMatch(app, /elements\["baseline-panel"\]\.innerHTML\s*=/);
  assert.doesNotMatch(app, /elements\["issue-summary"\]\.innerHTML\s*=/);
  assert.doesNotMatch(app, /elements\["issue-list"\]\.innerHTML\s*=/);
  assert.doesNotMatch(app, /elements\.floor\.innerHTML\s*=/);
  assert.match(app, /applyCamera\(\);/);

  // Because writes can now be skipped, addEventListener on a surviving node
  // would stack a duplicate handler every tick. Bindings must be assignments.
  assert.doesNotMatch(app, /select\.addEventListener/);
  assert.doesNotMatch(app, /override\.addEventListener/);
  assert.match(app, /select\.onchange =/);
  assert.match(app, /override\.onclick =/);

  // The button state must be derived, not trusted from markup that may not be
  // what is on screen after a preserved-value restore.
  assert.match(app, /override\.disabled = !select\.value;/);

  // Long-running model calls and asynchronous responder offers are first-class
  // states; neither requires a human confirmation button.
  assert.match(app, /recommendation\.status === "PENDING_MODEL"/);
  assert.match(app, /Recommendation in progress/);
  assert.match(app, /issue\.status === "OFFER_PENDING"/);
  assert.match(app, /Offer sent to/);
  assert.doesNotMatch(app, /live-confirm-button/);

  // The poll must survive, guarded rather than removed.
  assert.match(app, /setInterval/);
  assert.match(app, /pointerdown/);
  assert.match(app, /pointercancel/);
});
