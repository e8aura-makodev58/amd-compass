import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("WP10 shared control room exposes live state and demo controls", async () => {
  const root = new URL("../../frontend/", import.meta.url);
  const [html, app, css] = await Promise.all(["index.html", "app.js", "styles.css"].map((file) => readFile(new URL(file, root), "utf8")));
  for (const label of ["Live Floor", "Live Simulation", "Offline Demo", "Demo", "Agent activity", "Simulation overrides", "Trigger Next Event", "Force Resolve", "Analytics"]) assert.match(html, new RegExp(label));
  for (const endpoint of ["/simulation/force-event", "/force-resolve", "/assignments/override", "/mode"]) assert.match(app, new RegExp(endpoint));
  assert.match(app, /OFFER_PENDING/);
  assert.match(app, /A rejection automatically advances/);
  assert.match(app, /COMPASS_RECOMMENDATION/);
  assert.match(app, /⚡ Compass disagreement/);
  assert.match(app, /setInterval/);
  assert.match(css, /\.simulation-bar/);
  assert.match(css, /\.agent-activity-indicator/);
  assert.match(css, /\.demo-view/);
  assert.match(css, /\.feed-event\.disagreement/);
});

test("event feed opens a per-issue audit trail covering analysis, dispatch, and outcome", async () => {
  const root = new URL("../../frontend/", import.meta.url);
  const [app, css] = await Promise.all(["app.js", "styles.css"].map((file) => readFile(new URL(file, root), "utf8")));
  assert.match(app, /data-feed-event-id/);
  assert.match(app, /showingAuditTrail/);
  assert.match(app, /Selected event/);
  assert.match(app, /Full issue chronology/);
  assert.match(app, /Return to current view/);
  for (const section of ["Dispatch outcome", "Compass analysis", "Response and resolution", "Action taken"]) assert.match(app, new RegExp(section));
  assert.match(app, /aria-label="View details for/);
  assert.match(app, /requestSequence !== auditRequestSequence/);
  assert.match(app, /issueAuditSignature/);
  assert.match(css, /\.audit-card/);
  assert.match(css, /\.event-detail-summary/);
  assert.match(css, /\.feed-event\.selected/);
});

test("two-responder controls expose roles, support matching, transfer impact, and staffing audit history", async () => {
  const app = await readFile(new URL("../../frontend/app.js", import.meta.url), "utf8");
  for (const text of ["Request second responder", "of 2 responders", "PRIMARY", "SUPPORT", "source returns to 1 of 2", "Staffing chronology"]) assert.match(app, new RegExp(text, "i"));
  for (const endpoint of ["/assistance", "/release", "/assignments/transfer"]) assert.match(app, new RegExp(endpoint.replaceAll("/", "\\/")));
});
