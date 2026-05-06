# Unfinished Cleanup Work

This is the single source of truth for cleanup work that is not finished yet.

Do not create separate phase cleanup docs for the same effort. Add unfinished items here instead.

## Current Status Summary

- Phase 1: Partially complete. Patch files are removed, but `global.js` still needs direct Quick Add gating.
- Phase 2: Partially complete. Patch routes/files are removed, but the Undo button and checkbox row actions still need a proper rebuild in the real transaction owner files.
- Phase 3: Complete. Login/MFA refresh bridge cookie code was removed.
- Phase 4: In review. Billing/subscription sidecar files contain wanted behavior and must be consolidated, not blindly deleted.
- Phase 5: In review. Dark mode must remain hard-disabled, including OS/browser automatic dark mode, until it is redesigned.
- Phase 6: In review. Final audit found remaining sidecar files that should be moved into owner files before deletion.
- Additional audit: New cleanup candidates were found after the first Phase 6 list, including dark-mode duplicate CSS, recovery artifacts, checksum repair scripts, test naming drift, and documentation folder drift.

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

# Phase 2 — Transactions Undo / Checkbox Action Cleanup

## Completed

Removed the separate undo route mount from:

- `In-Ex-Ledger-API/routes/index.js`

Deleted the separate backend sidecar route file:

- `In-Ex-Ledger-API/routes/transactions-undo.routes.js`

## Phase 6 Audit Correction

The final audit found these frontend sidecar files still exist on `main`:

- `In-Ex-Ledger-API/public/js/transaction-undo-button.js`
- `In-Ex-Ledger-API/public/js/transaction-checkbox-actions.js`
- `In-Ex-Ledger-API/public/js/transaction-checkbox-actions-v2.js`

Do not delete them blindly if their behavior is still wanted. They should be treated as implementation notes/source material, then moved into the real transaction owner files before deletion.

Current reference search did not find active HTML/global references to these files, so they appear to be disconnected sidecars. Still, the useful behavior should be reviewed before deletion.

## Remaining Work

Undo and checkbox row actions are not properly active from owner files. If still wanted, rebuild them directly inside the real transaction owner files.

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

If the Undo button is kept:

- Place it directly in `transactions.html` where the select-all checkbox/header action belongs.
- Put the click handler directly in `transactions.js`.
- On click, send `POST /api/transactions/undo-delete`.
- On success, reload transactions through the real transaction load function.
- Show a clear success/failure message.
- Style it in `transactions.css`.

If checkbox row actions are kept:

- Move popup/edit/delete behavior from `transaction-checkbox-actions-v2.js` into `transactions.js`.
- Move popup markup/styling into `transactions.html` and `transactions.css`.
- Do not create or keep `transaction-checkbox-actions.js` or `transaction-checkbox-actions-v2.js`.
- Prefer one implementation only; do not keep both v1 and v2 behaviors.

## Phase 2 Definition of Done

- `transactions-undo.routes.js` does not exist.
- `routes/index.js` does not mount a separate undo router.
- No frontend transaction sidecar scripts exist.
- No utility file injects transaction behavior.
- Undo is either intentionally removed or properly rebuilt in the real owner files.
- Checkbox row actions are either intentionally removed or properly rebuilt in the real owner files.
- If kept, `POST /api/transactions/undo-delete` lives in `transactions.routes.js`.
- If kept, the Undo button is in `transactions.html`.
- If kept, Undo frontend logic is in `transactions.js`.
- If kept, checkbox popup logic is in `transactions.js`, not a `-v2` sidecar.

---

# Phase 3 — Auth Bridge / MFA Trust Cleanup

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

## Phase 6 Audit Correction

The final audit found another auth/MFA bandaid candidate that was not part of the original Phase 3 list:

- `In-Ex-Ledger-API/middleware/accountSwitchMfaTrust.js`

This file may contain useful behavior, but the implementation is suspicious because it overrides `res.json` on `/auth/login` to intercept the login response and convert an MFA-required response into a trusted-browser session.

Do not delete it blindly.

Correct destination if kept:

- `In-Ex-Ledger-API/routes/auth.routes.js`
- a dedicated MFA trust/auth service owned by the auth flow

Consolidation direction:

- Move trusted-browser account-switch behavior into the explicit login/MFA route flow.
- Avoid monkey-patching `res.json` from middleware.
- Keep the global MFA trust cookie behavior only if it is an intentional product/security decision.
- Delete `accountSwitchMfaTrust.js` only after the behavior is represented in the real auth/MFA owner flow, or after the feature is intentionally removed.

## Phase 3 Definition of Done

- Login/MFA frontend bridge cookies are gone.
- No auth handoff frontend file exists.
- Trusted-browser account-switch behavior is either intentionally removed or owned by the real auth/MFA route/service flow.
- No auth middleware monkey-patches `res.json`.

