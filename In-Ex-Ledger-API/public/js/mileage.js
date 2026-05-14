const METRIC_STORAGE_KEY = "lb_unit_metric";
const MILES_TO_KM = 1.609344;
const MILEAGE_TOAST_MS = 3000;
const MILEAGE_PAGE_SIZE = 25;

let mileageToastTimer = null;
let mileageRecords = [];
let vehicleCosts = [];
let unattachedReceiptsCount = 0;
let mileageServerAvailable = true;
let activeEntryMode = "trip";
let mileageCurrentPage = 1;

function tx(key, fallback = "") {
  return typeof window.t === "function" ? window.t(key) : fallback || key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  initializeMileageDates();
  wireEntryModeToggle();
  wireMileageForm();
  wireVehicleCostForm();
  wireHistoryFilters();
  wireMileageEditModal();

  await loadMileageDashboard();
  refreshMileageLabels();
  await refreshReceiptsDot();

  window.addEventListener("storage", refreshMileageLabels);
  window.addEventListener("lunaRegionChanged", refreshMileageLabels);
  window.addEventListener("lunaLanguageChanged", refreshMileageLabels);
});

function initializeMileageDates() {
  const today = new Date().toISOString().slice(0, 10);
  const mileageDate = document.getElementById("mileageDate");
  const vehicleCostDate = document.getElementById("vehicleCostDate");
  if (mileageDate && !mileageDate.value) mileageDate.value = today;
  if (vehicleCostDate && !vehicleCostDate.value) vehicleCostDate.value = today;
}

function wireEntryModeToggle() {
  document.querySelectorAll("[data-entry-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.getAttribute("data-entry-mode") || "trip";
      setEntryMode(nextMode);
    });
  });
  setEntryMode(activeEntryMode);
}

function setEntryMode(mode) {
  activeEntryMode = mode === "maintenance" ? "maintenance" : mode === "expense" ? "expense" : "trip";
  document.querySelectorAll("[data-entry-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-entry-mode") === activeEntryMode);
  });

  const tripPanel = document.querySelector('[data-entry-panel="trip"]');
  const costPanel = document.querySelector('[data-entry-panel="cost"]');
  const costTypeInput = document.getElementById("vehicleCostType");
  const titleLabel = document.getElementById("vehicleCostTitleLabel");
  const submitButton = document.getElementById("vehicleCostSubmit");

  if (tripPanel) tripPanel.hidden = activeEntryMode !== "trip";
  if (costPanel) costPanel.hidden = activeEntryMode === "trip";

  if (activeEntryMode !== "trip") {
    if (costTypeInput) costTypeInput.value = activeEntryMode;
    if (titleLabel) titleLabel.textContent = activeEntryMode === "maintenance" ? "Maintenance title" : "Expense title";
    if (submitButton) submitButton.textContent = activeEntryMode === "maintenance" ? "Add maintenance" : "Add expense";
  }
}

function wireMileageForm() {
  const form = document.getElementById("mileageForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("mileageFormMessage");
    if (message) message.textContent = "";

    const date = document.getElementById("mileageDate")?.value || "";
    const purpose = document.getElementById("mileagePurpose")?.value.trim() || "";
    const destination = document.getElementById("mileageDestination")?.value.trim() || "";
    const distance = parseFloat(document.getElementById("mileageDistance")?.value || "");

    if (!date || !purpose || !Number.isFinite(distance) || distance <= 0) {
      if (message) message.textContent = tx("mileage_error_required_fields", "Complete the date, purpose, and distance.");
      return;
    }

    const useKilometers = shouldUseKilometers();
    const milesValue = useKilometers ? Number((distance / MILES_TO_KM).toFixed(2)) : Number(distance.toFixed(1));
    const kmValue = useKilometers ? Number(distance.toFixed(1)) : Number((distance * MILES_TO_KM).toFixed(2));
    const response = await apiFetch("/api/mileage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        trip_date: date,
        purpose,
        destination,
        miles: milesValue,
        km: kmValue
      })
    });

    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      if (message) message.textContent = errorPayload?.error || tx("mileage_error_save", "Unable to save trip.");
      return;
    }

    await loadMileageDashboard();
    form.reset();
    initializeMileageDates();
    showMileageToast(tx("mileage_added", "Trip added."));
  });
}

