const CATEGORIES_TOAST_MS = 3000;

const CATEGORY_TAX_OPTIONS = {
  US: {
    income: [
      { value: "gross_receipts_sales", label: "Gross receipts or sales", line: "Schedule C Line 1" },
      { value: "returns_allowances", label: "Returns and allowances", line: "Schedule C Line 2" },
      { value: "interest_income", label: "Interest income", line: "Schedule B" },
      { value: "other_income", label: "Other income", line: "Schedule C Line 6" },
      { value: "nonemployee_compensation", label: "Nonemployee compensation", line: "1099-NEC" },
      { value: "payment_card_income", label: "Payment card / third-party network income", line: "1099-K" },
      { value: "misc_income", label: "Other miscellaneous income", line: "1099-MISC" },
      { value: "cash_unreported_income", label: "Cash / unreported income", line: "Cash" }
    ],
    expense: [
      { value: "advertising", label: "Advertising", line: "Schedule C Line 8" },
      { value: "car_truck", label: "Car and truck expenses", line: "Schedule C Line 9" },
      { value: "commissions_fees", label: "Commissions and fees", line: "Schedule C Line 10" },
      { value: "contract_labor", label: "Contract labor", line: "Schedule C Line 11" },
      { value: "insurance_other_than_health", label: "Insurance (other than health)", line: "Schedule C Line 15" },
      { value: "interest_mortgage", label: "Interest: mortgage", line: "Schedule C Line 16a" },
      { value: "interest_other", label: "Interest: other", line: "Schedule C Line 16b" },
      { value: "legal_professional", label: "Legal and professional services", line: "Schedule C Line 17" },
      { value: "office_expense", label: "Office expense", line: "Schedule C Line 18" },
      { value: "repairs_maintenance", label: "Repairs and maintenance", line: "Schedule C Line 21" },
      { value: "supplies", label: "Supplies", line: "Schedule C Line 22" },
      { value: "taxes_licenses", label: "Taxes and licenses", line: "Schedule C Line 23" },
      { value: "travel", label: "Travel", line: "Schedule C Line 24a" },
      { value: "meals", label: "Meals", line: "Schedule C Line 24b" },
      { value: "utilities", label: "Utilities", line: "Schedule C Line 25" },
      { value: "wages", label: "Wages", line: "Schedule C Line 26" },
      { value: "home_office", label: "Home office", line: "Form 8829 / Line 30" },
      { value: "bank_fees", label: "Bank service charges", line: "Schedule C Line 27b" },
      { value: "software_subscriptions", label: "Software and subscriptions", line: "Schedule C Line 27b" },
      { value: "other_expense", label: "Other business expenses", line: "Schedule C Line 27b" }
    ]
  },
  CA: {
    income: [
      { value: "sales", label: "Gross sales / professional fees", line: "T2125 Line 8000" },
      { value: "gst_hst_collected", label: "GST/HST collected", line: "GST/HST" },
      { value: "subsidies_grants", label: "Subsidies, grants and rebates", line: "T2125 Line 8230" },
      { value: "other_income", label: "Other income", line: "T2125 Line 8230" },
      { value: "t4a_20", label: "Self-employment commissions", line: "T4A Box 20" },
      { value: "t4a_28", label: "Other income", line: "T4A Box 28" },
      { value: "cash_income", label: "Cash income", line: "T2125 Line 8000" }
    ],
    expense: [
      { value: "advertising", label: "Advertising", line: "T2125 Line 8520" },
      { value: "meals_entertainment", label: "Meals and entertainment (50%)", line: "T2125 Line 8523" },
      { value: "insurance", label: "Insurance", line: "T2125 Line 8690" },
      { value: "interest_bank_charges", label: "Interest and bank charges", line: "T2125 Line 8710" },
      { value: "business_tax_fees_licenses_memberships", label: "Business taxes, licences and memberships", line: "T2125 Line 8760" },
      { value: "office_expense", label: "Office expenses", line: "T2125 Line 8810" },
      { value: "office_supplies", label: "Office stationery and supplies", line: "T2125 Line 8811" },
      { value: "legal_accounting", label: "Legal, accounting and professional fees", line: "T2125 Line 8860" },
      { value: "rent", label: "Rent", line: "T2125 Line 8910" },
      { value: "maintenance_repairs", label: "Repairs and maintenance", line: "T2125 Line 8960" },
      { value: "salaries_wages_benefits", label: "Salaries, wages and benefits", line: "T2125 Line 9060" },
      { value: "property_taxes", label: "Property taxes", line: "T2125 Line 9180" },
      { value: "travel", label: "Travel expenses", line: "T2125 Line 9200" },
      { value: "utilities", label: "Telephone and utilities", line: "T2125 Line 9220" },
      { value: "delivery_freight", label: "Delivery, freight and express", line: "T2125 Line 9275" },
      { value: "other_expense", label: "Other expenses", line: "T2125 Line 9270" },
      { value: "motor_vehicle", label: "Motor vehicle expenses", line: "T2125 Line 9281" },
      { value: "gst_hst_paid", label: "GST/HST paid", line: "GST/HST ITC" },
      { value: "home_office", label: "Business-use-of-home expenses", line: "T2125 Line 9945" }
    ]
  }
};

