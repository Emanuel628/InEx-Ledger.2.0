const EXPORT_HISTORY_KEY = "ledger_export_history";
const TRANSACTIONS_KEY = "ledger_transactions";
const ACCOUNTS_KEY = "ledger_accounts";
const CATEGORIES_KEY = "ledger_categories";
const RECEIPTS_KEY = "ledger_receipts";
const MILEAGE_KEY = "ledger_mileage";
const BUSINESSES_KEY = "ledger_businesses";
const EXPORT_LANG_KEY = "ledger_export_language";
const EXPORT_SCOPE_KEY = "ledger_export_scope";
const BUSINESS_PROFILE_KEY = "ledger_business_profile";
const VALID_EXPORT_LANGS = ["en", "es", "fr"];
const DEFAULT_EXPORT_LANG = "en";
const PDF_FORMAT = "pdf";
const CSV_FULL_FORMAT = "csv_full";
const CSV_BASIC_FORMAT = "csv_basic";
const EXPORT_TOAST_MS = 3000;

let exportToastTimer = null;
let resetInlineTaxIdState = () => {};
let unattachedReceiptsCount = 0;
let transactionsCacheFresh = false;
let openHistoryDiagnosticsId = "";
const exportHistoryDiagnosticsCache = new Map();
let exportPreflightState = {
  loading: false,
  finalization: null
};
let exportReviewState = {
  loading: false,
  queue: [],
  summary: null
};
let exportContext = {
  activeBusinessId: "",
  businesses: []
};
let exportState = {
  transactions: [],
  accounts: [],
  categories: [],
  receipts: [],
  mileage: [],
  businessProfile: {}
};
const EXPORT_PROFILE_MISSING_QUERY_KEY = "export_profile_missing";

function requiresExportMileageLog(categoryText) {
  const catText = String(categoryText || "").toLowerCase();
  if (/\bmileage\b/.test(catText)) return true;
  if (/\b(vehicle|auto|car|truck)\b/.test(catText) && /\b(fuel|gas|parking|tolls?)\b/.test(catText)) return true;
  return /\b(fuel|gas|parking|tolls?)\b/.test(catText);
}

function requiresExportAllocation(categoryText) {
  const catText = String(categoryText || "").toLowerCase();
  const vehicleMaintenance = /\b(repair|maintenance)\b/.test(catText) && /\b(vehicle|auto|car|truck)\b/.test(catText);
  return /\bphone\b|\binternet\b|home.?office|vehicle|fuel|auto insurance|car\b|truck\b/.test(catText)
    || vehicleMaintenance;
}

function requiresExportBusinessPurpose(categoryText) {
  const catText = String(categoryText || "").toLowerCase();
  return /\bmeal|\bfood\b|\bdining\b|\brestaurant\b|\btravel\b|\bairfare\b|\bhotel\b|\bentertainment\b/i.test(catText);
}

function getRequestedExportMode() {
  const params = new URLSearchParams(window.location.search);
  const mode = String(params.get("mode") || "").trim().toLowerCase();
  return ["draft", "workpaper", "finalized"].includes(mode) ? mode : "";
}

function normalizeMissingFieldKeys(values) {
  const source = Array.isArray(values) ? values : [values];
  return Array.from(new Set(
    source
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-z_]+$/.test(value))
  ));
}

function buildExportProfileGuideUrl(missingFieldKeys) {
  const keys = normalizeMissingFieldKeys(missingFieldKeys);
  if (!keys.length) {
    return "settings";
  }
  const params = new URLSearchParams();
  params.set(EXPORT_PROFILE_MISSING_QUERY_KEY, keys.join(","));
  params.set("export_profile_source", "exports");
  return `settings?${params.toString()}`;
}

function hideExportProfileGuide() {
  const guide = document.getElementById("exportInlineTaxIdGuide");
  const button = document.getElementById("exportProfileShowMeBtn");
  if (button) {
    button.onclick = null;
  }
  if (guide) {
    guide.classList.add("hidden");
  }
}

function showFinalizationError(blockers) {
  const errorEl = document.getElementById("exportGeneralError");
  const guide = document.getElementById("exportGeneralGuide");
  if (!errorEl) return;
  if (guide) guide.classList.add("hidden");

  const list = Array.isArray(blockers) ? blockers : [];
  const items = list.map((b) => {
    const n = Number(b.count) || 0;
    if (b.code === "needs_tax_mapping") {
      return `<li>${escapeHtml(b.message || "Some transactions still need tax-line mapping")} - <a href="categories">Fix in Categories</a></li>`;
    }
    if (["needs_receipt_support", "needs_business_purpose", "needs_allocation", "needs_mileage_log", "needs_home_office_support", "needs_capital_asset_review", "missing_description", "cpa_review_required", "final_confirmation_needed"].includes(b.code)) {
      return `<li>${escapeHtml(b.message || b.code)} - <a href="${escapeHtml(buildExportReviewUrl({ issue: b.code }))}">Fix in export review</a></li>`;
    }
    if (b.code === "needs_category") {
      const label = n === 1 ? "1 transaction needs a category" : `${n} transactions need a category`;
      return `<li>${escapeHtml(label)} — <a href="transactions?filter=uncategorized">Fix in Transactions →</a></li>`;
    }
    if (b.code === "business_profile_incomplete") {
      return `<li>${escapeHtml(b.message || "Business profile is incomplete")} — <a href="settings">Fix in Settings →</a></li>`;
    }
    if (b.code === "finalization_certification_required") {
      return `<li>${escapeHtml("Certification is required — check the box above.")}</li>`;
    }
    const label = n > 0 ? `${n} — ${b.message || b.code}` : (b.message || b.code);
    return `<li>${escapeHtml(label)}</li>`;
  }).join("");

  const heading = list.length === 1 ? "1 issue blocking finalization:" : `${list.length} issues blocking finalization:`;
  errorEl.innerHTML = `<strong>${escapeHtml("Can't finalize yet")} — ${escapeHtml(heading)}</strong><ul class="export-blocker-list">${items}</ul>`;
  errorEl.classList.remove("hidden");
}

function showExportGeneralError(message, missingFieldKeys = []) {
  const errorEl = document.getElementById("exportGeneralError");
  if (errorEl) {
    errorEl.textContent = String(message || "");
    errorEl.classList.toggle("hidden", !message);
  }
  const keys = normalizeMissingFieldKeys(missingFieldKeys);
  const guide = document.getElementById("exportGeneralGuide");
  const button = document.getElementById("exportGeneralShowMeBtn");
  if (!guide || !button || !keys.length) {
    if (guide) guide.classList.add("hidden");
    return;
  }
  button.onclick = () => { window.location.href = buildExportProfileGuideUrl(keys); };
  guide.classList.remove("hidden");
}

function showSecureExportInlineError(message, missingFieldKeys = []) {
  const errorEl = document.getElementById("exportInlineTaxIdError");
  if (errorEl) {
    errorEl.textContent = String(message || "");
    errorEl.classList.toggle("hidden", !message);
  }

  const keys = normalizeMissingFieldKeys(missingFieldKeys);
  const guide = document.getElementById("exportInlineTaxIdGuide");
  const button = document.getElementById("exportProfileShowMeBtn");
  if (!guide || !button || !keys.length) {
    hideExportProfileGuide();
    return;
  }

  button.onclick = () => {
    window.location.href = buildExportProfileGuideUrl(keys);
  };
  guide.classList.remove("hidden");
}

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function getExportReviewRouteState() {
  const params = new URLSearchParams(window.location.search);
  const issue = String(params.get("issue") || "").trim().toLowerCase();
  const transactionId = String(params.get("transaction") || "").trim();
  const focus = String(params.get("focus") || "").trim().toLowerCase() === "review";
  return {
    issue: /^[a-z_]+$/.test(issue) ? issue : "",
    transactionId,
    focus
  };
}

function buildExportReviewUrl({ issue = "", transactionId = "" } = {}) {
  const params = new URLSearchParams();
  params.set("focus", "review");
  if (issue) {
    params.set("issue", issue);
  }
  if (transactionId) {
    params.set("transaction", transactionId);
  }
  return `exports?${params.toString()}#exportReviewQueueSection`;
}

function resolveExportIssueAction(item) {
  const code = String(item?.code || "").trim().toLowerCase();
  if (!code) {
    return null;
  }

  const actionMap = {
    needs_category: { href: "transactions?review=nc", label: "Open filtered transactions" },
    needs_tax_mapping: { href: "transactions?review=um", label: "Open tax-mapping gaps" },
    needs_receipt_support: { href: buildExportReviewUrl({ issue: "needs_receipt_support" }), label: "Open export review" },
    needs_business_purpose: { href: buildExportReviewUrl({ issue: "needs_business_purpose" }), label: "Open export review" },
    needs_allocation: { href: buildExportReviewUrl({ issue: "needs_allocation" }), label: "Open export review" },
    needs_mileage_log: { href: buildExportReviewUrl({ issue: "needs_mileage_log" }), label: "Open export review" },
    needs_home_office_support: { href: buildExportReviewUrl({ issue: "needs_home_office_support" }), label: "Open export review" },
    needs_capital_asset_review: { href: buildExportReviewUrl({ issue: "needs_capital_asset_review" }), label: "Open export review" },
    missing_description: { href: buildExportReviewUrl({ issue: "missing_description" }), label: "Open export review" },
    cpa_review_required: { href: buildExportReviewUrl({ issue: "cpa_review_required" }), label: "Open export review" },
    final_confirmation_needed: { href: buildExportReviewUrl({ issue: "final_confirmation_needed" }), label: "Open export review" },
    business_profile_incomplete: { href: "settings?jump=settings-business", label: "Open business profile" },
    finalization_certification_required: { href: "#exportInlineTaxIdCheckbox", label: "Review certification" }
  };

  return actionMap[code] || null;
}

function syncExportActionState() {
  const pdfButton = document.getElementById("exportPdfBtn");
  const csvButton = document.getElementById("exportCsvBtn");
  const isV1 = (typeof effectiveTier === "function" ? effectiveTier() : "free") === "v1";

  if (pdfButton) {
    pdfButton.disabled = !isV1;
    pdfButton.title = "";
  }
  if (csvButton) {
    csvButton.disabled = false;
    csvButton.title = "";
  }
}

function getSelectedExportMode() {
  return String(document.getElementById("exportPackageMode")?.value || "workpaper").trim().toLowerCase();
}

function confirmFinalizedExportIfNeeded() {
  if (getSelectedExportMode() !== "finalized") {
    return true;
  }
  return window.confirm(
    tx("exports_finalize_confirm")
    || "Finalize this CPA package? Only continue if categories, support, and filing profile details are complete."
  );
}

function resolveExportBusinessId() {
  return exportContext.activeBusinessId || localStorage.getItem("lb_active_business_id") || "";
}

function resolveExportBusinessIdForScope(scope) {
  return scope === "all" ? "all" : resolveExportBusinessId();
}