function wireVehicleCostForm() {
  const form = document.getElementById("vehicleCostForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("vehicleCostFormMessage");
    if (message) message.textContent = "";

    const entryType = document.getElementById("vehicleCostType")?.value || "expense";
    const entryDate = document.getElementById("vehicleCostDate")?.value || "";
    const title = document.getElementById("vehicleCostTitle")?.value.trim() || "";
    const vendor = document.getElementById("vehicleCostVendor")?.value.trim() || "";
    const amount = parseFloat(document.getElementById("vehicleCostAmount")?.value || "");
    const notes = document.getElementById("vehicleCostNotes")?.value.trim() || "";

    if (!entryDate || !title || !Number.isFinite(amount) || amount <= 0) {
      if (message) message.textContent = "Complete the date, title, and amount.";
      return;
    }

    const response = await apiFetch("/api/mileage/costs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        entry_type: entryType,
        entry_date: entryDate,
        title,
        vendor,
        amount,
        notes
      })
    });

    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      if (message) message.textContent = errorPayload?.error || "Unable to save vehicle cost.";
      return;
    }

    await loadMileageDashboard();
    form.reset();
    initializeMileageDates();
    setEntryMode(entryType);
    showMileageToast(entryType === "maintenance" ? "Maintenance logged." : "Vehicle expense logged.");
  });
}

function wireHistoryFilters() {
  const resetPage = () => { mileageCurrentPage = 1; renderMileageHistory(); };
  document.getElementById("mileageSearch")?.addEventListener("input", resetPage);
  document.getElementById("mileageHistoryFilter")?.addEventListener("change", resetPage);
  document.getElementById("mileageDateFrom")?.addEventListener("change", resetPage);
  document.getElementById("mileageDateTo")?.addEventListener("change", resetPage);
}

function refreshMileageLabels() {
  const useKilometers = shouldUseKilometers();
  const mileageUnitNote = document.getElementById("mileageUnitNote");
  const mileageSubtext = document.getElementById("mileageSubtext");
  const distanceLabel = document.getElementById("distanceLabel");
  const distanceHeader = document.getElementById("distanceHeader");

  if (mileageUnitNote) {
    mileageUnitNote.textContent = useKilometers
      ? "Track trips, vehicle expenses, and maintenance with kilometres as the working distance unit."
      : "Track trips, vehicle expenses, and maintenance with miles as the working distance unit.";
  }
  if (mileageSubtext) {
    mileageSubtext.textContent = useKilometers
      ? "Using kilometres by default. Change units in Settings if needed."
      : "Using miles by default. Change units in Settings if needed.";
  }
  if (distanceLabel) distanceLabel.textContent = useKilometers ? "Kilometres" : "Miles";
  if (distanceHeader) distanceHeader.textContent = useKilometers ? "Kilometres / Amount" : "Miles / Amount";

  renderMileageHistory();
}

function shouldUseKilometers() {
  const region = (window.LUNA_REGION || localStorage.getItem("lb_region") || "us").toLowerCase();
  return localStorage.getItem(METRIC_STORAGE_KEY) === "true" || region === "ca";
}

async function loadMileageDashboard() {
  await Promise.all([loadMileageRecords(), loadVehicleCosts()]);
  renderMileageHistory();
}

async function loadMileageRecords() {
  try {
    const response = await apiFetch("/api/mileage?limit=500");
    if (!response || !response.ok) {
      throw new Error(tx("mileage_error_load", "Unable to load mileage."));
    }
    const payload = await response.json().catch(() => null);
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
      ? payload.data
      : [];
    mileageRecords = entries.map((entry) => ({
      id: entry.id,
      date: String(entry.trip_date || "").slice(0, 10),
      purpose: entry.purpose || "",
      destination: entry.destination || "",
      miles: entry.miles != null ? Number(entry.miles) : null,
      km: entry.km != null ? Number(entry.km) : null,
      created_at: entry.created_at || null
    }));
    mileageServerAvailable = true;
  } catch (error) {
    console.error("Failed to load mileage:", error);
    mileageRecords = [];
    mileageServerAvailable = false;
  }
  showMileageOfflineBanner(!mileageServerAvailable);
}