const LEGACY_TAX_VALUE_LABELS = {
  t2125_8000: { label: "Gross professional fees", line: "T2125 Line 8000" },
  t2125_8290: { label: "Other income", line: "T2125 Line 8290" },
  ca_8810: { label: "Office expenses", line: "T2125 Line 8810" },
  ca_8820: { label: "Meals and entertainment (50%)", line: "T2125 Line 8523" },
  ca_8860: { label: "Professional fees", line: "T2125 Line 8860" },
  ca_8871: { label: "Management and administration fees", line: "T2125 Line 8871" },
  ca_8910: { label: "Rent", line: "T2125 Line 8910" },
  ca_8960: { label: "Repairs and maintenance", line: "T2125 Line 8960" },
  ca_9060: { label: "Salaries, wages and benefits", line: "T2125 Line 9060" },
  ca_9180: { label: "Property taxes", line: "T2125 Line 9180" },
  ca_9200: { label: "Travel", line: "T2125 Line 9200" },
  ca_9220: { label: "Utilities", line: "T2125 Line 9220" },
  ca_9270: { label: "Other expenses", line: "T2125 Line 9270" },
  ca_9281: { label: "Motor vehicle expenses", line: "T2125 Line 9281" },
  ca_9936: { label: "Capital cost allowance", line: "T2125 Line 9936" },
  ca_9943: { label: "Business-use-of-home expenses", line: "T2125 Line 9945" }
};

let categoriesToastTimer = null;
let categoryRecords = [];
let currentRegion = null;
let unattachedReceiptsCount = 0;
let categoriesServerAvailable = true;
let categoriesLoading = false;
let categorySearchTerm = "";
let currentCategoryFilter = "all";
let editingCategoryId = null;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function extractCategoriesPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  await loadBusinessRegion();
  const params = new URLSearchParams(window.location.search);
  const requestedFilter = String(params.get("filter") || "").trim().toLowerCase();
  if (["all", "review", "mapped", "tax"].includes(requestedFilter)) {
    currentCategoryFilter = requestedFilter;
  }
  enhanceCategoriesPageShell();
  wireCategoryModal();
  wirePerListAddButtons();
  wireDefaultCategorySeed();
  await loadCategories();
  await refreshReceiptsDot();
});

