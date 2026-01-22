const MILEAGE_STORAGE_KEY = "lb_mileage";
const METRIC_STORAGE_KEY = "lb_unit_metric";

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireMileageForm();
  wireMileageTableActions();
  wireOdometerInputs();
  refreshMileageView();
  window.addEventListener("storage", handleStorageChange);
  window.addEventListener("lunaLanguageChanged", refreshMileageView);
});

function handleStorageChange(event) {
  if (!event || !("key" in event)) {
    return;
  }
  if (!event.key || event.key === METRIC_STORAGE_KEY || event.key === "lb_region") {
    refreshMileageView();
  }
}

function refreshMileageView() {
  const useKilometers = shouldUseKilometers();
  toggleMileageFields(useKilometers);
  updateUnitNote(useKilometers);
  updateHeroDescription();
  updateKilometerHelper();
  renderMileageTable();
}

function shouldUseKilometers() {
  const region = getCurrentRegion();
  const prefersMetric = localStorage.getItem(METRIC_STORAGE_KEY) === "true";
  return prefersMetric || region === "ca";
}

function toggleMileageFields(useKilometers) {
  const usFields = document.getElementById("mileage-us-fields");
  const caFields = document.getElementById("mileage-ca-fields");
  if (useKilometers) {
    usFields?.setAttribute("hidden", "");
    caFields?.removeAttribute("hidden");
  } else {
    caFields?.setAttribute("hidden", "");
    usFields?.removeAttribute("hidden");
  }
}

function updateUnitNote(useKilometers) {
  const note = document.getElementById("mileageUnitNote");
  if (!note) {
    return;
  }
  const key = useKilometers ? "mileage_subtext_ca" : "mileage_subtext_us";
  if (typeof t === "function") {
    note.textContent = t(key);
  } else {
    note.textContent = useKilometers
      ? "Using kilometers (Canada default). Change in Settings if needed."
      : "Using miles (U.S. default). Change in Settings if needed.";
  }
}

function updateHeroDescription() {
  const hero = document.getElementById("mileageHeroDescription");
  if (!hero) {
    return;
  }
  const region = getCurrentRegion();
  hero.textContent =
    region === "ca"
      ? "Keep a simple log for Canadian tax reporting."
      : "Keep a simple log for US tax reporting.";
}

function wireMileageForm() {
  const form = document.getElementById("mileageForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setMileageMessage("");
    const record = buildMileageRecord();
    if (!record) {
      return;
    }

    const entries = getMileageRecords();
    entries.unshift(record);
    saveMileageRecords(entries);
    form.reset();
    updateKilometerHelper();
    refreshMileageView();
    focusFirstField();
  });
}

function wireMileageTableActions() {
  const tbody = document.getElementById("mileageTableBody");
  if (!tbody) {
    return;
  }

  tbody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const deleteBtn = target.closest("[data-action='delete-mileage']");
    if (!deleteBtn) return;
    const id = deleteBtn.getAttribute("data-id");
    if (!id) return;
    deleteMileageRecord(id);
  });
}

function wireOdometerInputs() {
  const inputs = Array.from(
    document.querySelectorAll("#mileageOdometerStart, #mileageOdometerEnd")
  );
  inputs.forEach((input) => {
    input.addEventListener("input", updateKilometerHelper);
  });
}

function focusFirstField() {
  const useKilometers = shouldUseKilometers();
  const targetId = useKilometers ? "mileageDateCa" : "mileageDateUs";
  document.getElementById(targetId)?.focus();
}

function renderMileageTable() {
  const useKilometers = shouldUseKilometers();
  const headingLabels = buildTableHeadings(useKilometers);
  const records = getMileageRecords().filter(
    (record) => record.unit === (useKilometers ? "km" : "mi")
  );
  const table = document.getElementById("mileageTable");
  const thead = table?.querySelector("thead");
  const tbody = document.getElementById("mileageTableBody");
  const empty = document.getElementById("mileageEmpty");

  if (!table || !thead || !tbody) {
    return;
  }

  thead.innerHTML = `
    <tr>
      ${headingLabels.map((label) => `<th>${label}</th>`).join("")}
    </tr>
  `;

  if (records.length === 0) {
    tbody.innerHTML = "";
    table.setAttribute("hidden", "");
    if (empty) {
      empty.removeAttribute("hidden");
    }
    return;
  }

  table.removeAttribute("hidden");
  empty?.setAttribute("hidden", "");
  tbody.innerHTML = "";

  const deleteLabel = typeof t === "function" ? t("mileage_button_delete") : "Delete";

  records.forEach((record) => {
    const destination = record.destination || "-";
    const row = document.createElement("tr");
    const actionCell = `<td><button type="button" data-action="delete-mileage" data-id="${record.id}">${deleteLabel}</button></td>`;
    if (useKilometers) {
      row.innerHTML = `
        <td>${record.date}</td>
        <td>${record.purpose}</td>
        <td>${destination}</td>
        <td>${formatOdometer(record.odometerStart)}</td>
        <td>${formatOdometer(record.odometerEnd)}</td>
        <td>${Number.isFinite(record.kilometers) ? record.kilometers.toFixed(2) : ""}</td>
        ${actionCell}
      `;
    } else {
      row.innerHTML = `
        <td>${record.date}</td>
        <td>${record.purpose}</td>
        <td>${destination}</td>
        <td>${record.miles?.toFixed(2) || ""}</td>
        ${actionCell}
      `;
    }
    tbody.appendChild(row);
  });
}