async function loadVehicleCosts() {
  try {
    const response = await apiFetch("/api/mileage/costs?limit=500");
    if (!response || !response.ok) {
      throw new Error("Unable to load vehicle costs.");
    }
    const payload = await response.json().catch(() => null);
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
      ? payload.data
      : [];
    vehicleCosts = entries.map((entry) => ({
      id: entry.id,
      entry_type: String(entry.entry_type || "expense"),
      date: String(entry.entry_date || "").slice(0, 10),
      title: entry.title || "",
      vendor: entry.vendor || "",
      amount: Number(entry.amount || 0),
      notes: entry.notes || "",
      created_at: entry.created_at || null
    }));
  } catch (error) {
    console.error("Failed to load vehicle costs:", error);
    vehicleCosts = [];
  }
}

function buildHistoryEntries() {
  const useKilometers = shouldUseKilometers();
  const tripEntries = mileageRecords.map((entry) => ({
    id: entry.id,
    kind: "trip",
    date: entry.date,
    created_at: entry.created_at || "",
    search: `${entry.purpose} ${entry.destination}`.toLowerCase(),
    title: entry.purpose,
    subtitle: entry.destination || "No destination",
    metricValue: `${convertMileageDistance(entry, useKilometers).toFixed(1)} ${useKilometers ? "km" : "mi"}`,
    rawDistance: convertMileageDistance(entry, useKilometers)
  }));

  const costEntries = vehicleCosts.map((entry) => ({
    id: entry.id,
    kind: entry.entry_type === "maintenance" ? "maintenance" : "expense",
    date: entry.date,
    created_at: entry.created_at || "",
    search: `${entry.title} ${entry.vendor} ${entry.notes}`.toLowerCase(),
    title: entry.title,
    subtitle: [entry.vendor, entry.notes].filter(Boolean).join(" • ") || "No extra notes",
    metricValue: formatCurrency(entry.amount),
    amount: entry.amount
  }));

  return [...tripEntries, ...costEntries].sort((left, right) => {
    const leftDate = `${left.date || ""}T${String(left.created_at || "").slice(11, 19) || "00:00:00"}`;
    const rightDate = `${right.date || ""}T${String(right.created_at || "").slice(11, 19) || "00:00:00"}`;
    return rightDate.localeCompare(leftDate);
  });
}

function getFilteredHistoryEntries() {
  const historyFilter = document.getElementById("mileageHistoryFilter")?.value || "all";
  const searchTerm = (document.getElementById("mileageSearch")?.value || "").trim().toLowerCase();
  const dateFrom = document.getElementById("mileageDateFrom")?.value || "";
  const dateTo = document.getElementById("mileageDateTo")?.value || "";

  return buildHistoryEntries().filter((entry) => {
    if (historyFilter !== "all" && entry.kind !== historyFilter) return false;
    if (searchTerm && !entry.search.includes(searchTerm)) return false;
    if (dateFrom && entry.date < dateFrom) return false;
    if (dateTo && entry.date > dateTo) return false;
    return true;
  });
}

