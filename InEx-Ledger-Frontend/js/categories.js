const CATEGORIES_STORAGE_KEY = "lb_categories";
const TRANSACTIONS_STORAGE_KEY = "lb_transactions";

const US_SCHEDULE_C_OPTIONS = [
  "Advertising",
  "Car and truck expenses",
  "Commissions and fees",
  "Contract labor",
  "Depletion",
  "Depreciation (Line 13)",
  "Employee benefit programs",
  "Insurance (other than health)",
  "Interest — Mortgage (Line 16a)",
  "Interest — Other (Line 16b)",
  "Legal and professional services",
  "Office expense",
  "Pension / profit-sharing plans",
  "Rent — Vehicles, machines, equipment (Line 20a)",
  "Rent — Other business property (Line 20b)",
  "Repairs and maintenance",
  "Supplies",
  "Taxes and licenses",
  "Travel and meals",
  "Deductible meals (Line 24b)",
  "Utilities",
  "Wages",
  "Other expenses"
];

const CA_T2125_OPTIONS = [
  "Advertising",
  "Bad debts",
  "Business taxes, licences, and memberships",
  "Insurance",
  "Interest and bank charges",
  "Maintenance and repairs",
  "Meals and entertainment",
  "Motor vehicle expenses",
  "Office expenses",
  "Legal, accounting, and other professional fees",
  "Management and administration fees",
  "Rent",
  "Property taxes",
  "Salaries, wages, and benefits",
  "Supplies",
  "Travel",
  "Utilities",
  "Other expenses"
];

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  setupTaxLabelControls();
  ensureDefaultCategories();
  wireCategoryForm();
  renderCategoryLists();
});

function wireCategoryForm() {
  const showButton = document.getElementById("showCategoryForm");
  const modal = document.getElementById("categoryModal");
  const modalBackdrop = modal?.querySelector("[data-modal-close]");
  const modalClose = document.getElementById("categoryModalClose");
  const form = document.getElementById("categoryForm");
  const message = document.getElementById("categoryFormMessage");
  const nameInput = document.getElementById("category-name");
  const typeInput = document.getElementById("category-type");

  const openModal = () => {
    modal?.classList.remove("hidden");
    nameInput?.focus();
  };

  const closeModal = () => {
    modal?.classList.add("hidden");
  };

  if (showButton) {
    showButton.addEventListener("click", openModal);
  }

  modalBackdrop?.addEventListener("click", closeModal);
  modalClose?.addEventListener("click", closeModal);

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput?.value.trim() ?? "";
      const type = typeInput?.value ?? "";
      const taxLabelInput = getTaxLabelInputForRegion();
      const taxLabel = taxLabelInput?.value?.trim() ?? "";

      if (!name || !type) {
        if (message) {
          message.textContent = "Provide a name and choose a type.";
        }
        return;
      }

      const categories = getCategories();
      const newCategory = {
        id: `cat_${type}_${slugify(name)}`,
        name,
        type,
        taxLabel
      };

      categories.push(newCategory);
      saveCategories(categories);

      window.dispatchEvent(new Event("categoriesUpdated"));

      if (message) {
        message.textContent = "";
      }

      form.reset();
      renderCategoryLists();
      closeModal();
    });
  }
}

function renderCategoryLists() {
  const incomeContainer = document.getElementById("incomeCategories");
  const expenseContainer = document.getElementById("expenseCategories");
  const categories = getCategories();

  const message = document.getElementById("categoryMessage");
  if (message) {
    message.textContent = "";
  }

  if (incomeContainer) {
    incomeContainer.innerHTML = "";
    const income = categories.filter((item) => item.type === "income");
    if (income.length === 0) {
      const message =
        typeof t === "function"
          ? t("categories_no_income")
          : "No income categories yet.";
      incomeContainer.innerHTML = `<p class='category-note'>${message}</p>`;
    } else {
      income.forEach((category) => {
        incomeContainer.appendChild(buildCategoryCard(category));
      });
    }
  }

  if (expenseContainer) {
    expenseContainer.innerHTML = "";
    const expense = categories.filter((item) => item.type === "expense");
    if (expense.length === 0) {
      const message =
        typeof t === "function"
          ? t("categories_no_expense")
          : "No expense categories yet.";
      expenseContainer.innerHTML = `<p class='category-note'>${message}</p>`;
    } else {
      expense.forEach((category) => {
        expenseContainer.appendChild(buildCategoryCard(category));
      });
    }
  }
}