function getExportPreferenceKey(key) {
  const businessId = resolveExportBusinessId();
  if (window.lunaStorage?.getKey) {
    return window.lunaStorage.getKey(key, { businessId });
  }
  const userId = window.__LUNA_ME__?.id || window.__LUNA_ME__?.user_id || window.__LUNA_ME__?.userId || "";
  if (!userId || !businessId || !key) {
    return null;
  }
  return `lb:${userId}:${businessId}:${key}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  initExportCollapsibleSections();
  await hydrateBusinessList();
  initExportScopeSelect();
  await hydrateExportData();
  populateExportFilters();
  initExportLanguageSelect();
  applyRequestedExportMode();
  initPresetChips();
  initExportInfoPopover();
  setupExportForm();
  setupPdfButton();
  wireInlineTaxId();
  await refreshReceiptsDot();
  updateExportSummary();
  await refreshExportPreflight();
  await refreshExportReviewQueue();
  renderExportHistory();
});

function setExportSectionCollapsed(section, collapsed) {
  if (!section) {
    return;
  }
  const body = section.querySelector(".exports-collapsible-body");
  const toggle = section.querySelector("[data-collapse-toggle]");
  const label = toggle?.querySelector(".exports-section-toggle-label");
  const icon = toggle?.querySelector(".exports-section-toggle-icon");
  const nextCollapsed = Boolean(collapsed);

  section.classList.toggle("is-collapsed", nextCollapsed);
  if (body) {
    body.hidden = nextCollapsed;
  }
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!nextCollapsed));
  }
  if (label) {
    label.textContent = nextCollapsed ? "Open" : "Close";
  }
  if (icon) {
    icon.textContent = nextCollapsed ? "+" : "−";
  }
}

function expandExportSectionForHash() {
  const hash = String(window.location.hash || "").trim();
  if (!hash) {
    return;
  }
  const target = document.querySelector(hash);
  if (!target) {
    return;
  }
  const section = target.classList?.contains("is-collapsible")
    ? target
    : target.closest(".is-collapsible");
  if (section) {
    setExportSectionCollapsed(section, false);
  }
}

function initExportCollapsibleSections() {
  document.querySelectorAll(".is-collapsible").forEach((section) => {
    const toggle = section.querySelector("[data-collapse-toggle]");
    const body = section.querySelector(".exports-collapsible-body");
    if (!toggle || !body) {
      return;
    }
    setExportSectionCollapsed(section, true);
    toggle.addEventListener("click", () => {
      const collapsed = section.classList.contains("is-collapsed");
      setExportSectionCollapsed(section, !collapsed);
    });
  });

  expandExportSectionForHash();
  window.addEventListener("hashchange", expandExportSectionForHash);
}

function initExportInfoPopover() {
  const button = document.getElementById("exportsInfoBtn");
  const popover = document.getElementById("exportsInfoPopover");
  if (!button || !popover) {
    return;
  }

  const close = () => {
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const nextHidden = !popover.hidden;
    popover.hidden = nextHidden;
    button.setAttribute("aria-expanded", String(!nextHidden));
  });

  document.addEventListener("click", (event) => {
    if (popover.hidden) {
      return;
    }
    if (event.target === button || button.contains(event.target) || popover.contains(event.target)) {
      return;
    }
    close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) {
      close();
    }
  });
}

async function hydrateExportData() {
  await Promise.all([
    hydrateTransactionsCache(),
    hydrateAccountsCache(),
    hydrateCategoriesCache(),
    hydrateReceiptsCache(),
    hydrateBusinessProfileCache(),
    hydrateMileageCache()
  ]);
}

async function hydrateMileageCache() {
  try {
    const response = await apiFetch("/api/mileage?limit=500");
    if (!response || !response.ok) {
      exportState.mileage = [];
      return;
    }
    const payload = await response.json().catch(() => null);
    const records = Array.isArray(payload?.data) ? payload.data : [];
    exportState.mileage = records.map((item) => ({
      id: item.id,
      businessId: item.business_id || "",
      date: item.trip_date || "",
      purpose: item.purpose || "",
      destination: item.destination || "",
      miles: item.miles != null ? Number(item.miles) : null,
      km: item.km != null ? Number(item.km) : null
    }));
  } catch (error) {
    console.warn("[Exports] Unable to hydrate mileage", error);
    exportState.mileage = [];
  }
}

async function hydrateBusinessList() {
  try {
    const response = await apiFetch("/api/businesses");
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    exportContext = {
      activeBusinessId: payload?.active_business_id || "",
      businesses: Array.isArray(payload?.businesses) ? payload.businesses : []
    };
  } catch (error) {
    console.warn("[Exports] Unable to hydrate businesses", error);
  }
}

function initExportScopeSelect() {
  const select = document.getElementById("exportScope");
  if (!select) {
    return;
  }

  const scopeKey = getExportPreferenceKey(EXPORT_SCOPE_KEY);
  setExportScope(select, scopeKey ? localStorage.getItem(scopeKey) : null);
  syncExportScopeUi();
  select.addEventListener("change", async () => {
    setExportScope(select, select.value);
    await hydrateExportData();
    populateExportFilters();
    await refreshReceiptsDot();
    syncExportScopeUi();
    updateExportSummary();
    await refreshExportPreflight();
    await refreshExportReviewQueue(true);
    renderExportHistory();
  });
}

function applyRequestedExportMode() {
  const requestedMode = getRequestedExportMode();
  const select = document.getElementById("exportPackageMode");
  if (!requestedMode || !select) {
    return;
  }
  select.value = requestedMode;
}

function getExportScope() {
  const select = document.getElementById("exportScope");
  if (select?.value === "all") {
    return "all";
  }
  const scopeKey = getExportPreferenceKey(EXPORT_SCOPE_KEY);
  return scopeKey && localStorage.getItem(scopeKey) === "all" ? "all" : "active";
}

function setExportScope(select, value) {
  const normalized = value === "all" ? "all" : "active";
  if (select) {
    select.value = normalized;
  }
  const scopeKey = getExportPreferenceKey(EXPORT_SCOPE_KEY);
  if (scopeKey) {
    localStorage.setItem(scopeKey, normalized);
  }
}

function buildScopeQuery() {
  return getExportScope() === "all" ? "?scope=all" : "";
}

function buildTransactionsExportQuery() {
  const params = new URLSearchParams();
  params.set("all", "true");

  if (getExportScope() === "all") {
    params.set("scope", "all");
  }

  return `?${params.toString()}`;
}

function getStoredBusinesses() {
  return Array.isArray(exportContext.businesses) ? exportContext.businesses : [];
}

function getActiveBusinessId() {
  return exportContext.activeBusinessId || localStorage.getItem("lb_active_business_id") || "";
}

function getBusinessById(businessId) {
  return getStoredBusinesses().find((business) => business.id === businessId) || null;
}

function getBusinessesInScope() {
  const businesses = getStoredBusinesses();
  if (getExportScope() === "all") {
    return businesses;
  }
  const active = businesses.find((business) => business.id === getActiveBusinessId());
  return active ? [active] : businesses.slice(0, 1);
}

function syncExportScopeOptionLabel() {
  const select = document.getElementById("exportScope");
  const activeOption = select?.querySelector('option[value="active"]');
  if (!activeOption) {
    return;
  }

  const activeBusiness = getBusinessById(getActiveBusinessId()) || getStoredBusinesses()[0] || null;
  activeOption.textContent = activeBusiness?.name || tx("exports_scope_active_short");
}

function getBusinessCurrency(businessId) {
  const region = String(getBusinessById(businessId)?.region || "").toLowerCase() === "ca" ? "ca" : "us";
  return getCurrencyForRegion(region);
}

function hasMixedCurrenciesInScope() {
  const currencies = new Set(
    getBusinessesInScope().map((business) => getBusinessCurrency(business.id))
  );
  return currencies.size > 1;
}

function syncExportScopeUi() {
  const scopeHelp = document.getElementById("exportScopeHelp");
  const taxIdCheckbox = document.getElementById("exportIncludeTaxId");
  const inlineTaxId = document.getElementById("exportInlineTaxId");
  const pdfNote = document.getElementById("exportPdfNote");
  const scope = getExportScope();
  const mixedCurrencies = hasMixedCurrenciesInScope();

  syncExportScopeOptionLabel();

  if (scopeHelp) {
    scopeHelp.textContent =
      scope === "all"
        ? tx("exports_scope_help_all")
        : tx("exports_scope_help_active");
  }

  if (taxIdCheckbox) {
    taxIdCheckbox.disabled = scope === "all";
    if (scope === "all") {
      taxIdCheckbox.checked = false;
      if (inlineTaxId) {
        inlineTaxId.hidden = true;
        hideExportProfileGuide();
        const inp = document.getElementById("exportInlineTaxIdInput");
        if (inp) inp.value = "";
        const cb = document.getElementById("exportInlineTaxIdCheckbox");
        if (cb) cb.checked = false;
      }
    }
  }

  if (pdfNote) {
    pdfNote.textContent =
      scope === "all"
        ? tx("exports_pdf_note_bulk")
        : tx("exports_pdf_note_single");
  }

  const summaryNet = document.getElementById("exportSummaryNet");
  if (scope === "all" && mixedCurrencies && summaryNet) {
    summaryNet.textContent = tx("exports_per_business");
  }
}

async function hydrateTransactionsCache() {
  try {
    const response = await apiFetch(`/api/transactions${buildTransactionsExportQuery()}`);
    if (!response || !response.ok) {
      transactionsCacheFresh = false;
      exportState.transactions = [];
      return;
    }
    const payload = await response.json().catch(() => null);
    const transactions = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.transactions)
      ? payload.transactions
      : Array.isArray(payload?.data)
      ? payload.data
      : [];
    exportState.transactions = transactions.map((transaction) => ({
      id: transaction.id,
      businessId: transaction.businessId || transaction.business_id || "",
      businessName: transaction.businessName || transaction.business_name || "",
      date: String(transaction.date || "").slice(0, 10),
      description: transaction.description || "",
      amount: Number(transaction.amount) || 0,
      accountId: transaction.accountId || transaction.account_id || "",
      categoryId: transaction.categoryId || transaction.category_id || "",
      type: transaction.type === "income" ? "income" : "expense",
      note: transaction.note || "",
      receiptId: transaction.receiptId || transaction.receipt_id || "",
      cleared: transaction.cleared === true,
      currency: String(transaction.currency || "").toUpperCase(),
      sourceAmount: transaction.sourceAmount ?? transaction.source_amount ?? null,
      exchangeRate: transaction.exchangeRate ?? transaction.exchange_rate ?? null,
      exchangeDate: String(transaction.exchangeDate || transaction.exchange_date || "").slice(0, 10),
      convertedAmount: transaction.convertedAmount ?? transaction.converted_amount ?? null,
      taxTreatment: transaction.taxTreatment || transaction.tax_treatment || "",
      indirectTaxAmount: transaction.indirectTaxAmount ?? transaction.indirect_tax_amount ?? null,
      indirectTaxRecoverable:
        transaction.indirectTaxRecoverable === true || transaction.indirect_tax_recoverable === true,
      personalUsePct: transaction.personalUsePct ?? transaction.personal_use_pct ?? null,
      reviewStatus: transaction.reviewStatus || transaction.review_status || "",
      reviewNotes: transaction.reviewNotes || transaction.review_notes || ""
    }));
    transactionsCacheFresh = true;
  } catch (error) {
    transactionsCacheFresh = false;
    console.warn("[Exports] Unable to hydrate transactions", error);
    exportState.transactions = [];
  }
}

async function hydrateAccountsCache() {
  try {
    const response = await apiFetch(`/api/accounts${buildScopeQuery()}`);
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    const accounts = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    if (Array.isArray(accounts)) {
      exportState.accounts = accounts.map((account) => ({
        ...account,
        businessId: account.businessId || account.business_id || "",
        businessName: account.businessName || account.business_name || ""
      }));
      return;
    }
    exportState.accounts = [];
  } catch (error) {
    console.warn("[Exports] Unable to hydrate accounts", error);
    exportState.accounts = [];
  }
}

async function hydrateCategoriesCache() {
  try {
    const response = await apiFetch(`/api/categories${buildScopeQuery()}`);
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    const categories = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    if (Array.isArray(categories)) {
      exportState.categories = categories.map((category) => {
        const businessRegion = String(category.businessRegion || category.business_region || "").toUpperCase() === "CA" ? "CA" : "US";
        return {
        id: category.id,
        businessId: category.businessId || category.business_id || "",
        businessName: category.businessName || category.business_name || "",
        businessRegion,
        name: category.name,
        type: category.kind || category.type || "",
        taxLabel: (businessRegion === "CA" ? category.tax_map_ca : category.tax_map_us) || ""
      };
      });
      return;
    }
    exportState.categories = [];
  } catch (error) {
    console.warn("[Exports] Unable to hydrate categories", error);
    exportState.categories = [];
  }
}

async function hydrateReceiptsCache() {
  try {
    const response = await apiFetch(`/api/receipts${buildScopeQuery()}`);
    if (!response || !response.ok) {
      return;
    }
    const payload = await response.json().catch(() => null);
    const receipts = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.receipts)
      ? payload.receipts
      : [];
    exportState.receipts = receipts.map((receipt) => ({
      id: receipt.id,
      businessId: receipt.businessId || receipt.business_id || "",
      businessName: receipt.businessName || receipt.business_name || "",
      filename: receipt.filename || "",
      uploadedAt: receipt.created_at || "",
      transactionId: receipt.transaction_id || "",
      mimeType: receipt.mime_type || ""
    }));
    unattachedReceiptsCount = exportState.receipts.filter((receipt) => !receipt.transactionId).length;
  } catch (error) {
    console.warn("[Exports] Unable to hydrate receipts", error);
    exportState.receipts = [];
    unattachedReceiptsCount = 0;
  }
}

async function hydrateBusinessProfileCache() {
  if (getExportScope() === "all") {
    exportState.businessProfile = {
      name: tx("exports_scope_all"),
      type: "",
      ein: "",
      taxId: "",
      fiscalYearStart: "",
      address: "",
      naics: "",
      accountingMethod: "",
      materialParticipation: null,
      gstHstRegistered: false,
      gstHstNumber: "",
      gstHstMethod: "",
      operatingName: ""
    };
    return;
  }

  try {
    const response = await apiFetch("/api/business");
    if (!response || !response.ok) {
      exportState.businessProfile = {};
      return;
    }
    const business = await response.json().catch(() => null);
    if (!business) {
      exportState.businessProfile = {};
      return;
    }
    exportState.businessProfile = {
      name: business.name || "",
      type: business.business_type || "",
      ein: business.tax_id || "",
      taxId: business.tax_id || "",
      fiscalYearStart: business.fiscal_year_start || "",
      address: business.address || "",
      naics: business.business_activity_code || "",
      accountingMethod: business.accounting_method || "",
      materialParticipation: typeof business.material_participation === "boolean" ? business.material_participation : null,
      gstHstRegistered: business.gst_hst_registered === true,
      gstHstNumber: business.gst_hst_number || "",
      gstHstMethod: business.gst_hst_method || "",
      operatingName: business.operating_name || ""
    };
  } catch (error) {
    console.warn("[Exports] Unable to hydrate business profile", error);
    exportState.businessProfile = {};
  }
}

function setupExportForm() {
  const form = document.getElementById("exportForm");
  const historyRows = document.getElementById("exportHistoryRows");
  const preflightRefreshButton = document.getElementById("exportPreflightRefreshBtn");
  const reviewFilter = document.getElementById("exportReviewFilter");
  const ytdYear = new Date().getUTCFullYear();
  const defaultPreset = `${ytdYear}-ytd`;

  applyDatePreset(defaultPreset);
  updatePresetChipState(defaultPreset);

  ["period-start", "period-end", "exportAccountFilter", "exportCategoryFilter", "exportLanguage", "exportIncludeTaxId", "exportScope", "exportPackageMode"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", async () => {
      if (id === "period-start" || id === "period-end") {
        clearCustomPresetState();
      }
      updateExportSummary();
      await refreshExportPreflight();
      await refreshExportReviewQueue(true);
    });
  });

  preflightRefreshButton?.addEventListener("click", async () => {
    await refreshExportPreflight(true);
    await refreshExportReviewQueue(true);
  });

  reviewFilter?.addEventListener("change", () => {
    renderExportReviewQueue(exportReviewState.queue, exportReviewState.summary);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const range = getValidatedExportRange();
    if (!range) {
      return;
    }
    await exportCsv(range.startDate, range.endDate);
  });

  historyRows?.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLElement)) return;

    const deleteBtn = event.target.closest(".history-delete");
    if (deleteBtn) {
      const backendId = deleteBtn.dataset.deleteBackendId;
      if (backendId) {
        deleteBackendExport(backendId, deleteBtn.closest(".history-entry"));
      }
      return;
    }

    const downloadBtn = event.target.closest(".history-download");
    if (downloadBtn?.dataset.historyId) {
      if (downloadBtn.dataset.historyMode === "redacted") {
        downloadBackendExport(downloadBtn.dataset.historyId);
      } else {
        replayHistoryEntry(downloadBtn.dataset.historyId);
      }
      return;
    }

    const diagnosticsBtn = event.target.closest(".history-diagnostics-toggle");
    if (diagnosticsBtn?.dataset.historyDiagnosticsId) {
      void toggleHistoryDiagnostics(diagnosticsBtn.dataset.historyDiagnosticsId);
    }
  });
}

function setupPdfButton() {
  const button = document.getElementById("exportPdfBtn");
  const note = document.getElementById("exportPdfNote");
  if (!button) {
    return;
  }

  const syncPdfState = () => {
    const isV1 = (typeof effectiveTier === "function" ? effectiveTier() : "free") === "v1";
    const finalization = exportPreflightState.finalization;
    const finalizedBlocked =
      getSelectedExportMode() === "finalized"
      && getExportScope() !== "all"
      && Array.isArray(finalization?.hardBlockers)
      && finalization.hardBlockers.length > 0;
    button.disabled = !isV1 || finalizedBlocked;
    button.title = finalizedBlocked ? tx("exports_preflight_note_finalized_blocked") : "";
    if (note) {
      note.hidden = isV1;
    }
    return isV1 && !finalizedBlocked;
  };

  syncPdfState();

  button.addEventListener("click", async () => {
    if (!syncPdfState()) {
      return;
    }
    const range = getValidatedExportRange();
    if (!range) {
      return;
    }
    const scope = getExportScope();
    const includeTaxId = scope !== "all" && !!document.getElementById("exportIncludeTaxId")?.checked;
    if (includeTaxId) {
      const taxIdInput = document.getElementById("exportInlineTaxIdInput");
      const agreementCheckbox = document.getElementById("exportInlineTaxIdCheckbox");
      showSecureExportInlineError("");
      const taxId = taxIdInput?.value?.trim() || "";
      if (!taxId) {
        showSecureExportInlineError(tx("secure_export_modal_error_taxid"));
        taxIdInput?.focus();
        return;
      }
      if (!isValidTaxId(taxId)) {
        showSecureExportInlineError(tx("secure_export_modal_error_taxid_format"));
        taxIdInput?.focus();
        return;
      }
      if (!agreementCheckbox?.checked) {
        showSecureExportInlineError(tx("secure_export_modal_error_checkbox"));
        return;
      }
      button.disabled = true;
      try {
        await submitSecureExport(taxId, range.startDate, range.endDate);
        if (typeof resetInlineTaxIdState === "function") {
          resetInlineTaxIdState({ hideSection: true });
        } else if (taxIdInput) {
          taxIdInput.value = "";
        }
      } catch (err) {
        if (taxIdInput) taxIdInput.value = "";
        showSecureExportInlineError(
          err?.message || tx("secure_export_modal_error_generic"),
          err?.missingFieldKeys || []
        );
      } finally {
        syncPdfState();
      }
    } else {
      await exportPdf(range.startDate, range.endDate);
    }
  });
}

function initPresetChips() {
  document.querySelectorAll("[data-range-preset]").forEach((button) => {
    button.addEventListener("click", async () => {
      const preset = button.dataset.rangePreset || "custom";
      applyDatePreset(preset);
      updatePresetChipState(preset);
      updateExportSummary();
      await refreshExportPreflight();
      await refreshExportReviewQueue(true);
    });
  });
}

function renderExportPreflightEmpty(message) {
  const stateNode = document.getElementById("exportPreflightState");
  if (!stateNode) {
    return;
  }
  stateNode.innerHTML = `<div class="history-empty">${escapeHtml(message || tx("exports_preflight_empty"))}</div>`;
}

function getFilteredExportReviewQueue(queue = exportReviewState.queue) {
  const routeState = getExportReviewRouteState();
  const filterValue = String(document.getElementById("exportReviewFilter")?.value || "all").trim().toLowerCase();
  return (queue || []).filter((item) => {
    const entries = Array.isArray(item?.issueEntries) ? item.issueEntries : [];
    if (routeState.transactionId && String(item?.id || "") !== routeState.transactionId) {
      return false;
    }
    if (routeState.issue && !entries.some((entry) => String(entry?.issueCode || "").trim().toLowerCase() === routeState.issue)) {
      return false;
    }
    if (filterValue === "hard" && !entries.some((entry) => entry?.severity === "hard")) {
      return false;
    }
    if (filterValue === "warning" && !entries.some((entry) => entry?.severity !== "hard")) {
      return false;
    }
    return true;
  });
}

function buildExportReviewActionHref(item) {
  const actionTarget = item?.actionTarget || {};
  const href = String(actionTarget.href || "/transactions").trim() || "/transactions";
  if (href === "/transactions" || href.endsWith("/transactions")) {
    const params = new URLSearchParams();
    params.set("highlight", String(item?.id || ""));
    params.set("open", "review");
    return `/transactions?${params.toString()}`;
  }
  return href;
}

function renderExportReviewQueue(queue = [], summary = null) {
  const stateNode = document.getElementById("exportReviewState");
  if (!stateNode) {
    return;
  }

  const filtered = getFilteredExportReviewQueue(queue);
  const routeState = getExportReviewRouteState();
  const total = Number(summary?.total || queue.length || 0);
  const introBits = [];
  introBits.push(`${total} open item${total === 1 ? "" : "s"} in this export window.`);
  if (routeState.issue) {
    introBits.push(`Filtered to ${routeState.issue.replace(/_/g, " ")}.`);
  }
  if (routeState.transactionId) {
    introBits.push("Focused on one transaction.");
  }

  if (!queue.length) {
    stateNode.innerHTML = `<div class="history-empty">No review items are open for this date range.</div>`;
    return;
  }

  if (!filtered.length) {
    stateNode.innerHTML = `<div class="history-empty">No review items match this filter.</div>`;
    return;
  }

  stateNode.innerHTML = `
    <div class="export-review-summary">${escapeHtml(introBits.join(" "))}</div>
    <div class="export-review-list">
      ${filtered.map((item) => {
        const issueEntries = Array.isArray(item.issueEntries) ? item.issueEntries : [];
        const primaryIssue = issueEntries[0] || null;
        const issueLabel = primaryIssue?.label || "Needs review";
        const issueSeverity = primaryIssue?.severity === "hard" ? "hard" : "warning";
        const actionLabel = item?.actionTarget?.label || "Open transaction";
        const amount = typeof formatMoney === "function"
          ? formatMoney(item.amount, item.currency)
          : `${item.currency || "USD"} ${Number(item.amount || 0).toFixed(2)}`;
        return `
          <article class="export-review-item export-review-item--${escapeHtml(issueSeverity)}">
            <div class="export-review-item-main">
              <div class="export-review-item-head">
                <strong>${escapeHtml(item.description || "(No description)")}</strong>
                <span class="export-review-status">${escapeHtml(item.reviewStatus || "Needs review")}</span>
              </div>
              <div class="export-review-item-meta">
                <span>${escapeHtml(String(item.date || ""))}</span>
                <span>${escapeHtml(amount)}</span>
                <span>${escapeHtml(item.categoryName || "Uncategorized")}</span>
              </div>
              <div class="export-review-item-issue">
                <span class="export-review-issue-badge export-review-issue-badge--${escapeHtml(issueSeverity)}">${escapeHtml(issueLabel)}</span>
                <span>${escapeHtml(item.supportSummary || item.supportStatus || "")}</span>
              </div>
            </div>
            <div class="export-review-item-actions">
              <a class="export-preflight-link" href="${escapeHtml(buildExportReviewActionHref(item))}">${escapeHtml(actionLabel)}</a>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;

  if (routeState.focus || routeState.issue || routeState.transactionId) {
    document.getElementById("exportReviewQueueSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderExportReviewQueueEmpty(message) {
  const stateNode = document.getElementById("exportReviewState");
  if (!stateNode) {
    return;
  }
  stateNode.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
}

function renderExportPreflight(finalization) {
  const stateNode = document.getElementById("exportPreflightState");
  if (!stateNode) {
    return;
  }

  const hardBlockers = Array.isArray(finalization?.hardBlockers) ? finalization.hardBlockers : [];
  const warnings = Array.isArray(finalization?.warnings) ? finalization.warnings : [];
  const reviewerCount =
    Number(finalization?.materialityPolicy?.openHardReviewerIssueCount || 0)
    + Number(finalization?.materialityPolicy?.openWarningReviewerIssueCount || 0);
  const missingFields = Array.isArray(finalization?.businessProfile?.missingFieldKeys)
    ? finalization.businessProfile.missingFieldKeys
    : [];

  let statusClass = "ready";
  let statusLabel = tx("exports_preflight_status_ready");
  if (hardBlockers.length > 0) {
    statusClass = "blocked";
    statusLabel = tx("exports_preflight_status_blocked");
  } else if (warnings.length > 0 || reviewerCount > 0) {
    statusClass = "warning";
    statusLabel = tx("exports_preflight_status_warning");
  }

  const formatIssueLabel = (item) => {
    const code = String(item?.code || "").trim().toLowerCase();
    const rawMessage = String(item?.message || "").trim();
    const shorthandMessage = rawMessage.toLowerCase();
    const codeLabels = {
      needs_tax_mapping: "Transactions still need tax-line mapping",
      needs_receipt_support: "Receipt or support files are still missing",
      needs_business_purpose: "Business-purpose notes still need review",
      needs_allocation: "Split allocations still need review",
      needs_mileage_log: "Mileage logs or actual-expense support are still missing",
      needs_home_office_support: "Home office support is still missing",
      needs_capital_asset_review: "Capital asset review is still incomplete",
      missing_description: "Transactions are still missing descriptions",
      cpa_review_required: "Reviewer follow-up is still open",
      final_confirmation_needed: "Final confirmation is still required",
      needs_category: "Transactions still need categories",
      business_profile_incomplete: "Business profile is incomplete",
      finalization_certification_required: "Finalization certification is still required"
    };

    if (codeLabels[code]) {
      return codeLabels[code];
    }
    if (shorthandMessage === "dup" || shorthandMessage.startsWith("dup ")) {
      return "Duplicate transactions detected";
    }
    if (shorthandMessage === "pt" || shorthandMessage.startsWith("pt ")) {
      return "Personal transactions still need review";
    }
    if (rawMessage && /^[a-z_]+$/i.test(rawMessage)) {
      return rawMessage
        .replace(/_/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
    }
    return rawMessage || code.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase()) || tx("exports_preflight_none");
  };

  const renderIssueList = (items) => {
    if (!items.length) {
      return `<li>${escapeHtml(tx("exports_preflight_none"))}</li>`;
    }
    return items.map((item) => {
      const count = Number(item?.count || 0);
      const suffix = count > 0 ? ` (${count})` : "";
      const action = resolveExportIssueAction(item);
      const actionMarkup = action
        ? `<a class="export-preflight-link" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`
        : "";
      return `
        <li class="export-preflight-item">
          <div class="export-preflight-item-copy">${escapeHtml(formatIssueLabel(item))}${escapeHtml(suffix)}</div>
          ${actionMarkup}
        </li>
      `;
    }).join("");
  };

  const profileNote = missingFields.length
    ? `<p class="export-preflight-note">${escapeHtml(tx("exports_preflight_profile_missing"))}: ${escapeHtml(missingFields.join(", "))}</p>`
    : "";
  const blockedNote = hardBlockers.length > 0 && getSelectedExportMode() === "finalized"
    ? `<p class="export-preflight-note">${escapeHtml(tx("exports_preflight_note_finalized_blocked"))}</p>`
    : "";

  stateNode.innerHTML = `
    <div class="export-preflight-grid">
      <article class="export-preflight-metric">
        <span class="meta-label">${escapeHtml(tx("exports_preflight_metric_blockers"))}</span>
        <strong>${hardBlockers.length}</strong>
      </article>
      <article class="export-preflight-metric">
        <span class="meta-label">${escapeHtml(tx("exports_preflight_metric_warnings"))}</span>
        <strong>${warnings.length}</strong>
      </article>
      <article class="export-preflight-metric">
        <span class="meta-label">${escapeHtml(tx("exports_preflight_metric_reviewer"))}</span>
        <strong>${reviewerCount}</strong>
      </article>
    </div>
    <div class="export-preflight-status-row">
      <span class="export-preflight-status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="export-preflight-columns">
      <section class="export-preflight-list">
        <h3>${escapeHtml(tx("exports_preflight_blockers_title"))}</h3>
        <ul>${renderIssueList(hardBlockers)}</ul>
      </section>
      <section class="export-preflight-list">
        <h3>${escapeHtml(tx("exports_preflight_warnings_title"))}</h3>
        <ul>${renderIssueList(warnings)}</ul>
      </section>
    </div>
    ${profileNote}
    ${blockedNote}
  `;
}

async function refreshExportPreflight(force = false) {
  const refreshButton = document.getElementById("exportPreflightRefreshBtn");
  const range = getValidatedExportRange();

  if (getExportScope() === "all") {
    exportPreflightState = { loading: false, finalization: null };
    renderExportPreflightEmpty(tx("exports_preflight_scope_all"));
    syncExportActionState();
    return;
  }

  if (!range) {
    exportPreflightState = { loading: false, finalization: null };
    renderExportPreflightEmpty(tx("exports_preflight_empty"));
    syncExportActionState();
    return;
  }

  if (!force && exportPreflightState.loading) {
    return;
  }

  exportPreflightState = { ...exportPreflightState, loading: true };
  if (refreshButton) {
    refreshButton.disabled = true;
  }
  renderExportPreflightEmpty(tx("exports_preflight_loading"));

  try {
    const params = new URLSearchParams({
      startDate: range.startDate,
      endDate: range.endDate
    });
    const response = await apiFetch(`/api/exports/dataset?${params.toString()}`);
    if (!response || !response.ok) {
      throw new Error("dataset_failed");
    }
    const payload = await response.json().catch(() => null);
    exportPreflightState = {
      loading: false,
      finalization: payload?.finalization || null
    };
    renderExportPreflight(exportPreflightState.finalization || {});
  } catch (error) {
    console.warn("[Exports] Unable to load export preflight", error);
    exportPreflightState = { loading: false, finalization: null };
    renderExportPreflightEmpty(tx("exports_error_generic") || "Unable to load export review.");
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
    }
    syncExportActionState();
  }
}

async function refreshExportReviewQueue(force = false) {
  const range = getValidatedExportRange();
  if (getExportScope() === "all") {
    exportReviewState = { loading: false, queue: [], summary: null };
    renderExportReviewQueueEmpty("Review queue is available for the active business only.");
    return;
  }
  if (!range) {
    exportReviewState = { loading: false, queue: [], summary: null };
    renderExportReviewQueueEmpty("Choose a valid date range to load the review queue.");
    return;
  }

  if (!force && exportReviewState.loading) {
    return;
  }

  exportReviewState = { ...exportReviewState, loading: true };
  renderExportReviewQueueEmpty("Loading review queue...");

  try {
    const params = new URLSearchParams({
      startDate: range.startDate,
      endDate: range.endDate
    });
    const response = await apiFetch(`/api/review/queue?${params.toString()}`);
    if (!response || !response.ok) {
      throw new Error("review_queue_failed");
    }
    const payload = await response.json().catch(() => ({}));
    exportReviewState = {
      loading: false,
      queue: Array.isArray(payload?.queue) ? payload.queue : [],
      summary: payload?.summary || null
    };
    renderExportReviewQueue(exportReviewState.queue, exportReviewState.summary);
  } catch (error) {
    console.warn("[Exports] Unable to load export review queue", error);
    exportReviewState = { loading: false, queue: [], summary: null };
    renderExportReviewQueueEmpty("Unable to load the review queue right now.");
  }
}

function applyDatePreset(preset) {
  const startInput = document.getElementById("period-start");
  const endInput = document.getElementById("period-end");
  if (!startInput || !endInput) {
    return;
  }

  const today = new Date();
  const ytdYear = today.getUTCFullYear();
  const ytdMonth = String(today.getUTCMonth() + 1).padStart(2, "0");
  const ytdDay = String(today.getUTCDate()).padStart(2, "0");
  const ytdToday = `${ytdYear}-${ytdMonth}-${ytdDay}`;
  const prevYear = ytdYear - 1;

  const ranges = {
    [`${prevYear}-tax-year`]: [`${prevYear}-01-01`, `${prevYear}-12-31`],
    "2025-tax-year": ["2025-01-01", "2025-12-31"],
    [`${ytdYear}-ytd`]: [`${ytdYear}-01-01`, ytdToday],
    "2026-ytd": [`${ytdYear}-01-01`, ytdToday],
    [`q1-${ytdYear}`]: [`${ytdYear}-01-01`, `${ytdYear}-03-31`],
    "q1-2026": ["2026-01-01", "2026-03-31"],
    [`q4-${prevYear}`]: [`${prevYear}-10-01`, `${prevYear}-12-31`],
    "q4-2025": ["2025-10-01", "2025-12-31"]
  };

  if (preset === "custom") {
    return;
  }

  const [startDate, endDate] = ranges[preset] || ranges[`${ytdYear}-ytd`] || [ranges["2026-ytd"][0], ytdToday];
  startInput.value = startDate;
  endInput.value = endDate;
}

function updatePresetChipState(activePreset) {
  document.querySelectorAll("[data-range-preset]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rangePreset === activePreset);
  });
}

function clearCustomPresetState() {
  const activeButton = document.querySelector(".preset-chip.is-active");
  const customButton = document.querySelector('[data-range-preset="custom"]');
  if (activeButton && activeButton !== customButton) {
    activeButton.classList.remove("is-active");
  }
  customButton?.classList.add("is-active");
}

function initExportLanguageSelect() {
  const select = document.getElementById("exportLanguage");
  if (!select) {
    return;
  }

  const appLang = localStorage.getItem("lb_language") || DEFAULT_EXPORT_LANG;
  const langKey = getExportPreferenceKey(EXPORT_LANG_KEY);
  const saved = clampExportLang((langKey ? localStorage.getItem(langKey) : null) || appLang);
  select.value = saved;
  select.addEventListener("change", () => {
    const next = clampExportLang(select.value);
    select.value = next;
    if (langKey) {
      localStorage.setItem(langKey, next);
    }
  });
}

function wireInlineTaxId() {
  const checkbox = document.getElementById("exportIncludeTaxId");
  const section = document.getElementById("exportInlineTaxId");
  const input = document.getElementById("exportInlineTaxIdInput");
  const toggle = document.getElementById("exportInlineTaxIdToggle");

  if (!checkbox || !section) {
    return;
  }

  resetInlineTaxIdState = ({ hideSection = false } = {}) => {
    if (input) {
      input.value = "";
      input.type = "password";
    }
    if (toggle) toggle.textContent = tx("secure_export_modal_show");
    const cb = document.getElementById("exportInlineTaxIdCheckbox");
    if (cb) cb.checked = false;
    const errorEl = document.getElementById("exportInlineTaxIdError");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }
    hideExportProfileGuide();
    if (hideSection) {
      section.hidden = true;
      checkbox.checked = false;
    }
  };

  checkbox.addEventListener("change", () => {
    const show = checkbox.checked;
    section.hidden = !show;
    if (!show) {
      resetInlineTaxIdState();
    }
    if (show) {
      resetInlineTaxIdState();
      const canadaText = document.getElementById("exportInlineTaxIdCanadaText");
      if (canadaText) {
        canadaText.classList.toggle("hidden", getRegion() !== "ca");
      }
      input?.focus();
    }
  });

  toggle?.addEventListener("click", () => {
    if (!input) return;
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    if (toggle) toggle.textContent = isPassword ? tx("secure_export_modal_hide") : tx("secure_export_modal_show");
  });
}

function getValidatedExportRange() {
  const messageNode = document.getElementById("exportFormMessage");
  const startDate = document.getElementById("period-start")?.value || "";
  const endDate = document.getElementById("period-end")?.value || "";

  if (!startDate || !endDate) {
    if (messageNode) {
      messageNode.textContent = tx("exports_error_dates_required");
    }
    return null;
  }

  if (startDate > endDate) {
    if (messageNode) {
      messageNode.textContent = tx("exports_error_dates_order");
    }
    return null;
  }

  if (messageNode) {
    messageNode.textContent = "";
  }

  return { startDate, endDate };
}

function updateExportSummary() {
  const summaryScope = document.getElementById("exportSummaryScope");
  const summaryTaxForm = document.getElementById("exportSummaryTaxForm");
  const taxContextNote = document.getElementById("exportTaxContext");
  const summaryPeriod = document.getElementById("exportSummaryPeriod");
  const summaryIncome = document.getElementById("exportSummaryIncome");
  const summaryExpenses = document.getElementById("exportSummaryExpenses");
  const summaryNet = document.getElementById("exportSummaryNet");
  const startDate = document.getElementById("period-start")?.value || "";
  const endDate = document.getElementById("period-end")?.value || "";
  const scope = getExportScope();
  const mixedCurrencies = hasMixedCurrenciesInScope();

  if (!summaryPeriod || !summaryIncome || !summaryExpenses || !summaryNet) {
    return;
  }

  const taxContext = getTaxFormContextForScope();
  if (summaryScope) {
    summaryScope.textContent =
      scope === "all" ? tx("exports_scope_all") : getBusinessById(getActiveBusinessId())?.name || tx("exports_scope_active_short");
  }
  if (summaryTaxForm) {
    summaryTaxForm.textContent = taxContext.label;
  }
  if (taxContextNote) {
    const textNode = document.getElementById("exportTaxContextText");
    const label = `${tx("exports_tax_context_prefix")}: ${taxContext.exportLabel}`;
    if (textNode) textNode.textContent = label;
    taxContextNote.hidden = !taxContext.exportLabel;
  }

  if (!startDate || !endDate || startDate > endDate) {
    summaryPeriod.textContent = "-";
    summaryIncome.textContent = formatMoney(0);
    summaryExpenses.textContent = formatMoney(0);
    summaryNet.textContent = formatMoney(0);
    return;
  }

  const transactions = filterTransactions(startDate, endDate);
  const income = transactions
    .filter((transaction) => resolveTransactionType(transaction) === "income")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const expenses = transactions
    .filter((transaction) => resolveTransactionType(transaction) !== "income")
    .reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount) || 0), 0);
  const net = income - expenses;

  summaryPeriod.textContent = `${startDate} to ${endDate}`;
  if (scope === "all" && mixedCurrencies) {
    summaryIncome.textContent = tx("exports_per_business");
    summaryExpenses.textContent = tx("exports_per_business");
    summaryNet.textContent = tx("exports_per_business");
    return;
  }

  const currencyRegion = scope === "all"
    ? String(getBusinessesInScope()[0]?.region || "").toLowerCase()
    : getRegion();
  summaryIncome.textContent = formatMoney(income, currencyRegion);
  summaryExpenses.textContent = formatMoney(expenses, currencyRegion);
  summaryNet.textContent = formatMoney(net, currencyRegion);

  updateExportReadiness(transactions);
}

function updateExportReadiness(transactions) {
  const section = document.getElementById("exportReadinessSection");
  const itemsEl = document.getElementById("exportReadinessItems");
  if (!section || !itemsEl || !transactions || transactions.length === 0) {
    if (section) section.hidden = true;
    return;
  }

  const categories = getCategories();
  const catById = {};
  categories.forEach(c => { catById[c.id] = c; });

  let needsCategory = 0;
  let needsTaxMapping = 0;
  let missingReceipt = 0;
  let needsMileage = 0;
  let needsAllocation = 0;
  let needsBusinessPurpose = 0;
  let incomeReview = 0;

  for (const txn of transactions) {
    const cat = catById[txn.categoryId];
    const catName = String(cat?.name || txn.categoryName || "").toLowerCase();
    const isExpense = txn.type !== "income";
    const isIncome = txn.type === "income";
    const isUncategorized = !txn.categoryId || /imported|needs[._-]?category|uncategorized/i.test(catName);

    if (isUncategorized) {
      needsCategory++;
      continue;
    }
    if (!cat?.taxLabel) needsTaxMapping++;
    if (isExpense && !txn.receiptId) missingReceipt++;
    if (isExpense && requiresExportMileageLog(catName)) needsMileage++;
    if (requiresExportAllocation(catName)) needsAllocation++;
    if (isExpense && requiresExportBusinessPurpose(catName)) needsBusinessPurpose++;
    if (isIncome && txn.reviewStatus === "needs_review") incomeReview++;
  }

  const readinessRows = [
    { label: "Need category assignment", count: needsCategory, key: "nc" },
    { label: "Expenses missing receipts/support", count: missingReceipt, key: "rs" },
    { label: "Need tax line mapping", count: needsTaxMapping, key: "um" },
    { label: "Need mileage log", count: needsMileage, key: "ml" },
    { label: "Need business-use allocation", count: needsAllocation, key: "al" },
    { label: "Need business purpose note", count: needsBusinessPurpose, key: "bp" },
    { label: "Income rows flagged for review", count: incomeReview, key: "ir" }
  ].filter(r => r.count > 0);

  if (readinessRows.length === 0) {
    itemsEl.innerHTML = `<span class="export-readiness-all-clear">✅ All transactions are ready for export</span>`;
  } else {
    itemsEl.innerHTML = readinessRows.map(r =>
      `<div class="export-readiness-item">
        <span class="export-readiness-label">${escapeHtml(r.label)}</span>
        <span class="export-readiness-count warn">${r.count}</span>
      </div>`
    ).join("");
  }

  section.hidden = false;
}

async function exportCsv(startDate, endDate, recordHistory = true, explicitFilename, tierOverride, exportLangOverride, formatOverride) {
  if (!transactionsCacheFresh) {
    showExportToast(tx("exports_error_stale_data"));
    return;
  }
  const tier = tierOverride || (typeof effectiveTier === "function" ? effectiveTier() : "free");
  const exportLang = clampExportLang(exportLangOverride || getCurrentExportLanguage());
  const scope = getExportScope();
  const transactions = filterTransactions(startDate, endDate);
  const format = formatOverride || (tier === "v1" ? CSV_FULL_FORMAT : CSV_BASIC_FORMAT);

  if (!transactions.length) {
    showExportToast(tx("exports_no_data"));
    return;
  }

  if (scope === "all") {
    showExportToast("Premium CSV export is available one business at a time. Multi-business CSV batching is temporarily disabled while the backend export engine is finalized.");
    return;
  }

  const activeBusiness = getBusinessesInScope()[0] || null;
  const currency = getCurrencyForRegion(String(activeBusiness?.region || getRegion()).toLowerCase());
  const filename = explicitFilename
    || (format === CSV_FULL_FORMAT
      ? makeExportFilename(startDate, endDate, activeBusiness || {})
      : format === CSV_BASIC_FORMAT
        ? makeBasicFilename(startDate, endDate, activeBusiness || {})
        : makeCsvFilenameForFormat(format, startDate, endDate));

  try {
    await submitBackendCsvExport({
      startDate,
      endDate,
      exportLang,
      currency,
      filename,
      exportType: format
    });
    showExportToast(tx("exports_generated_csv"));
    if (recordHistory) {
      await renderExportHistory();
    }
  } catch (csvErr) {
    console.error("[Exports] Backend CSV generation failed:", csvErr);
    showExportToast(csvErr?.message || tx("exports_error_generic") || "CSV export failed. Please try again.");
  }
}

async function exportPdf(startDate, endDate, recordHistory = true, explicitFilename, exportLangOverride) {
  if (!transactionsCacheFresh) {
    showExportToast(tx("exports_error_stale_data"));
    return;
  }

  const exportLang = clampExportLang(exportLangOverride || getCurrentExportLanguage());
  const scope = getExportScope();
  const includeTaxId = scope !== "all" && !!document.getElementById("exportIncludeTaxId")?.checked;
  const transactions = filterTransactions(startDate, endDate);
  const batches = await buildExportPdfBatches(transactions, scope);
  const historyEntries = [];

  if (!batches.length) {
    showExportToast(tx("exports_no_data"));
    return;
  }

  if (scope !== "all") {
    if (!confirmFinalizedExportIfNeeded()) {
      return;
    }
    const filename = explicitFilename && batches.length === 1
      ? explicitFilename
      : makePdfFilename(startDate, endDate, batches[0]);
    showExportGeneralError("");
    try {
      await submitBackendPdfExport({
        startDate,
        endDate,
        includeTaxId,
        exportMode: getSelectedExportMode(),
        certifiedByUser: includeTaxId || getSelectedExportMode() === "finalized",
        exportLang,
        currency: getCurrencyForRegion(String(batches[0]?.region || getRegion()).toLowerCase()),
        filename
      });
      showExportToast(tx("exports_generated_pdf"));
      if (recordHistory) {
        await renderExportHistory();
      }
    } catch (pdfErr) {
      console.error("[Exports] Backend PDF generation failed:", pdfErr);
      const keys = pdfErr?.missingFieldKeys || [];
      if (pdfErr?.finalizationBlockers?.length) {
        showFinalizationError(pdfErr.finalizationBlockers);
      } else if (keys.length) {
        showExportGeneralError(pdfErr.message, keys);
      } else {
        showExportToast(pdfErr?.message || tx("exports_error_generic") || "PDF export failed. Please try again.");
      }
    }
    return;
  }

  showExportToast("Premium PDF export is available one business at a time. Multi-business PDF batching is temporarily disabled while the backend export engine is finalized.");
}

async function requestPdfGrant({ startDate, endDate, includeTaxId, exportLang, currency }) {
  return requestExportGrant({
    exportType: "pdf",
    includeTaxId,
    startDate,
    endDate,
    exportLang,
    currency
  });
}

async function requestCsvGrant({ startDate, endDate, exportLang, currency, exportType }) {
  return requestExportGrant({
    exportType,
    includeTaxId: false,
    startDate,
    endDate,
    exportLang,
    currency
  });
}

async function requestExportGrant({ exportType, includeTaxId, startDate, endDate, exportLang, currency }) {
  const response = await apiFetch("/api/exports/request-grant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      exportType,
      includeTaxId,
      dateRange: { startDate, endDate },
      language: exportLang,
      currency,
      templateVersion: "v1"
    })
  });

  if (!response || !response.ok) {
    let errorMessage = tx("exports_error_generic") || "PDF export failed. Please try again.";
    try {
      const payload = await response.json();
      if (payload?.error && typeof payload.error === "string") {
        errorMessage = payload.error;
      }
    } catch {}
    throw new Error(errorMessage);
  }

  return response.json();
}

async function encryptExportTaxIdIfNeeded(includeTaxId) {
  if (!includeTaxId) return "";
  const businessProfile = readBusinessProfile();
  const taxId = String(businessProfile?.ein || businessProfile?.taxId || "").trim();
  if (!taxId) {
    throw new Error("Tax ID is missing from the business profile.");
  }
  if (!window.exportCrypto?.encryptTaxId) {
    throw new Error(tx("secure_export_modal_error_generic") || "Secure export is unavailable.");
  }
  return window.exportCrypto.encryptTaxId(taxId);
}

async function submitBackendPdfExport({ startDate, endDate, includeTaxId, exportMode, certifiedByUser, exportLang, currency, filename }) {
  const grant = await requestPdfGrant({ startDate, endDate, includeTaxId, exportLang, currency });
  const taxId_jwe = await encryptExportTaxIdIfNeeded(includeTaxId);
  const response = await apiFetch("/api/exports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantToken: grant?.grantToken,
      exportMode: exportMode || "workpaper",
      ...(taxId_jwe ? { taxId_jwe } : {}),
      ...(certifiedByUser ? { certifiedByUser: true } : {})
    })
  });

  if (!response || !response.ok) {
    let errorMessage = tx("exports_error_generic") || "PDF export failed. Please try again.";
    let missingFieldKeys = [];
    let finalizationBlockers = null;
    try {
      const payload = await response.json();
      if (payload?.error && typeof payload.error === "string") {
        errorMessage = payload.error;
      }
      if (Array.isArray(payload?.missingFieldKeys)) {
        missingFieldKeys = normalizeMissingFieldKeys(payload.missingFieldKeys);
      }
      if (response.status === 409 && Array.isArray(payload?.finalization?.hardBlockers) && payload.finalization.hardBlockers.length > 0) {
        finalizationBlockers = payload.finalization.hardBlockers;
      }
    } catch {}
    const error = new Error(errorMessage);
    error.missingFieldKeys = missingFieldKeys;
    if (finalizationBlockers) error.finalizationBlockers = finalizationBlockers;
    throw error;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || `inex-ledger-export-${startDate}_to_${endDate}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function submitBackendCsvExport({ startDate, endDate, exportLang, currency, filename, exportType }) {
  const grant = await requestCsvGrant({ startDate, endDate, exportLang, currency, exportType });
  const response = await apiFetch("/api/exports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grantToken: grant?.grantToken })
  });

  if (!response || !response.ok) {
    let errorMessage = tx("exports_error_generic") || "CSV export failed. Please try again.";
    try {
      const payload = await response.json();
      if (payload?.error && typeof payload.error === "string") {
        errorMessage = payload.error;
      }
    } catch {}
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || `inex-ledger-export-${startDate}_to_${endDate}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// LEGACY FALLBACK ONLY. Backend CSV export is authoritative.
function buildBasicCsv(transactions, includeBusiness = false) {
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Date",
    "Description",
    "Type",
    "Status",
    "Amount"
  ]];

  transactions
    .slice()
    .sort((left, right) => (left.date || "").localeCompare(right.date || ""))
    .forEach((transaction) => {
      rows.push([
        ...(includeBusiness ? [transaction.businessName || getBusinessById(transaction.businessId)?.name || tx("common_business")] : []),
        formatCsvDateCell(transaction.date),
        transaction.description || "",
        resolveTransactionType(transaction),
        transaction.cleared ? tx("transactions_status_cleared") : tx("transactions_status_pending"),
        String(Math.abs(Number(transaction.amount) || 0))
      ]);
    });

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

// LEGACY FALLBACK ONLY. Backend CSV export is authoritative.
function buildFullCsv(transactions, currency, includeBusiness = false) {
  const accounts = mapById(getAccounts());
  const categories = mapById(getCategories());
  const rows = [[
    ...(includeBusiness ? ["Business"] : []),
    "Date",
    "Description",
    "Type",
    "Status",
    "Amount",
    "Account",
    "Category",
    "Running Balance",
    "Receipt Attached",
    "Currency",
    "Source Amount",
    "Exchange Rate",
    "Exchange Date",
    "Converted Amount",
    "Tax Treatment",
    "Indirect Tax Amount",
    "Indirect Tax Recoverable",
    "Personal Use %",
    "Payer Name",
    "Tax Form Type",
    "Review Status",
    "Review Notes"
  ]];
  const runningBalances = new Map();

  transactions
    .slice()
    .sort((left, right) => {
      const accountCompare = `${left.accountId || ""}`.localeCompare(`${right.accountId || ""}`);
      if (accountCompare !== 0) return accountCompare;
      const dateCompare = (left.date || "").localeCompare(right.date || "");
      if (dateCompare !== 0) return dateCompare;
      return `${left.id || ""}`.localeCompare(`${right.id || ""}`);
    })
    .forEach((transaction) => {
      const type = resolveTransactionType(transaction, categories[transaction.categoryId]);
      const accountId = transaction.accountId || "";
      const numericAmount = Math.abs(Number(transaction.amount) || 0);
      const signedAmount = type === "income" ? numericAmount : -numericAmount;
      const runningBalanceKey = includeBusiness ? `${transaction.businessId || ""}:${accountId}` : accountId;
      const nextBalance = (runningBalances.get(runningBalanceKey) || 0) + signedAmount;
      runningBalances.set(runningBalanceKey, nextBalance);

      rows.push([
        ...(includeBusiness ? [transaction.businessName || getBusinessById(transaction.businessId)?.name || tx("common_business")] : []),
        formatCsvDateCell(transaction.date),
        transaction.description || "",
        type,
        transaction.cleared ? tx("transactions_status_cleared") : tx("transactions_status_pending"),
        String(numericAmount),
        accounts[transaction.accountId]?.name || "",
        categories[transaction.categoryId]?.name || "",
        nextBalance.toFixed(2),
        transaction.receiptId || transaction.receipt_id ? tx("status_yes") : tx("status_no"),
        transaction.currency || currency,
        formatOptionalCsvNumber(transaction.sourceAmount ?? transaction.source_amount),
        formatOptionalCsvNumber(transaction.exchangeRate ?? transaction.exchange_rate, true),
        formatCsvDateCell(transaction.exchangeDate || transaction.exchange_date || ""),
        formatOptionalCsvNumber(transaction.convertedAmount ?? transaction.converted_amount),
        (() => {
          const treatment = String(transaction.taxTreatment || transaction.tax_treatment || "").toLowerCase();
          return treatment && treatment !== "operating" ? treatment : "";
        })(),
        formatOptionalCsvNumber(transaction.indirectTaxAmount ?? transaction.indirect_tax_amount),
        transaction.indirectTaxRecoverable === true || transaction.indirect_tax_recoverable === true ? "Yes" : "",
        (() => {
          const pct = Number(transaction.personalUsePct ?? transaction.personal_use_pct);
          return Number.isFinite(pct) && pct > 0 ? pct.toFixed(1) : "";
        })(),
        transaction.payerName || transaction.payer_name || "",
        transaction.taxFormType || transaction.tax_form_type || "",
        (() => {
          const status = String(transaction.reviewStatus || transaction.review_status || "").toLowerCase();
          return status && status !== "ready" ? status : "";
        })(),
        transaction.reviewNotes || transaction.review_notes || ""
      ]);
    });

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value) {
  const stringValue = `${value ?? ""}`;
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function formatCsvDateCell(value) {
  const normalized = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  // Prefix with an invisible LTR mark so spreadsheet apps preserve the
  // short ISO date as text instead of auto-formatting it into truncated cells.
  return `\u200E${normalized}`;
}

function formatOptionalCsvNumber(value, preservePrecision = false) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "";
  }
  return preservePrecision ? String(num) : num.toFixed(2);
}

function downloadFile(content, filename, type) {
  const isCsv = typeof type === "string" && type.toLowerCase().startsWith("text/csv");
  let blobData = content instanceof Uint8Array ? content.buffer : content;
  if (isCsv && typeof blobData === "string") {
    blobData = `\uFEFF${blobData}`;
  }
  const blob = new Blob([blobData], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function recordExportHistory(entry) {
  try {
    const response = await apiFetch("/api/exports/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        format: entry.format,
        startDate: entry.startDate,
        endDate: entry.endDate,
        language: entry.exportLang || DEFAULT_EXPORT_LANG,
        scope: entry.scope || getExportScope(),
        filename: entry.filename || "",
        businessId: entry.businessId || "",
        batchMode: !!entry.batchMode
      })
    });
    return !!(response && response.ok);
  } catch (error) {
    console.warn("[Exports] Unable to record export history", error);
    return false;
  }
}

async function fetchBackendExportHistory() {
  try {
    const response = await apiFetch("/api/exports/history");
    if (!response || !response.ok) {
      return [];
    }
    const rows = await response.json().catch(() => []);
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => ({
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      exportedAt: row.created_at,
      filename: row.filename || buildHistoryFilename(row),
      format: row.export_type || PDF_FORMAT,
      exportLang: row.language || "en",
      scope: row.scope || "active",
      contentHash: row.content_hash || "",
      exportMode: row.export_mode || "workpaper",
      snapshotStatus: row.snapshot_status || "",
      invalidatedAt: row.invalidated_at || "",
      invalidationReason: row.invalidation_reason || "",
      source: "backend"
    }));
  } catch {
    return [];
  }
}

async function renderExportHistory() {
  const historyRows = document.getElementById("exportHistoryRows");
  if (!historyRows) {
    return;
  }

  const merged = (await fetchBackendExportHistory())
    .sort((left, right) => new Date(right.exportedAt) - new Date(left.exportedAt))
    .slice(0, 10);

  if (merged.length === 0) {
    historyRows.innerHTML = `<div class="history-empty">${escapeHtml(tx("exports_no_history"))}</div>`;
    return;
  }

  historyRows.innerHTML = merged.map((entry) => {
    const descriptor = describeHistoryEntry(entry);
    const formatClass = descriptor.formatLabel === "PDF" ? "pdf" : "csv";
    const modeLabel = tx(`exports_history_mode_${entry.exportMode || "workpaper"}`);
    const statusLabel = entry.snapshotStatus === "invalidated"
      ? tx("exports_history_status_stale")
      : tx("exports_history_status_current");
    const hasStoredRedactedPdf = entry.format === PDF_FORMAT && !!entry.contentHash;
    const isStale = entry.snapshotStatus === "invalidated";
    const actionLabel = hasStoredRedactedPdf
      ? escapeHtml(tx("exports_history_download_redacted") || "Download")
      : escapeHtml(tx("exports_history_download_label") || "Download");
    
    const dataAttr = `data-history-id="${escapeHtml(entry.id || "")}" data-history-format="${escapeHtml(entry.format || PDF_FORMAT)}" data-history-mode="${hasStoredRedactedPdf ? "redacted" : "replay"}"`;
    return `
      <div class="history-entry" data-history-entry-id="${escapeHtml(entry.id || "")}">
        <div class="history-item">
          <div class="history-file">
            <span class="history-badge ${formatClass}">${descriptor.formatLabel}</span>
            <span class="history-badge mode">${escapeHtml(modeLabel || (entry.exportMode || "workpaper"))}</span>
            <span class="history-badge ${isStale ? "stale" : "current"}">${escapeHtml(statusLabel || "Current")}</span>
            <span class="history-file-name">${escapeHtml(entry.filename || descriptor.formatLabel)}</span>
          </div>
          <div class="history-period">${escapeHtml(`${entry.startDate || "-"} to ${entry.endDate || "-"}`)}</div>
          <div class="history-meta">${escapeHtml(formatHistoryDate(entry.exportedAt))}${entry.invalidatedAt ? `<div class="history-submeta">${escapeHtml(entry.invalidationReason || tx("exports_history_stale_reason") || "Source data changed after export.")}</div>` : ""}</div>
          <div class="history-size">${escapeHtml(formatHistorySize(entry.format))}</div>
          <div class="history-download-cell">
            <div class="history-actions">
              ${isStale ? `<button type="button" class="history-diagnostics-toggle" data-history-diagnostics-id="${escapeHtml(entry.id || "")}">${escapeHtml(tx("exports_history_stale_details") || "Why stale?")}</button>` : ""}
              <button type="button" class="history-download" ${dataAttr}>
                <svg viewBox="0 0 16 16" fill="none"><path d="M8 3v7M5 7l3 3 3-3"></path><line x1="3" y1="13" x2="13" y2="13"></line></svg>
                <span>${actionLabel}</span>
              </button>
              <button type="button" class="history-delete" data-delete-backend-id="${escapeHtml(entry.id || "")}" aria-label="Delete export">
                <svg viewBox="0 0 16 16" fill="none"><polyline points="2 4 14 4"></polyline><path d="M5 4V2h6v2M6 7v5M10 7v5"></path><path d="M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"></path></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="history-diagnostics-panel hidden" data-history-diagnostics-panel="${escapeHtml(entry.id || "")}"></div>
      </div>
    `;
  }).join("");
}

async function fetchHistoryDiagnostics(exportId) {
  const cached = exportHistoryDiagnosticsCache.get(exportId);
  if (cached) {
    return cached;
  }
  const response = await apiFetch(`/api/exports/history/${encodeURIComponent(exportId)}/diagnostics`);
  if (!response || !response.ok) {
    throw new Error("diagnostics_failed");
  }
  const payload = await response.json().catch(() => null);
  exportHistoryDiagnosticsCache.set(exportId, payload || null);
  return payload || null;
}

function buildHistoryDiagnosticsMarkup(diagnostics) {
  const invalidation = diagnostics?.invalidation || {};
  const itemCounts = diagnostics?.snapshot?.itemCounts || {};
  const generatedBy = String(diagnostics?.snapshot?.generatedBy || "").trim();
  const certifiedBy = String(diagnostics?.snapshot?.certifiedBy || "").trim();
  return `
    <div class="history-diagnostics-card">
      <div class="history-diagnostics-grid">
        <div>
          <span class="history-diagnostics-label">${escapeHtml(tx("exports_history_diag_area"))}</span>
          <strong>${escapeHtml(invalidation.label || tx("exports_history_diag_unknown"))}</strong>
        </div>
        <div>
          <span class="history-diagnostics-label">${escapeHtml(tx("exports_history_diag_invalidated"))}</span>
          <strong>${escapeHtml(formatHistoryDate(diagnostics?.invalidatedAt || diagnostics?.generatedAt || ""))}</strong>
        </div>
        <div>
          <span class="history-diagnostics-label">${escapeHtml(tx("exports_history_diag_transactions"))}</span>
          <strong>${escapeHtml(String(Number(itemCounts.transactions) || 0))}</strong>
        </div>
        <div>
          <span class="history-diagnostics-label">${escapeHtml(tx("exports_history_diag_artifacts"))}</span>
          <strong>${escapeHtml(String(Number(itemCounts.artifacts) || 0))}</strong>
        </div>
        <div>
          <span class="history-diagnostics-label">${escapeHtml(tx("exports_history_diag_generated_by"))}</span>
          <strong>${escapeHtml(generatedBy || tx("exports_history_diag_unknown"))}</strong>
        </div>
        <div>
          <span class="history-diagnostics-label">${escapeHtml(tx("exports_history_diag_finalized_by"))}</span>
          <strong>${escapeHtml(certifiedBy || tx("exports_history_diag_unknown"))}</strong>
        </div>
      </div>
      <p class="history-diagnostics-reason">${escapeHtml(invalidation.reason || tx("exports_history_stale_reason"))}</p>
      <p class="history-diagnostics-next">${escapeHtml(invalidation.nextStep || tx("exports_history_diag_next_default"))}</p>
    </div>
  `;
}

async function toggleHistoryDiagnostics(exportId) {
  const panel = document.querySelector(`[data-history-diagnostics-panel="${CSS.escape(exportId)}"]`);
  const button = document.querySelector(`[data-history-diagnostics-id="${CSS.escape(exportId)}"]`);
  if (!panel || !button) {
    return;
  }

  if (openHistoryDiagnosticsId && openHistoryDiagnosticsId !== exportId) {
    const openPanel = document.querySelector(`[data-history-diagnostics-panel="${CSS.escape(openHistoryDiagnosticsId)}"]`);
    const openButton = document.querySelector(`[data-history-diagnostics-id="${CSS.escape(openHistoryDiagnosticsId)}"]`);
    openPanel?.classList.add("hidden");
    if (openButton) {
      openButton.textContent = tx("exports_history_stale_details") || "Why stale?";
    }
  }

  if (!panel.classList.contains("hidden") && openHistoryDiagnosticsId === exportId) {
    panel.classList.add("hidden");
    button.textContent = tx("exports_history_stale_details") || "Why stale?";
    openHistoryDiagnosticsId = "";
    return;
  }

  button.disabled = true;
  panel.classList.remove("hidden");
  panel.innerHTML = `<div class="history-empty">${escapeHtml(tx("exports_history_diag_loading") || "Loading stale details...")}</div>`;
  try {
    const diagnostics = await fetchHistoryDiagnostics(exportId);
    panel.innerHTML = buildHistoryDiagnosticsMarkup(diagnostics);
    button.textContent = tx("exports_history_stale_hide") || "Hide details";
    openHistoryDiagnosticsId = exportId;
  } catch (error) {
    console.error("[Exports] Unable to load history diagnostics", error);
    panel.innerHTML = `<div class="history-empty">${escapeHtml(tx("exports_history_diag_error") || "Unable to load stale details.")}</div>`;
    button.textContent = tx("exports_history_stale_details") || "Why stale?";
    openHistoryDiagnosticsId = "";
  } finally {
    button.disabled = false;
  }
}

async function downloadBackendExport(exportId) {
  if (!exportId) {
    return;
  }
  try {
    const response = await apiFetch(`/api/exports/history/${encodeURIComponent(exportId)}/redacted`);
    if (!response || !response.ok) {
      showExportToast(tx("exports_history_download_error") || "Download failed");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `export-redacted-${exportId}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Backend export download failed:", err);
    showExportToast(tx("exports_history_download_error") || "Download failed");
  }
}

async function deleteBackendExport(exportId, rowEl) {
  if (!exportId) return;
  try {
    const response = await apiFetch(`/api/exports/history/${encodeURIComponent(exportId)}`, { method: "DELETE" });
    if (!response || !response.ok) {
      showExportToast(tx("exports_history_delete_error") || "Delete failed");
      return;
    }
    rowEl?.remove();
    const historyRows = document.getElementById("exportHistoryRows");
    if (historyRows && !historyRows.querySelector(".history-item")) {
      historyRows.innerHTML = `<div class="history-empty">${escapeHtml(tx("exports_no_history"))}</div>`;
    }
    showExportToast(tx("exports_history_deleted") || "Export deleted");
  } catch (err) {
    console.error("Backend export delete failed:", err);
    showExportToast(tx("exports_history_delete_error") || "Delete failed");
  }
}

async function replayHistoryEntry(entryId) {
  if (!entryId) {
    return;
  }
  const entry = (await fetchBackendExportHistory()).find((record) => record.id === entryId);
  if (!entry) {
    return;
  }

  setExportScope(document.getElementById("exportScope"), entry.scope);
  await hydrateExportData();
  await refreshReceiptsDot();
  syncExportScopeUi();
  populateExportFilters();
  updateExportSummary();

  if (entry.format === PDF_FORMAT) {
    await exportPdf(entry.startDate, entry.endDate, false, entry.filename, entry.exportLang);
    return;
  }

  const tier = entry.tier || (entry.format === CSV_FULL_FORMAT ? "v1" : "free");
  await exportCsv(entry.startDate, entry.endDate, false, entry.filename, tier, entry.exportLang, entry.format);
}

function describeHistoryEntry(entry) {
  const format = entry.format || (entry.tier === "v1" ? CSV_FULL_FORMAT : CSV_BASIC_FORMAT);
  if (format === PDF_FORMAT) {
    return { formatLabel: "PDF" };
  }
  return { formatLabel: "CSV" };
}

function getCurrentExportLanguage() {
  const select = document.getElementById("exportLanguage");
  if (select?.value) {
    return clampExportLang(select.value);
  }
  const langKey = getExportPreferenceKey(EXPORT_LANG_KEY);
  return clampExportLang(
    (langKey ? localStorage.getItem(langKey) : null)
      || localStorage.getItem("lb_language")
      || DEFAULT_EXPORT_LANG
  );
}

function clampExportLang(value) {
  const normalized = (value || DEFAULT_EXPORT_LANG).toLowerCase();
  return VALID_EXPORT_LANGS.includes(normalized) ? normalized : DEFAULT_EXPORT_LANG;
}

function buildHistoryFilename(entry) {
  const format = entry?.export_type || entry?.format || PDF_FORMAT;
  if (format === PDF_FORMAT) {
    return `export_${entry.start_date}_to_${entry.end_date}.pdf`;
  }
  if (format === CSV_FULL_FORMAT) {
    return `inex-ledger-cpa-workpaper-${entry.start_date}_to_${entry.end_date}.csv`;
  }
  if (format === CSV_BASIC_FORMAT) {
    return `inex-ledger-basic-ledger-${entry.start_date}_to_${entry.end_date}.csv`;
  }
  return makeCsvFilenameForFormat(format, entry.start_date, entry.end_date);
}

function filterTransactions(startDate, endDate) {
  const accountFilter = document.getElementById("exportAccountFilter")?.value || "";
  const categoryFilter = document.getElementById("exportCategoryFilter")?.value || "";

  return getTransactions().filter((transaction) => {
    if (!transaction.date || transaction.date < startDate || transaction.date > endDate) {
      return false;
    }
    if (accountFilter && transaction.accountId !== accountFilter) {
      return false;
    }
    if (categoryFilter && transaction.categoryId !== categoryFilter) {
      return false;
    }
    return true;
  });
}

function populateExportFilters() {
  const accountSelect = document.getElementById("exportAccountFilter");
  const categorySelect = document.getElementById("exportCategoryFilter");

  if (accountSelect) {
    const accounts = getAccounts();
    accountSelect.innerHTML = `<option value="">${escapeHtml(tx("exports_all_accounts"))}</option>`;
    accounts.forEach((account) => {
      const option = document.createElement("option");
      option.value = account.id || "";
      option.textContent =
        getExportScope() === "all"
          ? `${account.businessName || getBusinessById(account.businessId)?.name || tx("common_business")} · ${account.name || tx("accounts_fallback_name")}`
          : account.name || tx("accounts_fallback_name");
      accountSelect.appendChild(option);
    });
    accountSelect.disabled = accounts.length === 0;
  }

  if (categorySelect) {
    const categories = getCategories();
    categorySelect.innerHTML = `<option value="">${escapeHtml(tx("exports_all_categories"))}</option>`;
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id || "";
      option.textContent =
        getExportScope() === "all"
          ? `${category.businessName || getBusinessById(category.businessId)?.name || tx("common_business")} · ${category.name || tx("categories_fallback_name")}`
          : category.name || tx("categories_fallback_name");
      categorySelect.appendChild(option);
    });
    categorySelect.disabled = categories.length === 0;
  }
}

async function refreshReceiptsDot() {
  try {
    const response = await apiFetch(`/api/receipts${buildScopeQuery()}`);
    if (response && response.ok) {
      const payload = await response.json().catch(() => []);
      const receipts = Array.isArray(payload) ? payload : Array.isArray(payload?.receipts) ? payload.receipts : [];
      unattachedReceiptsCount = receipts.filter((receipt) => !receipt?.transaction_id && !receipt?.transactionId).length;
    }
  } catch (error) {
    console.warn("[Exports] Unable to refresh receipts dot", error);
  }
  updateReceiptsDot();
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) {
    return;
  }
  dot.hidden = unattachedReceiptsCount === 0;
}

