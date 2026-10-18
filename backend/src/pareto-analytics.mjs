/**
 * Issue Pareto: which categories account for most issues, downtime and failed fix
 * attempts in one analytics period. Built only from observed, public records (issue
 * class, the issue's public symptom, the applied catalog fix, station and floor). The
 * private fault cause and ResponderSkill are never read here.
 */
import { analyticHistory } from "./history-retention.mjs";
import { MAX_PERIODS_BY_LEVEL, observedHistoryStart, periodBounds, priorPeriod } from "./analytics-service.mjs";

export const PARETO_LEVELS = ["DAY", "WEEK", "MONTH"];
export const ISSUE_CLASS_LABELS = { A: "Process output", B: "Material transfer", C: "Mechanism motion" };
const UNRECORDED_SYMPTOM = "UNRECORDED";

function node(key, label) { return { key, label, count: 0, downtimeMinutes: 0, failedAttempts: 0, children: new Map() }; }
function child(parent, key, label) { return parent.children.get(key) ?? parent.children.set(key, node(key, label)).get(key); }
function finish(map) {
  return [...map.values()].map(({ children, ...rest }) => ({ ...rest, children: finish(children) }))
    .sort((a, b) => b.count - a.count || b.downtimeMinutes - a.downtimeMinutes || a.key.localeCompare(b.key));
}
function periodStatus(bounds, snapshotMs, historyStartMs) {
  return bounds.start < historyStartMs ? "INSUFFICIENT_HISTORY" : bounds.end > snapshotMs ? "PARTIAL" : "COMPLETE";
}

export function buildParetoAnalytics(rawState, { level = "MONTH", period } = {}) {
  if (!PARETO_LEVELS.includes(level)) throw Object.assign(new Error("Invalid Pareto period level"), { statusCode: 400 });
  const state = analyticHistory(rawState);
  const snapshotMs = Date.parse(state.simulationState.simulationTime);
  const historyStartMs = observedHistoryStart(state, snapshotMs);
  const periods = [];
  let bounds = periodBounds(state.simulationState.simulationTime, level);
  for (let index = 0; index < MAX_PERIODS_BY_LEVEL[level]; index += 1) {
    periods.push({ index, start: new Date(bounds.start).toISOString(), end: new Date(bounds.end).toISOString(), status: periodStatus(bounds, snapshotMs, historyStartMs) });
    bounds = priorPeriod(bounds, level);
  }
  // Default to the most recent complete period: a partial one under-states every bar.
  const requested = period === undefined || period === null || period === "" ? null : Number(period);
  if (requested !== null && !(Number.isInteger(requested) && requested >= 0 && requested < periods.length)) throw Object.assign(new Error("Invalid Pareto period"), { statusCode: 400 });
  const selected = periods[requested ?? Math.max(0, periods.findIndex((entry) => entry.status === "COMPLETE"))];
  const start = Date.parse(selected.start), end = Math.min(Date.parse(selected.end), snapshotMs);
  const inWindow = (timestamp) => { const ms = Date.parse(timestamp); return ms >= start && ms < end; };

  const equipment = new Map(state.equipment.map((row) => [row.id, row]));
  const type = node("ALL", "All issues"), location = node("ALL", "All issues");
  const symptomLabels = new Map();
  const classNode = (parent, issueClass) => child(parent, issueClass, `${ISSUE_CLASS_LABELS[issueClass] ?? "Class"} (Class ${issueClass})`);
  const symptomNode = (parent, code, text) => child(parent, code ?? UNRECORDED_SYMPTOM, code ? `${text ?? symptomLabels.get(code) ?? code}`.replace(/\.$/, "") : "Symptom not recorded (earlier records)");
  const stationNodes = (equipmentId) => {
    const row = equipment.get(equipmentId);
    const floor = child(location, `F${row?.floor ?? "?"}`, `Floor ${row?.floor ?? "unknown"}`);
    return [floor, child(floor, equipmentId, row?.name ?? equipmentId)];
  };
  for (const issue of state.issues) if (issue.symptom?.code) symptomLabels.set(issue.symptom.code, issue.symptom.text);

  let issueCount = 0, downtimeMinutes = 0, failedAttempts = 0, fixAttempts = 0;
  for (const issue of state.issues) {
    if (!inWindow(issue.raisedAt)) continue;
    const downStart = Math.max(start, Date.parse(issue.downtimeStartedAt ?? issue.raisedAt));
    const downEnd = Math.min(end, Date.parse(issue.resolvedAt ?? new Date(snapshotMs).toISOString()));
    const minutes = Number.isFinite(downStart) && downEnd > downStart ? (downEnd - downStart) / 60_000 : 0;
    const cls = classNode(type, issue.issueClass);
    for (const target of [type, cls, symptomNode(cls, issue.symptom?.code, issue.symptom?.text), location, ...stationNodes(issue.equipmentId)]) { target.count += 1; target.downtimeMinutes += minutes; }
    issueCount += 1; downtimeMinutes += minutes;
  }
  // Fix attempts completed in the window: failures roll up to the issue's category, and
  // the applied fix is the third level under its symptom (catalog fixes only).
  const issues = new Map(state.issues.map((issue) => [issue.id, issue]));
  for (const attempt of state.resolutionHistory ?? []) {
    if (!inWindow(attempt.resolvedAt)) continue;
    // Older attempt rows carry less detail; their issue record fills the gaps.
    const issue = issues.get(attempt.issueId);
    const issueClass = attempt.issueClass ?? issue?.issueClass;
    const equipmentId = attempt.equipmentId ?? issue?.equipmentId;
    if (!issueClass || !equipmentId) continue;
    const failed = attempt.success === false ? 1 : 0;
    const cls = classNode(type, issueClass);
    const symptom = symptomNode(cls, attempt.symptomCode ?? issue?.symptom?.code, issue?.symptom?.text);
    for (const target of [type, cls, symptom, location, ...stationNodes(equipmentId)]) target.failedAttempts += failed;
    failedAttempts += failed;
    if (attempt.fixApplied?.id && !attempt.legacyFix) {
      const fix = child(symptom, attempt.fixApplied.id, `${attempt.fixApplied.title} (${attempt.fixApplied.id})`);
      fix.count += 1; fix.downtimeMinutes += Number(attempt.resolutionMinutes) || 0; fix.failedAttempts += failed;
      fixAttempts += 1;
    }
  }
  return {
    level, snapshotSimulationTime: state.simulationState.simulationTime, period: selected, periods,
    totals: { issues: issueCount, downtimeMinutes, failedAttempts, fixAttempts },
    dimensions: {
      type: { label: "Issue type", levels: ["Issue class", "Observed symptom", "Applied fix"], nodes: finish(type.children) },
      location: { label: "Location", levels: ["Floor", "Station"], nodes: finish(location.children) },
    },
    definitions: {
      count: "Issues raised in the period. At the applied-fix level: completed fix attempts in the period.",
      downtimeMinutes: "Each issue's downtime minutes inside the period, summed per issue (overlapping issues on one station are each counted). At the applied-fix level: minutes spent on those attempts.",
      failedAttempts: "Completed attempts in the period that did not resolve the issue.",
      privacy: "Built from public symptoms, applied catalog fixes and locations only; hidden fault causes and responder skill are never used.",
    },
  };
}
