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
      { value: "bank_fees", label: "Bank service charges", line: "Schedule C Line 27a" },
      { value: "software_subscriptions", label: "Software and subscriptions", line: "Schedule C Line 27a" },
      { value: "other_expense", label: "Other business expenses", line: "Schedule C Line 27a" }
    ]
  },
  CA: {
    income: [
      { value: "sales", label: "Gross sales / professional fees", line: "T2125 Line 8000" },
      { value: "gst_hst_collected", label: "GST/HST collected", line: "GST/HST" },
      { value: "subsidies_grants", label: "Subsidies, grants and rebates", line: "T2125 Line 8290" },
      { value: "other_income", label: "Other income", line: "T2125 Line 8290" },
      { value: "t4a_20", label: "Self-employment commissions", line: "T4A Box 20" },
      { value: "t4a_28", label: "Other income", line: "T4A Box 28" },
      { value: "cash_income", label: "Cash income", line: "Cash" }
    ],
    expense: [
      { value: "advertising", label: "Advertising", line: "T2125 Line 8810" },
      { value: "meals_entertainment", label: "Meals and entertainment (50%)", line: "T2125 Line 8523" },
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
      { value: "gst_hst_paid", label: "GST/HST paid", line: "GST/HST ITC" },
      { value: "other_expense", label: "Other expenses", line: "T2125 Line 9270" }
    ]
  }
};

const LEGACY_TAX_VALUE_LABELS = {
  t2125_8000: { label: "Gross professional fees", line: "T2125 Line 8000" },
  t2125_8290: { label: "Other income", line: "T2125 Line 8290" },
  ca_8810: { label: "Advertising", line: "T2125 Line 8810" },
  ca_8820: { label: "Meals and entertainment (50%)", line: "T2125 Line 8523" },
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
  ca_9936: { label: "Capital cost allowance", line: "T2125 Line 9936" },
  ca_9943: { label: "Business-use-of-home expenses", line: "T2125 Line 9943" }
};

let categoriesToastTimer = null;
let categoryRecords = [];
let currentRegion = null;
let unattachedReceiptsCount = 0;
let categoriesServerAvailable = true;
let categoriesLoading = false;
let categorySearchTerm = "";
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
  enhanceCategoriesPageShell();
  wireCategoryModal();
  wirePerListAddButtons();
  wireDefaultCategorySeed();
  await loadCategories();
  await refreshReceiptsDot();
});

