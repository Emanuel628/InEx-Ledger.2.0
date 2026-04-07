requireAuthAndTier("v1");

const ADVANCED_FILTER_STORAGE_KEY = "lb_advanced_transaction_filters";
const ADVANCED_FILTER_PRESET_KEY = "lb_advanced_transaction_filter_preset";

const ADVANCED_FILTER_DEFAULTS = {
  dateFrom: "",
  dateTo: "",
  cleared: "all",
  minAmount: "",
  maxAmount: ""
};

function ensureV1Filters() {
  if (typeof effectiveTier === "function" && effectiveTier() !== "v1") {
    window.location.href = "upgrade";
    return false;
  }

  return true;
}

function readFilterState() {
  const active = readStoredFilters(ADVANCED_FILTER_STORAGE_KEY);
  const preset = readStoredFilters(ADVANCED_FILTER_PRESET_KEY);
  return { ...ADVANCED_FILTER_DEFAULTS, ...preset, ...active };
}

function readStoredFilters(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFilterState(state, persistPreset = false) {
  const normalized = normalizeFilterState(state);
  localStorage.setItem(ADVANCED_FILTER_STORAGE_KEY, JSON.stringify(normalized));
  if (persistPreset) {
    localStorage.setItem(ADVANCED_FILTER_PRESET_KEY, JSON.stringify(normalized));
  }
  window.dispatchEvent(new CustomEvent("advancedTransactionFiltersChanged", { detail: normalized }));
  return normalized;
}

function normalizeFilterState(state) {
  return {
    dateFrom: String(state?.dateFrom || "").trim(),
    dateTo: String(state?.dateTo || "").trim(),
    cleared: ["all", "cleared", "uncleared"].includes(state?.cleared) ? state.cleared : "all",
    minAmount: coerceOptionalAmount(state?.minAmount),
    maxAmount: coerceOptionalAmount(state?.maxAmount)
  };
}

function coerceOptionalAmount(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : "";
}

function readFormState() {
  return normalizeFilterState({
    dateFrom: document.getElementById("filterDateFrom")?.value,
    dateTo: document.getElementById("filterDateTo")?.value,
    cleared: document.getElementById("filterCleared")?.value,
    minAmount: document.getElementById("filterMinAmount")?.value,
    maxAmount: document.getElementById("filterMaxAmount")?.value
  });
}

function applyStateToForm(state) {
  const nextState = { ...ADVANCED_FILTER_DEFAULTS, ...state };
  const dateFrom = document.getElementById("filterDateFrom");
  const dateTo = document.getElementById("filterDateTo");
  const cleared = document.getElementById("filterCleared");
  const minAmount = document.getElementById("filterMinAmount");
  const maxAmount = document.getElementById("filterMaxAmount");
  const message = document.getElementById("advancedFilterMessage");

  if (dateFrom) dateFrom.value = nextState.dateFrom;
  if (dateTo) dateTo.value = nextState.dateTo;
  if (cleared) cleared.value = nextState.cleared;
  if (minAmount) minAmount.value = nextState.minAmount;
  if (maxAmount) maxAmount.value = nextState.maxAmount;
  if (message) {
    message.textContent = "";
  }
}

function updateFilterMessage(text) {
  const message = document.getElementById("advancedFilterMessage");
  if (message) {
    message.textContent = text || "";
  }
}

function toggleFilterPanel(forceOpen) {
  const panel = document.getElementById("advancedFilterPanel");
  const toggle = document.querySelector("[data-filter-toggle]");
  if (!panel || !toggle) return;

  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : panel.hidden;
  panel.hidden = !shouldOpen;
  toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
}

function wireFilterActions() {
  const toggleBtn = document.querySelector("[data-filter-toggle]");
  const applyBtn = document.querySelector("[data-filter-apply]");
  const saveBtn = document.querySelector("[data-filter-save]");
  const clearBtn = document.querySelector("[data-filter-clear]");
  const panel = document.getElementById("advancedFilterPanel");

  if (!toggleBtn && !applyBtn && !saveBtn && !clearBtn) {
    return;
  }

  applyStateToForm(readStateFromStorage());

  toggleBtn?.addEventListener("click", () => {
    toggleFilterPanel();
  });

  applyBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    if (!ensureV1Filters()) return;
    const state = writeFilterState(readFormState(), false);
    updateFilterMessage("Advanced filters applied.");
    if (panel && panel.hidden === false) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return state;
  });

  saveBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    if (!ensureV1Filters()) return;
    const state = writeFilterState(readFormState(), true);
    updateFilterMessage("Advanced filter preset saved.");
    return state;
  });

  clearBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    if (!ensureV1Filters()) return;
    localStorage.removeItem(ADVANCED_FILTER_STORAGE_KEY);
    localStorage.removeItem(ADVANCED_FILTER_PRESET_KEY);
    applyStateToForm(ADVANCED_FILTER_DEFAULTS);
    window.dispatchEvent(new CustomEvent("advancedTransactionFiltersChanged", { detail: ADVANCED_FILTER_DEFAULTS }));
    updateFilterMessage("Advanced filters cleared.");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === ADVANCED_FILTER_STORAGE_KEY || event.key === ADVANCED_FILTER_PRESET_KEY) {
      applyStateToForm(readStateFromStorage());
    }
  });

  window.LUNA_ADVANCED_TRANSACTION_FILTERS = {
    read: readStateFromStorage,
    write: writeFilterState,
    clear: () => {
      localStorage.removeItem(ADVANCED_FILTER_STORAGE_KEY);
      localStorage.removeItem(ADVANCED_FILTER_PRESET_KEY);
      applyStateToForm(ADVANCED_FILTER_DEFAULTS);
    }
  };
}

function readStateFromStorage() {
  return readFilterState();
}

document.addEventListener("DOMContentLoaded", wireFilterActions);