function showExportToast(message) {
  const toast = document.getElementById("exportToast");
  const messageNode = document.getElementById("exportToastMessage");
  if (!toast || !messageNode) {
    return;
  }

  messageNode.textContent = message;
  toast.classList.remove("hidden");
  if (exportToastTimer) {
    clearTimeout(exportToastTimer);
  }
  exportToastTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, EXPORT_TOAST_MS);
}

function resolveTransactionType(transaction, category) {
  if (transaction.type) {
    return transaction.type;
  }
  return category?.type === "income" ? "income" : "expense";
}

function makeExportFilename(startDate, endDate, batch) {
  return `inex-ledger-cpa-workpaper-${startDate}_to_${endDate}.csv`;
}

function makeBasicFilename(startDate, endDate, batch) {
  return `inex-ledger-basic-ledger-${startDate}_to_${endDate}.csv`;
}

function makeCsvFilenameForFormat(format, startDate, endDate) {
  if (format === "csv_excluded") {
    return `inex-ledger-excluded-items-${startDate}_to_${endDate}.csv`;
  }
  if (format === "csv_category_summary") {
    return `inex-ledger-category-summary-${startDate}_to_${endDate}.csv`;
  }
  return `inex-ledger-export-${startDate}_to_${endDate}.csv`;
}

