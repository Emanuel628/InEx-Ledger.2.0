const CATEGORIES_STORAGE_KEY = "lb_categories";
const CATEGORIES_TOAST_MS = 3000;

const CATEGORY_TAX_OPTIONS = {
  US: {
    income: [
      { value: "gross_receipts_sales", label: "Gross receipts or sales" },
      { value: "returns_allowances", label: "Returns and allowances" },
      { value: "other_business_income", label: "Other business income" },
      { value: "interest_income", label: "Interest income" },
      { value: "refunds_credits", label: "Refunds and tax credits" },
      { value: "other_income", label: "Other income" }
    ],
    expense: [
      { value: "advertising", label: "Advertising" },
      { value: "car_truck", label: "Car and truck expenses" },
      { value: "commissions_fees", label: "Commissions and fees" },
      { value: "contract_labor", label: "Contract labor" },
      { value: "depletion", label: "Depletion" },
      { value: "depreciation_section179", label: "Depreciation and Section 179" },
      { value: "employee_benefit_programs", label: "Employee benefit programs" },
      { value: "insurance_other_than_health", label: "Insurance (other than health)" },
      { value: "interest_mortgage", label: "Interest: mortgage" },
      { value: "interest_other", label: "Interest: other" },
      { value: "legal_professional", label: "Legal and professional services" },
      { value: "office_expense", label: "Office expense" },
      { value: "pension_profit_sharing", label: "Pension and profit-sharing plans" },
      { value: "rent_lease_vehicles", label: "Rent or lease: vehicles, machinery, equipment" },
      { value: "rent_lease_other", label: "Rent or lease: other business property" },
      { value: "repairs_maintenance", label: "Repairs and maintenance" },
      { value: "supplies", label: "Supplies" },
      { value: "taxes_licenses", label: "Taxes and licenses" },
      { value: "travel", label: "Travel" },
      { value: "meals", label: "Meals" },
      { value: "utilities", label: "Utilities" },
      { value: "wages", label: "Wages" },
      { value: "home_office", label: "Business use of home" },
      { value: "bank_fees", label: "Bank and payment processing fees" },
      { value: "software_subscriptions", label: "Software and subscriptions" },
      { value: "other_expense", label: "Other expense" }
    ]
  },
  CA: {
    income: [
      { value: "sales", label: "Sales" },
      { value: "commissions_fees", label: "Commissions and fees" },
      { value: "gst_hst_collected", label: "GST/HST/PST/QST collected" },
      { value: "bad_debts_recovered", label: "Bad debts recovered" },
      { value: "subsidies_grants", label: "Subsidies and grants" },
      { value: "other_income", label: "Other income" }
    ],
    expense: [
      { value: "advertising", label: "Advertising" },
      { value: "meals_entertainment", label: "Meals and entertainment" },
      { value: "insurance", label: "Insurance" },
      { value: "interest_bank_charges", label: "Interest and bank charges" },
      { value: "business_tax_fees_licenses_memberships", label: "Business tax, fees, licenses, memberships" },
      { value: "office_expense", label: "Office expenses" },
      { value: "supplies", label: "Supplies" },
      { value: "legal_accounting", label: "Legal, accounting, and professional fees" },
      { value: "management_admin", label: "Management and administration fees" },
      { value: "rent", label: "Rent" },
      { value: "maintenance_repairs", label: "Maintenance and repairs" },
      { value: "salaries_wages_benefits", label: "Salaries, wages, and benefits" },
      { value: "property_taxes", label: "Property taxes" },
      { value: "travel", label: "Travel" },
      { value: "utilities", label: "Utilities" },
      { value: "delivery_freight", label: "Delivery, freight, and express" },
      { value: "motor_vehicle", label: "Motor vehicle" },
      { value: "capital_cost_allowance", label: "Capital cost allowance" },
      { value: "home_office", label: "Business-use-of-home expenses" },
      { value: "professional_fees", label: "Professional fees" },
      { value: "gst_hst_paid", label: "GST/HST/PST/QST paid" },
      { value: "other_expense", label: "Other expense" }
    ]
  }
};

let categoriesToastTimer = null;
let categoryRecords = [];
let currentRegion = null;
let unattachedReceiptsCount = 0;
let categoriesServerAvailable = true;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  await loadBusinessRegion();
  wireCategoryModal();
  await loadCategories();
  await refreshReceiptsDot();
});

