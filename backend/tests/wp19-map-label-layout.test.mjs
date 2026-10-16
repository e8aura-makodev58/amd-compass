import assert from "node:assert/strict";
import test from "node:test";
import { layoutProjectedLabels } from "../../frontend/map-label-layout.js";

test("projected 3D labels use clear vertical lanes above or below adjacent anchors", () => {
  const labels = [
    { id: "A", anchorX: 100, anchorY: 260, width: 90, height: 30 },
    { id: "B", anchorX: 125, anchorY: 260, width: 90, height: 30 },
    { id: "C", anchorX: 310, anchorY: 260, width: 90, height: 30 },
  ];
  const [first, second, distant] = layoutProjectedLabels(labels, { width: 500, height: 400 });

  assert.equal(first.placement, "above");
  assert.equal(second.placement, "above");
  assert.notEqual(first.top, second.top, "side-by-side labels use separate vertical lanes");
  assert.equal(first.top, distant.top, "distant labels can share a lane");
  assert.ok(first.top + first.height < first.anchorY);
  assert.ok(second.top + second.height < second.anchorY);
});

test("labels near the top use the clear space below their anchors", () => {
  const [label] = layoutProjectedLabels([{ id: "top", anchorX: 100, anchorY: 20, width: 90, height: 30 }], { width: 300, height: 260 });
  assert.equal(label.placement, "below");
  assert.ok(label.top > label.anchorY);
});

test("projected labels remain inside horizontal viewport padding", () => {
  const [left, right] = layoutProjectedLabels([
    { id: "left", anchorX: -20, anchorY: 200, width: 80, height: 24 },
    { id: "right", anchorX: 340, anchorY: 200, width: 80, height: 24 },
  ], { width: 320, height: 300 }, { padding: 10 });

  assert.equal(left.left, 10);
  assert.equal(right.left + right.width, 310);
});