function enhanceCategoriesPageShell() {
  const header = document.querySelector(".categories-page-header");
  const incomeCard = document.getElementById("incomeCategories")?.closest(".category-card");
  const expenseCard = document.getElementById("expenseCategories")?.closest(".category-card");
  const content = document.querySelector(".categories-content");
  if (!header || !incomeCard || !expenseCard || !content || document.querySelector(".category-dashboard")) {
    return;
  }

  const dashboard = document.createElement("section");
  dashboard.className = "category-dashboard";
  dashboard.setAttribute("aria-label", "Category overview");
  dashboard.innerHTML = `
    <button type="button" class="category-stat-card" data-category-filter="all"><span class="category-stat-icon total" aria-hidden="true">CT</span><div><span>Total categories</span><strong id="categoryTotalCount">0</strong><small>Active categories</small></div></button>
    <button type="button" class="category-stat-card" data-category-filter="mapped"><span class="category-stat-icon mapped" aria-hidden="true">OK</span><div><span>Mapped</span><strong id="categoryMappedCount">0</strong><small id="categoryMappedPercent">0% of categories</small></div></button>
    <button type="button" class="category-stat-card" data-category-filter="review" id="categoryReviewStat"><span class="category-stat-icon review" aria-hidden="true">RV</span><div><span>Needs review</span><strong id="categoryReviewCount">0</strong><small id="categoryReviewHint">Still missing a tax line</small></div></button>
    <button type="button" class="category-stat-card" data-category-filter="tax"><span class="category-stat-icon tax" aria-hidden="true">TX</span><div><span id="categorySpecialTaxLabel">Tax categories</span><strong id="categorySpecialTaxCount">0</strong><small id="categorySpecialTaxHint">With tax treatment</small></div></button>
  `;
  header.after(dashboard);

  const toolbar = document.createElement("section");
  toolbar.className = "category-toolbar";
  toolbar.setAttribute("aria-label", "Category tools");
  toolbar.innerHTML = `
    <label class="category-search-wrap" for="categorySearchInput"><span aria-hidden="true">⌕</span><input id="categorySearchInput" type="search" placeholder="Search categories" autocomplete="off" /></label>
    <div class="category-toolbar-actions">
      <div class="category-filter-row">
        <button type="button" class="category-filter-chip is-active" data-category-filter="all">All</button>
        <button type="button" class="category-filter-chip" data-category-filter="review">Needs review</button>
        <button type="button" class="category-filter-chip" data-category-filter="mapped">Mapped</button>
        <button type="button" class="category-filter-chip" data-category-filter="tax">Tax line</button>
      </div>
      <button id="categoryReviewBtn" type="button" class="category-review-btn">Review unmapped categories</button>
      <button id="categoryToolbarAddBtn" type="button" class="categories-primary-btn">+ Add category</button>
    </div>
  `;
  dashboard.after(toolbar);

  const consoleWrap = document.createElement("section");
  consoleWrap.className = "category-console";
  consoleWrap.setAttribute("aria-label", "Category lists");
  incomeCard.before(consoleWrap);
  consoleWrap.append(incomeCard, expenseCard);

  [incomeCard, expenseCard].forEach((card) => {
    const head = card.querySelector(".category-card-head");
    const addButton = head?.querySelector(".category-inline-add-btn");
    if (!head) return;
    const isIncome = card.contains(document.getElementById("incomeCategories"));
    head.innerHTML = `
      <div class="category-card-titleline">
        <span class="category-section-icon ${isIncome ? "income" : "expense"}" aria-hidden="true">${isIncome ? "IN" : "EX"}</span>
        <div>
          <h2>${isIncome ? "Income categories" : "Expense categories"}</h2>
          <p id="${isIncome ? "incomeCategorySummary" : "expenseCategorySummary"}">0 active · 0 mapped</p>
        </div>
      </div>
    `;
    if (addButton) {
      addButton.className = "category-add-row";
      addButton.textContent = isIncome ? "+ Add income category" : "+ Add expense category";
      card.append(addButton);
    }
  });

  const guidance = document.createElement("section");
  guidance.className = "category-guidance";
  guidance.innerHTML = `<span aria-hidden="true">i</span><p><strong id="categoryGuidanceTitle">Tax mapping guidance</strong><br><span id="categoryGuidanceText">Review categories before exporting to ensure every default line is mapped cleanly.</span></p>`;
  consoleWrap.after(guidance);

  document.getElementById("categoryToolbarAddBtn")?.addEventListener("click", () => openCategoryModal("expense"));
  document.getElementById("categoryReviewBtn")?.addEventListener("click", () => applyCategoryFilter("review"));
  document.getElementById("categorySearchInput")?.addEventListener("input", (event) => {
    categorySearchTerm = String(event.target.value || "").trim().toLowerCase();
    renderCategoryLists();
  });
  document.querySelectorAll("[data-category-filter]").forEach((button) => {
    button.addEventListener("click", () => applyCategoryFilter(button.getAttribute("data-category-filter") || "all"));
  });

  updateRegionContext();
}

function applyCategoryFilter(nextFilter) {
  currentCategoryFilter = nextFilter || "all";
  syncCategoryFilterUi();
  renderCategoryLists();
}

function syncCategoryFilterUi() {
  document.querySelectorAll("[data-category-filter]").forEach((button) => {
    const active = (button.getAttribute("data-category-filter") || "all") === currentCategoryFilter;
    button.classList.toggle("is-active", active);
  });
}

