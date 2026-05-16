const CATEGORIES_TOAST_MS = 3000;

const CATEGORY_TAX_OPTIONS = {
  US: {
    income: [
      { value: "gross_receipts_sales", label: "Gross receipts or sales", line: "1" },
      { value: "returns_allowances", label: "Returns and allowances", line: "2" },
      { value: "interest_income", label: "Interest income", line: "Sch B" },
      { value: "other_income", label: "Other income", line: "6" },
      { value: "nonemployee_compensation", label: "Nonemployee compensation (1099-NEC)", line: "1099-NEC" },
      { value: "payment_card_income", label: "Payment card / third-party network income (1099-K)", line: "1099-K" },
      { value: "misc_income", label: "Other miscellaneous income (1099-MISC)", line: "1099-MISC" },
      { value: "cash_unreported_income", label: "Cash / unreported income", line: "Cash" }
    ],
    expense: [
      { value: "advertising", label: "Advertising", line: "8" },
      { value: "car_truck", label: "Car and truck expenses", line: "9" },
      { value: "commissions_fees", label: "Commissions and fees", line: "10" },
      { value: "contract_labor", label: "Contract labor", line: "11" },
      { value: "depletion", label: "Depletion", line: "12" },
      { value: "depreciation_section179", label: "Depreciation and section 179 expense deduction", line: "13" },
      { value: "employee_benefit_programs", label: "Employee benefit programs", line: "14" },
      { value: "insurance_other_than_health", label: "Insurance (other than health)", line: "15" },
      { value: "interest_mortgage", label: "Interest: mortgage (paid to banks, etc.)", line: "16a" },
      { value: "interest_other", label: "Interest: other", line: "16b" },
      { value: "legal_professional", label: "Legal and professional services", line: "17" },
      { value: "office_expense", label: "Office expense", line: "18" },
      { value: "pension_profit_sharing", label: "Pension and profit-sharing plans", line: "19" },
      { value: "rent_lease_vehicles", label: "Rent or lease: vehicles, machinery, equipment", line: "20a" },
      { value: "rent_lease_other", label: "Rent or lease: other business property", line: "20b" },
      { value: "repairs_maintenance", label: "Repairs and maintenance", line: "21" },
      { value: "supplies", label: "Supplies", line: "22" },
      { value: "taxes_licenses", label: "Taxes and licenses", line: "23" },
      { value: "travel", label: "Travel, meals, and entertainment: travel", line: "24a" },
      { value: "meals", label: "Travel, meals, and entertainment: meals", line: "24b" },
      { value: "utilities", label: "Utilities", line: "25" },
      { value: "wages", label: "Wages (less employment credits)", line: "26" },
      { value: "home_office", label: "Home office (Form 8829)", line: "30" },
      { value: "bank_fees", label: "Bank service charges", line: "27a" },
      { value: "software_subscriptions", label: "Software and subscriptions", line: "27a" },
      { value: "other_expense", label: "Other business expenses", line: "27a" }
    ]
  },
  CA: {
    income: [
      { value: "sales", label: "Gross sales / professional fees", line: "T2125 Line 8000" },
      { value: "gst_hst_collected", label: "GST/HST collected (balance sheet — not income)", line: "GST/HST" },
      { value: "subsidies_grants", label: "Subsidies, grants and rebates", line: "T2125 Line 8290" },
      { value: "other_income", label: "Other income", line: "T2125 Line 8290" },
      { value: "t4a_20", label: "Self-employment commissions (T4A Box 20)", line: "T4A Box 20" },
      { value: "t4a_28", label: "Other income (T4A Box 28)", line: "T4A Box 28" },
      { value: "cash_income", label: "Cash income", line: "Cash" }
    ],
    expense: [
      { value: "advertising", label: "Advertising", line: "T2125 Line 8810" },
      { value: "meals_entertainment", label: "Meals and entertainment (50%)", line: "T2125 Line 8820" },
      { value: "delivery_freight", label: "Delivery, freight and express", line: "T2125 Line 8870" },
      { value: "insurance", label: "Insurance", line: "T2125 Line 8871" },
      { value: "interest_bank_charges", label: "Interest and bank charges", line: "T2125 Line 8910" },
      { value: "legal_accounting", label: "Legal, accounting and professional fees", line: "T2125 Line 8960" },
      { value: "office_expense", label: "Office expenses", line: "T2125 Line 9270" },
      { value: "business_tax_fees_licenses_memberships", label: "Business taxes, licences and memberships", line: "T2125 Line 9270" },
      { value: "property_taxes", label: "Property taxes", line: "T2125 Line 9270" },
      { value: "salaries_wages_benefits", label: "Salaries, wages and benefits", line: "T2125 Line 9060" },
      { value: "rent", label: "Rent", line: "T2125 Line 9130" },
      { value: "maintenance_repairs", label: "Repairs and maintenance", line: "T2125 Line 9140" },
      { value: "utilities", label: "Telephone and utilities", line: "T2125 Line 9180" },
      { value: "travel", label: "Travel expenses", line: "T2125 Line 9200" },
      { value: "motor_vehicle", label: "Motor vehicle expenses", line: "T2125 Line 9281" },
      { value: "home_office", label: "Business-use-of-home expenses", line: "T2125 Line 9943" },
      { value: "gst_hst_paid", label: "GST/HST paid (input tax credits)", line: "GST/HST ITC" },
      { value: "other_expense", label: "Other expenses", line: "T2125 Line 9270" }
    ]
  }
};

