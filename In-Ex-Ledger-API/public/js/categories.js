const CATEGORIES_STORAGE_KEY = "lb_categories";
const TRANSACTIONS_STORAGE_KEY = "lb_transactions";
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

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  await loadBusinessRegion();
  ensureDefaultCategories();
  wireCategoryModal();
  renderCategoryLists();
  updateReceiptsDot();
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

  populateTaxLabelOptions(typeSelect?.value || "income");

  document.querySelectorAll(".color-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      if (colorInput) {
        colorInput.value = button.dataset.color || "blue";
      }
    });
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("category-name")?.value.trim() || "";
    const type = typeSelect?.value || "income";
    const color = colorInput?.value || "blue";
    const taxLabel = taxLabelSelect?.value || "";
    const message = document.getElementById("categoryFormMessage");

    if (!name) {
      if (message) {
        message.textContent = "Enter a category name.";
      }
      return;
    }

    const categories = getCategories();
    categories.push({
      id: `cat_${type}_${slugify(name)}_${Date.now()}`,
      name,
      type,
      color,
      taxLabel
    });
    saveCategories(categories);
    window.dispatchEvent(new Event("categoriesUpdated"));
    closeCategoryModal();
    renderCategoryLists();
    showCategoriesToast("Category added");
  });
}

function closeCategoryModal() {
  const modal = document.getElementById("categoryModal");
  const form = document.getElementById("categoryForm");
  const message = document.getElementById("categoryFormMessage");
  modal?.classList.add("hidden");
  form?.reset();
  if (message) {
    message.textContent = "";
  }
  document.getElementById("category-color").value = "blue";
  populateTaxLabelOptions("income");
  document.querySelectorAll(".color-swatch").forEach((item) => item.classList.remove("is-active"));
  document.querySelector('.color-swatch[data-color="blue"]')?.classList.add("is-active");
}

function renderCategoryLists() {
  renderCategoryGroup("incomeCategories", "income", "No income categories yet.");
  renderCategoryGroup("expenseCategories", "expense", "No expense categories yet.");
}

function renderCategoryGroup(containerId, type, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  const categories = getCategories().filter((item) => item.type === type);
  if (!categories.length) {
    container.innerHTML = `<div class="category-empty"><p>${emptyText}</p><button type="button" class="empty-add-btn" data-empty-add="${type}">+ Add ${type} category</button></div>`;
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
      <button type="button" class="category-delete" data-category-delete="${escapeHtml(category.id)}">Delete</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-category-delete]").forEach((button) => {
    button.addEventListener("click", () => handleCategoryDelete(button.getAttribute("data-category-delete") || ""));
  });
}

function handleCategoryDelete(categoryId) {
  const message = document.getElementById("categoryMessage");
  if (isCategoryUsed(categoryId)) {
    if (message) {
      message.textContent = "This category cannot be deleted because it is in use.";
    }
    return;
  }

  saveCategories(getCategories().filter((item) => item.id !== categoryId));
  if (message) {
    message.textContent = "";
  }
  renderCategoryLists();
  showCategoriesToast("Category deleted");
}

function ensureDefaultCategories() {
  const existing = getCategories();
  if (existing.length) {
    return;
  }
  const defaults = window.LUNA_DEFAULTS?.categories || {};
  const seeded = [];
  (defaults.income || []).forEach((name) => seeded.push({ id: `cat_income_${slugify(name)}`, name, type: "income", color: "green" }));
  (defaults.expense || []).forEach((name) => seeded.push({ id: `cat_expense_${slugify(name)}`, name, type: "expense", color: "blue" }));
  saveCategories(seeded);
}

function populateTaxLabelOptions(type) {
  const select = document.getElementById("category-tax-label");
  const hint = document.getElementById("categoryTaxHint");
  if (!select) {
    return;
  }

  const region = getCurrentRegion();
  const options = region ? CATEGORY_TAX_OPTIONS[region]?.[type === "expense" ? "expense" : "income"] || [] : [];
  const previous = select.value;
  select.innerHTML = '<option value="">Select tax treatment</option>';
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  });
  select.value = options.some((option) => option.value === previous) ? previous : "";
  select.disabled = !region || options.length === 0;

  if (hint) {
    if (region === "CA") {
      hint.textContent = "Showing Canadian T2125 and sales-tax mappings only.";
    } else if (region === "US") {
      hint.textContent = "Showing U.S. Schedule C mappings only.";
    } else {
      hint.textContent = "Set your business region first so only the correct tax mappings are shown.";
    }
  }
}

function getCurrentRegion() {
  const raw = String(localStorage.getItem("lb_region") || window.LUNA_REGION || "").toUpperCase();
  if (raw === "CA" || raw === "US") {
    return raw;
  }
  return null;
}

async function loadBusinessRegion() {
  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      return;
    }
    const business = await response.json();
    const region = String(business?.region || "").toUpperCase();
    if (region === "CA" || region === "US") {
      localStorage.setItem("lb_region", region.toLowerCase());
      window.LUNA_REGION = region.toLowerCase();
    }
  } catch (error) {
    console.warn("[Categories] Unable to load business region", error);
  }
}

function formatTaxLabel(value) {
  const region = getCurrentRegion();
  const groups = region ? CATEGORY_TAX_OPTIONS[region] : null;
  if (!groups) {
    return value;
  }
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

function saveCategories(categories) {
  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
}

function isCategoryUsed(categoryId) {
  try {
    const transactions = JSON.parse(localStorage.getItem(TRANSACTIONS_STORAGE_KEY) || "[]");
    return transactions.some((transaction) => transaction.categoryId === categoryId);
  } catch {
    return false;
  }
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

function defaultColorForType(type) {
  return type === "income" ? "green" : "blue";
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

function slugify(value) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function escapeHtml(value) {
  return `${value ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