function renderMileageHistory() {
  const body = document.getElementById("mileageTableBody");
  const empty = document.getElementById("mileageEmpty");
  if (!body || !empty) return;

  const allEntries = getFilteredHistoryEntries();
  renderMileageSummary(allEntries);

  if (!allEntries.length) {
    body.innerHTML = "";
    empty.hidden = false;
    renderMileagePagination(0);
    return;
  }

  empty.hidden = true;
  const totalPages = Math.ceil(allEntries.length / MILEAGE_PAGE_SIZE);
  if (mileageCurrentPage > totalPages) mileageCurrentPage = totalPages;
  const start = (mileageCurrentPage - 1) * MILEAGE_PAGE_SIZE;
  const entries = allEntries.slice(start, start + MILEAGE_PAGE_SIZE);

  body.innerHTML = entries.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.date)}</td>
      <td><span class="mileage-history-badge mileage-history-badge--${escapeHtml(entry.kind)}">${escapeHtml(capitalize(entry.kind))}</span></td>
      <td>
        <div class="mileage-history-title">${escapeHtml(entry.title)}</div>
        <div class="mileage-history-subtitle">${escapeHtml(entry.subtitle)}</div>
      </td>
      <td>${escapeHtml(entry.metricValue)}</td>
      <td class="mileage-actions-cell">
        <button type="button" class="mileage-edit-btn" data-edit-id="${escapeHtml(String(entry.id))}" data-edit-kind="${escapeHtml(entry.kind)}">Edit</button>
        <button
          type="button"
          class="mileage-delete"
          ${entry.kind === "trip" ? `data-mileage-delete="${escapeHtml(String(entry.id))}"` : `data-vehicle-cost-delete="${escapeHtml(String(entry.id))}"`}
        >Delete</button>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-mileage-delete]").forEach((button) => {
    button.addEventListener("click", async () => deleteMileage(button.getAttribute("data-mileage-delete") || ""));
  });
  body.querySelectorAll("[data-vehicle-cost-delete]").forEach((button) => {
    button.addEventListener("click", async () => deleteVehicleCost(button.getAttribute("data-vehicle-cost-delete") || ""));
  });
  body.querySelectorAll(".mileage-edit-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-edit-id") || "";
      const kind = button.getAttribute("data-edit-kind") || "";
      const entry = kind === "trip"
        ? mileageRecords.find((r) => String(r.id) === id)
        : vehicleCosts.find((c) => String(c.id) === id);
      if (entry) openMileageEditModal(entry, kind);
    });
  });

  renderMileagePagination(allEntries.length);
}

function renderMileagePagination(total) {
  const pagination = document.getElementById("mileagePagination");
  const info = document.getElementById("mileagePageInfo");
  const prev = document.getElementById("mileagePagePrev");
  const next = document.getElementById("mileagePageNext");
  if (!pagination || !info || !prev || !next) return;

  const totalPages = Math.ceil(total / MILEAGE_PAGE_SIZE);
  if (totalPages <= 1) {
    pagination.hidden = true;
    return;
  }

  pagination.hidden = false;
  info.textContent = `Page ${mileageCurrentPage} of ${totalPages}`;
  prev.disabled = mileageCurrentPage <= 1;
  next.disabled = mileageCurrentPage >= totalPages;
}

function wireMileageEditModal() {
  document.getElementById("mileageEditBackdrop")?.addEventListener("click", closeMileageEditModal);
  document.getElementById("mileageEditCancel")?.addEventListener("click", closeMileageEditModal);
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("mileageEditModal");
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeMileageEditModal();
  });
  document.getElementById("mileageEditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveMileageEdit();
  });
  document.getElementById("mileagePagePrev")?.addEventListener("click", () => {
    if (mileageCurrentPage > 1) { mileageCurrentPage--; renderMileageHistory(); }
  });
  document.getElementById("mileagePageNext")?.addEventListener("click", () => {
    const totalPages = Math.ceil(getFilteredHistoryEntries().length / MILEAGE_PAGE_SIZE);
    if (mileageCurrentPage < totalPages) { mileageCurrentPage++; renderMileageHistory(); }
  });
}