function enhanceCategoriesPageShell() {
  const content = document.querySelector(".categories-content");
  const header = document.querySelector(".categories-page-header");
  const incomeCard = document.getElementById("incomeCategories")?.closest(".category-card");
  const expenseCard = document.getElementById("expenseCategories")?.closest(".category-card");
  if (!content || !header || !incomeCard || !expenseCard || document.querySelector(".category-dashboard")) return;

  const title = header.querySelector(".app-page-title");
  const subtitle = header.querySelector(".app-page-subtitle");
  if (title) title.textContent = "Category";
  if (subtitle) subtitle.textContent = "Map income and expenses into tax-ready reports for the active business region.";

  const dashboard = document.createElement("section");
  dashboard.className = "category-dashboard";
  dashboard.setAttribute("aria-label", "Category overview");
  dashboard.innerHTML = `
    <article class="category-stat-card"><span class="category-stat-icon total" aria-hidden="true">▣</span><div><span>Total categories</span><strong id="categoryTotalCount">0</strong><small>Active categories</small></div></article>
    <article class="category-stat-card"><span class="category-stat-icon mapped" aria-hidden="true">✓</span><div><span>Mapped</span><strong id="categoryMappedCount">0</strong><small id="categoryMappedPercent">0% of categories</small></div></article>
    <article class="category-stat-card"><span class="category-stat-icon review" aria-hidden="true">△</span><div><span>Needs review</span><strong id="categoryReviewCount">0</strong><small>Require attention</small></div></article>
    <article class="category-stat-card"><span class="category-stat-icon tax" aria-hidden="true">%</span><div><span id="categorySpecialTaxLabel">Tax categories</span><strong id="categorySpecialTaxCount">0</strong><small id="categorySpecialTaxHint">With tax treatment</small></div></article>
  `;
  header.after(dashboard);

  const toolbar = document.createElement("section");
  toolbar.className = "category-toolbar";
  toolbar.setAttribute("aria-label", "Category tools");
  toolbar.innerHTML = `
    <label class="category-search-wrap" for="categorySearchInput"><span aria-hidden="true">⌕</span><input id="categorySearchInput" type="search" placeholder="Search categories" autocomplete="off" /></label>
    <div class="category-toolbar-actions"><button id="categoryToolbarAddBtn" type="button" class="categories-primary-btn">+ Add category</button></div>
  `;
  dashboard.after(toolbar);

  const consoleWrap = document.createElement("section");
  consoleWrap.className = "category-console";
  consoleWrap.setAttribute("aria-label", "Category lists");
  incomeCard.before(consoleWrap);
  consoleWrap.append(incomeCard, expenseCard);

  [incomeCard, expenseCard].forEach((card) => {
    const head = card.querySelector(".category-card-head");
    const h2 = head?.querySelector("h2");
    const button = head?.querySelector(".category-inline-add-btn");
    if (!head || !h2) return;
    const isIncome = card.contains(document.getElementById("incomeCategories"));
    head.innerHTML = `
      <div class="category-card-titleline"><span class="category-section-icon ${isIncome ? "income" : "expense"}" aria-hidden="true">${isIncome ? "↗" : "↘"}</span><div><h2>${isIncome ? "Income categories" : "Expense categories"}</h2><p id="${isIncome ? "incomeCategorySummary" : "expenseCategorySummary"}">0 active · 0 mapped</p></div></div>
      <button type="button" class="category-card-menu" aria-label="${isIncome ? "Income" : "Expense"} category options">•••</button>
    `;
    if (button) {
      button.className = "category-add-row";
      button.textContent = isIncome ? "+ Add income category" : "+ Add expense category";
      card.append(button);
    }
  });

  const guidance = document.createElement("section");
  guidance.className = "category-guidance";
  guidance.innerHTML = `<span aria-hidden="true">◈</span><p><strong id="categoryGuidanceTitle">Tax mapping guidance</strong><br><span id="categoryGuidanceText">Review categories before exporting to ensure accuracy.</span></p>`;
  consoleWrap.after(guidance);

  document.getElementById("categoryToolbarAddBtn")?.addEventListener("click", () => openCategoryModal("expense"));
  document.getElementById("categorySearchInput")?.addEventListener("input", (event) => {
    categorySearchTerm = String(event.target.value || "").trim().toLowerCase();
    renderCategoryLists();
  });

  updateRegionContext();
}