function slugExportFilenamePart(value, fallback = "Business") {
  return String(value || fallback)
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || fallback;
}

function makePdfFilename(startDate, endDate, batch) {
  const businessName = slugExportFilenamePart(
    batch?.businessName ||
    batch?.businessProfile?.name ||
    exportState.businessProfile?.name ||
    "Business"
  );

  const taxForm = getTaxFormContext(String(batch?.region || getRegion()).toLowerCase()).slug === "t2125"
    ? "T2125"
    : "Schedule-C";

  const year =
    startDate &&
    endDate &&
    startDate.slice(0, 4) === endDate.slice(0, 4)
      ? startDate.slice(0, 4)
      : `${startDate}_to_${endDate}`;

  const mode = getSelectedExportMode() === "finalized" ? "Final" : "Draft";

  return `${businessName}_${taxForm}_${year}_${mode}.pdf`;
}

function formatHistoryDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatHistorySize(format) {
  return format === PDF_FORMAT ? "PDF" : "CSV";
}

function formatMoney(amount, regionOverride = getRegion()) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: getCurrencyForRegion(regionOverride),
    minimumFractionDigits: 2
  }).format(amount || 0);
}

function getRegion() {
  const stored = window.LUNA_REGION || localStorage.getItem("lb_region");
  return stored?.toLowerCase() === "ca" ? "ca" : "us";
}

