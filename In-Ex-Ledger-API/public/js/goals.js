/* goals.js — Phase 5 Goal-Based Financial Tracking */

const GOALS_TOAST_MS = 3000;
let goalsToastTimer = null;
let goalsList = [];
let editingGoalId = null;

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  await loadGoals();
  wireGoalModal();
  document.getElementById("addGoalBtn")?.addEventListener("click", openNewGoalModal);
});

// ---------------------------------------------------------------------------
// Load & render goals
// ---------------------------------------------------------------------------
async function loadGoals() {
  const grid = document.getElementById("goalsGrid");
  grid.innerHTML = '<div class="goals-loading">Loading goals…</div>';
  try {
    const res = await apiFetch("/api/goals");
    if (!res || !res.ok) throw new Error("Failed");
    goalsList = await res.json();
    renderGoalsGrid();
  } catch {
    grid.innerHTML = '<div class="goals-empty">Unable to load goals. Please refresh.</div>';
  }
}

function renderGoalsGrid() {
  const grid = document.getElementById("goalsGrid");

  if (!goalsList.length) {
    grid.innerHTML = `<div class="goals-empty">
      No goals yet. Tap <strong>+ New Goal</strong> to get started.<br>
      Track savings for taxes, vacation, purchases, and more.
    </div>`;
    return;
  }

  grid.innerHTML = goalsList.map((g) => renderGoalCard(g)).join("");

  // Wire edit / delete / quick-update buttons
  grid.querySelectorAll("[data-goal-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEditGoalModal(btn.getAttribute("data-goal-edit")));
  });
  grid.querySelectorAll("[data-goal-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteGoal(btn.getAttribute("data-goal-delete")));
  });
  grid.querySelectorAll("[data-goal-update-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-goal-update-save");
      const input = document.querySelector(`[data-goal-update-input="${id}"]`);
      if (input) quickUpdateProgress(id, input.value);
    });
  });
}