// Lookup map for old ca_XXXX / t2125_XXXX values that may be stored in the DB
// from before the tax option keys were updated to plain-English names.
const LEGACY_TAX_VALUE_LABELS = {
  t2125_8000: { label: "Gross professional fees", line: "T2125 Line 8000" },
  t2125_8290: { label: "Other income", line: "T2125 Line 8290" },
  ca_8810: { label: "Advertising", line: "T2125 Line 8810" },
  ca_8820: { label: "Meals and entertainment (50%)", line: "T2125 Line 8820" },
  ca_8860: { label: "Bad debts", line: "T2125 Line 8860" },
  ca_8871: { label: "Insurance", line: "T2125 Line 8871" },
  ca_8910: { label: "Interest", line: "T2125 Line 8910" },
  ca_8960: { label: "Legal and accounting fees", line: "T2125 Line 8960" },
  ca_9060: { label: "Salaries, wages and benefits", line: "T2125 Line 9060" },
  ca_9130: { label: "Rent", line: "T2125 Line 9130" },
  ca_9140: { label: "Repairs and maintenance", line: "T2125 Line 9140" },
  ca_9180: { label: "Telephone and utilities", line: "T2125 Line 9180" },
  ca_9200: { label: "Travel", line: "T2125 Line 9200" },
  ca_9220: { label: "Fuel costs", line: "T2125 Line 9220" },
  ca_9270: { label: "Other expenses", line: "T2125 Line 9270" },
  ca_9281: { label: "Motor vehicle expenses", line: "T2125 Line 9281" },
  ca_9936: { label: "Capital cost allowance (CCA)", line: "T2125 Line 9936" },
  ca_9943: { label: "Business-use-of-home expenses", line: "T2125 Line 9943" }
};

let categoriesToastTimer = null;
let categoryRecords = [];
let currentRegion = null;
let unattachedReceiptsCount = 0;
let categoriesServerAvailable = true;
let categoriesLoading = false;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  await loadBusinessRegion();
  wireCategoryModal();
  wirePerListAddButtons();
  wireDefaultCategorySeed();
  await loadCategories();
  await refreshReceiptsDot();
});

function openCategoryModal(type) {
  const modal = document.getElementById("categoryModal");
  const typeSelect = document.getElementById("category-type");
  if (typeSelect && type) typeSelect.value = type;
  populateTaxLabelOptions(type || typeSelect?.value || "income");
  modal?.classList.remove("hidden");
}

function wirePerListAddButtons() {
  document.getElementById("addIncomeCategoryBtn")?.addEventListener("click", () => openCategoryModal("income"));
  document.getElementById("addExpenseCategoryBtn")?.addEventListener("click", () => openCategoryModal("expense"));
}