function getProvince() {
  return String(
    (typeof window !== "undefined" && window.LUNA_PROVINCE) ||
    localStorage.getItem("lb_province") ||
    ""
  ).toUpperCase();
}

function getTaxFormContext(region = getRegion()) {
  if (region === "ca") {
    return {
      label: "Canada T2125",
      exportLabel: "Canada T2125 export package",
      slug: "t2125"
    };
  }

  return {
    label: "U.S. Schedule C",
    exportLabel: "U.S. Schedule C export package",
    slug: "schedule-c"
  };
}

function getTaxFormContextForScope() {
  const businesses = getBusinessesInScope();
  if (getExportScope() !== "all") {
    return getTaxFormContext(String(businesses[0]?.region || getRegion()).toLowerCase());
  }

  const regions = new Set(
    businesses.map((business) => (String(business.region || "").toUpperCase() === "CA" ? "CA" : "US"))
  );
  if (regions.size === 1) {
    return getTaxFormContext([...regions][0] === "CA" ? "ca" : "us");
  }

  return {
    label: "Multi-business",
    exportLabel: "Multi-business export package",
    slug: "multi-business"
  };
}

function slugifyBusinessName(value) {
  return String(value || "business")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "business";
}

function buildExportFileSlug(batch) {
  const taxContext = getTaxFormContextForScope();
  if (!batch?.businessId || getExportScope() !== "all") {
    return taxContext.slug;
  }
  return `${taxContext.slug}-${slugifyBusinessName(batch.businessName || batch.businessId)}`;
}