function renderGoalCard(g) {
  const pct = g.progress_pct;
  const isComplete = pct >= 100 || g.status === "completed";
  const fillClass = isComplete ? "complete" : "";
  const statusClass = g.status;

  const suggestion = g.suggestion?.message
    ? `<div class="goal-suggestion">💡 ${escapeHtml(g.suggestion.message)}</div>`
    : "";

  const dateLine = g.target_date
    ? `<div class="goal-date">Target: ${escapeHtml(g.target_date)}</div>`
    : "";

  return `<div class="goal-card" id="goal-card-${escapeHtml(g.id)}">
    <div class="goal-card-header">
      <span class="goal-name">${escapeHtml(g.name)}</span>
      <div style="display:flex;gap:5px;align-items:center">
        <span class="goal-badge ${escapeHtml(g.category)}">${escapeHtml(g.category)}</span>
        <span class="goal-status ${statusClass}">${escapeHtml(g.status)}</span>
      </div>
    </div>

    ${g.description ? `<p style="font-size:12px;color:var(--ink3);margin-bottom:8px">${escapeHtml(g.description)}</p>` : ""}

    <div class="goal-amounts">
      <span>Saved: <strong>${fmtAmt(g.current_amount)}</strong></span>
      <span>Target: <strong>${fmtAmt(g.target_amount)}</strong></span>
    </div>

    <div class="goal-progress-track">
      <div class="goal-progress-fill ${fillClass}" style="width:${pct}%"></div>
    </div>
    <div class="goal-pct">${pct}% complete</div>

    ${suggestion}
    ${dateLine}

    <div class="goal-update-row">
      <input type="number" class="goal-update-input" data-goal-update-input="${escapeHtml(g.id)}"
             placeholder="Update saved amount" min="0" step="0.01" value="${escapeHtml(String(g.current_amount))}" />
      <button type="button" class="goal-update-save" data-goal-update-save="${escapeHtml(g.id)}">Update</button>
    </div>

    <div class="goal-actions">
      <button type="button" class="goal-edit-btn" data-goal-edit="${escapeHtml(g.id)}">Edit</button>
      <button type="button" class="goal-delete-btn" data-goal-delete="${escapeHtml(g.id)}">Delete</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Quick progress update
// ---------------------------------------------------------------------------
async function quickUpdateProgress(id, rawValue) {
  const amount = Number.parseFloat(rawValue);
  if (!Number.isFinite(amount) || amount < 0) {
    showGoalsToast("Please enter a valid amount.");
    return;
  }

  try {
    const res = await apiFetch(`/api/goals/${encodeURIComponent(id)}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_amount: amount })
    });
    if (!res || !res.ok) throw new Error("Failed");
    const updated = await res.json();
    goalsList = goalsList.map((g) => (g.id === id ? updated : g));
    renderGoalsGrid();
    showGoalsToast("Progress updated!");
  } catch {
    showGoalsToast("Failed to update progress. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Modal wiring
// ---------------------------------------------------------------------------
function wireGoalModal() {
  document.getElementById("goalModalCancel")?.addEventListener("click", closeGoalModal);
  document.getElementById("goalModalOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeGoalModal();
  });
  document.getElementById("goalModalSave")?.addEventListener("click", saveGoal);
}

function openNewGoalModal() {
  editingGoalId = null;
  clearGoalForm();
  document.getElementById("goalModalTitle").textContent = "New Goal";
  document.getElementById("goalModalOverlay").classList.remove("hidden");
}

function openEditGoalModal(id) {
  const goal = goalsList.find((g) => g.id === id);
  if (!goal) return;
  editingGoalId = id;
  document.getElementById("goalModalTitle").textContent = "Edit Goal";
  document.getElementById("goalName").value = goal.name || "";
  document.getElementById("goalDescription").value = goal.description || "";
  document.getElementById("goalTarget").value = goal.target_amount || "";
  document.getElementById("goalCurrent").value = goal.current_amount || "";
  document.getElementById("goalDate").value = goal.target_date || "";
  document.getElementById("goalCategory").value = goal.category || "savings";
  document.getElementById("goalStatus").value = goal.status || "active";
  document.getElementById("goalModalError").textContent = "";
  document.getElementById("goalModalOverlay").classList.remove("hidden");
}

function closeGoalModal() {
  document.getElementById("goalModalOverlay").classList.add("hidden");
  editingGoalId = null;
}

function clearGoalForm() {
  document.getElementById("goalName").value = "";
  document.getElementById("goalDescription").value = "";
  document.getElementById("goalTarget").value = "";
  document.getElementById("goalCurrent").value = "0";
  document.getElementById("goalDate").value = "";
  document.getElementById("goalCategory").value = "savings";
  document.getElementById("goalStatus").value = "active";
  document.getElementById("goalModalError").textContent = "";
}

async function saveGoal() {
  const name = document.getElementById("goalName").value.trim();
  const description = document.getElementById("goalDescription").value.trim();
  const target_amount = document.getElementById("goalTarget").value;
  const current_amount = document.getElementById("goalCurrent").value || "0";
  const target_date = document.getElementById("goalDate").value || null;
  const category = document.getElementById("goalCategory").value;
  const status = document.getElementById("goalStatus").value;

  const errorEl = document.getElementById("goalModalError");
  errorEl.textContent = "";

  if (!name) { errorEl.textContent = "Goal name is required."; return; }
  if (!target_amount) { errorEl.textContent = "Target amount is required."; return; }

  const payload = { name, description: description || null, target_amount, current_amount, target_date, category, status };

  try {
    const url = editingGoalId ? `/api/goals/${encodeURIComponent(editingGoalId)}` : "/api/goals";
    const method = editingGoalId ? "PUT" : "POST";
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res || !res.ok) {
      const err = await res?.json().catch(() => null);
      errorEl.textContent = err?.error || "Failed to save goal.";
      return;
    }

    const saved = await res.json();
    if (editingGoalId) {
      goalsList = goalsList.map((g) => (g.id === editingGoalId ? saved : g));
    } else {
      goalsList = [saved, ...goalsList];
    }

    closeGoalModal();
    renderGoalsGrid();
    showGoalsToast(editingGoalId ? "Goal updated!" : "Goal created!");
  } catch {
    errorEl.textContent = "An error occurred. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
async function deleteGoal(id) {
  if (!window.confirm("Delete this goal? This cannot be undone.")) return;

  try {
    const res = await apiFetch(`/api/goals/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res || !res.ok) throw new Error("Failed");
    goalsList = goalsList.filter((g) => g.id !== id);
    renderGoalsGrid();
    showGoalsToast("Goal deleted.");
  } catch {
    showGoalsToast("Failed to delete goal.");
  }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
function showGoalsToast(message) {
  const toast = document.getElementById("goalsToast");
  const msg = document.getElementById("goalsToastMessage");
  if (!toast || !msg) return;
  msg.textContent = message;
  toast.classList.remove("hidden");
  if (goalsToastTimer) clearTimeout(goalsToastTimer);
  goalsToastTimer = setTimeout(() => toast.classList.add("hidden"), GOALS_TOAST_MS);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function fmtAmt(value) {
  const n = Number(value) || 0;
  return "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return `${value ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
