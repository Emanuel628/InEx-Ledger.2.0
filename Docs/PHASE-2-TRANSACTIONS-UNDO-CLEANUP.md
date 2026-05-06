# Phase 2 Transactions Undo Cleanup

## Status

Phase 2 cleanup has started.

The separate transaction undo backend patch has been removed from the active route tree. The undo feature is not currently active and must be rebuilt properly inside the real transaction owner files if it is still wanted.

## Completed

Removed the separate undo route mount from:

- `In-Ex-Ledger-API/routes/index.js`

Deleted the separate backend sidecar route file:

- `In-Ex-Ledger-API/routes/transactions-undo.routes.js`

Current active search did not find these frontend sidecar files on `main`:

- `transaction-undo-button.js`
- `transaction-checkbox-actions.js`
- `transaction-checkbox-actions-v2.js`
- `transactions-no-actions-column.css`

## What Cannot Be Safely Implemented From This Connector

The proper rebuild requires editing large owner files that are truncated in the current GitHub connector view:

- `In-Ex-Ledger-API/public/js/transactions.js`
- `In-Ex-Ledger-API/public/html/transactions.html`
- `In-Ex-Ledger-API/routes/transactions.routes.js`
- `In-Ex-Ledger-API/public/css/pages/transactions.css`

Do not work around that limitation by creating new sidecar files. The remaining work must be done with full-file access through Codex or a local checkout.

## Why This Exists

The undo button was previously implemented as drift:

- frontend behavior was injected through utility/sidecar scripts
- backend undo was mounted through a separate route file instead of the real transaction router

That is not acceptable architecture. Transaction behavior belongs in the transaction owner files.

## Product Decision

The user previously requested an Undo button where the select-all checkbox used to be.

The feature should be rebuilt properly if it is still wanted.

Do not bring back sidecar patch files.

## Correct Owner Files

If the Undo feature is kept, implement it directly in:

- `In-Ex-Ledger-API/public/html/transactions.html`
- `In-Ex-Ledger-API/public/js/transactions.js`
- `In-Ex-Ledger-API/routes/transactions.routes.js`
- `In-Ex-Ledger-API/public/css/pages/transactions.css`

## Backend Rebuild Direction

Move the undo endpoint into `transactions.routes.js` directly.

Suggested route shape:

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

The main transaction route already imports:

```js
archiveTransaction
```

It should import both if undo is rebuilt:

```js
const {
  archiveTransaction,
  restoreMostRecentArchivedTransaction
} = require("../services/transactionAuditService.js");
```

Do not create `transactions-undo.routes.js` again.

## Frontend Rebuild Direction

If the button is kept, place it directly in `transactions.html` where the select-all checkbox/header action belongs.

The frontend logic belongs in `transactions.js`.

Expected behavior:

- Undo button is visible in the transaction table action/header area.
- Clicking Undo sends:

```text
POST /api/transactions/undo-delete
```

- After success, reload transactions from the real transaction load function.
- Show a clear success/failure message.
- Do not use injected scripts.
- Do not use separate transaction undo JS files.

## Checkbox Action Cleanup

Do not recreate:

- `transaction-checkbox-actions.js`
- `transaction-checkbox-actions-v2.js`

If checkbox behavior is still wanted, it must live inside `transactions.js` and be wired to markup in `transactions.html`.

## Verification Checklist

Phase 2 is complete only when all of these are true:

- `transactions-undo.routes.js` does not exist.
- `routes/index.js` does not mount a separate undo router.
- No frontend transaction sidecar scripts exist.
- No utility file injects transaction behavior.
- Undo is either intentionally removed or properly rebuilt in the real owner files.
- If kept, `POST /api/transactions/undo-delete` lives in `transactions.routes.js`.
- If kept, the Undo button is in `transactions.html`.
- If kept, Undo frontend logic is in `transactions.js`.

## Do Not Reintroduce

Do not recreate files like:

- `transaction-undo-button.js`
- `transaction-checkbox-actions.js`
- `transaction-checkbox-actions-v2.js`
- `transactions-undo.routes.js`

If a behavior is useful, it belongs in the real transaction owner files.