function updateRegionContext() {
  const label = currentRegion === "CA"
    ? "Tax region: Canada | T2125 and GST/HST"
    : currentRegion === "US"
      ? "Tax region: United States | Schedule C and 1099"
      : "Tax region unavailable";
  const hint = currentRegion === "CA"
    ? "Categories and mappings follow Canadian T2125 and GST/HST reporting."
    : currentRegion === "US"
      ? "Categories and mappings follow U.S. Schedule C and 1099 reporting."
      : "Set a business region to enable region-specific tax mapping.";

  document.documentElement.style.setProperty("--categories-region-label", JSON.stringify(label));
  const defaultsHint = document.querySelector(".categories-defaults-hint");
  if (defaultsHint) defaultsHint.textContent = hint;
  const specialLabel = document.getElementById("categorySpecialTaxLabel");
  const specialHint = document.getElementById("categorySpecialTaxHint");
  if (specialLabel) specialLabel.textContent = currentRegion === "CA" ? "GST/HST-ready" : "1099-ready";
  if (specialHint) specialHint.textContent = currentRegion === "CA" ? "With CRA treatment" : "With income-form treatment";
  const guidanceTitle = document.getElementById("categoryGuidanceTitle");
  const guidanceText = document.getElementById("categoryGuidanceText");
  if (guidanceTitle) guidanceTitle.textContent = currentRegion === "CA" ? "CRA mapping guidance" : "IRS mapping guidance";
  if (guidanceText) {
    guidanceText.textContent = currentRegion === "CA"
      ? "Use T2125 lines that match the real expense type. Office expenses, office supplies, rent, property taxes, delivery, and utilities should stay separate."
      : "Use the closest Schedule C line for each expense. Office expense, supplies, utilities, and other expenses should not be collapsed into one bucket.";
  }
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
  const taxSelect = document.getElementById("category-tax-label");

  cancelButton?.addEventListener("click", closeCategoryModal);
  backdrop?.addEventListener("click", closeCategoryModal);
  typeSelect?.addEventListener("change", () => populateTaxLabelOptions(typeSelect.value));

  document.querySelectorAll(".color-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      syncColorSwatches(button.dataset.color || "blue");
      if (colorInput) colorInput.value = button.dataset.color || "blue";
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("category-name")?.value.trim() || "";
    const kind = typeSelect?.value || "income";
    const color = colorInput?.value || defaultColorForType(kind);
    const selectedTaxMap = taxSelect?.value || "";
    const message = document.getElementById("categoryFormMessage");

    if (!name) {
      if (message) message.textContent = tx("categories_error_name");
      if (typeof showFieldTooltip === "function") {
        showFieldTooltip(document.getElementById("category-name"), tx("categories_validation_required") || "Please fill in this required field.");
      }
      return;
    }

    const payload = {
      name,
      kind,
      color,
      tax_map_us: currentRegion === "US" ? selectedTaxMap || null : null,
      tax_map_ca: currentRegion === "CA" ? selectedTaxMap || null : null
    };

    const response = await apiFetch(editingCategoryId ? `/api/categories/${editingCategoryId}` : "/api/categories", {
      method: editingCategoryId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      if (message) {
        message.textContent = errorPayload?.error || (editingCategoryId ? "Failed to update category." : tx("categories_error_add"));
      }
      return;
    }

    closeCategoryModal();
    await loadCategories();
    showCategoriesToast(editingCategoryId ? "Category updated" : tx("categories_added"));
  });
}

function openCategoryModal(type, categoryId = null) {
  const modal = document.getElementById("categoryModal");
  const title = document.getElementById("categoryModalTitle");
  const submitButton = document.querySelector("#categoryForm .modal-save");
  const nameInput = document.getElementById("category-name");
  const typeSelect = document.getElementById("category-type");
  const colorInput = document.getElementById("category-color");
  const taxSelect = document.getElementById("category-tax-label");
  const category = categoryId ? categoryRecords.find((item) => String(item.id) === String(categoryId)) : null;
  const resolvedType = category?.type || type || typeSelect?.value || "income";

  editingCategoryId = category?.id || null;
  if (typeSelect) typeSelect.value = resolvedType;
  populateTaxLabelOptions(resolvedType);

  if (category) {
    if (title) title.textContent = "Edit category";
    if (submitButton) submitButton.textContent = "Save category";
    if (nameInput) nameInput.value = category.name || "";
    if (colorInput) colorInput.value = category.color || defaultColorForType(resolvedType);
    if (taxSelect) taxSelect.value = category.taxLabel || "";
    syncColorSwatches(colorInput?.value || defaultColorForType(resolvedType));
  } else {
    if (title) title.textContent = "Add category";
    if (submitButton) submitButton.textContent = "Add category";
    if (nameInput) nameInput.value = "";
    if (colorInput) colorInput.value = defaultColorForType(resolvedType);
    syncColorSwatches(colorInput?.value || defaultColorForType(resolvedType));
  }

  modal?.classList.remove("hidden");
}

