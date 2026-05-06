# Phase 1 Sidebar Cleanup — Remaining Work

## Status

Phase 1 is partially complete.

The sidecar patch files have been removed, and the stale quick-add entitlement endpoint has been removed. The real owner file, `In-Ex-Ledger-API/public/js/global.js`, still needs to absorb the intended sidebar logic directly.

## Completed

The following patch/sidecar files were deleted:

- `In-Ex-Ledger-API/public/js/global-patches.js`
- `In-Ex-Ledger-API/public/js/hide-business-quick-add.js`
- `In-Ex-Ledger-API/public/js/hide-analytics-quick-add.js`
- `In-Ex-Ledger-API/public/js/quick-add-entitlements.js`
- `In-Ex-Ledger-API/public/js/sidebar-multiselect.js`

The stale endpoint below was also removed because it only supported the deleted sidecar file:

- `GET /api/entitlements/quick-add`

The general entitlement endpoint remains and now exposes the proper sidebar flags:

- `GET /api/entitlements/features`
- `quick_add_sidebar_enabled`
- `business_quick_add_enabled`

The deleted sidecar files should not be recreated. Their useful behavior must live in the proper owner file.

## Product Decision

Quick Add sidebar gating should be:

- Basic/free: no Quick Add sidebar
- Pro: Core Quick Add only
- Business: Core plus Business Quick Add

This keeps the free product useful without making it feel like the complete paid product.

## Why This Exists

`global.js` is the actual owner of the dynamic sidebar / Quick Add feature list. The deleted files were workaround files that hid or modified sidebar behavior after render. That is not acceptable architecture.

Phase 1 is not complete until `global.js` directly controls what appears in Quick Add.

## Remaining Work in `global.js`

### 1. Remove non-action items from Quick Add at the source

Analytics should not appear in Quick Add. It is view-only.

Settings should not appear in Quick Add. It is system navigation, not a quick-add action.

Remove these from `DYNAMIC_SIDEBAR_FEATURES`:

- `analytics`
- `settings`

Do not hide them with JavaScript after render.

### 2. Add tier-aware Quick Add filtering

Quick Add should render different feature groups based on subscription tier.

Basic/free users should not see the dynamic Quick Add sidebar.

Pro users should only see Core quick-add actions.

Business-tier users should see Core plus Business actions.

Suggested source-level rules:

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

Business quick-add options should only render when the active subscription tier is Business / V2.

Possible tier sources:

- `window.__LUNA_ME__?.subscription?.effectiveTier`
- stored subscription state in `localStorage.lb_subscription`
- fallback `localStorage.tier`
- `/api/entitlements/features` if a fresh server-side check is needed

### 3. Hide the dynamic sidebar for Basic/free users

Implement this directly in `global.js`:

- If tier is Basic/free, do not initialize the dynamic Quick Add sidebar.
- Prefer removing/hiding the sidebar container before rendering it.
- Do not use a hide-after-render file.

### 4. Move multi-select behavior into `global.js`

The deleted `sidebar-multiselect.js` kept the Add library open while users added multiple shortcuts.

That behavior should be owned by `initDynamicSidebar()` in `global.js`.

Expected behavior:

- Clicking `Add` opens the Quick Add library.
- Clicking an item adds it without closing the library.
- The library only closes when the user clicks `Done`.
- Drag/drop adding should also keep the library open.

Implementation direction:

- Add `let shouldKeepLibraryOpen = false;` inside `initDynamicSidebar()`.
- Render the library hidden state from `shouldKeepLibraryOpen`.
- Set `shouldKeepLibraryOpen = true` when adding an item.
- Set `shouldKeepLibraryOpen = false` only when the user clicks Done.

### 5. Cache-bust `global.js`

After changing `global.js`, bump all HTML references to a new version, for example:

```text
/js/global.js?v=20260506b
```

Use whatever version is current at the time of implementation.

## Verification Checklist

Phase 1 is complete only when all of these are true:

- No sidecar files listed above exist.
- No HTML or JS references those deleted files.
- `GET /api/entitlements/quick-add` is gone.
- `GET /api/entitlements/features` remains.
- `global.js` is the only owner of dynamic sidebar logic.
- Basic/free users do not see the Quick Add sidebar.
- Analytics does not appear in Quick Add.
- Business quick-add options do not appear for non-Business users.
- Pro users see only Core Quick Add options.
- Business-tier users see Core plus Business Quick Add options.
- Multi-select Quick Add behavior works from `global.js` without any separate file.
- No hidden script injection is used.

## Do Not Reintroduce

Do not recreate files like:

- `hide-analytics-quick-add.js`
- `hide-business-quick-add.js`
- `quick-add-entitlements.js`
- `sidebar-multiselect.js`
- `global-patches.js`

If a behavior is useful, it belongs in `global.js` or the true owner file.