function buildTableHeadings(useKilometers) {
  if (typeof t !== "function") {
    return useKilometers
      ? ["Date", "Purpose", "Destination", "Start Odometer", "End Odometer", "Kilometers", "Actions"]
      : ["Date", "Purpose", "Destination", "Miles", "Actions"];
  }
  const base = [
    t("mileage_table_date"),
    t("mileage_table_purpose"),
    t("mileage_table_destination")
  ];
  if (useKilometers) {
    return [
      ...base,
      t("mileage_table_odo_start"),
      t("mileage_table_odo_end"),
      t("mileage_table_km"),
      t("mileage_table_actions")
    ];
  }
  return [...base, t("mileage_table_miles"), t("mileage_table_actions")];
}

function buildMileageRecord() {
  const useKilometers = shouldUseKilometers();
  const date = getInputValue(useKilometers ? "mileageDateCa" : "mileageDateUs");
  const purpose = getInputValue(useKilometers ? "mileagePurposeCa" : "mileagePurposeUs");
  const destination = getInputValue(useKilometers ? "mileageDestinationCa" : "mileageDestinationUs") || null;

  if (!date || !purpose) {
    setMileageMessage(t("mileage_error_required_fields"));
    return null;
  }

  const record = {
    id: `mile_${Date.now()}`,
    date,
    purpose,
    destination,
    region: useKilometers ? "ca" : "us",
    unit: useKilometers ? "km" : "mi"
  };

  if (useKilometers) {
    const startValue = parseFloat(getInputValue("mileageOdometerStart"));
    const endValue = parseFloat(getInputValue("mileageOdometerEnd"));
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
      setMileageMessage(t("mileage_error_odometer_required"));
      return null;
    }
    if (endValue < startValue) {
      setMileageMessage(t("mileage_error_odometer_order"));
      return null;
    }
    record.odometerStart = startValue;
    record.odometerEnd = endValue;
    record.kilometers = Number((endValue - startValue).toFixed(2));
  } else {
    const milesValue = parseFloat(getInputValue("mileageMiles"));
    if (!Number.isFinite(milesValue)) {
      setMileageMessage(t("mileage_error_miles_required"));
      return null;
    }
    record.miles = milesValue;
  }

  return record;
}

function updateKilometerHelper() {
  const note = document.getElementById("mileageCalcNote");
  if (!note) return;
  const useKilometers = shouldUseKilometers();
  if (!useKilometers) {
    note.textContent = "";
    return;
  }
  const start = Number(getInputValue("mileageOdometerStart"));
  const end = Number(getInputValue("mileageOdometerEnd"));
  const hasNumbers = Number.isFinite(start) && Number.isFinite(end);
  let diff = 0;
  if (hasNumbers) {
    diff = Number((end - start).toFixed(2));
  }
  const template =
    typeof t === "function"
      ? t("mileage_label_calc_km")
      : "Calculated distance: {{value}} km";
  note.textContent = template.replace("{{value}}", diff.toFixed(2));
  updateCanadaValidation(start, end, hasNumbers);
}

function getAddMileageButton() {
  return document.querySelector("#mileageForm button[type='submit']");
}

function updateCanadaValidation(start, end, hasNumbers) {
  const button = getAddMileageButton();
  if (!button) return;
  if (!shouldUseKilometers()) {
    button.disabled = false;
    setMileageMessage("");
    return;
  }
  const warningText = getCanadaWarningText();
  if (hasNumbers && end < start) {
    button.disabled = true;
    setMileageMessage(warningText);
    return;
  }
  button.disabled = false;
  const messageNode = document.getElementById("mileageFormMessage");
  if (messageNode && messageNode.textContent === warningText) {
    setMileageMessage("");
  }
}

function formatOdometer(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "";
}

function getCanadaWarningText() {
  const englishWarning = "End must be greater than start";
  const lang =
    typeof getCurrentLanguage === "function"
      ? getCurrentLanguage()
      : "en";
  if (lang === "en") {
    return englishWarning;
  }
  if (typeof t === "function") {
    return t("mileage_error_odometer_order") || englishWarning;
  }
  return englishWarning;
}

function deleteMileageRecord(id) {
  const updated = getMileageRecords().filter((record) => record.id !== id);
  saveMileageRecords(updated);
  refreshMileageView();
}

function getMileageRecords() {
  const raw = localStorage.getItem(MILEAGE_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveMileageRecords(records) {
  localStorage.setItem(MILEAGE_STORAGE_KEY, JSON.stringify(records));
}

function setMileageMessage(message) {
  const node = document.getElementById("mileageFormMessage");
  if (!node) {
    return;
  }
  node.textContent = message || "";
}

function getInputValue(id) {
  const element = document.getElementById(id);
  if (!element) {
    return "";
  }
  return (element.value || "").trim();
}

function getCurrentRegion() {
  const stored = window.LUNA_REGION || localStorage.getItem("lb_region");
  return stored && stored.toLowerCase() === "ca" ? "ca" : "us";
}