function openMileageEditModal(entry, kind) {
  const modal = document.getElementById("mileageEditModal");
  const tripFields = document.getElementById("mileageEditTripFields");
  const costFields = document.getElementById("mileageEditCostFields");
  if (!modal || !tripFields || !costFields) return;

  document.getElementById("mileageEditId").value = String(entry.id || "");
  document.getElementById("mileageEditKind").value = kind;
  document.getElementById("mileageEditMessage").textContent = "";

  if (kind === "trip") {
    tripFields.hidden = false;
    costFields.hidden = true;
    const useKilometers = shouldUseKilometers();
    document.getElementById("mileageEditDate").value = entry.date || "";
    document.getElementById("mileageEditPurpose").value = entry.purpose || "";
    document.getElementById("mileageEditDestination").value = entry.destination || "";
    document.getElementById("mileageEditDistance").value = convertMileageDistance(entry, useKilometers).toFixed(1);
    const distLabel = document.getElementById("mileageEditDistanceLabel");
    if (distLabel) distLabel.textContent = useKilometers ? "Kilometres" : "Miles";
  } else {
    tripFields.hidden = true;
    costFields.hidden = false;
    const titleLabel = document.getElementById("mileageEditTitleLabel");
    if (titleLabel) titleLabel.textContent = kind === "maintenance" ? "Maintenance title" : "Expense title";
    document.getElementById("mileageEditCostDate").value = entry.date || "";
    document.getElementById("mileageEditCostTitle").value = entry.title || "";
    document.getElementById("mileageEditCostVendor").value = entry.vendor || "";
    document.getElementById("mileageEditCostAmount").value = entry.amount != null ? String(entry.amount) : "";
    document.getElementById("mileageEditCostNotes").value = entry.notes || "";
  }

  modal.classList.remove("hidden");
  (modal.querySelector("input[type='date'], input[type='text']"))?.focus();
}

function closeMileageEditModal() {
  document.getElementById("mileageEditModal")?.classList.add("hidden");
}

async function saveMileageEdit() {
  const id = document.getElementById("mileageEditId")?.value || "";
  const kind = document.getElementById("mileageEditKind")?.value || "";
  const message = document.getElementById("mileageEditMessage");
  if (message) message.textContent = "";

  let response;
  if (kind === "trip") {
    const date = document.getElementById("mileageEditDate")?.value || "";
    const purpose = (document.getElementById("mileageEditPurpose")?.value || "").trim();
    const destination = (document.getElementById("mileageEditDestination")?.value || "").trim();
    const distInput = parseFloat(document.getElementById("mileageEditDistance")?.value || "");
    if (!date || !purpose || !Number.isFinite(distInput) || distInput <= 0) {
      if (message) message.textContent = "Complete the date, purpose, and distance.";
      return;
    }
    const useKilometers = shouldUseKilometers();
    const milesValue = useKilometers ? Number((distInput / MILES_TO_KM).toFixed(2)) : Number(distInput.toFixed(1));
    const kmValue = useKilometers ? Number(distInput.toFixed(1)) : Number((distInput * MILES_TO_KM).toFixed(2));
    response = await apiFetch(`/api/mileage/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_date: date, purpose, destination, miles: milesValue, km: kmValue })
    });
  } else {
    const entryDate = document.getElementById("mileageEditCostDate")?.value || "";
    const title = (document.getElementById("mileageEditCostTitle")?.value || "").trim();
    const vendor = (document.getElementById("mileageEditCostVendor")?.value || "").trim();
    const amount = parseFloat(document.getElementById("mileageEditCostAmount")?.value || "");
    const notes = (document.getElementById("mileageEditCostNotes")?.value || "").trim();
    if (!entryDate || !title || !Number.isFinite(amount) || amount <= 0) {
      if (message) message.textContent = "Complete the date, title, and amount.";
      return;
    }
    response = await apiFetch(`/api/mileage/costs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_type: kind, entry_date: entryDate, title, vendor, amount, notes })
    });
  }

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    if (message) message.textContent = errorPayload?.error || "Unable to save changes.";
    return;
  }

  closeMileageEditModal();
  await loadMileageDashboard();
  showMileageToast("Entry updated.");
}

function renderMileageSummary(entries) {
  const useKilometers = shouldUseKilometers();
  const tripEntries = entries.filter((entry) => entry.kind === "trip");
  const expenseEntries = entries.filter((entry) => entry.kind === "expense");
  const maintenanceEntries = entries.filter((entry) => entry.kind === "maintenance");

  const totalDistance = tripEntries.reduce((sum, entry) => sum + Number(entry.rawDistance || 0), 0);
  const expenseTotal = expenseEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const maintenanceTotal = maintenanceEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  setText("mileageSummaryTrips", String(tripEntries.length));
  setText("mileageSummaryTripsMeta", tripEntries.length ? `${tripEntries.length} visible in history` : "No trips in the current view");
  setText("mileageSummaryDistance", `${totalDistance.toFixed(1)} ${useKilometers ? "km" : "mi"}`);
  setText("mileageSummaryDistanceMeta", tripEntries.length ? "Distance from visible trip records" : "No trip distance to summarize");
  setText("mileageSummaryExpenses", formatCurrency(expenseTotal));
  setText("mileageSummaryExpensesMeta", expenseEntries.length ? `${expenseEntries.length} expense record${expenseEntries.length === 1 ? "" : "s"}` : "No expense records in view");
  setText("mileageSummaryMaintenance", formatCurrency(maintenanceTotal));
  setText("mileageSummaryMaintenanceMeta", maintenanceEntries.length ? `${maintenanceEntries.length} maintenance record${maintenanceEntries.length === 1 ? "" : "s"}` : "No maintenance records in view");
}