function wireCategoryModal() {
  const modal = document.getElementById("categoryModal");
  const cancelButton = document.getElementById("cancelCategoryModal");
  const backdrop = modal?.querySelector("[data-modal-close]");
  const form = document.getElementById("categoryForm");
  const colorInput = document.getElementById("category-color");
  const typeSelect = document.getElementById("category-type");
  const taxLabelSelect = document.getElementById("category-tax-label");

  cancelButton?.addEventListener("click", () => closeCategoryModal());
  backdrop?.addEventListener("click", () => closeCategoryModal());
  typeSelect?.addEventListener("change", () => populateTaxLabelOptions(typeSelect.value));

  document.querySelectorAll(".color-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach((item) => {
        item.classList.remove("is-active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
      if (colorInput) {
        colorInput.value = button.dataset.color || "blue";
      }
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("category-name")?.value.trim() || "";
    const type = typeSelect?.value || "income";
    const color = colorInput?.value || defaultColorForType(type);
    const taxLabel = taxLabelSelect?.value || "";
    const message = document.getElementById("categoryFormMessage");

    if (!name) {
      if (message) message.textContent = tx("categories_error_name");
      showFieldTooltip(document.getElementById("category-name"), tx("categories_validation_required") || "Please fill in this required field.");
      return;
    }

    const response = await apiFetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind: type,
        color,
        tax_map_us: currentRegion === "US" ? taxLabel || null : null,
        tax_map_ca: currentRegion === "CA" ? taxLabel || null : null
      })
    });

    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      if (message) message.textContent = errorPayload?.error || tx("categories_error_add");
      return;
    }

    closeCategoryModal();
    await loadCategories();
    showCategoriesToast(tx("categories_added"));
  });
}

function closeCategoryModal() {
  const modal = document.getElementById("categoryModal");
  const form = document.getElementById("categoryForm");
  const message = document.getElementById("categoryFormMessage");
  modal?.classList.add("hidden");
  form?.reset();
  if (message) message.textContent = "";
  const colorInput = document.getElementById("category-color");
  if (colorInput) {
    colorInput.value = "blue";
  }
  populateTaxLabelOptions("income");
  document.querySelectorAll(".color-swatch").forEach((item) => {
    item.classList.remove("is-active");
    item.setAttribute("aria-pressed", "false");
  });
  const blueBtn = document.querySelector('.color-swatch[data-color="blue"]');
  if (blueBtn) {
    blueBtn.classList.add("is-active");
    blueBtn.setAttribute("aria-pressed", "true");
  }
}

function wireDefaultCategorySeed() {
  const button = document.getElementById("seedDefaultCategoriesBtn");
  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    const message = document.getElementById("categoryMessage");
    button.disabled = true;
    if (message) {
      message.textContent = "";
    }

    try {
      const response = await apiFetch("/api/categories/defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = response ? await response.json().catch(() => null) : null;

      if (!response || !response.ok) {
        throw new Error(payload?.error || tx("categories_error_defaults"));
      }

      await loadCategories();
      showCategoriesToast(
        (payload?.inserted_count || 0) > 0
          ? tx("categories_defaults_added")
          : tx("categories_defaults_already_present")
      );
    } catch (error) {
      if (message) {
        message.textContent = error?.message || tx("categories_error_defaults");
      }
    } finally {
      button.disabled = false;
    }
  });
}

async function loadCategories() {
  categoriesLoading = categoryRecords.length === 0;
  if (categoriesLoading) {
    renderCategoryLists();
  }
  try {
    const response = await apiFetch("/api/categories");
    if (!response || !response.ok) {
      throw new Error(tx("categories_error_load"));
    }
    let categories = await response.json().catch(() => []);
    if (Array.isArray(categories) && categories.length === 0) {
      categories = await migrateLegacyCategories();
    }
    categoryRecords = Array.isArray(categories) ? categories.map(normalizeCategory) : [];
    categoriesServerAvailable = true;
  } catch (error) {
    console.error("Failed to load categories:", error);
    categoryRecords = [];
    categoriesServerAvailable = false;
  }
  categoriesLoading = false;
  showCategoriesOfflineBanner(!categoriesServerAvailable);
  renderCategoryLists();
}