function closeCategoryModal() {
  const modal = document.getElementById("categoryModal");
  const form = document.getElementById("categoryForm");
  const message = document.getElementById("categoryFormMessage");
  const title = document.getElementById("categoryModalTitle");
  const submitButton = document.querySelector("#categoryForm .modal-save");
  const colorInput = document.getElementById("category-color");
  editingCategoryId = null;
  modal?.classList.add("hidden");
  form?.reset();
  if (message) message.textContent = "";
  if (title) title.textContent = "Add category";
  if (submitButton) submitButton.textContent = "Add category";
  if (colorInput) colorInput.value = "blue";
  populateTaxLabelOptions("income");
  syncColorSwatches("blue");
}

function syncColorSwatches(color) {
  const normalized = normalizeCategoryColor(color, "expense");
  document.querySelectorAll(".color-swatch").forEach((button) => {
    const active = button.dataset.color === normalized;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function wireDefaultCategorySeed() {
  const button = document.getElementById("seedDefaultCategoriesBtn");
  if (!button) return;
  button.addEventListener("click", async () => {
    const message = document.getElementById("categoryMessage");
    button.disabled = true;
    if (message) message.textContent = "";
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
      showCategoriesToast((payload?.inserted_count || 0) > 0 ? tx("categories_defaults_added") : tx("categories_defaults_already_present"));
    } catch (error) {
      if (message) message.textContent = error?.message || tx("categories_error_defaults");
    } finally {
      button.disabled = false;
    }
  });
}

async function loadCategories() {
  categoriesLoading = categoryRecords.length === 0;
  if (categoriesLoading) renderCategoryLists();

  try {
    const response = await apiFetch("/api/categories");
    if (!response || !response.ok) throw new Error(tx("categories_error_load"));
    let categories = extractCategoriesPayload(await response.json().catch(() => null));
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
  ["seedDefaultCategoriesBtn", "addIncomeCategoryBtn", "addExpenseCategoryBtn", "categoryToolbarAddBtn"].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.disabled = show;
  });
}

function normalizeCategory(category) {
  const type = category.kind === "income" ? "income" : "expense";
  return {
    id: category.id,
    name: category.name || "",
    type,
    color: category.color || defaultColorForType(type),
    taxLabel: currentRegion === "CA" ? category.tax_map_ca || "" : category.tax_map_us || "",
    transactionCount: Number(category.transaction_count || 0),
    isDefault: category.is_default === true
  };
}

function renderCategoryLists() {
  syncCategoryFilterUi();
  updateCategoryDashboard();
  renderCategoryGroup("incomeCategories", "income", tx("categories_no_income"));
  renderCategoryGroup("expenseCategories", "expense", tx("categories_no_expense"));
}

function getFilteredCategories(type) {
  return categoryRecords
    .filter((item) => item.type === type)
    .filter((item) => {
      if (categorySearchTerm) {
        const taxInfo = item.taxLabel ? getTaxInfo(item.taxLabel) : null;
        const haystack = [item.name, taxInfo?.line, taxInfo?.label].join(" ").toLowerCase();
        if (!haystack.includes(categorySearchTerm)) return false;
      }

      const taxInfo = item.taxLabel ? getTaxInfo(item.taxLabel) : null;
      const mapped = Boolean(taxInfo);
      const review = !mapped;
      const tax = isTaxCategory(item, taxInfo);

      if (currentCategoryFilter === "review") return review;
      if (currentCategoryFilter === "mapped") return mapped;
      if (currentCategoryFilter === "tax") return tax;
      return true;
    })
    .sort((left, right) => rankCategory(right) - rankCategory(left) || left.name.localeCompare(right.name));
}

function rankCategory(category) {
  const taxInfo = category.taxLabel ? getTaxInfo(category.taxLabel) : null;
  let rank = 0;
  if (!taxInfo) rank += 100;
  if (category.transactionCount > 0) rank += 20;
  if (category.isDefault) rank += 10;
  return rank;
}

function renderCategoryGroup(containerId, type, emptyText) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (categoriesLoading) {
    container.innerHTML = `<div class="category-empty category-loading"><p>${escapeHtml(tx("categories_loading"))}</p></div>`;
    return;
  }

  const categories = getFilteredCategories(type);
  if (!categories.length) {
    const emptyMessage = categorySearchTerm || currentCategoryFilter !== "all"
      ? "No categories match the current view."
      : emptyText;
    container.innerHTML = `<div class="category-empty"><p>${escapeHtml(emptyMessage)}</p></div>`;
    return;
  }

  container.innerHTML = categories.map((category) => renderCategoryRow(category)).join("");
  container.querySelectorAll("[data-category-edit]").forEach((button) => {
    button.addEventListener("click", () => openCategoryModal(null, button.getAttribute("data-category-edit") || ""));
  });
  container.querySelectorAll("[data-category-delete]").forEach((button) => {
    button.addEventListener("click", () => handleCategoryDelete(button.getAttribute("data-category-delete") || ""));
  });
}