function buildExportBatches(transactions, scope) {
  if (scope !== "all") {
    const activeBusiness = getBusinessById(getActiveBusinessId());
    return [{
      businessId: activeBusiness?.id || "",
      businessName: activeBusiness?.name || readBusinessProfile().name || "Business",
      region: String(activeBusiness?.region || getRegion()).toLowerCase(),
      province: String(activeBusiness?.province || getProvince()).toUpperCase(),
      businessProfile: readBusinessProfile(),
      transactions
    }];
  }

  return getBusinessesInScope().map((business) => ({
    businessId: business.id,
    businessName: business.name || "Business",
    region: String(business.region || "US").toLowerCase(),
    province: String(business.province || "").toUpperCase(),
    transactions: transactions.filter((transaction) => transaction.businessId === business.id),
    businessProfile: {
      name: business.name || "Business",
      taxId: "",
      ein: "",
      type: "",
      address: "",
      fiscalYearStart: "",
      naics: "",
      accountingMethod: "",
      materialParticipation: null,
      gstHstRegistered: false,
      gstHstNumber: "",
      gstHstMethod: "",
      operatingName: ""
    }
  })).filter((batch) => batch.transactions.length > 0);
}

async function buildExportPdfBatches(transactions, scope) {
  const batches = buildExportBatches(transactions, scope);
  if (scope !== "all") {
    return batches;
  }

  const hydratedProfiles = await Promise.all(
    batches.map(async (batch) => ({
      ...batch,
      businessProfile: await fetchBusinessProfileById(batch.businessId, batch.businessName)
    }))
  );

  return hydratedProfiles;
}

