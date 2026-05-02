/* analytics.js — Phase 5 Advanced Analytics & Forecasting */

const ANALYTICS_VERSION = "20260407a";

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  wireTabBar();
  await loadDashboard();
});

// ---------------------------------------------------------------------------
// Tab bar wiring
// ---------------------------------------------------------------------------
function wireTabBar() {
  const tabs = document.querySelectorAll(".analytics-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");

      document.querySelectorAll(".analytics-panel").forEach((p) => p.classList.remove("is-visible"));
      const panelId = "panel-" + tab.dataset.tab;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add("is-visible");

      // Lazy-load each panel on first activation
      if (tab.dataset.tab === "cashflow" && !tab.dataset.loaded) {
        tab.dataset.loaded = "1";
        loadCashFlow();
      } else if (tab.dataset.tab === "seasonal" && !tab.dataset.loaded) {
        tab.dataset.loaded = "1";
        loadSeasonal();
      } else if (tab.dataset.tab === "whatif" && !tab.dataset.loaded) {
        tab.dataset.loaded = "1";
        wireWhatIf();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
  try {
    const res = await apiFetch("/api/analytics/dashboard");
    if (!res || !res.ok) throw new Error("Failed");
    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    const kpiRowEl = document.getElementById("kpiRow");
    if (kpiRowEl) kpiRowEl.innerHTML = '<div class="analytics-empty">Unable to load dashboard data. Add some transactions to get started.</div>';
  }
}

function renderDashboard(data) {
  const { summary, monthly_breakdown, top_income_sources, top_expense_categories, current_month } = data;

  // KPI cards
  const kpiRow = document.getElementById("kpiRow");
  if (!kpiRow) return;
  const isCA = summary.region === "CA";
  const seTaxLabel = isCA ? "Est. CPP Contribution" : "Est. SE Tax Owed";
  const seTaxNote = isCA ? "Canada Pension Plan (self-employed)" : "Self-employment tax (approx.)";
  const cards = [
    kpiCard("Total Income", fmt(summary.total_income), "trailing 12 months"),
    kpiCard("Total Expenses", fmt(summary.total_expense), "trailing 12 months"),
    kpiCard("Net Profit", fmt(summary.net), summary.net >= 0 ? "trailing 12 months" : "trailing 12 months", summary.net >= 0 ? "" : "kpi-value--negative")
  ];
  if (summary.has_tax_estimates) {
    cards.push(kpiCard(seTaxLabel, fmt(summary.se_tax_estimate ?? 0), seTaxNote));
  }
  kpiRow.innerHTML = cards.join("");

  // This Month card
  if (current_month) renderThisMonth(current_month);

  // 12-month trend sparkline
  if (monthly_breakdown && monthly_breakdown.length) {
    renderTrendChart(monthly_breakdown);
  }

  // Monthly breakdown table
  if (monthly_breakdown && monthly_breakdown.length) {
    const tbody = document.getElementById("monthlyTableBody");
    const activeMonthLabel = current_month?.label || "";
    tbody.innerHTML = monthly_breakdown.map((m) => {
      const netClass = m.net >= 0 ? "net-positive" : "net-negative";
      const activeClass = m.month === activeMonthLabel ? " projection-row--active" : "";
      return `<tr class="projection-row${activeClass}">
        <td>${escapeHtml(m.month)}</td>
        <td>${fmt(m.income)}</td>
        <td>${fmt(m.expense)}</td>
        <td class="${netClass}">${fmt(m.net)}</td>
      </tr>`;
    }).join("");
    document.getElementById("monthlyCard").hidden = false;
  }

  // Top income sources bar chart
  if (top_income_sources && top_income_sources.length) {
    const maxIncome = Math.max(...top_income_sources.map((s) => s.total), 1);
    const topIncomeChart = document.getElementById("topIncomeChart");
    topIncomeChart.innerHTML = top_income_sources.map((s) => barRow(s.category, s.total, maxIncome, "income")).join("");
    document.getElementById("topIncomeCard").hidden = false;
  }

  // Top expense categories bar chart
  if (top_expense_categories && top_expense_categories.length) {
    const maxExpense = Math.max(...top_expense_categories.map((s) => s.total), 1);
    const topExpenseChart = document.getElementById("topExpenseChart");
    topExpenseChart.innerHTML = top_expense_categories.map((s) => barRow(s.category, s.total, maxExpense, "expense")).join("");
    document.getElementById("topExpenseCard").hidden = false;
  }
}

// ---------------------------------------------------------------------------
// This Month card
// ---------------------------------------------------------------------------
function renderThisMonth(cm) {
  const card = document.getElementById("thisMonthCard");
  const grid = document.getElementById("thisMonthGrid");
  const label = document.getElementById("thisMonthLabel");
  const progress = document.getElementById("thisMonthProgress");
  if (!card || !grid) return;

  label.textContent = `${escapeHtml(cm.title || "This Month")} (${escapeHtml(cm.label)})`;
  if (cm.title === "Latest Active Month") {
    progress.textContent = "Most recent month with recorded income";
  } else {
    progress.textContent = `${cm.days_elapsed} of ${cm.days_in_month} days`;
  }

  function pctBadge(pct, inverse) {
    if (pct === 0) return "";
    const positive = inverse ? pct < 0 : pct > 0;
    const cls = positive ? "pct-badge--up" : "pct-badge--down";
    const sign = pct > 0 ? "+" : "";
    return `<span class="pct-badge ${cls}">${sign}${pct}%</span>`;
  }

  grid.innerHTML = [
    `<div class="this-month-item">
      <div class="this-month-val income">${fmt(cm.income)}</div>
      <div class="this-month-key">Income ${pctBadge(cm.income_vs_prior_pct, false)}</div>
    </div>`,
    `<div class="this-month-item">
      <div class="this-month-val expense">${fmt(cm.expense)}</div>
      <div class="this-month-key">Expenses ${pctBadge(cm.expense_vs_prior_pct, true)}</div>
    </div>`,
    `<div class="this-month-item">
      <div class="this-month-val ${cm.net >= 0 ? "net-pos" : "net-neg"}">${fmt(cm.net)}</div>
      <div class="this-month-key">Net ${pctBadge(cm.net_vs_prior_pct, false)}</div>
    </div>`
  ].join("");

  card.hidden = false;
}

// ---------------------------------------------------------------------------
// SVG sparkline trend chart
// ---------------------------------------------------------------------------
function renderTrendChart(months) {
  const card = document.getElementById("trendCard");
  const svg = document.getElementById("trendChart");
  if (!card || !svg || !months.length) return;

  const W = 600;
  const H = 120;
  const PAD = { top: 10, right: 16, bottom: 28, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1);
  const n = months.length;

  function xPos(i) {
    return PAD.left + (i / (n - 1)) * chartW;
  }
  function yPos(v) {
    return PAD.top + chartH - (v / maxVal) * chartH;
  }
  function polyline(points) {
    return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  }

  const incomePoints = months.map((m, i) => [xPos(i), yPos(m.income)]);
  const expensePoints = months.map((m, i) => [xPos(i), yPos(m.expense)]);

  // Y-axis ticks
  const tickCount = 4;
  let yTicks = "";
  for (let t = 0; t <= tickCount; t++) {
    const val = (maxVal / tickCount) * t;
    const y = yPos(val).toFixed(1);
    yTicks += `<line x1="${PAD.left - 4}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3 3"/>`;
    yTicks += `<text x="${PAD.left - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" class="chart-tick">${fmtCompact(val)}</text>`;
  }

  // X-axis month labels (every 3rd to avoid overlap)
  let xLabels = "";
  months.forEach((m, i) => {
    if (i % 3 === 0 || i === n - 1) {
      const x = xPos(i).toFixed(1);
      const short = m.month.slice(5);
      xLabels += `<text x="${x}" y="${H - 4}" text-anchor="middle" class="chart-tick">${escapeHtml(short)}</text>`;
    }
  });

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.innerHTML = `
    <g class="chart-grid">${yTicks}</g>
    <g class="chart-labels">${xLabels}</g>
    <polyline class="chart-line chart-line--expense" points="${polyline(expensePoints)}" fill="none" stroke="var(--color-expense,#e74c3c)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline class="chart-line chart-line--income" points="${polyline(incomePoints)}" fill="none" stroke="var(--color-income,#27ae60)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${incomePoints.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="chart-dot chart-dot--income"><title>${escapeHtml(months[i].month)}: ${fmt(months[i].income)}</title></circle>`).join("")}
  `;

  card.hidden = false;
}

function fmtCompact(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toFixed(0);
}

function kpiCard(label, value, note, extraClass) {
  return `<div class="kpi-card">
    <div class="kpi-label">${escapeHtml(label)}</div>
    <div class="kpi-value${extraClass ? ` ${escapeHtml(extraClass)}` : ""}">${escapeHtml(value)}</div>
    ${note ? `<div class="kpi-note">${escapeHtml(note)}</div>` : ""}
  </div>`;
}

function barRow(label, value, max, type) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="bar-row">
    <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
    <div class="bar-track"><div class="bar-fill ${escapeHtml(type)} ${resolveBarPctClass(pct)}"></div></div>
    <span class="bar-amount">${fmt(value)}</span>
  </div>`;
}

