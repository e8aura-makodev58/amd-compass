import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const frontendRoot = new URL("../../frontend/", import.meta.url);

test("WP6 recommendation panel renders server-owned evidence and decision affordances", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("index.html", frontendRoot), "utf8"),
    readFile(new URL("app.js", frontendRoot), "utf8"),
  ]);
  assert.match(html, /id="recommendation-panel"/);
  assert.match(app, /Eligible responder evidence/);
  assert.match(app, /sameIssueHistoricalCount/);
  assert.match(app, /evidenceStrengthLabel/);
  assert.match(app, /medianResolutionMinutes/);
  assert.match(app, /successRate/);
  assert.match(app, /travelTimeMinutes/);
  assert.match(app, /top\.tradeoff/);
  assert.match(app, /Offer sent to/);
  assert.match(app, /Central command override/);
  assert.match(app, /Override dispatch/);
  assert.match(app, /A rejection automatically advances/);
  assert.match(app, /is-loading/);
  const styles = await readFile(new URL("styles.css", frontendRoot), "utf8");
  assert.match(styles, /button:disabled[^}]*cursor: not-allowed/);
  assert.match(styles, /button\.is-loading[^}]*cursor: wait/);
});