function renderCategoryRow(category) {
  const taxInfo = category.taxLabel ? getTaxInfo(category.taxLabel) : null;
  const mapped = Boolean(taxInfo);
  const tax = isTaxCategory(category, taxInfo);
  const missingTaxLabel = currentRegion === "CA" ? "No T2125 line" : currentRegion === "US" ? "No Schedule C line" : "No tax line";
  const missingTaxHint = currentRegion === "CA"
    ? "Assign a T2125 line before export."
    : currentRegion === "US"
      ? "Assign a Schedule C line before export."
      : "Assign a tax line before export.";
  const accentClass = !mapped ? "category-item-accent-review" : tax ? "category-item-accent-tax" : category.type === "income" ? "category-item-accent-income" : "category-item-accent-expense";
  const usageText = category.transactionCount > 0 ? `${category.transactionCount} linked transaction${category.transactionCount === 1 ? "" : "s"}` : "Not in use yet";
  const usageBadge = category.transactionCount > 0 ? `<span class="category-status-pill status-in-use">In use</span>` : "";
  const defaultBadge = category.isDefault ? `<span class="category-status-pill status-default">Default</span>` : "";
  const mappingBadge = mapped
    ? `<span class="category-status-pill status-mapped">Mapped</span>`
    : `<span class="category-status-pill status-review">Needs review</span>`;
  const taxBadge = tax ? `<span class="category-status-pill status-tax">${currentRegion === "CA" ? "GST/HST" : "1099"}</span>` : "";
  const taxChip = mapped
    ? `<span class="category-tax-pill" title="${escapeHtml(taxInfo.label)}">${escapeHtml(taxInfo.line || taxInfo.label)}</span>`
    : `<span class="category-tax-pill status-unmapped" title="${escapeHtml(missingTaxHint)}">${escapeHtml(missingTaxLabel)}</span>`;

  return `
    <div class="category-item ${accentClass}">
      <span class="category-row-icon" aria-hidden="true">${escapeHtml(category.type === "income" ? "IN" : "EX")}</span>
      <div class="category-row-main">
        <span class="category-row-title">${escapeHtml(category.name || tx("categories_fallback_name"))}</span>
        <div class="category-row-sub">
          <span class="category-row-type">${category.type === "income" ? "Income" : "Expense"}</span>
          ${taxChip}
          ${mappingBadge}
          ${usageBadge}
          ${taxBadge}
          ${defaultBadge}
        </div>
        <div class="category-row-usage">${escapeHtml(usageText)}</div>
      </div>
      <div class="category-actions">
        <button type="button" class="category-row-menu" aria-label="Category actions">...</button>
        <div class="category-action-menu">
          <button type="button" data-category-edit="${escapeHtml(category.id)}">Edit category</button>
          <button type="button" class="category-delete" data-category-delete="${escapeHtml(category.id)}">Delete category</button>
        </div>
      </div>
    </div>
  `;
}