async function fetchBusinessProfileById(businessId, fallbackName = "Business") {
  if (!businessId) {
    return {
      name: fallbackName,
      taxId: "",
      ein: "",
      type: "",
      address: "",
      fiscalYearStart: "",
      naics: "",
      accountingMethod: "",
      materialParticipation: null,
      gstHstRegistered: false,
      gstHstNumber: "",
      gstHstMethod: "",
      operatingName: ""
    };
  }

  try {
    const response = await apiFetch(`/api/businesses/${encodeURIComponent(businessId)}/profile`);
    if (!response || !response.ok) {
      throw new Error("Profile request failed");
    }
    const business = await response.json().catch(() => null);
    if (!business) {
      throw new Error("Profile payload missing");
    }

    return {
      name: business.name || fallbackName,
      type: business.business_type || "",
      ein: business.tax_id || "",
      taxId: business.tax_id || "",
      fiscalYearStart: business.fiscal_year_start || "",
      address: business.address || "",
      naics: business.business_activity_code || "",
      accountingMethod: business.accounting_method || "",
      materialParticipation: typeof business.material_participation === "boolean" ? business.material_participation : null,
      gstHstRegistered: business.gst_hst_registered === true,
      gstHstNumber: business.gst_hst_number || "",
      gstHstMethod: business.gst_hst_method || "",
      operatingName: business.operating_name || ""
    };
  } catch (error) {
    console.warn("[Exports] Unable to hydrate business profile", businessId, error);
    return {
      name: fallbackName,
      taxId: "",
      ein: "",
      type: "",
      address: "",
      fiscalYearStart: "",
      naics: "",
      accountingMethod: "",
      materialParticipation: null,
      gstHstRegistered: false,
      gstHstNumber: "",
      gstHstMethod: "",
      operatingName: ""
    };
  }
}