function buildCategoryCard(category) {
  const card = document.createElement("div");
  card.className = "category-row category-card";
  const title = document.createElement("h4");
  title.textContent = category.name;
  const button = document.createElement("button");
  button.textContent = "Delete";
  button.addEventListener("click", () => {
    handleCategoryDelete(category.id);
  });
  card.appendChild(title);
  card.appendChild(button);
  return card;
}

function handleCategoryDelete(categoryId) {
  if (isCategoryUsed(categoryId)) {
    const message = document.getElementById("categoryMessage");
    if (message) {
      message.textContent =
        typeof t === "function"
          ? t("categories_in_use")
          : "This category cannot be deleted because it is in use.";
    }
    return;
  }

  const categories = getCategories().filter((item) => item.id !== categoryId);
  saveCategories(categories);
  window.dispatchEvent(new Event("categoriesUpdated"));
  const message = document.getElementById("categoryMessage");
  if (message) {
    message.textContent = "";
  }
  renderCategoryLists();
}

function ensureDefaultCategories() {
  const existing = getCategories();
  if (existing.length > 0) {
    return existing;
  }

  const defaults = window.LUNA_DEFAULTS?.categories || {};
  const income = defaults.income || [];
  const expense = defaults.expense || [];
  const seeded = [];

  income.forEach((name) => {
    seeded.push({
      id: `cat_income_${slugify(name)}`,
      name,
      type: "income",
      taxLabel: ""
    });
  });

  expense.forEach((name) => {
    seeded.push({
      id: `cat_expense_${slugify(name)}`,
      name,
      type: "expense",
      taxLabel: ""
    });
  });

  saveCategories(seeded);
  return seeded;
}

function getCategories() {
  const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveCategories(categories) {
  localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
}

function getTransactions() {
  const raw = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function isCategoryUsed(categoryId) {
  const transactions = getTransactions();
  return transactions.some((txn) => txn.categoryId === categoryId);
}

function setupTaxLabelControls() {
  refreshTaxLabelControls();
  window.addEventListener("storage", (event) => {
    if (event.key === "lb_region") {
      refreshTaxLabelControls();
    }
  });
}

function refreshTaxLabelControls() {
  const region = getCurrentRegion();
  const label = document.getElementById("taxLabelLabel");
  if (label) {
    label.textContent = region === "ca" ? "Map to CRA T2125" : "Map to Schedule C";
  }
  populateTaxLabelOptions(region);
  updateRegionMappingNote(region);
}

function populateTaxLabelOptions(region) {
  const select = document.getElementById("taxLabelSelect");
  if (!select) return;
  const previousValue = select.value;
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent =
    region === "ca" ? "(Optional) Map to T2125" : "(Optional) Map to Schedule C";
  select.appendChild(placeholder);
  const options = getTaxOptionsForRegion(region);
  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  });
  if (previousValue) {
    const match = options.find(
      (optionValue) => optionValue.toLowerCase() === previousValue.toLowerCase()
    );
    if (match) {
      select.value = match;
    }
  }
}

function updateRegionMappingNote(region) {
  const note = document.getElementById("taxRegionNote");
  if (!note) return;
  const options = getTaxOptionsForRegion(region).map((option) =>
    option.toLowerCase()
  );
  const hasMismatch = getCategories().some((category) => {
    if (!category.taxLabel) {
      return false;
    }
    return !options.includes(category.taxLabel.toLowerCase());
  });
  if (hasMismatch) {
    note.removeAttribute("hidden");
  } else {
    note.setAttribute("hidden", "");
  }
}

function getTaxOptionsForRegion(region) {
  const target = region || getCurrentRegion();
  return target === "ca" ? CA_T2125_OPTIONS : US_SCHEDULE_C_OPTIONS;
}

function getCurrentRegion() {
  const stored = window.LUNA_REGION || localStorage.getItem("lb_region");
  return stored && stored.toLowerCase() === "ca" ? "ca" : "us";
}

function getTaxLabelInputForRegion() {
  return document.getElementById("taxLabelSelect");
}

function slugify(value) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