function updateRegionContext() {
  const flag = currentRegion === "CA" ? "🇨🇦" : currentRegion === "US" ? "🇺🇸" : "🌐";
  const label = currentRegion === "CA"
    ? "Tax region: Canada · T2125 / T4A active"
    : currentRegion === "US"
      ? "Tax region: United States · Schedule C / 1099 active"
      : "Tax region unavailable";
  const hint = currentRegion === "CA"
    ? "Categories and mappings are tailored to Canadian T2125, T4A, and GST/HST reporting."
    : currentRegion === "US"
      ? "Categories and mappings are tailored to U.S. Schedule C and 1099 reporting."
      : "Set a business region to enable region-specific tax mapping.";

  document.documentElement.style.setProperty("--categories-region-label", JSON.stringify(`${flag} ${label}`));
  const hintNode = document.querySelector(".categories-defaults-hint");
  if (hintNode) hintNode.textContent = hint;
  const specialLabel = document.getElementById("categorySpecialTaxLabel");
  const specialHint = document.getElementById("categorySpecialTaxHint");
  if (specialLabel) specialLabel.textContent = currentRegion === "CA" ? "GST/HST categories" : "1099 categories";
  if (specialHint) specialHint.textContent = currentRegion === "CA" ? "With tax treatment" : "Income form mapping";
  const guidanceTitle = document.getElementById("categoryGuidanceTitle");
  const guidanceText = document.getElementById("categoryGuidanceText");
  if (guidanceTitle) guidanceTitle.textContent = currentRegion === "CA" ? "CRA mapping guidance" : "IRS mapping guidance";
  if (guidanceText) guidanceText.textContent = currentRegion === "CA"
    ? "Mappings follow Canada Revenue Agency T2125, T4A, and GST/HST treatment. Review categories before exporting."
    : "Mappings follow Schedule C and 1099 reporting context. Review categories before exporting.";
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

  editingCategoryId = category?.id || null;
  const resolvedType = category?.type || type || typeSelect?.value || "income";

  if (typeSelect) typeSelect.value = resolvedType;
  populateTaxLabelOptions(resolvedType);

  if (category) {
    if (title) title.textContent = "Update tax mapping";
    if (submitButton) submitButton.textContent = "Save mapping";
    if (nameInput) nameInput.value = category.name || "";
    if (colorInput) colorInput.value = category.color || defaultColorForType(resolvedType);
    if (taxSelect) taxSelect.value = category.taxLabel || "";
    syncColorSwatches(colorInput?.value || defaultColorForType(resolvedType));
  } else {
    if (title) title.textContent = "Add category";
    if (submitButton) submitButton.textContent = "Add category";
    syncColorSwatches(colorInput?.value || "blue");
  }

  modal?.classList.remove("hidden");
}

function syncColorSwatches(color) {
  const normalizedColor = normalizeCategoryColor(color, "expense");
  document.querySelectorAll(".color-swatch").forEach((item) => {
    const isActive = item.dataset.color === normalizedColor;
    item.classList.toggle("is-active", isActive);
    item.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
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
      if (colorInput) colorInput.value = button.dataset.color || "blue";
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
      if (typeof showFieldTooltip === "function") showFieldTooltip(document.getElementById("category-name"), tx("categories_validation_required") || "Please fill in this required field.");
      return;
    }

    const payload = {
      name,
      kind: type,
      color,
      tax_map_us: currentRegion === "US" ? taxLabel || null : null,
      tax_map_ca: currentRegion === "CA" ? taxLabel || null : null
    };

    const response = await apiFetch(editingCategoryId ? `/api/categories/${editingCategoryId}` : "/api/categories", {
      method: editingCategoryId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      if (message) message.textContent = errorPayload?.error || (editingCategoryId ? "Failed to update category mapping." : tx("categories_error_add"));
      return;
    }

    closeCategoryModal();
    await loadCategories();
    showCategoriesToast(editingCategoryId ? "Category mapping updated" : tx("categories_added"));
  });
}

function closeCategoryModal() {
  const modal = document.getElementById("categoryModal");
  const form = document.getElementById("categoryForm");
  const message = document.getElementById("categoryFormMessage");
  const title = document.getElementById("categoryModalTitle");
  const submitButton = document.querySelector("#categoryForm .modal-save");
  editingCategoryId = null;
  modal?.classList.add("hidden");
  form?.reset();
  if (message) message.textContent = "";
  if (title) title.textContent = "Add category";
  if (submitButton) submitButton.textContent = "Add category";
  const colorInput = document.getElementById("category-color");
  if (colorInput) colorInput.value = "blue";
  populateTaxLabelOptions("income");
  syncColorSwatches("blue");
}

