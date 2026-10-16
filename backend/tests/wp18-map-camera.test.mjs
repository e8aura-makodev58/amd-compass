import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readFrontendCss } from "./helpers/frontend-css.mjs";

test("manufacturing map defaults to 2D with deliberate desktop pan, explicit zoom, and optional 2.5D controls", async () => {
  const root = new URL("../../frontend/", import.meta.url);
  const [html, app, css] = await Promise.all([...["index.html", "app.js"].map((file) => readFile(new URL(file, root), "utf8")), readFrontendCss()]);
  assert.match(html, /Manufacturing Floor/);
  assert.match(html, /class="floor view-2d"/);
  assert.match(html, /role="group"/);
  assert.doesNotMatch(html, /role="img"/);
  assert.match(app, /let viewMode = "2d"/);
  assert.match(app, /function applyCamera/);
  assert.match(app, /function renderProjectedLabels/);
  assert.match(app, /data-overlay-label/);
  assert.match(app, /layoutProjectedLabels/);
  // Labels are measured from live projected geometry, so they must keep
  // re-measuring until the camera settles or leader lines detach from nodes.
  assert.match(app, /scheduleProjectedLabelLayout\(CAMERA_SETTLE_MS\)/);
  assert.match(app, /data-select-floor/);
  assert.doesNotMatch(app, /addEventListener\("wheel"/);
  assert.doesNotMatch(app, /dblclick/);
  assert.match(app, /addEventListener\("pointermove"/);
  assert.match(app, /setPointerCapture/);
  assert.match(app, /mapSpacePressed/);
  assert.match(app, /event\.pointerType !== "mouse"/);
  assert.match(app, /window\.addEventListener\("blur", clearMapPanArming\)/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /ZOOM_MIN/);
  assert.match(app, /ZOOM_MAX/);
  assert.doesNotMatch(app, /class="building" style=/);
  assert.match(css, /\.floor\.view-2d \.floor-plane:not\(\.active-floor\)/);
  assert.match(css, /\.building-stage/);
  assert.match(css, /scale\(var\(--zoom/);
  assert.match(css, /cursor: grabbing/);
  assert.match(css, /\.floor\.is-pan-armed/);
  assert.match(css, /@media \(min-width: 901px\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.map-label-layer/);
  assert.match(css, /--leader-height/);
  assert.match(css, /data-label-placement="below"/);
});
