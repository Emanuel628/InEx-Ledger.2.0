# Phase 1 Sidebar Cleanup — Remaining Work

## Status

Phase 1 is partially complete.

The sidecar patch files have been removed, but the real owner file, `In-Ex-Ledger-API/public/js/global.js`, still needs to absorb the intended sidebar logic directly.

## Completed

The following patch/sidecar files were deleted:

- `In-Ex-Ledger-API/public/js/global-patches.js`
- `In-Ex-Ledger-API/public/js/hide-business-quick-add.js`
- `In-Ex-Ledger-API/public/js/hide-analytics-quick-add.js`
- `In-Ex-Ledger-API/public/js/quick-add-entitlements.js`
- `In-Ex-Ledger-API/public/js/sidebar-multiselect.js`

These files should not be recreated. Their useful behavior must live in the proper owner file.

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

Pro/basic/free users should only see Core quick-add actions.

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

### 3. Consider hiding the entire dynamic sidebar for Basic/free users

New product decision under consideration:

> Basic/free users may not need the Quick Add sidebar at all.

Reason: the free/basic product is already broad, and Quick Add may make the free tier feel too complete.

If accepted, implement this in `global.js` directly:

- Free/basic: no dynamic Quick Add sidebar
- Pro: Core Quick Add only
- Business: Core plus Business Quick Add

Do not use a hide-after-render file.

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
- `global.js` is the only owner of dynamic sidebar logic.
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