function wireDefaultCategorySeed() {
  const button = document.getElementById("seedDefaultCategoriesBtn");
  if (!button) return;
  button.addEventListener("click", async () => {
    const message = document.getElementById("categoryMessage");
    button.disabled = true;
    if (message) message.textContent = "";
    try {
      const response = await apiFetch("/api/categories/defaults", { method: "POST", headers: { "Content-Type": "application/json" } });
      const payload = response ? await response.json().catch(() => null) : null;
      if (!response || !response.ok) throw new Error(payload?.error || tx("categories_error_defaults"));
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
    if (Array.isArray(categories) && categories.length === 0) categories = await migrateLegacyCategories();
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
    taxLabel: currentRegion === "CA" ? category.tax_map_ca || "" : category.tax_map_us || ""
  };
}

function renderCategoryLists() {
  updateCategoryDashboard();
  renderCategoryGroup("incomeCategories", "income", tx("categories_no_income"));
  renderCategoryGroup("expenseCategories", "expense", tx("categories_no_expense"));
}

function getFilteredCategories(type) {
  return categoryRecords.filter((item) => {
    if (item.type !== type) return false;
    if (!categorySearchTerm) return true;
    const taxInfo = item.taxLabel ? getTaxInfo(item.taxLabel) : null;
    return [item.name, taxInfo?.line, taxInfo?.label].some((value) => String(value || "").toLowerCase().includes(categorySearchTerm));
  });
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
    container.innerHTML = `<div class="category-empty"><p>${escapeHtml(categorySearchTerm ? "No categories match your search." : emptyText)}</p></div>`;
    return;
  }
  container.innerHTML = categories.map((category) => renderCategoryRow(category, type)).join("");
  container.querySelectorAll("[data-category-delete]").forEach((button) => {
    button.addEventListener("click", async () => handleCategoryDelete(button.getAttribute("data-category-delete") || ""));
  });
  container.querySelectorAll("[data-category-map]").forEach((button) => {
    button.addEventListener("click", () => openCategoryModal(null, button.getAttribute("data-category-map") || ""));
  });
}

function renderCategoryRow(category, type) {
  const taxInfo = category.taxLabel ? getTaxInfo(category.taxLabel) : null;
  const isMapped = !!taxInfo;
  const isTax = isTaxCategory(category, taxInfo);
  const isDefault = isLikelyDefaultCategory(category);
  const accent = rowAccent(category, type, isTax, !isMapped);
  const icon = rowIcon(category, type, isTax);
  const taxChipHtml = taxInfo ? `<span class="category-tax-pill" title="${escapeHtml(taxInfo.label)}">${escapeHtml(taxInfo.line || taxInfo.label)}</span>` : "";
  const statusHtml = isMapped
    ? `<span class="category-status-pill status-mapped">Mapped</span>`
    : `<span class="category-status-pill status-review">Needs review</span>`;
  const taxStatusHtml = isTax ? `<span class="category-status-pill status-tax">${currentRegion === "CA" ? "GST/HST" : "1099"}</span>` : "";
  const defaultHtml = isDefault ? `<span class="category-status-pill status-default">Default</span>` : "";
  return `
    <div class="category-item" style="--row-accent:${accent.color};--row-icon-bg:${accent.bg};">
      <span class="category-row-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <div class="category-row-main">
        <span class="category-row-title">${escapeHtml(category.name || tx("categories_fallback_name"))}</span>
        <div class="category-row-sub">
          <span class="category-row-type">${type === "income" ? "Income" : "Expense"}</span>
          ${taxChipHtml || `<span class="category-tax-pill">No tax line</span>`}
          ${statusHtml}${taxStatusHtml}${defaultHtml}
        </div>
      </div>
      <div class="category-actions">
        <button type="button" class="category-row-menu" aria-label="Category actions">•••</button>
        <div class="category-action-menu">
          <button type="button" data-category-map="${escapeHtml(category.id)}">Tax mapping</button>
          <button type="button" class="category-delete" data-category-delete="${escapeHtml(category.id)}">Delete category</button>
        </div>
      </div>
    </div>
  `;
}

function updateCategoryDashboard() {
  const total = categoryRecords.length;
  const mapped = categoryRecords.filter((cat) => !!getTaxInfo(cat.taxLabel)).length;
  const review = Math.max(total - mapped, 0);
  const special = categoryRecords.filter((cat) => isTaxCategory(cat, getTaxInfo(cat.taxLabel))).length;
  const pct = total ? Math.round((mapped / total) * 100) : 0;
  setText("categoryTotalCount", total);
  setText("categoryMappedCount", mapped);
  setText("categoryReviewCount", review);
  setText("categorySpecialTaxCount", special);
  setText("categoryMappedPercent", `${pct}% of categories`);
  const income = categoryRecords.filter((item) => item.type === "income");
  const expense = categoryRecords.filter((item) => item.type === "expense");
  const incomeMapped = income.filter((cat) => !!getTaxInfo(cat.taxLabel)).length;
  const expenseMapped = expense.filter((cat) => !!getTaxInfo(cat.taxLabel)).length;
  setText("incomeCategorySummary", `${income.length} active · ${incomeMapped} mapped`);
  setText("expenseCategorySummary", `${expense.length} active · ${expenseMapped} mapped · ${Math.max(expense.length - expenseMapped, 0)} need review`);
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value);
}

