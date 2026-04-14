const MILEAGE_STORAGE_KEY = "lb_mileage";
const METRIC_STORAGE_KEY = "lb_unit_metric";
const MILES_TO_KM = 1.609344;
const MILEAGE_TOAST_MS = 3000;

let mileageToastTimer = null;
let mileageRecords = [];
let unattachedReceiptsCount = 0;
let mileageServerAvailable = true;
function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  await loadMileageRecords();
  wireMileageForm();
  renderMileageTable();
  refreshMileageLabels();
  await refreshReceiptsDot();
  window.addEventListener("storage", refreshMileageLabels);
  window.addEventListener("lunaRegionChanged", refreshMileageLabels);
  window.addEventListener("lunaLanguageChanged", refreshMileageLabels);
});

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
      if (message) message.textContent = tx("mileage_error_required_fields");
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
      if (message) message.textContent = errorPayload?.error || tx("mileage_error_save");
      return;
    }

    await loadMileageRecords();
    form.reset();
    renderMileageTable();
    showMileageToast(tx("mileage_added"));
  });
}

function refreshMileageLabels() {
  const useKilometers = shouldUseKilometers();
  const mileageUnitNote = document.getElementById("mileageUnitNote");
  const mileageSubtext = document.getElementById("mileageSubtext");
  const distanceLabel = document.getElementById("distanceLabel");
  const distanceHeader = document.getElementById("distanceHeader");
  if (mileageUnitNote) mileageUnitNote.textContent = useKilometers ? tx("mileage_unit_note_ca") : tx("mileage_unit_note_us");
  if (mileageSubtext) mileageSubtext.textContent = useKilometers ? tx("mileage_subtext_ca") : tx("mileage_subtext_us");
  if (distanceLabel) distanceLabel.textContent = useKilometers ? tx("mileage_label_kilometers") : tx("mileage_label_miles");
  if (distanceHeader) distanceHeader.textContent = useKilometers ? tx("mileage_table_km") : tx("mileage_table_miles");
  renderMileageTable();
}

function renderMileageTable() {
  const body = document.getElementById("mileageTableBody");
  const empty = document.getElementById("mileageEmpty");
  const useKilometers = shouldUseKilometers();
  const entries = mileageRecords.map((entry) => ({
    ...entry,
    displayDistance: convertMileageDistance(entry, useKilometers)
  }));

  if (!entries.length) {
    body.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  body.innerHTML = entries.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.date)}</td>
      <td>${escapeHtml(entry.purpose)}</td>
      <td>${escapeHtml(entry.destination || "-")}</td>
      <td>${escapeHtml(Number(entry.displayDistance || 0).toFixed(1))}</td>
      <td><button type="button" class="mileage-delete" data-mileage-delete="${escapeHtml(entry.id)}">${escapeHtml(t("mileage_button_delete"))}</button></td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-mileage-delete]").forEach((button) => {
    button.addEventListener("click", async () => deleteMileage(button.getAttribute("data-mileage-delete") || ""));
  });
}

async function deleteMileage(id) {
  if (!window.confirm(tx("mileage_confirm_delete"))) {
    return;
  }
  const response = await apiFetch(`/api/mileage/${id}`, {
    method: "DELETE"
  });
  if (!response || !response.ok) {
    showMileageToast(tx("mileage_error_delete"));
    return;
  }
  await loadMileageRecords();
  renderMileageTable();
  showMileageToast(tx("mileage_deleted"));
}

function shouldUseKilometers() {
  const region = (window.LUNA_REGION || localStorage.getItem("lb_region") || "us").toLowerCase();
  return localStorage.getItem(METRIC_STORAGE_KEY) === "true" || region === "ca";
}

async function loadMileageRecords() {
  try {
    const response = await apiFetch("/api/mileage");
    if (!response || !response.ok) {
      throw new Error(tx("mileage_error_load"));
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
      distance: Number(entry.km ?? entry.miles ?? 0),
      unit: entry.km != null ? "km" : "mi"
    }));
    localStorage.setItem(MILEAGE_STORAGE_KEY, JSON.stringify(mileageRecords));
    mileageServerAvailable = true;
  } catch (error) {
    console.error("Failed to load mileage:", error);
    try {
      mileageRecords = JSON.parse(localStorage.getItem(MILEAGE_STORAGE_KEY) || "[]");
    } catch {
      mileageRecords = [];
    }
    mileageServerAvailable = false;
  }
  showMileageOfflineBanner(!mileageServerAvailable);
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
  banner.textContent = show ? tx("mileage_offline_warning") : "";

  const form = document.getElementById("mileageForm");
  if (form) {
    const submitBtn = form.querySelector("button[type=\"submit\"]");
    if (submitBtn) {
      submitBtn.disabled = show;
    }
  }
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
    : Number(entry.distance || 0);

  if (useKilometers) {
    return entry.km != null ? Number(entry.km) : milesValue * MILES_TO_KM;
  }

  return milesValue;
}
