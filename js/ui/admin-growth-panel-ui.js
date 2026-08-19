/* ============================================================
   GYMBOT QC — MASTER ADMIN: GROWTH ANALYTICS PANEL (Phase 16)
   Rendering + wiring only — real data from
   admin-growth-analytics-service.js. Mounted on the Overview
   page — see admin-overview-page-ui.js.

   Hand-rolled inline SVG bars, not a charting library — this
   codebase has zero npm dependencies and no build step (see
   README.md's architecture notes), so pulling in Chart.js etc.
   would be the first external dependency in the whole project.
   A dozen-line bar renderer is enough for this data shape.
   ============================================================ */
import { escapeHtml } from "../utils.js";
import { getGrowthSeries, getRangeLabel, GROWTH_RANGES } from "../services/admin-growth-analytics-service.js";

const PHP = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
let currentRange = GROWTH_RANGES.DAYS_30;

export function renderGrowthPanel(root){
  if(!root) return;

  root.innerHTML = `
    <div class="owner-panel-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <h3 style="margin:0;">Platform growth</h3>
      <div class="owner-leads-toolbar" style="padding:0;">
        <select id="growthRangeSelect" aria-label="Date range">
          ${Object.values(GROWTH_RANGES).map(r => `<option value="${r}" ${r === currentRange ? "selected" : ""}>${escapeHtml(getRangeLabel(r))}</option>`).join("")}
        </select>
      </div>
    </div>
    <div id="growthChartsHost"></div>
  `;

  document.getElementById("growthRangeSelect").addEventListener("change", e => {
    currentRange = e.target.value;
    renderCharts();
  });

  renderCharts();
}

function renderCharts(){
  const host = document.getElementById("growthChartsHost");
  if(!host) return;

  const series = getGrowthSeries(currentRange);

  if(series.totalNewGyms === 0 && series.totalApprovedAmount === 0){
    host.innerHTML = `
      <div class="empty-state">
        No new gyms or approved payments in this period yet.
        Charts will fill in as real activity happens — nothing here is simulated.
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <div class="owner-metric-grid" style="margin-bottom:14px;">
      <div class="owner-metric-card">
        <div class="owner-metric-num">${series.totalNewGyms}</div>
        <div class="owner-metric-label">New gyms — ${escapeHtml(getRangeLabel(currentRange).toLowerCase())}</div>
      </div>
      <div class="owner-metric-card">
        <div class="owner-metric-num">₱${PHP.format(series.totalApprovedAmount)}</div>
        <div class="owner-metric-label">Approved payments — ${escapeHtml(getRangeLabel(currentRange).toLowerCase())}</div>
      </div>
    </div>
    <div class="owner-settings-grid cols-2">
      <div>
        <div class="owner-activity-meta" style="margin-bottom:4px;">New gyms per period</div>
        ${renderBarChart(series.labels, series.newGyms, v => String(v))}
      </div>
      <div>
        <div class="owner-activity-meta" style="margin-bottom:4px;">Approved payments (₱) per period</div>
        ${renderBarChart(series.labels, series.approvedPaymentsAmount, v => `₱${PHP.format(v)}`)}
      </div>
    </div>
  `;
}

/**
 * @param {string[]} labels
 * @param {number[]} values
 * @param {(v:number)=>string} formatValue for the <title> tooltip
 * @returns {string} inline SVG markup
 */
function renderBarChart(labels, values, formatValue){
  const width = 320;
  const height = 120;
  const barGap = 2;
  const barWidth = Math.max(2, width / values.length - barGap);
  const max = Math.max(1, ...values); // avoid divide-by-zero when every bucket is 0

  const bars = values.map((v, i) => {
    const barHeight = Math.round((v / max) * (height - 18));
    const x = i * (barWidth + barGap);
    const y = height - barHeight - 14;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, v > 0 ? 2 : 0)}" fill="var(--purple)" rx="1">
        <title>${escapeHtml(labels[i])}: ${escapeHtml(formatValue(v))}</title>
      </rect>
    `;
  }).join("");

  // Show first/last labels only — showing all would overlap on a 30/90-day range.
  const firstLabel = labels[0] || "";
  const lastLabel = labels[labels.length - 1] || "";

  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px;" role="img" aria-label="Bar chart">
      ${bars}
      <text x="0" y="${height - 2}" font-size="9" fill="var(--text-faint)">${escapeHtml(firstLabel)}</text>
      <text x="${width}" y="${height - 2}" font-size="9" fill="var(--text-faint)" text-anchor="end">${escapeHtml(lastLabel)}</text>
    </svg>
  `;
}