function isTaxCategory(category, taxInfo) {
  const haystack = `${category.name || ""} ${category.taxLabel || ""} ${taxInfo?.line || ""} ${taxInfo?.label || ""}`.toLowerCase();
  return /gst|hst|itc|1099|t4a/.test(haystack);
}

function isLikelyDefaultCategory(category) {
  const name = String(category.name || "").toLowerCase();
  return /sales revenue|service income|advertising|home office|office|insurance|legal|bank|vehicle|fuel|meals|supplies|telephone|internet/.test(name);
}

function rowAccent(category, type, isTax, needsReview) {
  if (needsReview) return { color: "#f59e0b", bg: "#fffbeb" };
  if (isTax) return { color: "#2563eb", bg: "#eff6ff" };
  if (type === "income") return { color: "#10b981", bg: "#ecfdf5" };
  return { color: "#3b82f6", bg: "#eff6ff" };
}

function rowIcon(category, type, isTax) {
  const name = String(category.name || "").toLowerCase();
  if (isTax) return "%";
  if (name.includes("meal") || name.includes("food")) return "🍽";
  if (name.includes("vehicle") || name.includes("fuel") || name.includes("gas")) return "⌁";
  if (name.includes("home")) return "⌂";
  if (name.includes("legal") || name.includes("account")) return "⚖";
  if (name.includes("insurance")) return "◇";
  if (name.includes("bank") || name.includes("interest")) return "▤";
  if (name.includes("phone") || name.includes("internet")) return "☎";
  if (name.includes("advertising")) return "◁";
  return type === "income" ? "↗" : "▣";
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
    node.textContent = option.line ? `${option.label} — ${option.line}` : option.label;
    node.setAttribute("data-line", option.line || "");
    node.setAttribute("data-label", option.label);
    select.appendChild(node);
  });
  select.value = options.some((option) => option.value === previous) ? previous : "";
  select.disabled = !currentRegion || options.length === 0;
  const updateHint = () => {
    if (!hint) return;
    const selected = options.find((opt) => opt.value === select.value);
    hint.textContent = selected?.line ? `${selected.line}: ${selected.label}` : "";
    hint.style.display = selected?.line ? "block" : "none";
  };
  if (typeof select.__categoryTaxHintHandler === "function") select.removeEventListener("change", select.__categoryTaxHintHandler);
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
    }
    currentRegion = null;
    showCategoriesToast(tx("categories_error_region_invalid"));
  } catch (error) {
    console.warn("[Categories] Unable to load business region", error);
    showCategoriesToast(tx("categories_error_region_load"));
    currentRegion = null;
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
    const response = await apiFetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(category) });
    if (!response || !response.ok) {
      const errorPayload = response ? await response.json().catch(() => null) : null;
      throw new Error(errorPayload?.error || tx("categories_error_migrate"));
    }
  }
  const refreshed = await apiFetch("/api/categories");
  if (!refreshed || !refreshed.ok) throw new Error(tx("categories_error_reload"));
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