function showCategoriesOfflineBanner(show) {
  let banner = document.getElementById("categoriesOfflineBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "categoriesOfflineBanner";
    banner.className = "offline-banner";
    const main = document.querySelector("main") || document.body;
    main.insertBefore(banner, main.firstChild);
  }
  banner.hidden = !show;
  banner.textContent = show ? tx("categories_offline_warning") : "";

  const defaultsButton = document.getElementById("seedDefaultCategoriesBtn");
  if (defaultsButton) defaultsButton.disabled = show;
  const incomeBtn = document.getElementById("addIncomeCategoryBtn");
  const expenseBtn = document.getElementById("addExpenseCategoryBtn");
  if (incomeBtn) incomeBtn.disabled = show;
  if (expenseBtn) expenseBtn.disabled = show;
}

function normalizeCategory(category) {
  return {
    id: category.id,
    name: category.name || "",
    type: category.kind === "income" ? "income" : "expense",
    color: category.color || defaultColorForType(category.kind === "income" ? "income" : "expense"),
    taxLabel: currentRegion === "CA" ? category.tax_map_ca || "" : category.tax_map_us || ""
  };
}

function renderCategoryLists() {
  renderCategoryGroup("incomeCategories", "income", tx("categories_no_income"));
  renderCategoryGroup("expenseCategories", "expense", tx("categories_no_expense"));
}

function renderCategoryGroup(containerId, type, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (categoriesLoading) {
    container.innerHTML = `<div class="category-empty category-loading"><p>${escapeHtml(tx("categories_loading"))}</p></div>`;
    return;
  }

  const categories = categoryRecords.filter((item) => item.type === type);
  if (!categories.length) {
    container.innerHTML = `<div class="category-empty"><p>${escapeHtml(emptyText)}</p></div>`;
    return;
  }

  container.innerHTML = categories.map((category) => {
    const taxInfo = category.taxLabel ? getTaxInfo(category.taxLabel) : null;
    const taxChipHtml = taxInfo
      ? `<span class="category-tax-pill" title="${escapeHtml(taxInfo.label)}">${escapeHtml(taxInfo.line || taxInfo.label)}</span>`
      : "";
    return `
    <div class="category-item">
      <div class="category-item-meta">
        <span class="category-pill pill-${escapeHtml(category.color || defaultColorForType(type))}">${escapeHtml(category.name)}</span>
        ${taxChipHtml}
      </div>
      <button type="button" class="category-delete" data-category-delete="${escapeHtml(category.id)}" aria-label="${escapeHtml(tx("common_delete") + " " + (category.name || tx("categories_fallback_name")))}">${escapeHtml(tx("common_delete"))}</button>
    </div>
  `;
  }).join("");

  container.querySelectorAll("[data-category-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleCategoryDelete(button.getAttribute("data-category-delete") || "");
    });
  });
}

async function handleCategoryDelete(categoryId) {
  const message = document.getElementById("categoryMessage");
  if (!window.confirm(tx("categories_confirm_delete"))) {
    return;
  }
  const response = await apiFetch(`/api/categories/${categoryId}`, { method: "DELETE" });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    if (message) message.textContent = errorPayload?.error || tx("categories_error_delete");
    return;
  }

  if (message) message.textContent = "";
  await loadCategories();
  showCategoriesToast(tx("categories_deleted"));
}

function populateTaxLabelOptions(type) {
  const select = document.getElementById("category-tax-label");
  const hint = document.getElementById("categoryTaxHint");
  if (!select) return;

  const options = currentRegion ? CATEGORY_TAX_OPTIONS[currentRegion]?.[type === "expense" ? "expense" : "income"] || [] : [];
  const previous = select.value;
  select.innerHTML = `<option value="">${escapeHtml(tx("categories_tax_select"))}</option>`;
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    // Show as "{label} — {line}" if line exists
    node.textContent = option.line ? `${option.label} — ${option.line}` : option.label;
    node.setAttribute("data-line", option.line || "");
    node.setAttribute("data-label", option.label);
    select.appendChild(node);
  });
  select.value = options.some((option) => option.value === previous) ? previous : "";
  select.disabled = !currentRegion || options.length === 0;

  function buildHintText(selected) {
    if (!selected || !selected.line) return "";
    const { line, label } = selected;
    if (currentRegion === "US" && type === "expense" && /^\d/.test(line)) {
      return `Schedule C Line ${line}: ${label}`;
    }
    return `${line}: ${label}`;
  }

  if (hint) {
    const selected = options.find(opt => opt.value === select.value);
    const text = buildHintText(selected);
    hint.textContent = text;
    hint.style.display = text ? "block" : "none";
  }

  const updateHint = () => {
    if (hint) {
      const selected = options.find(opt => opt.value === select.value);
      const text = buildHintText(selected);
      hint.textContent = text;
      hint.style.display = text ? "block" : "none";
    }
  };
  if (typeof select.__categoryTaxHintHandler === "function") {
    select.removeEventListener("change", select.__categoryTaxHintHandler);
  }
  select.__categoryTaxHintHandler = updateHint;
  select.addEventListener("change", select.__categoryTaxHintHandler);
  updateHint();
}

