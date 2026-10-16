import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readFrontendCss } from "./helpers/frontend-css.mjs";

test("WP12 analytics UI renders all P0 panels and denominator safeguards", async () => {
  const root = new URL("../../frontend/", import.meta.url);
  const [app, css] = await Promise.all([readFile(new URL("app.js", root), "utf8"), readFrontendCss()]);
  for (const label of ["Compass vs Baselines", "Equipment", "Responder issue-response summary", "Issue-Class Experience", "Insufficient data"]) assert.match(app, new RegExp(label));
  assert.match(app, /metric\.denominator/);
  assert.match(app, /currentOngoingDowntimeMinutes/);
  assert.match(app, /not an employee ranking/);
  assert.match(css, /\.experience-matrix/);
  assert.doesNotMatch(css, /performance-heatmap/);
});

test("analytics dashboard keeps three bounded period bar charts grounded in public operational evidence", async () => {
  const root = new URL("../../frontend/", import.meta.url);
  const app = await readFile(new URL("app.js", root), "utf8");
  for (const label of ["Recorded simulated activity", "past 12 hours", "past 7 days", "past 4 weeks", "past 3 months", "Issues raised", "Issues resolved", "Aggregate downtime", "Disagreed with both", "Drill-down", "not a forecast", "Equipment directory", "Needs attention", "stable ID order"]) assert.match(app, new RegExp(label));
  assert.match(app, /operationalTimeline/);
  assert.match(app, /analyticsPeriodLevel = "DAY"/);
  assert.match(app, /data-analytics-level/);
  assert.match(app, /--period-count/);
  assert.match(app, /data-analytics-equipment/);
  assert.match(app, /data-analytics-drill/);
  assert.match(app, /data-analytics-measure/);
  assert.match(app, /analyticsEquipmentPage/);
  assert.match(app, /focusAnalyticsDrill/);
  assert.doesNotMatch(app, /ResponderSkill/);
});
