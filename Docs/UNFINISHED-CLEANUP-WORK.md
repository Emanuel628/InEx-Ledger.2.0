# Unfinished Cleanup Work

This is the single source of truth for cleanup work that is not finished yet.

Do not create separate phase cleanup docs for the same effort. Add unfinished items here instead.

## Current Status Summary

- Phase 1: Partially complete. Patch files are removed, but `global.js` still needs direct Quick Add gating.
- Phase 2: Partially complete. Patch routes/files are removed, but the Undo button still needs a proper rebuild in the real transaction owner files.
- Phase 3: Complete. Login/MFA refresh bridge cookie code was removed.
- Phase 4: Not started. Billing/subscription patch and override files still need review and consolidation.
- Phase 5: Not started. Dark mode/theme drift still needs review because dark mode is unplugged and visually unfinished.

---

# Phase 1 — Sidebar / Quick Add Cleanup

## Completed

Deleted sidecar patch files:

- `In-Ex-Ledger-API/public/js/global-patches.js`
- `In-Ex-Ledger-API/public/js/hide-business-quick-add.js`
- `In-Ex-Ledger-API/public/js/hide-analytics-quick-add.js`
- `In-Ex-Ledger-API/public/js/quick-add-entitlements.js`
- `In-Ex-Ledger-API/public/js/sidebar-multiselect.js`

Removed stale backend endpoint:

- `GET /api/entitlements/quick-add`

Kept the real entitlement endpoint:

- `GET /api/entitlements/features`

Current useful entitlement flags:

- `quick_add_sidebar_enabled`
- `business_quick_add_enabled`

## Product Decision

Quick Add sidebar gating should be:

```text
Basic/free -> no Quick Add sidebar
Pro        -> Core Quick Add only
Business   -> Core plus Business Quick Add
```

## Remaining Work

`global.js` must become the only owner of Quick Add visibility.

Do not recreate sidecar files. Do not hide items after render. Do not inject scripts.

### Required `global.js` changes

Remove these from `DYNAMIC_SIDEBAR_FEATURES`:

- `analytics` — view-only, not a quick-add action
- `settings` — system navigation, not a quick-add action

Add source-level feature groups:

```js
const DYNAMIC_SIDEBAR_CORE_FEATURE_IDS = new Set([
  "transactions",
  "receipts",
  "mileage",
  "accounts",
  "categories",
  "exports"
]);

const DYNAMIC_SIDEBAR_BUSINESS_FEATURE_IDS = new Set([
  "customers",
  "invoices",
  "bills",
  "vendors",
  "projects",
  "billable-expenses",
  "billable_expenses"
]);
```

Add tier helpers near the dynamic sidebar constants:

```js
function normalizeDynamicSidebarTier(value) {
  return String(value || "").trim().toLowerCase();
}

function getDynamicSidebarSubscription() {
  const profileSubscription = window.__LUNA_ME__?.subscription;
  if (profileSubscription && typeof profileSubscription === "object") {
    return profileSubscription;
  }

  try {
    return JSON.parse(localStorage.getItem("lb_subscription") || "null") || null;
  } catch (_) {
    return null;
  }
}

function getDynamicSidebarTier() {
  const subscription = getDynamicSidebarSubscription();
  const candidates = [
    subscription?.effectiveTier,
    subscription?.tier,
    subscription?.plan,
    subscription?.planCode,
    subscription?.plan_code,
    localStorage.getItem("tier")
  ];

  return candidates.map(normalizeDynamicSidebarTier).find(Boolean) || "free";
}

function hasDynamicSidebarQuickAddAccess() {
  const tier = getDynamicSidebarTier();
  return tier === "v1" || tier === "pro" || tier === "business" || tier === "v2";
}

function hasDynamicSidebarBusinessTier() {
  const tier = getDynamicSidebarTier();
  return tier === "business" || tier === "v2" || tier === "business_tier";
}

function getDynamicSidebarAvailableFeatures() {
  if (!hasDynamicSidebarQuickAddAccess()) {
    return [];
  }

  const allowBusiness = hasDynamicSidebarBusinessTier();
  return DYNAMIC_SIDEBAR_FEATURES.filter((feature) => {
    if (DYNAMIC_SIDEBAR_BUSINESS_FEATURE_IDS.has(feature.id)) {
      return allowBusiness;
    }
    return DYNAMIC_SIDEBAR_CORE_FEATURE_IDS.has(feature.id);
  });
}
```