function resolveBarPctClass(pct) {
  const rounded = Math.max(0, Math.min(100, Math.round(Number(pct || 0) / 5) * 5));
  return `pct-${rounded}`;
}

// ---------------------------------------------------------------------------
// Cash Flow Projection
// ---------------------------------------------------------------------------
async function loadCashFlow() {
  const container = document.getElementById("cashFlowContent");
  container.innerHTML = '<div class="analytics-loading">Loading…</div>';
  try {
    const res = await apiFetch("/api/analytics/cash-flow");
    if (!res || !res.ok) throw new Error("Failed");
    const data = await res.json();
    renderCashFlow(data, container);
  } catch {
    container.innerHTML = '<div class="analytics-empty">Unable to load cash flow data. Add some transactions to get started.</div>';
  }
}

function renderCashFlow(data, container) {
  const { avg_monthly_income, avg_monthly_expense, recurring_monthly_expense, projections } = data;

  let html = `<div class="kpi-row kpi-row--spaced">
    ${kpiCard("Avg Monthly Income", fmt(avg_monthly_income), "trailing 6 months")}
    ${kpiCard("Avg Monthly Expenses", fmt(avg_monthly_expense), "trailing 6 months")}
    ${kpiCard("Recurring Expenses", fmt(recurring_monthly_expense), "estimated per month")}
  </div>`;

  // Risk notifications
  const risks = projections.filter((p) => p.risk_notification);
  if (risks.length) {
    html += risks.map((p) => `<div class="risk-alert">⚠️ ${escapeHtml(p.risk_notification)}</div>`).join("");
  }

  // Projection table
  html += `<table class="monthly-table monthly-table--spaced">
    <thead><tr><th>Month</th><th>Projected Income</th><th>Projected Expenses</th><th>Projected Net</th></tr></thead>
    <tbody>
      ${projections.map((p) => {
        const cls = p.projected_net >= 0 ? "net-positive" : "net-negative";
        return `<tr class="projection-row">
          <td>${escapeHtml(p.month)}</td>
          <td>${fmt(p.projected_income)}</td>
          <td>${fmt(p.projected_expense)}</td>
          <td class="${cls}">${fmt(p.projected_net)}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>`;

  container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Seasonal Income Analysis
// ---------------------------------------------------------------------------
async function loadSeasonal() {
  const container = document.getElementById("seasonalContent");
  container.innerHTML = '<div class="analytics-loading">Loading…</div>';
  try {
    const res = await apiFetch("/api/analytics/seasonal");
    if (!res || !res.ok) throw new Error("Failed");
    const data = await res.json();
    renderSeasonal(data, container);
  } catch {
    container.innerHTML = '<div class="analytics-empty">Unable to load seasonal data. Add some income transactions to get started.</div>';
  }
}

function renderSeasonal(data, container) {
  const { months, overall_avg, insights } = data;

  if (!months || months.length === 0) {
    container.innerHTML = '<div class="analytics-empty">No income data yet. Add income transactions to see seasonal trends.</div>';
    return;
  }

  // Insights list
  let html = "";
  if (insights && insights.length) {
    html += `<div class="insight-list">
      ${insights.map((i) => `<div class="insight-item">💡 ${escapeHtml(i)}</div>`).join("")}
    </div>`;
  }

  // Heatmap grid — colour intensity based on deviation from mean
  const maxAvg = Math.max(...months.map((m) => m.avg_income), 1);
  html += '<div class="heatmap">';
  for (const m of months) {
    const level = heatLevel(m.avg_income, overall_avg, m.deviation_pct);
    html += `<div class="heatmap-cell ${level}" title="${escapeHtml(m.insight || "")}">
      <div class="heatmap-month">${escapeHtml(m.month_name.slice(0, 3))}</div>
      <div class="heatmap-avg">${fmt(m.avg_income)}</div>
      ${m.deviation_pct !== 0 ? `<div class="heatmap-insight">${m.deviation_pct > 0 ? "+" : ""}${m.deviation_pct.toFixed(0)}%</div>` : ""}
    </div>`;
  }
  html += "</div>";

  // Per-month insight callouts
  const callouts = months.filter((m) => m.insight);
  if (callouts.length) {
    html += `<div class="insight-list insight-list--spaced">
      ${callouts.map((m) => `<div class="insight-item">📅 ${escapeHtml(m.insight)}</div>`).join("")}
    </div>`;
  }

  container.innerHTML = html;
}

function heatLevel(avg, overall, pct) {
  if (pct <= -10) return "level-low";
  if (avg <= 0) return "level-0";
  const ratio = avg / overall;
  if (ratio >= 1.3) return "level-4";
  if (ratio >= 1.1) return "level-3";
  if (ratio >= 0.9) return "level-2";
  return "level-1";
}

// ---------------------------------------------------------------------------
// What-If Scenario
// ---------------------------------------------------------------------------
function wireWhatIf() {
  document.getElementById("whatifRunBtn")?.addEventListener("click", runWhatIf);
}

async function runWhatIf() {
  const incomePct = parseFloatOrNull(document.getElementById("wiIncomePct")?.value);
  const expensePct = parseFloatOrNull(document.getElementById("wiExpensePct")?.value);
  const weeksOff = parseFloatOrNull(document.getElementById("wiWeeksOff")?.value);
  const customIncome = parseFloatOrNull(document.getElementById("wiCustomIncome")?.value);

  const body = {};
  if (incomePct !== null) body.income_change_pct = incomePct;
  if (expensePct !== null) body.expense_change_pct = expensePct;
  if (weeksOff !== null) body.weeks_off = weeksOff;
  if (customIncome !== null) body.custom_income = customIncome;

  const resultsEl = document.getElementById("whatifResults");
  const messagesEl = document.getElementById("whatifMessages");
  const tableEl = document.getElementById("whatifTable");
  resultsEl.classList.remove("visible");

  try {
    const res = await apiFetch("/api/analytics/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res || !res.ok) throw new Error("Failed");
    const data = await res.json();
    renderWhatIf(data, messagesEl, tableEl);
    resultsEl.classList.add("visible");
  } catch {
    messagesEl.innerHTML = '<span class="whatif-error">Unable to run scenario. Please try again.</span>';
    resultsEl.classList.add("visible");
  }
}

function renderWhatIf(data, messagesEl, tableEl) {
  const { baseline, scenario, messages } = data;

  messagesEl.innerHTML = messages.map((m) => `<div class="whatif-msg">• ${escapeHtml(m)}</div>`).join("") ||
    '<div class="whatif-msg">No changes applied. Adjust the inputs and run again.</div>';

  const netClass = scenario.net_delta >= 0 ? "whatif-net-positive" : "whatif-net-negative";
  tableEl.innerHTML = [
    scenarioRow("Monthly Income", baseline.monthly_income, scenario.projected_income, "income"),
    scenarioRow("Monthly Expenses", baseline.monthly_expense, scenario.projected_expense, "expense"),
    scenarioRow("Monthly Net", baseline.monthly_net, scenario.projected_net, scenario.projected_net >= 0 ? "income" : "expense")
  ].join("");
}

function scenarioRow(label, base, projected, type) {
  const delta = projected - base;
  const deltaClass = type === "income"
    ? (delta >= 0 ? "net-positive" : "net-negative")
    : (delta <= 0 ? "net-positive" : "net-negative");
  const sign = delta >= 0 ? "+" : "";
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td>${fmt(base)}</td>
    <td>${fmt(projected)}</td>
    <td class="${deltaClass}">${sign}${fmt(delta)}</td>
  </tr>`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function fmt(value) {
  const n = Number(value) || 0;
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

function parseFloatOrNull(str) {
  if (str === "" || str === undefined || str === null) return null;
  const n = Number.parseFloat(str);
  return Number.isFinite(n) ? n : null;
}