function wireCategoryModal() {
  const modal = document.getElementById("categoryModal");
  const openButton = document.getElementById("showCategoryModal");
  const cancelButton = document.getElementById("cancelCategoryModal");
  const backdrop = modal?.querySelector("[data-modal-close]");
  const form = document.getElementById("categoryForm");
  const colorInput = document.getElementById("category-color");
  const typeSelect = document.getElementById("category-type");
  const taxLabelSelect = document.getElementById("category-tax-label");

  openButton?.addEventListener("click", () => {
    populateTaxLabelOptions(typeSelect?.value || "income");
    modal?.classList.remove("hidden");
  });
  cancelButton?.addEventListener("click", () => closeCategoryModal());
  backdrop?.addEventListener("click", () => closeCategoryModal());
  typeSelect?.addEventListener("change", () => populateTaxLabelOptions(typeSelect.value));

  document.querySelectorAll(".color-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
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
      const errorPayload = await response?.json().catch(() => null);
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
  document.getElementById("category-color").value = "blue";
  populateTaxLabelOptions("income");
  document.querySelectorAll(".color-swatch").forEach((item) => item.classList.remove("is-active"));
  document.querySelector('.color-swatch[data-color="blue"]')?.classList.add("is-active");
}

async function loadCategories() {
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
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categoryRecords));
    categoriesServerAvailable = true;
  } catch (error) {
    console.error("Failed to load categories:", error);
    categoryRecords = getCategories();
    categoriesServerAvailable = false;
  }
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

  const addButton = document.getElementById("showCategoryModal");
  if (addButton) {
    addButton.disabled = show;
  }
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

  const categories = categoryRecords.filter((item) => item.type === type);
  if (!categories.length) {
    const addLabel = type === "income" ? tx("categories_add_income") : tx("categories_add_expense");
    container.innerHTML = `<div class="category-empty"><p>${escapeHtml(emptyText)}</p><button type="button" class="empty-add-btn" data-empty-add="${type}">${escapeHtml(addLabel)}</button></div>`;
    container.querySelector("[data-empty-add]")?.addEventListener("click", () => {
      document.getElementById("category-type").value = type;
      populateTaxLabelOptions(type);
      document.getElementById("showCategoryModal")?.click();
    });
    return;
  }

  container.innerHTML = categories.map((category) => `
    <div class="category-item">
      <div>
        <span class="category-pill pill-${escapeHtml(category.color || defaultColorForType(type))}">${escapeHtml(category.name)}</span>
        ${category.taxLabel ? `<div class="field-hint">${escapeHtml(formatTaxLabel(category.taxLabel))}</div>` : ""}
      </div>
      <button type="button" class="category-delete" data-category-delete="${escapeHtml(category.id)}">${escapeHtml(tx("common_delete"))}</button>
    </div>
  `).join("");

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
    const errorPayload = await response?.json().catch(() => null);
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
    node.textContent = option.label;
    select.appendChild(node);
  });
  select.value = options.some((option) => option.value === previous) ? previous : "";
  select.disabled = !currentRegion || options.length === 0;

  if (hint) {
    if (currentRegion === "CA") {
      hint.textContent = tx("categories_tax_hint_ca");
    } else if (currentRegion === "US") {
      hint.textContent = tx("categories_tax_hint_us");
    } else {
      hint.textContent = tx("categories_tax_hint_region");
    }
  }
}

async function loadBusinessRegion() {
  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      currentRegion = null;
      return;
    }
    const business = await response.json();
    const region = String(business?.region || "").toUpperCase();
    if (region === "CA" || region === "US") {
      currentRegion = region;
      localStorage.setItem("lb_region", region.toLowerCase());
      window.LUNA_REGION = region.toLowerCase();
      return;
    }
  } catch (error) {
    console.warn("[Categories] Unable to load business region", error);
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
      const errorPayload = await response?.json().catch(() => null);
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

function formatTaxLabel(value) {
  const groups = currentRegion ? CATEGORY_TAX_OPTIONS[currentRegion] : null;
  if (!groups) return value;
  const options = [...groups.income, ...groups.expense];
  return options.find((option) => option.value === value)?.label || value;
}

function getCategories() {
  try {
    return JSON.parse(localStorage.getItem(CATEGORIES_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
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

function escapeHtml(value) {
  return `${value ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
