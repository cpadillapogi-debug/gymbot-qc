/* ============================================================
   GYMBOT QC — PRICING PAGE ENTRY POINT (Phase 11)
   Public, unauthenticated page. Renders plan cards and a feature
   comparison table straight from SUBSCRIPTION_PLANS /
   PLAN_FEATURE_ROWS in config.js — the same records
   subscription-service.js bills against — so this page can never
   drift from what the app actually charges. See docs/PHASE11_NOTES.md.
   ============================================================ */
import { SUBSCRIPTION_PLANS, PLAN_FEATURE_ROWS } from "./config.js";
import { escapeHtml } from "./utils.js";

const PHP = new Intl.NumberFormat("en-PH");

function renderPlanCards(){
  const host = document.getElementById("pricingPlanCards");
  if(!host) return;
  host.innerHTML = SUBSCRIPTION_PLANS.map(plan => `
    <article class="price-card ${plan.id === "pro" ? "featured" : ""}">
      <h3>${escapeHtml(plan.name)}</h3>
      <div class="price">₱${PHP.format(plan.priceMonthly)}<span>/mo</span></div>
      <p class="help-text" style="margin:0 0 8px;">${escapeHtml(plan.blurb)}</p>
      <ul>
        ${PLAN_FEATURE_ROWS.map(row => {
          const val = plan.features[row.key];
          if(val === false) return "";
          return `<li>${escapeHtml(row.label)}${typeof val === "string" ? ` — ${escapeHtml(val)}` : ""}</li>`;
        }).join("")}
      </ul>
      <a href="onboarding.html?plan=${encodeURIComponent(plan.id)}" class="btn ${plan.id === "pro" ? "btn-primary" : "btn-ghost"}">Start free trial</a>
    </article>
  `).join("");
}

function renderCompareTable(){
  const table = document.getElementById("pricingCompareTable");
  if(!table) return;
  table.innerHTML = `
    <thead>
      <tr>
        <th>Feature</th>
        ${SUBSCRIPTION_PLANS.map(p => `<th>${escapeHtml(p.name)}<br><span class="help-text">₱${PHP.format(p.priceMonthly)}/mo</span></th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${PLAN_FEATURE_ROWS.map(row => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          ${SUBSCRIPTION_PLANS.map(p => {
            const val = p.features[row.key];
            const cell = val === true ? "✓" : val === false ? "—" : escapeHtml(String(val));
            return `<td>${cell}</td>`;
          }).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

try{
  renderPlanCards();
  renderCompareTable();
}catch(err){
  console.error("GymBot QC pricing page failed to initialize:", err);
}