---

# Phase 4 — Billing / Subscription Consolidation

## Status

Phase 4 has started as review only. Do not delete billing or subscription sidecar files until their useful behavior has been moved into the owner files.

## Findings

### `billing-checkout-overrides.routes.js`

Status: active.

Current owner problem: this file is mounted before `billing.routes.js` and intercepts `POST /api/billing/checkout-session`.

Purpose: normalize a downgraded/free-selected trial before checkout so the main checkout route can create the normal Stripe checkout instead of blocking the user as if they already had paid Pro access.

This behavior appears useful and should be kept.

Correct destination:

- `In-Ex-Ledger-API/routes/billing.routes.js`

Consolidation direction:

- Move `isTrialReupgradeAttempt(subscription)` into `billing.routes.js`.
- Move the `cancel_at_period_end = false` trial normalization into the top of the real `router.post("/checkout-session", ...)` route.
- After that, remove the mount from `routes/index.js` and delete `billing-checkout-overrides.routes.js`.

Do not delete this file before consolidation.

### `billing-reactivation.routes.js`

Status: contains wanted product behavior, but current review did not find it mounted in `routes/index.js`.

Purpose: lets a trialing user reactivate Pro during the trial after they selected Basic/free for the post-trial plan.

Endpoint:

```text
POST /api/billing/reactivate-trial-pro
```

Correct destination:

- `In-Ex-Ledger-API/routes/billing.routes.js`

Consolidation direction:

- Move the `reactivate-trial-pro` route into `billing.routes.js`.
- Reuse existing billing helpers already in `billing.routes.js` where possible, including `stripeRequest`, `normalizeAdditionalBusinesses`, and `resolveBillingBusinessScope`.
- Keep rate limiting, auth, and CSRF protection.
- Delete `billing-reactivation.routes.js` only after the route exists in `billing.routes.js` and is mounted through the normal billing router.

Do not delete this file before consolidation.

### `subscription-reactivation.js`

Status: contains wanted frontend behavior, but current `subscription.html` review shows it is not loaded directly. The subscription page loads `subscription.js`.

Purpose: intercept the Pro CTA only when the user is in the downgraded-trial state and call `/api/billing/reactivate-trial-pro` instead of starting brand-new checkout.

Correct destination:

- `In-Ex-Ledger-API/public/js/subscription.js`

Consolidation direction:

- Move `isTrialDowngradedToBasic(subscription)` into `subscription.js`.
- Move the Pro reactivation click behavior into the existing Pro CTA handler in `subscription.js`.
- Ensure it uses the existing subscription page state instead of refetching duplicate state where possible.
- Delete `subscription-reactivation.js` only after the behavior is integrated and the page uses it from `subscription.js`.

Do not delete this file before consolidation.

### `subscriptionTrialCheckoutPatch.js`

Status: patch-style monkey patch.

Purpose: prevents trialing snapshots from masquerading as paid/remaining paid access by forcing trialing snapshots to:

```js
isPaid: false,
isCanceledWithRemainingAccess: false
```

Correct destination:

- `In-Ex-Ledger-API/services/subscriptionService.js`

Consolidation direction:

- Move the normalization into the actual subscription snapshot builder inside `subscriptionService.js`.
- Trialing access should remain effective Pro trial access, but it should not be treated as paid access for checkout blocking.
- Delete `subscriptionTrialCheckoutPatch.js` only after the snapshot logic is native to `subscriptionService.js` and no require/import points to the patch module.

Do not delete this file before consolidation.

## What Cannot Be Safely Implemented From This Connector

The correct destination files are large owner files that are truncated in the current GitHub connector view:

- `In-Ex-Ledger-API/routes/billing.routes.js`
- `In-Ex-Ledger-API/services/subscriptionService.js`
- `In-Ex-Ledger-API/public/js/subscription.js`

Do not work around this by creating new sidecar files.

The remaining Phase 4 work should be done with full-file access through Codex or a local checkout.

## Phase 4 Definition of Done

- No billing/subscription file is named like a patch, override, bridge, or temporary workaround.
- Checkout trial normalization lives in `billing.routes.js`.
- Trial Pro reactivation backend route lives in `billing.routes.js`.
- Trial Pro reactivation frontend behavior lives in `subscription.js`.
- Trial snapshot paid-access normalization lives in `subscriptionService.js`.
- `routes/index.js` does not mount `billing-checkout-overrides.routes.js`.
- `billing-checkout-overrides.routes.js` is deleted after consolidation.
- `billing-reactivation.routes.js` is deleted after consolidation.
- `subscription-reactivation.js` is deleted after consolidation.
- `subscriptionTrialCheckoutPatch.js` is deleted after consolidation.

---