async function loadBusinessRegion() {
  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      currentRegion = null;
      showCategoriesToast(tx("categories_error_region_load"));
      return;
    }
    const business = await response.json();
    const region = String(business?.region || "").toUpperCase();
    if (region === "CA" || region === "US") {
      currentRegion = region;
      localStorage.setItem("lb_region", region.toLowerCase());
      window.LUNA_REGION = region.toLowerCase();
      return;
    } else {
      currentRegion = null;
      showCategoriesToast(tx("categories_error_region_invalid"));
      return;
    }
  } catch (error) {
    console.warn("[Categories] Unable to load business region", error);
    showCategoriesToast(tx("categories_error_region_load"));
  }
  currentRegion = null;
}

async function migrateLegacyCategories() {
  const legacyCategories = getCategories()
    .filter((category) => category && typeof category === "object" && category.name)
    .map((category) => ({
      name: String(category.name || "").trim(),
      kind: category.type === "income" ? "income" : "expense",
      color: normalizeCategoryColor(category.color, category.type),
      tax_map_us:
        currentRegion === "US" && category.taxLabel
          ? String(category.taxLabel)
          : null,
      tax_map_ca:
        currentRegion === "CA" && category.taxLabel
          ? String(category.taxLabel)
          : null
    }))
    .filter((category) => category.name);

  if (!legacyCategories.length) {
    return [];
  }

  for (const category of legacyCategories) {
    const response = await apiFetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(category)
    });

    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      throw new Error(errorPayload?.error || tx("categories_error_migrate"));
    }
  }

  const refreshed = await apiFetch("/api/categories");
  if (!refreshed || !refreshed.ok) {
    throw new Error(tx("categories_error_reload"));
  }
  const payload = await refreshed.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
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
  } catch (error) {
    console.warn("[Categories] Unable to load receipts", error);
    unattachedReceiptsCount = 0;
  }
  updateReceiptsDot();
}

function getTaxInfo(value) {
  if (!value) return null;
  const groups = currentRegion ? CATEGORY_TAX_OPTIONS[currentRegion] : null;
  if (groups) {
    const found = [...groups.income, ...groups.expense].find((o) => o.value === value);
    if (found) return { label: found.label, line: found.line };
  }
  const legacy = LEGACY_TAX_VALUE_LABELS[value];
  if (legacy) return legacy;
  return null;
}

function formatTaxLabel(value) {
  const info = getTaxInfo(value);
  return info ? info.label : (value || "");
}

function getCategories() {
  return Array.isArray(categoryRecords) ? categoryRecords : [];
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) return;
  dot.hidden = unattachedReceiptsCount === 0;
}

function defaultColorForType(type) {
  return type === "income" ? "green" : "blue";
}

function normalizeCategoryColor(color, type) {
  const value = String(color || "").toLowerCase();
  if (["blue", "green", "amber", "pink", "red", "slate"].includes(value)) {
    return value;
  }
  return defaultColorForType(type);
}

function showCategoriesToast(message) {
  const toast = document.getElementById("categoriesToast");
  const messageNode = document.getElementById("categoriesToastMessage");
  if (!toast || !messageNode) return;
  messageNode.textContent = message;
  toast.classList.remove("hidden");
  if (categoriesToastTimer) clearTimeout(categoriesToastTimer);
  categoriesToastTimer = window.setTimeout(() => toast.classList.add("hidden"), CATEGORIES_TOAST_MS);
}