function getCurrencyForRegion(region) {
  return region === "ca" ? "CAD" : "USD";
}

function mapById(items) {
  return items.reduce((accumulator, item) => {
    if (item?.id) {
      accumulator[item.id] = item;
    }
    return accumulator;
  }, {});
}

function readBusinessProfile() {
  return exportState.businessProfile || {};
}

function getTransactions() {
  return Array.isArray(exportState.transactions) ? exportState.transactions : [];
}

function getAccounts() {
  return Array.isArray(exportState.accounts) ? exportState.accounts : [];
}

function getCategories() {
  return Array.isArray(exportState.categories) ? exportState.categories : [];
}

function getReceipts() {
  return Array.isArray(exportState.receipts) ? exportState.receipts : [];
}

function getMileage() {
  return Array.isArray(exportState.mileage) ? exportState.mileage : [];
}

function isValidTaxId(value) {
  if (!value) return false;
  const v = value.trim();
  // US SSN: 9 digits or XXX-XX-XXXX
  const SSN_RE = /^(\d{3}-\d{2}-\d{4}|\d{9})$/;
  // US EIN: 9 digits or XX-XXXXXXX
  const EIN_RE = /^(\d{2}-\d{7}|\d{9})$/;
  // Canada SIN: 9 digits or XXX-XXX-XXX
  const SIN_RE = /^(\d{3}-\d{3}-\d{3}|\d{9})$/;
  // Canada BN: 9-digit program account or full 15-char account like 123456789RT0001
  const BN_RE = /^(\d{9}|(?:\d{9}[A-Za-z]{2}\d{4})|(?:\d{9}\s?[A-Za-z]{2}\s?\d{4})|(?:\d{9}-[A-Za-z]{2}-\d{4}))$/;
  return SSN_RE.test(v) || EIN_RE.test(v) || SIN_RE.test(v) || BN_RE.test(v);
}

async function submitSecureExport(taxId, startDate, endDate) {
  // Encrypt the tax ID client-side before sending
  let taxId_jwe;
  try {
    if (!window.exportCrypto?.encryptTaxId) {
      throw new Error(tx("secure_export_modal_error_generic"));
    }
    taxId_jwe = await window.exportCrypto.encryptTaxId(taxId);
  } catch (encErr) {
    throw new Error(tx("secure_export_modal_error_generic"));
  }

  const scope = getExportScope();
  const exportLang = clampExportLang(getCurrentExportLanguage());
  const region = getRegion();
  const currency = getCurrencyForRegion(region);
  const exportMode = getSelectedExportMode();
  if (exportMode === "finalized" && !confirmFinalizedExportIfNeeded()) {
    return;
  }

  const response = await apiFetch("/api/exports/secure-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRange: { startDate, endDate },
      includeTaxId: true,
      certifiedByUser: true,
      exportMode,
      taxId_jwe,
      language: exportLang,
      currency,
      templateVersion: "v1"
    })
  });

  if (!response || !response.ok) {
    let errorMessage = tx("secure_export_modal_error_generic");
    let missingFieldKeys = [];
    try {
      const payload = await response.json();
      if (payload?.error && typeof payload.error === "string") {
        errorMessage = payload.error;
      }
      if (Array.isArray(payload?.missingFieldKeys)) {
        missingFieldKeys = normalizeMissingFieldKeys(payload.missingFieldKeys);
      }
    } catch {}
    const error = new Error(errorMessage);
    error.missingFieldKeys = missingFieldKeys;
    throw error;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `inex-ledger-secure-export-${startDate}_to_${endDate}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  showExportToast(tx("exports_generated_pdf"));
  await renderExportHistory();
}