async function deleteMileage(id) {
  if (!window.confirm(tx("mileage_confirm_delete", "Delete this trip?"))) {
    return;
  }
  const response = await apiFetch(`/api/mileage/${id}`, {
    method: "DELETE"
  });
  if (!response || !response.ok) {
    showMileageToast(tx("mileage_error_delete", "Unable to delete trip."));
    return;
  }
  await loadMileageDashboard();
  showMileageToast(tx("mileage_deleted", "Trip deleted."));
}

async function deleteVehicleCost(id) {
  if (!window.confirm("Delete this vehicle cost?")) {
    return;
  }
  const response = await apiFetch(`/api/mileage/costs/${id}`, {
    method: "DELETE"
  });
  if (!response || !response.ok) {
    showMileageToast("Unable to delete vehicle cost.");
    return;
  }
  await loadMileageDashboard();
  showMileageToast("Vehicle cost deleted.");
}

function showMileageOfflineBanner(show) {
  let banner = document.getElementById("mileageOfflineBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "mileageOfflineBanner";
    banner.className = "offline-banner";
    const main = document.querySelector("main") || document.body;
    main.insertBefore(banner, main.firstChild);
  }
  banner.hidden = !show;
  banner.textContent = show ? tx("mileage_offline_warning", "Mileage is offline. Reconnect to save new activity.") : "";

  document.querySelectorAll("#mileageForm button[type=\"submit\"], #vehicleCostForm button[type=\"submit\"]").forEach((button) => {
    button.disabled = show;
  });
}

async function refreshReceiptsDot() {
  try {
    const response = await apiFetch("/api/receipts");
    if (!response || !response.ok) {
      unattachedReceiptsCount = 0;
      updateReceiptsDot();
      return;
    }
    const payload = await response.json().catch(() => []);
    const receipts = Array.isArray(payload) ? payload : Array.isArray(payload?.receipts) ? payload.receipts : [];
    unattachedReceiptsCount = receipts.filter((receipt) => !receipt?.transaction_id).length;
  } catch {
    unattachedReceiptsCount = 0;
  }
  updateReceiptsDot();
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) return;
  dot.hidden = unattachedReceiptsCount === 0;
}

function showMileageToast(message) {
  const toast = document.getElementById("mileageToast");
  const messageNode = document.getElementById("mileageToastMessage");
  if (!toast || !messageNode) return;
  messageNode.textContent = message;
  toast.classList.remove("hidden");
  if (mileageToastTimer) clearTimeout(mileageToastTimer);
  mileageToastTimer = window.setTimeout(() => toast.classList.add("hidden"), MILEAGE_TOAST_MS);
}

function convertMileageDistance(entry, useKilometers) {
  const milesValue = entry.miles != null
    ? Number(entry.miles)
    : entry.km != null
    ? Number(entry.km) / MILES_TO_KM
    : 0;

  if (useKilometers) {
    return entry.km != null ? Number(entry.km) : milesValue * MILES_TO_KM;
  }

  return milesValue;
}

function formatCurrency(value) {
  const region = String(window.LUNA_REGION || localStorage.getItem("lb_region") || "us").toLowerCase();
  const currency = region === "ca" ? "CAD" : "USD";
  const locale = region === "ca" ? "en-CA" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency
  }).format(Number(value || 0));
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

function capitalize(value) {
  const normalized = String(value || "");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
