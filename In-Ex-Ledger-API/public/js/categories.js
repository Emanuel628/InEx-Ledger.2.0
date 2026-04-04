const CATEGORIES_STORAGE_KEY = "lb_categories";
const TRANSACTIONS_STORAGE_KEY = "lb_transactions";
const CATEGORIES_TOAST_MS = 3000;

const CATEGORY_TAX_OPTIONS = {
  US: {
    income: [
      { value: "schedule_c_income", label: "Business income (Schedule C / T2125)" },
      { value: "interest_income", label: "Interest income" },
      { value: "other_income", label: "Other income" }
    ],
    expense: [
      { value: "advertising", label: "Advertising / marketing" },
      { value: "office_expense", label: "Office expense" },
      { value: "software_tools", label: "Software / tools" },
      { value: "travel_meals", label: "Travel / meals" },
      { value: "vehicle_mileage", label: "Vehicle / mileage" },
      { value: "professional_fees", label: "Professional fees" },
      { value: "other_expense", label: "Other expense" }
    ]
  },
  CA: {
    income: [
      { value: "t2125_income", label: "Business income (T2125)" },
      { value: "gst_hst_collected", label: "GST/HST/PST/QST collected" },
      { value: "other_income", label: "Other income" }
    ],
    expense: [
      { value: "advertising", label: "Advertising" },
      { value: "office_expense", label: "Office expense" },
      { value: "software_tools", label: "Software / tools" },
      { value: "travel_meals", label: "Travel / meals" },
      { value: "motor_vehicle", label: "Motor vehicle" },
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
  const options = CATEGORY_TAX_OPTIONS[region]?.[type === "expense" ? "expense" : "income"] || [];
  const previous = select.value;
  select.innerHTML = '<option value="">Select tax treatment</option>';
  options.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  });
  select.value = options.some((option) => option.value === previous) ? previous : "";

  if (hint) {
    hint.textContent = region === "CA"
      ? "Choose the Canadian tax bucket this category maps to."
      : "Choose the U.S. tax bucket this category maps to.";
  }
}

function getCurrentRegion() {
  const raw = String(localStorage.getItem("lb_region") || window.LUNA_REGION || "us").toUpperCase();
  return raw === "CA" ? "CA" : "US";
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
  const groups = CATEGORY_TAX_OPTIONS[region] || CATEGORY_TAX_OPTIONS.US;
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