# Phase 5 — Theme / Dark Mode Drift Cleanup

## Status

Phase 5 has started as review only.

Dark mode must remain completely shut off for now. This includes users whose PC, browser, or OS is set to automatic dark mode.

Do not redesign dark mode in this cleanup pass. Do not allow dark mode to activate until the palette and all page/card surfaces are reworked properly.

## Product Decision

Dark mode is disabled until a full redesign is done.

Required behavior now:

```text
User selected light mode      -> app stays light
User selected dark mode       -> app forces light
OS/browser automatic dark     -> app forces light
Old localStorage dark setting -> app resets to light
```

## Findings

- `theme-boot.js` exists and currently forces light mode early by setting `lb_theme` and `data-theme` to `light`.
- `tokens.css` still contains a full `[data-theme="dark"]` block.
- `global.js` still contains `setGlobalTheme(theme)` and can accept `"dark"`.
- Duplicate dark-mode drift CSS was later found under `In-Ex-Ledger-API/public/css/core/` and is tracked in the Additional Cleanup Candidates section.

## Remaining Work

Keep the current light-mode lock until dark mode is redesigned.

Preferred final architecture:

- Move the force-light behavior into `global.js` as the owner of theme behavior.
- Keep `theme-boot.js` only if it is intentionally needed as an early anti-flash light-mode lock.
- If `theme-boot.js` stays, document that it is not a patch; it is the early light-mode enforcement layer.
- Prevent `setGlobalTheme("dark")` from applying dark mode while dark mode is disabled.
- Remove or hide any visible dark-mode toggle while dark mode is disabled.
- Reset stale `lb_theme=dark` values to `light`.
- Do not rely on OS/browser `prefers-color-scheme`.
- Do not delete dark-mode tokens unless the team decides the future redesign will start from scratch.

## Phase 5 Definition of Done

- Dark mode cannot activate from localStorage.
- Dark mode cannot activate from OS/browser automatic dark mode.
- Dark mode cannot activate from a visible UI toggle.
- `global.js` clearly owns theme behavior.
- Any early boot file is either removed after ownership moves to `global.js`, or explicitly documented as a permanent early light-mode lock.
- No duplicate `dark-mode-final` / `dark-mode-disabled` drift files exist.
- No hidden server/script injection controls theme behavior.
- Dark mode is either intentionally disabled or fully redesigned.

---

# Phase 6 — Final Audit

## Status

Phase 6 has started.

Do not delete remaining sidecar files unless both are true:

1. the behavior is unwanted or already integrated into the correct owner file, and
2. the owner-file destination is documented.

## Findings

Remaining sidecar/patch files confirmed on `main`:

- `In-Ex-Ledger-API/public/js/transaction-undo-button.js`
- `In-Ex-Ledger-API/public/js/transaction-checkbox-actions.js`
- `In-Ex-Ledger-API/public/js/transaction-checkbox-actions-v2.js`
- `In-Ex-Ledger-API/routes/billing-checkout-overrides.routes.js`
- `In-Ex-Ledger-API/services/subscriptionTrialCheckoutPatch.js`
- `In-Ex-Ledger-API/public/js/theme-boot.js`
- `In-Ex-Ledger-API/middleware/accountSwitchMfaTrust.js`

Files confirmed gone/not found from current direct checks:

- `In-Ex-Ledger-API/public/js/global-patches.js`
- `In-Ex-Ledger-API/public/js/quick-add-entitlements.js`

## Phase 6 Remaining Work

- Recheck all suspicious filenames using a full local search because the GitHub connector search can miss exact filenames.
- For every remaining sidecar, choose one of these outcomes:
  - move useful behavior into owner file, then delete sidecar
  - mark as intentionally permanent with a clear owner reason
  - delete only if behavior is truly unwanted and unused
- Do not create new sidecars.

## Phase 6 Definition of Done

- No disconnected sidecar files remain.
- No `-v2`, `patch`, `override`, `bridge`, or `temporary` file remains unless explicitly documented as permanent.
- No hidden script injection remains.
- All useful behavior lives in owner files.
- `Docs/UNFINISHED-CLEANUP-WORK.md` remains the single cleanup source of truth.

---

# Additional Cleanup Candidates Found After Phase 6

## Status

Additional broad filename searches found more files that look like cleanup drift, one-off recovery work, duplicate theme code, or documentation sprawl.

Do not delete these blindly. For each file, first confirm whether it is imported, mounted, referenced by HTML, used by `package.json`, or used by GitHub Actions. If behavior is useful, move it into the proper owner file/folder. If it is a one-off artifact, delete it after confirming it is unused.

## Theme / Dark Mode Drift

Additional files found:

- `In-Ex-Ledger-API/public/css/core/dark-mode-final.css`
- `In-Ex-Ledger-API/public/css/core/dark-mode-disabled.css`

