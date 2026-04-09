const GOALS_TOAST_MS = 3000;
const GOAL_TYPE_LABELS = {
  savings: "Savings target",
  spending_limit: "Spending limit",
  income_target: "Income target"
};

let goalsToastTimer = null;

console.log("[AUTH] Protected page loaded:", window.location.pathname);

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireGoalForm();
  await renderGoalsList();
  updateReceiptsDot();
});

function wireGoalForm() {
  const showButton = document.getElementById("showGoalForm");
  const formContainer = document.getElementById("goalFormContainer");
  const form = document.getElementById("goalForm");
  const cancelButton = document.getElementById("cancelGoalEdit");
  const message = document.getElementById("goalFormMessage");
  const titleEl = document.getElementById("goalFormTitle");

  showButton?.addEventListener("click", () => {
    clearGoalForm();
    titleEl.textContent = "New goal";
    formContainer.hidden = false;
    document.getElementById("goalName")?.focus();
  });

  cancelButton?.addEventListener("click", () => {
    formContainer.hidden = true;
    clearGoalForm();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (message) message.textContent = "";

    const id = document.getElementById("goalEditId")?.value || "";
    const name = document.getElementById("goalName")?.value.trim() || "";
    const type = document.getElementById("goalType")?.value || "";
    const targetAmount = document.getElementById("goalTarget")?.value || "";
    const currentAmount = document.getElementById("goalCurrent")?.value || "0";
    const dueDate = document.getElementById("goalDueDate")?.value || "";
    const notes = document.getElementById("goalNotes")?.value.trim() || "";

    if (!name || !type || !targetAmount) {
      if (message) message.textContent = "Name, type, and target amount are required.";
      return;
    }

    const saveBtn = document.getElementById("goalSaveBtn");
    if (saveBtn) saveBtn.disabled = true;

    try {
      const payload = {
        name,
        type,
        target_amount: parseFloat(targetAmount),
        current_amount: parseFloat(currentAmount) || 0,
        due_date: dueDate || null,
        notes: notes || null
      };

      const isEdit = !!id;
      const response = await apiFetch(
        isEdit ? `/api/goals/${id}` : "/api/goals",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      if (!response || !response.ok) {
        const errPayload = await response?.json().catch(() => null);
        throw new Error(errPayload?.error || "Failed to save goal.");
      }

      formContainer.hidden = true;
      clearGoalForm();
      showGoalsToast(isEdit ? "Goal updated." : "Goal added.");
      await renderGoalsList();
    } catch (err) {
      if (message) message.textContent = err.message || "Failed to save goal.";
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

function clearGoalForm() {
  const form = document.getElementById("goalForm");
  if (form) form.reset();
  const editId = document.getElementById("goalEditId");
  if (editId) editId.value = "";
  const message = document.getElementById("goalFormMessage");
  if (message) message.textContent = "";
}

async function renderGoalsList() {
  const list = document.getElementById("goalsList");
  const empty = document.getElementById("goalsEmpty");
  const errorEl = document.getElementById("goalsLoadError");
  if (!list) return;

  if (errorEl) errorEl.hidden = true;

  try {
    const response = await apiFetch("/api/goals");
    if (!response || !response.ok) throw new Error("Failed to load goals.");

    const goals = await response.json();

    if (!Array.isArray(goals) || goals.length === 0) {
      list.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;
    list.innerHTML = goals.map((goal) => renderGoalItem(goal)).join("");

    list.querySelectorAll("[data-goal-delete]").forEach((btn) => {
      btn.addEventListener("click", () => deleteGoal(btn.getAttribute("data-goal-delete")));
    });

    list.querySelectorAll("[data-goal-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-goal-edit");
        const goal = goals.find((g) => g.id === id);
        if (goal) openEditForm(goal);
      });
    });
  } catch (err) {
    list.innerHTML = "";
    if (errorEl) {
      errorEl.textContent = err.message || "Failed to load goals.";
      errorEl.hidden = false;
    }
  }
}

function renderGoalItem(goal) {
  const pct = goal.target_amount > 0
    ? Math.min(100, Math.round((Number(goal.current_amount) / Number(goal.target_amount)) * 100))
    : 0;
  const isComplete = goal.is_completed || pct >= 100;
  const dueText = goal.due_date ? `Due ${String(goal.due_date).slice(0, 10)}` : "";
  const notesText = goal.notes ? escapeHtml(goal.notes) : "";
  const typeLabel = GOAL_TYPE_LABELS[goal.type] || goal.type;

  return `
    <div class="goal-item">
      <div class="goal-item-head">
        <span class="goal-name">${escapeHtml(goal.name)}</span>
        <span class="goal-type-badge">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="goal-progress-wrap">
        <div class="goal-progress-bar">
          <div class="goal-progress-fill${isComplete ? " is-complete" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="goal-amounts">
          <span>${escapeHtml(formatCurrency(goal.current_amount))} of ${escapeHtml(formatCurrency(goal.target_amount))}</span>
          <span>${pct}%</span>
        </div>
      </div>
      ${dueText ? `<div class="goal-due">${escapeHtml(dueText)}</div>` : ""}
      ${notesText ? `<div class="goal-notes">${notesText}</div>` : ""}
      <div class="goal-actions">
        <button type="button" class="goal-edit-btn" data-goal-edit="${escapeHtml(goal.id)}">Edit</button>
        <button type="button" class="goal-delete-btn" data-goal-delete="${escapeHtml(goal.id)}">Delete</button>
      </div>
    </div>
  `;
}

function openEditForm(goal) {
  const formContainer = document.getElementById("goalFormContainer");
  const titleEl = document.getElementById("goalFormTitle");
  document.getElementById("goalEditId").value = goal.id;
  document.getElementById("goalName").value = goal.name || "";
  document.getElementById("goalType").value = goal.type || "";
  document.getElementById("goalTarget").value = goal.target_amount != null ? Number(goal.target_amount) : "";
  document.getElementById("goalCurrent").value = goal.current_amount != null ? Number(goal.current_amount) : "0";
  document.getElementById("goalDueDate").value = goal.due_date ? String(goal.due_date).slice(0, 10) : "";
  document.getElementById("goalNotes").value = goal.notes || "";
  const message = document.getElementById("goalFormMessage");
  if (message) message.textContent = "";
  titleEl.textContent = "Edit goal";
  formContainer.hidden = false;
  document.getElementById("goalName")?.focus();
}

async function deleteGoal(id) {
  if (!window.confirm("Delete this goal?")) return;

  const response = await apiFetch(`/api/goals/${id}`, { method: "DELETE" });
  if (!response || !response.ok) {
    showGoalsToast("Failed to delete goal.");
    return;
  }
  showGoalsToast("Goal deleted.");
  await renderGoalsList();
}

function formatCurrency(value) {
  const num = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) return;
  try {
    const receipts = JSON.parse(localStorage.getItem("lb_receipts") || "[]");
    dot.hidden = !receipts.some((r) => !r.transactionId && !r.transaction_id);
  } catch {
    dot.hidden = true;
  }
}

function showGoalsToast(msg) {
  const toast = document.getElementById("goalsToast");
  const msgEl = document.getElementById("goalsToastMessage");
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.remove("hidden");
  if (goalsToastTimer) clearTimeout(goalsToastTimer);
  goalsToastTimer = window.setTimeout(() => toast.classList.add("hidden"), GOALS_TOAST_MS);
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
