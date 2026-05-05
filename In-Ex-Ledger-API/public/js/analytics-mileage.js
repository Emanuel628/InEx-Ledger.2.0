/* Paid mileage analytics mixed into the dashboard.
   Basic accounts receive 404 from the backend and this file renders nothing. */

document.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(loadMileageAnalyticsCard, 0);
});

async function loadMileageAnalyticsCard() {
  if (typeof apiFetch !== "function") return;
  try {
    const res = await apiFetch("/api/analytics/mileage");
    if (!res || !res.ok) return;
    const data = await res.json();
    if (!data?.summary) return;
    renderMileageAnalyticsCard(data.summary);
  } catch (_) {
    // Hide completely for Basic accounts or failed optional loads.
  }
}

function renderMileageAnalyticsCard(summary) {
  const dashboardPanel = document.getElementById("panel-dashboard");
  const monthlyCard = document.getElementById("monthlyCard");
  if (!dashboardPanel) return;

  const existing = document.getElementById("mileageAnalyticsCard");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.className = "analytics-card";
  card.id = "mileageAnalyticsCard";
  card.innerHTML = `
    <h2>Mileage & Vehicle Costs</h2>
    <p>Distance driven and vehicle costs recorded so far.</p>
    <div class="kpi-row kpi-row--spaced mileage-analytics-grid">
      ${mileageMetricCard("Miles driven", formatDistance(summary.total_miles, "mi"), `${numberOrZero(summary.trip_count)} trips logged`)}
      ${mileageMetricCard("Kilometers driven", formatDistance(summary.total_km, "km"), "Converted and recorded distance")}
      ${mileageMetricCard("Vehicle costs", formatMoney(summary.total_vehicle_cost), `${formatMoney(summary.vehicle_expense_total)} expenses + ${formatMoney(summary.maintenance_total)} maintenance`)}
      ${mileageMetricCard("Cost per mile", summary.cost_per_mile === null ? "—" : formatMoney(summary.cost_per_mile), summary.cost_per_km === null ? "No distance yet" : `${formatMoney(summary.cost_per_km)} per km`)}
    </div>
    <div class="analytics-mileage-meta">
      ${summary.last_trip_date ? `<span>Last trip: ${escapeHtml(formatDateLabel(summary.last_trip_date))}</span>` : ""}
      ${summary.last_cost_date ? `<span>Last vehicle cost: ${escapeHtml(formatDateLabel(summary.last_cost_date))}</span>` : ""}
    </div>
  `;

  if (monthlyCard && monthlyCard.parentNode === dashboardPanel) {
    dashboardPanel.insertBefore(card, monthlyCard);
  } else {
    dashboardPanel.appendChild(card);
  }
}

function mileageMetricCard(label, value, note) {
  return `<div class="kpi-card">
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value">${escapeHtml(value)}</div>
    <div class="kpi-note">${escapeHtml(note || "")}</div>
  </div>`;
}

function numberOrZero(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function formatDistance(value, unit) {
  const n = Number(value || 0);
  const locale = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n)} ${unit}`;
}

function formatMoney(value) {
  const n = Number(value || 0);
  const rawRegion =
    (typeof localStorage !== "undefined" && (localStorage.getItem("lb_region") || localStorage.getItem("region"))) ||
    (typeof window !== "undefined" && window.LUNA_REGION) ||
    "";
  const currency = String(rawRegion).toLowerCase() === "ca" ? "CAD" : "USD";
  const locale = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(n));
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const locale = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