function updateCategoryDashboard() {
  const total = categoryRecords.length;
  const mapped = categoryRecords.filter((item) => Boolean(getTaxInfo(item.taxLabel))).length;
  const review = total - mapped;
  const special = categoryRecords.filter((item) => isTaxCategory(item, getTaxInfo(item.taxLabel))).length;
  const pct = total ? Math.round((mapped / total) * 100) : 0;
  const income = categoryRecords.filter((item) => item.type === "income");
  const expense = categoryRecords.filter((item) => item.type === "expense");
  const incomeMapped = income.filter((item) => Boolean(getTaxInfo(item.taxLabel))).length;
  const expenseMapped = expense.filter((item) => Boolean(getTaxInfo(item.taxLabel))).length;

  setText("categoryTotalCount", total);
  setText("categoryMappedCount", mapped);
  setText("categoryReviewCount", review);
  setText("categorySpecialTaxCount", special);
  setText("categoryMappedPercent", `${pct}% of categories`);
  setText("categoryReviewHint", review > 0 ? `Tap to filter ${review} unmapped categor${review === 1 ? "y" : "ies"}` : "Everything is mapped");
  setText("incomeCategorySummary", `${income.length} active · ${incomeMapped} mapped`);
  setText("expenseCategorySummary", `${expense.length} active · ${expenseMapped} mapped · ${Math.max(expense.length - expenseMapped, 0)} need review`);

  const reviewButton = document.getElementById("categoryReviewBtn");
  if (reviewButton) {
    reviewButton.textContent = review > 0 ? `Review ${review} unmapped categor${review === 1 ? "y" : "ies"}` : "All categories mapped";
    reviewButton.disabled = review === 0;
  }
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value);
}

function isTaxCategory(category, taxInfo) {
  const haystack = `${category.name || ""} ${category.taxLabel || ""} ${taxInfo?.line || ""} ${taxInfo?.label || ""}`.toLowerCase();
  return /gst|hst|itc|1099|t4a/.test(haystack);
}

async function handleCategoryDelete(categoryId) {
  const message = document.getElementById("categoryMessage");
  if (!window.confirm(tx("categories_confirm_delete"))) return;
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
    node.textContent = option.line ? `${option.label} - ${option.line}` : option.label;
    select.appendChild(node);
  });
  select.value = options.some((option) => option.value === previous) ? previous : "";
  select.disabled = !currentRegion || options.length === 0;

  const updateHint = () => {
    if (!hint) return;
    const selected = options.find((option) => option.value === select.value);
    hint.textContent = selected ? `${selected.line}: ${selected.label}` : tx("categories_tax_hint_default");
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
    const business = await response.json().catch(() => null);
    const region = String(business?.region || "").toUpperCase();
    currentRegion = region === "CA" || region === "US" ? region : null;
    if (!currentRegion) {
      showCategoriesToast(tx("categories_error_region_invalid"));
    }
  } catch (error) {
    console.warn("[Categories] Unable to load business region", error);
    currentRegion = null;
    showCategoriesToast(tx("categories_error_region_load"));
  }
}

async function migrateLegacyCategories() {
  const legacyCategories = getCategories()
    .filter((category) => category && typeof category === "object" && category.name)
    .map((category) => ({
      name: String(category.name || "").trim(),
      kind: category.type === "income" ? "income" : "expense",
      color: normalizeCategoryColor(category.color, category.type),
      tax_map_us: currentRegion === "US" && category.taxLabel ? String(category.taxLabel) : null,
      tax_map_ca: currentRegion === "CA" && category.taxLabel ? String(category.taxLabel) : null
    }))
    .filter((category) => category.name);

  if (!legacyCategories.length) return [];

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
  return extractCategoriesPayload(await refreshed.json().catch(() => null));
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
    const found = [...groups.income, ...groups.expense].find((option) => option.value === value);
    if (found) return { label: found.label, line: found.line };
  }
  return LEGACY_TAX_VALUE_LABELS[value] || null;
}

function getCategories() {
  return Array.isArray(categoryRecords) ? categoryRecords : [];
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (dot) dot.hidden = unattachedReceiptsCount === 0;
}

function defaultColorForType(type) {
  return type === "income" ? "green" : "blue";
}

function normalizeCategoryColor(color, type) {
  const value = String(color || "").toLowerCase();
  return ["blue", "green", "amber", "pink", "red", "slate"].includes(value) ? value : defaultColorForType(type);
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
