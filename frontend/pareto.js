/**
 * Issue Pareto panel: which issue types or locations account for most issues, downtime
 * and failed fix attempts in one analytics period. A Pareto bar chart (sorted bars with a
 * cumulative-share line) and a pie of the same breakdown; clicking a bar, slice or row
 * drills from issue class to observed symptom to applied fix (or floor to station).
 * Data: GET /analytics/pareto (public records only; see pareto-analytics.mjs).
 */
const MEASURES = {
  count: { label: "Issues", fixLabel: "Fix attempts", format: (value) => String(Math.round(value)) },
  downtimeMinutes: { label: "Downtime", fixLabel: "Attempt minutes", format: (value) => value >= 600 ? `${(value / 60).toFixed(0)} h` : `${value.toFixed(0)} min` },
  failedAttempts: { label: "Failed attempts", fixLabel: "Failed attempts", format: (value) => String(Math.round(value)) },
};
const LEVEL_LABELS = { DAY: "Day", WEEK: "Week", MONTH: "Month" };
const PLURALS = { "Issue class": "issue classes", "Observed symptom": "observed symptoms", "Applied fix": "applied fixes", Floor: "floors", Station: "stations" };
const MAX_BARS = 12;
const MAX_SLICES = 6;
const REFRESH_MS = 15_000;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function periodLabel(period, level) {
  const start = new Date(period.start);
  const day = (date) => date.toISOString().slice(0, 10);
  const text = level === "MONTH" ? start.toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" })
    : level === "WEEK" ? `Week of ${day(start)}` : day(start);
  return period.status === "PARTIAL" ? `${text} (in progress)` : period.status === "INSUFFICIENT_HISTORY" ? `${text} (incomplete history)` : text;
}

