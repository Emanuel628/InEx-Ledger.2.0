const MILEAGE_STORAGE_KEY = "lb_mileage";
const METRIC_STORAGE_KEY = "lb_unit_metric";
const MILEAGE_TOAST_MS = 3000;

let mileageToastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireMileageForm();
  renderMileageTable();
  refreshMileageLabels();
  updateReceiptsDot();
  window.addEventListener("storage", refreshMileageLabels);
  window.addEventListener("lunaRegionChanged", refreshMileageLabels);
  window.addEventListener("lunaLanguageChanged", refreshMileageLabels);
});

function wireMileageForm() {
  const form = document.getElementById("mileageForm");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = document.getElementById("mileageFormMessage");
    if (message) message.textContent = "";

    const date = document.getElementById("mileageDate")?.value || "";
    const purpose = document.getElementById("mileagePurpose")?.value.trim() || "";
    const destination = document.getElementById("mileageDestination")?.value.trim() || "";
    const distance = parseFloat(document.getElementById("mileageDistance")?.value || "");

    if (!date || !purpose || !Number.isFinite(distance)) {
      if (message) message.textContent = t("mileage_error_required_fields");
      return;
    }

    const useKilometers = shouldUseKilometers();
    const entries = getMileageRecords();
    entries.unshift({
      id: `mile_${Date.now()}`,
      date,
      purpose,
      destination,
      distance: Number(distance.toFixed(1)),
      unit: useKilometers ? "km" : "mi"
    });
    saveMileageRecords(entries);
    form.reset();
    renderMileageTable();
    showMileageToast("Mileage added");
  });
}

function refreshMileageLabels() {
  const useKilometers = shouldUseKilometers();
  document.getElementById("mileageUnitNote").textContent = useKilometers ? t("mileage_unit_note_ca") : t("mileage_unit_note_us");
  document.getElementById("mileageSubtext").textContent = useKilometers ? t("mileage_subtext_ca") : t("mileage_subtext_us");
  document.getElementById("distanceLabel").textContent = useKilometers ? t("mileage_label_kilometers") : t("mileage_label_miles");
  document.getElementById("distanceHeader").textContent = useKilometers ? t("mileage_table_km") : t("mileage_table_miles");
  renderMileageTable();
}

function renderMileageTable() {
  const body = document.getElementById("mileageTableBody");
  const empty = document.getElementById("mileageEmpty");
  const useKilometers = shouldUseKilometers();
  const unit = useKilometers ? "km" : "mi";
  const entries = getMileageRecords().filter((entry) => entry.unit === unit);

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
      <td>${escapeHtml(Number(entry.distance || 0).toFixed(1))}</td>
      <td><button type="button" class="mileage-delete" data-mileage-delete="${escapeHtml(entry.id)}">${escapeHtml(t("mileage_button_delete"))}</button></td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-mileage-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteMileage(button.getAttribute("data-mileage-delete") || ""));
  });
}

function deleteMileage(id) {
  saveMileageRecords(getMileageRecords().filter((entry) => entry.id !== id));
  renderMileageTable();
  showMileageToast("Mileage deleted");
}

function shouldUseKilometers() {
  const region = (window.LUNA_REGION || localStorage.getItem("lb_region") || "us").toLowerCase();
  return localStorage.getItem(METRIC_STORAGE_KEY) === "true" || region === "ca";
}

function getMileageRecords() {
  try {
    return JSON.parse(localStorage.getItem(MILEAGE_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveMileageRecords(records) {
  localStorage.setItem(MILEAGE_STORAGE_KEY, JSON.stringify(records));
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) return;
  try {
    const receipts = JSON.parse(localStorage.getItem("lb_receipts") || "[]");
    dot.hidden = !receipts.some((receipt) => !receipt.transactionId && !receipt.transaction_id);
  } catch {
    dot.hidden = true;
  }
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

function escapeHtml(value) {
  return `${value ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