At the start of `initDynamicSidebar()`:

```js
const availableFeatures = getDynamicSidebarAvailableFeatures();
if (!availableFeatures.length) {
  sidebar.hidden = true;
  sidebar.setAttribute("aria-hidden", "true");
  sidebar.innerHTML = "";
  return;
}
```

Then build `featureMap`, favorites, and the rendered library from `availableFeatures`, not directly from `DYNAMIC_SIDEBAR_FEATURES`.

Move the multi-select behavior into `initDynamicSidebar()`:

- Clicking `Add` opens the Quick Add library.
- Clicking an item adds it without closing the library.
- Drag/drop adding keeps the library open.
- The library closes only when the user clicks `Done`.

Implementation direction:

- Add `let shouldKeepLibraryOpen = false;` inside `initDynamicSidebar()`.
- Render the library hidden state from `shouldKeepLibraryOpen`.
- Set `shouldKeepLibraryOpen = true` when adding an item.
- Set `shouldKeepLibraryOpen = false` only when the user clicks Done.

After changing `global.js`, cache-bust all HTML references to the new global version.

## Phase 1 Definition of Done

- `global.js` is the only owner of dynamic sidebar logic.
- Basic/free users do not see the Quick Add sidebar.
- Pro users see only Core Quick Add options.
- Business users see Core plus Business Quick Add options.
- Analytics does not appear in Quick Add.
- Settings does not appear in Quick Add.
- Multi-select Quick Add behavior works from `global.js`.
- No hidden script injection is used.
- Deleted sidecar files are not recreated.

---

# Phase 2 — Transactions Undo Cleanup

## Completed

Removed the separate undo route mount from:

- `In-Ex-Ledger-API/routes/index.js`

Deleted the separate backend sidecar route file:

- `In-Ex-Ledger-API/routes/transactions-undo.routes.js`

Current active search did not find these old frontend sidecar files on `main`:

- `transaction-undo-button.js`
- `transaction-checkbox-actions.js`
- `transaction-checkbox-actions-v2.js`
- `transactions-no-actions-column.css`

## Remaining Work

The Undo button is not currently active. If still wanted, it must be rebuilt directly inside the real transaction owner files.

Do not recreate sidecar files.

Correct owner files:

- `In-Ex-Ledger-API/public/html/transactions.html`
- `In-Ex-Ledger-API/public/js/transactions.js`
- `In-Ex-Ledger-API/routes/transactions.routes.js`
- `In-Ex-Ledger-API/public/css/pages/transactions.css`

### Backend rebuild direction

Move the undo endpoint into `transactions.routes.js` directly.

Suggested route:

```js
router.post("/undo-delete", async (req, res) => {
  // resolve business
  // restore most recent archived transaction
  // return restored transaction
});
```

Use existing service logic from:

- `In-Ex-Ledger-API/services/transactionAuditService.js`

Existing useful function:

```js
restoreMostRecentArchivedTransaction({ pool, businessId, userId })
```

The main transaction route already imports `archiveTransaction`. If undo is rebuilt, it should import both:

```js
const {
  archiveTransaction,
  restoreMostRecentArchivedTransaction
} = require("../services/transactionAuditService.js");
```

### Frontend rebuild direction

If the button is kept:

- Place it directly in `transactions.html` where the select-all checkbox/header action belongs.
- Put the click handler directly in `transactions.js`.
- On click, send `POST /api/transactions/undo-delete`.
- On success, reload transactions through the real transaction load function.
- Show a clear success/failure message.
- Style it in `transactions.css`.

## Phase 2 Definition of Done

- `transactions-undo.routes.js` does not exist.
- `routes/index.js` does not mount a separate undo router.
- No frontend transaction sidecar scripts exist.
- No utility file injects transaction behavior.
- Undo is either intentionally removed or properly rebuilt in the real owner files.
- If kept, `POST /api/transactions/undo-delete` lives in `transactions.routes.js`.
- If kept, the Undo button is in `transactions.html`.
- If kept, Undo frontend logic is in `transactions.js`.

---

# Phase 3 — Auth Bridge Cleanup

## Completed

Removed stale auth bridge code from:

- `In-Ex-Ledger-API/public/js/login.js`
- `In-Ex-Ledger-API/public/js/mfa-challenge.js`

Removed terms:

- `markPostLoginRefreshBridge()`
- `post_login_refresh_bridge`

Final search found no active leftovers for:

- `post_login_refresh_bridge`
- `markPostLoginRefreshBridge`
- `lb_post_login_access_token_handoff`
- `auth-login-handoff`
- `refresh_bridge`

## Phase 3 Status

Complete.

---

# Phase 4 — Billing / Subscription Patch Consolidation

## Not Started

Suspicious files still need review and consolidation:

- `billing-checkout-overrides.routes.js`
- `billing-reactivation.routes.js`
- `subscription-reactivation.js`
- `subscriptionTrialCheckoutPatch.js`

Some of this behavior may be wanted, but it should not live in patch/override sidecar files if it is permanent product behavior.

## Remaining Work

Review each file and move useful logic into the correct owner files:

- `In-Ex-Ledger-API/routes/billing.routes.js`
- `In-Ex-Ledger-API/services/subscriptionService.js`
- `In-Ex-Ledger-API/public/js/subscription.js`

Delete or rename patch/override files after consolidation.

## Phase 4 Definition of Done

- No billing/subscription file is named like a patch, override, or temporary workaround.
- Checkout logic lives in billing route/service owner files.
- Reactivation logic lives in billing/subscription owner files.
- Frontend subscription behavior lives in `subscription.js`.

---

# Phase 5 — Theme / Dark Mode Drift Cleanup

## Not Started

Dark mode is currently unplugged and visually unfinished. There are still many white cards in dark mode, and the dark palette is not approved.

Suspicious files to review:

- `theme-boot.js`
- `dark-mode.css`
- `dark-mode-final.css`
- `dark-mode-disabled.css`

## Product Decision

Dark mode should stay unplugged for now unless it can be made visually consistent.

## Remaining Work

- Remove or consolidate duplicate dark-mode files.
- Ensure there is no server-side or utility-file theme injection.
- Keep the default theme light.
- If dark mode remains disabled, remove visible toggles or unfinished dark behavior.
- If any dark-mode token work is kept, it belongs in `tokens.css`, `app.css`, and `global.js`, not separate patch CSS files.

## Phase 5 Definition of Done

- One theme system only.
- No `theme-boot.js` sidecar behavior.
- No duplicate `dark-mode-final` / `dark-mode-disabled` drift files.
- No hidden server/script injection for theme behavior.
- Dark mode is either intentionally disabled or fully styled.

---

# Do Not Reintroduce

Do not recreate files like:

- `hide-analytics-quick-add.js`
- `hide-business-quick-add.js`
- `quick-add-entitlements.js`
- `sidebar-multiselect.js`
- `global-patches.js`
- `transaction-undo-button.js`
- `transaction-checkbox-actions.js`
- `transaction-checkbox-actions-v2.js`
- `transactions-undo.routes.js`

If behavior is useful, it belongs in the real owner file.

# Cleanup Rule

No hidden patches. No utility files with side effects. No script injection. No sidecar workaround files. No duplicate phase docs.