Owner files/folders:

- `In-Ex-Ledger-API/public/css/core/tokens.css`
- `In-Ex-Ledger-API/public/js/global.js`
- `In-Ex-Ledger-API/public/js/theme-boot.js`

Action:

- Review HTML/CSS imports for both CSS files.
- Keep only one intentional dark-mode-disabled path while dark mode is off.
- If `theme-boot.js` remains, document it as the early light-mode lock, not a temporary patch.
- Delete duplicate `dark-mode-final.css` / `dark-mode-disabled.css` drift files after behavior is owned.

## Recovery / Checksum Artifacts

Additional files found:

- `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/README.txt`
- `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/fix_001.js`
- `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/fix_checksum.js`
- `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/fix_all_checksums.js`
- `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/fix_checksums_from_git.js`
- `In-Ex-Ledger-API/recovery-artifacts/2026-04-11/show_checksums.js`
- `In-Ex-Ledger-API/scripts/repair-migration-checksums.js`

Owner files/folders:

- `In-Ex-Ledger-API/scripts/`
- migration runner / checksum validation owner code
- `Docs/UNFINISHED-CLEANUP-WORK.md`

Action:

- Decide whether checksum repair is still needed.
- If it is needed, keep one intentional maintenance script under `In-Ex-Ledger-API/scripts/` with clear instructions.
- Delete the dated `recovery-artifacts/2026-04-11/` folder after confirming it is not used by runtime, tests, package scripts, or CI.
- Do not keep multiple checksum fix scripts with overlapping behavior.

## Test Naming / Audit Drift

Additional files found:

- `In-Ex-Ledger-API/tests/i18nFix.js`
- `In-Ex-Ledger-API/tests/i18nAudit.js`
- `In-Ex-Ledger-API/tests/billingSubscriptionRecovery.test.js`

Owner files/folders:

- `In-Ex-Ledger-API/tests/i18nCoverage.test.js`
- `In-Ex-Ledger-API/tests/emailI18n.test.js`
- billing/subscription regression test files under `In-Ex-Ledger-API/tests/`

Action:

- If `i18nFix.js` contains useful regression coverage, rename it to a stable `.test.js` name or merge it into `i18nCoverage.test.js` / `emailI18n.test.js`.
- If `i18nAudit.js` is a one-off audit script, move it to an intentional scripts/audit location or delete it after confirming it is unused.
- Keep `billingSubscriptionRecovery.test.js` only if it is a real regression test. If the name reflects a temporary recovery effort, rename it to match the billing/subscription behavior it protects.

## Documentation Drift

Additional files/folders found:

- `AUDIT-REPORT.md`
- `AUDIT-REPORT-2026-04-13.md`
- `TASK-STATUS.md`
- lowercase `docs/` folder, including examples such as:
  - `docs/table-audit.md`
  - `docs/SECURITY_PLAN.md`
  - `docs/V2_BUILD_PLAN.md`
  - `docs/IMPECCABLE_STYLE_FRONTEND_ROLLOUT_PLAN.md`
  - `docs/MUTATION_AUDIT.md`

Owner folder:

- `Docs/`

Action:

- Move or merge useful root docs and lowercase `docs/` files into `Docs/`.
- Delete stale duplicate audit reports after useful content is preserved.
- Avoid maintaining both `Docs/` and lowercase `docs/`.
- Decide whether `README.md` should stay at root for GitHub visibility while the working documentation lives under `Docs/`.
- Keep `TASK-STATUS.md` only if it remains the current project status source; otherwise merge its useful content into the Docs folder and delete the duplicate status file.

## Guardrail / Utility Script Review

Additional files found:

- `scripts/check-bundle-drift.js`
- `scripts/log_scan.js`
- `In-Ex-Ledger-API/scripts/log_scan.js`

Owner files/folders:

- `scripts/`
- `In-Ex-Ledger-API/scripts/`
- GitHub Actions workflows / package scripts that intentionally run these checks

Action:

- Keep these only if they are wired into CI, package scripts, or documented maintenance workflows.
- If they are useful, document when/how they run.
- If they are unused one-off scan scripts, delete them.
- Avoid duplicate root-level and API-level scripts that perform the same scan unless there is a clear reason.

## Additional Audit Definition of Done

- No duplicate dark-mode CSS drift files remain.
- No dated recovery artifact folder remains in the app tree unless explicitly archived and documented.
- No one-off checksum fix scripts remain unless consolidated into one documented maintenance script.
- No tests are named like temporary fixes or audits unless intentionally documented.
- Documentation lives under `Docs/`, except root `README.md` if kept for GitHub landing visibility.
- No duplicate `docs/` and `Docs/` documentation systems remain.
- No unused scan/drift scripts remain outside documented CI or maintenance workflows.

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