/** Sort by the measure and fold the tail into "Other" so the chart stays readable. */
export function paretoRows(nodes, measure, limit) {
  const rows = nodes.map((node) => ({ ...node, value: node[measure] ?? 0 })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const shown = rows.length > limit ? rows.slice(0, limit - 1) : rows;
  if (rows.length > limit) {
    const rest = rows.slice(limit - 1);
    shown.push({ key: "__other", label: `Other (${rest.length})`, value: rest.reduce((sum, row) => sum + row.value, 0), children: [], other: true });
  }
  let running = 0;
  return { total, rows: shown.map((row) => { running += row.value; return { ...row, share: total ? row.value / total : 0, cumulative: total ? running / total : 0 }; }) };
}

function barChart({ rows, total }, format, measureLabel) {
  const width = 760, height = 344, left = 58, right = 46, top = 22, bottom = 100;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const max = Math.max(...rows.map((row) => row.value), 1);
  const slot = plotWidth / Math.max(rows.length, 1), barWidth = Math.min(64, slot * .68);
  const y = (value) => top + plotHeight - (value / max) * plotHeight;
  const yShare = (share) => top + plotHeight - share * plotHeight;
  const ticks = [0, .25, .5, .75, 1];
  const bars = rows.map((row, index) => {
    const x = left + slot * index + (slot - barWidth) / 2;
    const name = row.label.length > 26 ? `${row.label.slice(0, 25)}…` : row.label;
    const drill = row.children?.length && !row.other;
    return `<g class="pareto-bar${drill ? " drillable" : ""}" ${drill ? `data-pareto-drill="${escapeHtml(row.key)}" tabindex="0" role="button"` : ""} aria-label="${escapeHtml(`${row.label}: ${format(row.value)} (${(row.share * 100).toFixed(1)}%)`)}">
      <rect x="${x.toFixed(1)}" y="${y(row.value).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${(top + plotHeight - y(row.value)).toFixed(1)}" rx="3"></rect>
      <text class="pareto-value" x="${(x + barWidth / 2).toFixed(1)}" y="${(y(row.value) - 5).toFixed(1)}" text-anchor="middle">${escapeHtml(format(row.value))}</text>
      <text class="pareto-label" transform="translate(${(x + barWidth / 2).toFixed(1)} ${top + plotHeight + 12}) rotate(-32)" text-anchor="end">${escapeHtml(name)}</text>
      <title>${escapeHtml(row.label)}</title></g>`;
  }).join("");
  const points = rows.map((row, index) => `${(left + slot * index + slot / 2).toFixed(1)},${yShare(row.cumulative).toFixed(1)}`).join(" ");
  const dots = rows.map((row, index) => `<circle cx="${(left + slot * index + slot / 2).toFixed(1)}" cy="${yShare(row.cumulative).toFixed(1)}" r="3.5"></circle>`).join("");
  const grid = ticks.map((tick) => `<line class="pareto-grid" x1="${left}" x2="${width - right}" y1="${yShare(tick).toFixed(1)}" y2="${yShare(tick).toFixed(1)}"></line><text class="pareto-axis" x="${left - 8}" y="${(yShare(tick) + 4).toFixed(1)}" text-anchor="end">${escapeHtml(format(max * tick))}</text><text class="pareto-axis" x="${width - right + 8}" y="${(yShare(tick) + 4).toFixed(1)}">${tick * 100}%</text>`).join("");
  return `<svg class="pareto-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pareto chart of ${escapeHtml(measureLabel)}, ${rows.length} categories, total ${escapeHtml(format(total))}">
    ${grid}<line class="pareto-eighty" x1="${left}" x2="${width - right}" y1="${yShare(.8).toFixed(1)}" y2="${yShare(.8).toFixed(1)}"></line><text class="pareto-eighty-label" x="${width - right - 4}" y="${(yShare(.8) - 5).toFixed(1)}" text-anchor="end">80%</text>
    ${bars}<polyline class="pareto-line" points="${points}"></polyline><g class="pareto-dots">${dots}</g></svg>`;
}

function pieChart({ rows, total }, format) {
  const size = 240, radius = 104, inner = 58, centre = size / 2;
  let angle = -Math.PI / 2;
  const point = (r, a) => `${(centre + r * Math.cos(a)).toFixed(2)} ${(centre + r * Math.sin(a)).toFixed(2)}`;
  const slices = rows.map((row, index) => {
    const sweep = Math.min(row.share * Math.PI * 2, Math.PI * 2 - 1e-4), end = angle + sweep, large = sweep > Math.PI ? 1 : 0;
    const path = `M ${point(radius, angle)} A ${radius} ${radius} 0 ${large} 1 ${point(radius, end)} L ${point(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, angle)} Z`;
    angle = end;
    const drill = row.children?.length && !row.other;
    return `<path class="pareto-slice slice-${index}${drill ? " drillable" : ""}" d="${path}" ${drill ? `data-pareto-drill="${escapeHtml(row.key)}" tabindex="0" role="button"` : ""} aria-label="${escapeHtml(`${row.label}: ${(row.share * 100).toFixed(1)}%`)}"><title>${escapeHtml(`${row.label}: ${format(row.value)}`)}</title></path>`;
  }).join("");
  const legend = rows.map((row, index) => `<li><i class="slice-${index}"></i><span>${escapeHtml(row.label)}</span><strong>${(row.share * 100).toFixed(1)}%</strong></li>`).join("");
  return `<div class="pareto-pie"><svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Share of total, ${rows.length} slices">${slices}<text class="pareto-pie-total" x="${centre}" y="${centre - 2}" text-anchor="middle">${escapeHtml(format(total))}</text><text class="pareto-pie-caption" x="${centre}" y="${centre + 16}" text-anchor="middle">total</text></svg><ul class="pareto-legend">${legend}</ul></div>`;
}

export function initParetoPanel(container, { roomApi, isVisible }) {
  const view = { level: "MONTH", period: null, dimension: "type", measure: "count", path: [], data: null, error: null, loading: false };
  let timer = null, lastPayload = null;

  async function load() {
    if (view.loading) return;
    view.loading = true;
    try {
      const query = new URLSearchParams({ level: view.level, ...(view.period === null ? {} : { period: String(view.period) }) });
      const data = await roomApi(`/analytics/pareto?${query}`);
      if (data.available === false) throw new Error("Pareto analytics are available in Live mode.");
      // A background refresh that changes nothing must not re-render under the operator.
      const payload = JSON.stringify(data);
      view.error = null;
      if (payload === lastPayload) return;
      lastPayload = payload; view.data = data;
    } catch (error) { view.error = error.message; view.data = null; lastPayload = null; }
    finally { view.loading = false; }
    render();
  }

  function currentNodes() {
    let nodes = view.data.dimensions[view.dimension].nodes;
    const trail = [];
    for (const key of view.path) {
      const node = nodes.find((entry) => entry.key === key);
      if (!node) { view.path = trail.map((entry) => entry.key); break; }
      trail.push(node); nodes = node.children;
    }
    return { nodes, trail };
  }

  function render() {
    if (!view.data) { container.innerHTML = `<p class="workflow-prompt">${escapeHtml(view.error ?? "Loading the issue Pareto…")}</p>`; return; }
    const dimension = view.data.dimensions[view.dimension];
    const { nodes, trail } = currentNodes();
    const depth = trail.length;
    const atFixLevel = view.dimension === "type" && depth === 2;
    const measure = MEASURES[view.measure];
    const measureLabel = atFixLevel ? measure.fixLabel : measure.label;
    const bars = paretoRows(nodes, view.measure, MAX_BARS);
    const pie = paretoRows(nodes, view.measure, MAX_SLICES);
    const levelName = dimension.levels[Math.min(depth, dimension.levels.length - 1)];
    const top = bars.rows.filter((row) => !row.other);
    const vital = top.findIndex((row) => row.cumulative >= .8) + 1;
    const present = nodes.filter((node) => (node[view.measure] ?? 0) > 0).length;
    const insight = bars.total && vital ? `${vital} of ${present} ${PLURALS[levelName] ?? levelName.toLowerCase()} account for 80% of ${measureLabel.toLowerCase()}.` : "";
    const period = view.data.period;
    const crumbs = [`<button type="button" data-pareto-crumb="0">${escapeHtml(dimension.label)}</button>`, ...trail.map((node, index) => `<span aria-hidden="true">›</span><button type="button" data-pareto-crumb="${index + 1}" ${index === trail.length - 1 ? 'aria-current="true"' : ""}>${escapeHtml(node.label)}</button>`)].join("");
    const tableRows = bars.rows.map((row, index) => `<tr><td>${index + 1}</td><td>${row.children?.length && !row.other ? `<button type="button" class="link-button" data-pareto-drill="${escapeHtml(row.key)}">${escapeHtml(row.label)}</button>` : escapeHtml(row.label)}</td><td>${escapeHtml(measure.format(row.value))}</td><td>${(row.share * 100).toFixed(1)}%</td><td>${(row.cumulative * 100).toFixed(1)}%</td></tr>`).join("");
    container.innerHTML = `
      <div class="pareto-heading"><div><p class="eyebrow">Where the problems come from</p><h3 id="pareto-heading">Issue Pareto</h3></div>
        <div class="pareto-controls">
          <div class="segmented" role="group" aria-label="Pareto period length">${Object.entries(LEVEL_LABELS).map(([level, label]) => `<button type="button" data-pareto-level="${level}" aria-pressed="${view.level === level}">${label}</button>`).join("")}</div>
          <label>Period<select id="pareto-period">${view.data.periods.map((entry) => `<option value="${entry.index}" ${entry.index === period.index ? "selected" : ""}>${escapeHtml(periodLabel(entry, view.data.level))}</option>`).join("")}</select></label>
          <div class="segmented" role="group" aria-label="Group by">${Object.entries(view.data.dimensions).map(([key, entry]) => `<button type="button" data-pareto-dimension="${key}" aria-pressed="${view.dimension === key}">${escapeHtml(entry.label)}</button>`).join("")}</div>
          <div class="segmented" role="group" aria-label="Measure">${Object.entries(MEASURES).map(([key, entry]) => `<button type="button" data-pareto-measure="${key}" aria-pressed="${view.measure === key}">${escapeHtml(entry.label)}</button>`).join("")}</div>
        </div></div>
      <nav class="pareto-crumbs" aria-label="Pareto drill-down">${crumbs}<span class="pareto-level">· by ${escapeHtml(levelName.toLowerCase())}</span></nav>
      ${bars.rows.length ? `<p class="pareto-insight">${escapeHtml(insight)} Total: ${escapeHtml(measure.format(bars.total))} ${escapeHtml(measureLabel.toLowerCase())}, ${escapeHtml(periodLabel(period, view.data.level))}.${depth < dimension.levels.length - 1 ? " Select a bar, slice or row to drill down." : ""}</p>
      <div class="pareto-charts">${barChart(bars, measure.format, measureLabel)}${pieChart(pie, measure.format)}</div>
      <div class="evidence-scroll"><table class="analytics-table pareto-table"><thead><tr><th>#</th><th>${escapeHtml(levelName)}</th><th>${escapeHtml(measureLabel)}</th><th>Share</th><th>Cumulative</th></tr></thead><tbody>${tableRows}</tbody></table></div>`
      : `<p class="workflow-prompt">No ${escapeHtml(measureLabel.toLowerCase())} recorded for this selection in ${escapeHtml(periodLabel(period, view.data.level))}.</p>`}
      <p class="workflow-prompt">${escapeHtml(view.data.definitions[view.measure])} ${escapeHtml(view.data.definitions.privacy)}</p>`;
  }

  container.addEventListener("click", (event) => {
    const target = event.target.closest("[data-pareto-level], [data-pareto-dimension], [data-pareto-measure], [data-pareto-drill], [data-pareto-crumb]");
    if (!target) return;
    if (target.dataset.paretoLevel) { view.level = target.dataset.paretoLevel; view.period = null; view.path = []; load(); return; }
    if (target.dataset.paretoDimension) { view.dimension = target.dataset.paretoDimension; view.path = []; }
    else if (target.dataset.paretoMeasure) view.measure = target.dataset.paretoMeasure;
    else if (target.dataset.paretoDrill) view.path = [...view.path, target.dataset.paretoDrill];
    else view.path = view.path.slice(0, Number(target.dataset.paretoCrumb));
    render();
  });
  container.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("g[data-pareto-drill], path[data-pareto-drill]")) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  });
  container.addEventListener("change", (event) => {
    if (event.target.id !== "pareto-period") return;
    view.period = Number(event.target.value); view.path = []; load();
  });

  return {
    /** Load now and keep refreshing while visible; the period data changes slowly. */
    show() { load(); clearInterval(timer); timer = setInterval(() => { if (isVisible()) load(); }, REFRESH_MS); },
    hide() { clearInterval(timer); timer = null; },
  };
}
