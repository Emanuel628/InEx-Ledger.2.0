# Owner-File Follow-Up Work

This file tracks follow-up work that should be completed inside real owner files, not patch files or sidecars.

Do not create new workaround files for these items. If behavior is useful, it belongs in the feature owner files listed below.

---

## 1. Wire CSV Import End-to-End

### Status

Open.

The Transactions page currently shows an `Import CSV` button, and the backend transactions route contains a CSV import section, but the frontend owner file does not appear to wire the button to the backend endpoint yet.

Current state:

- `transactions.html` has the visible `Import CSV` button.
- `transactions.routes.js` has a CSV import section for `POST /transactions/import/csv`.
- `transactions.js` needs the frontend wiring.

### Owner files

- `In-Ex-Ledger-API/public/html/transactions.html`
- `In-Ex-Ledger-API/public/js/transactions.js`
- `In-Ex-Ledger-API/routes/transactions.routes.js`

### Required behavior

CSV import should work from the user interface and create real transactions.

User flow:

1. User clicks `Import CSV` on the Transactions page.
2. App opens a CSV file picker.
3. User selects a `.csv` file.
4. Frontend sends the file to the existing CSV import endpoint using `FormData`.
5. Backend parses the CSV.
6. Backend validates account/category/date/type/amount data.
7. Backend inserts valid rows into the `transactions` table for the active business.
8. Frontend refreshes the transaction list.
9. Frontend shows a clear result message with imported/skipped/error counts.

### Frontend implementation direction

Add CSV import wiring directly inside:

```text
In-Ex-Ledger-API/public/js/transactions.js
```

Do not create a new CSV sidecar file.

Add this near the existing DOMContentLoaded wiring:

```js
wireCsvImport();
```

Add a function like:

```js
function wireCsvImport() {
  const importButton = document.getElementById("importCsvBtn");
  if (!importButton) {
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,text/csv";
  input.hidden = true;
  input.id = "transactionCsvInput";
  document.body.appendChild(input);

  importButton.addEventListener("click", async () => {
    const canImport = await switchToActiveScopeIfNeeded();
    if (!canImport) {
      return;
    }

    input.value = "";
    input.click();
  });

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    importButton.disabled = true;
    const originalText = importButton.textContent;
    importButton.textContent = txT("transactions_importing_csv", "Importing...");

    try {
      const response = await apiFetch("/api/transactions/import/csv", {
        method: "POST",
        body: formData
      });

      const result = response ? await response.json().catch(() => null) : null;

      if (!response || !response.ok) {
        setTransactionFormMessage(
          result?.error || txT("transactions_import_csv_error", "Unable to import CSV.")
        );
        return;
      }

      const imported = Number(result?.imported || result?.imported_count || 0);
      const skipped = Number(result?.skipped || result?.skipped_count || 0);

      setTransactionFormMessage(
        txT(
          "transactions_import_csv_success",
          `CSV import complete. Imported ${imported} transaction${imported === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.`
        )
      );

      await loadTransactions();
      renderTotals();
    } catch (error) {
      console.error("CSV import failed:", error);
      setTransactionFormMessage(txT("transactions_import_csv_error", "Unable to import CSV."));
    } finally {
      importButton.disabled = false;
      importButton.textContent = originalText || "Import CSV";
    }
  });
}
```

### Backend verification

Review the CSV import section in:

```text
In-Ex-Ledger-API/routes/transactions.routes.js
```

Confirm the route:

- is mounted under `/api/transactions/import/csv`,
- uses the existing auth/CSRF/rate-limit middleware through the transactions router,
- inserts into the real `transactions` table,
- scopes rows to the resolved active business,
- respects Basic/Pro/Business transaction limits,
- creates/reuses categories correctly,
- rejects invalid dates, amounts, and transaction types,
- does not bypass accounting-period lock rules,
- returns useful counts and row-level errors.

### Definition of done

- `Import CSV` opens a file picker.
- Uploading a valid CSV creates transactions in the database.
- Imported rows appear in the Transactions table after import.
- Invalid rows are skipped or rejected with a clear message.
- No CSV patch/sidecar file exists.
- CSV import behavior lives in the transaction owner files.
- A regression test or manual test instructions are added.

---

## 2. Make Onboarding Meaningful

### Status

Open.

The current onboarding work-type tiles are not meaningful yet. The frontend asks what kind of work the user does, but the backend currently ignores `work_type`, and the answer does not appear to change categories, exports, reminders, reports, or later app behavior.

Do not remove the field blindly. If onboarding asks a question, the answer should affect setup in a useful way.

### Current issue

The current onboarding field:

```text
What kind of work do you do?
```

options:

```text
Rideshare / Delivery
Creative / Consulting
Trades / Home Services
Other independent work
```

Current problem:

- Frontend sends `work_type`.
- Backend does not appear to persist/use `work_type` in onboarding data.
- No later app behavior appears to use it.
- This makes the field feel like pointless onboarding friction.

### Product decision needed

Either:

1. Remove the work-type field completely, or
2. Make it meaningful by using it to customize setup.

Preferred direction: make it meaningful.

### Entity/business type decision

Do not ask users to pick LLC / sole proprietor / entity type during first-run onboarding unless the app meaningfully uses that choice.

Recommended behavior:

- Default `business_type` to `sole_proprietor` internally for onboarding.
- Move legal/entity type editing to Settings / Business Profile if needed later.
- Do not add onboarding friction for a setting that does not change the first-run experience.

### Owner files

Frontend onboarding:

- `In-Ex-Ledger-API/public/html/onboarding.html`
- `In-Ex-Ledger-API/public/js/onboarding-page.js`
- `In-Ex-Ledger-API/public/css/pages/onboarding.css`
- `In-Ex-Ledger-API/public/js/i18n.js`

Backend onboarding:

- `In-Ex-Ledger-API/routes/me.routes.js`
- `In-Ex-Ledger-API/api/utils/resolveBusinessIdForUser.js` if default seeding changes are needed
- category/account seed logic if work-type defaults are added

### Meaningful onboarding behavior

If work type stays, it should drive useful defaults.

Suggested behavior:

#### Rideshare / Delivery

Use this to emphasize:

- Mileage
- Vehicle expenses
- Gas/fuel
- Parking
- Tolls
- Phone plan
- Platform income

Possible setup behavior:

- prioritize mileage setup,
- seed or surface vehicle-related categories,
- show mileage as an early guided setup step.

#### Creative / Consulting

Use this to emphasize:

- Client income
- Software subscriptions
- Professional services
- Office supplies
- Advertising/marketing
- Home office related categories

Possible setup behavior:

- suggest client/platform income categories,
- emphasize invoices/customers later if Business tier,
- prioritize service income and software expense categories.

#### Trades / Home Services

Use this to emphasize:

- Materials
- Tools
- Mileage
- Subcontractors
- Job supplies
- Receipts

Possible setup behavior:

- seed trades/materials/tool categories,
- emphasize receipts and job expenses,
- surface mileage early.

#### Other independent work

Use this for generic defaults.

### Backend implementation direction

`PUT /api/me/onboarding` should either persist `work_type` in `users.onboarding_data` or the field should be removed entirely.

If keeping it, persist data like:

```json
{
  "business_name": "Jane's Design",
  "work_type": "creative",
  "business_type": "sole_proprietor",
  "region": "US",
  "language": "en",
  "guided_setup_active": true,
  "guided_setup_step": "categories"
}
```

Then use `work_type` to influence one or more of:

- default category seeding,
- recommended next setup step,
- onboarding copy,
- dashboard empty states,
- category suggestions,
- first-run checklist.

### Frontend implementation direction

Update onboarding copy so the user understands why the question exists.

Example copy:

```text
What kind of work do you do?
We’ll use this to suggest categories and setup steps that fit your work.
```

Do not claim personalization unless the backend actually uses the value.

### Definition of done

- Onboarding no longer asks pointless questions.
- Work type is either removed or used meaningfully.
- Entity/business type is not shown as a first-run question unless it affects setup.
- If work type remains, backend persists it.
- If work type remains, it changes categories, setup suggestions, or first-run guidance.
- No onboarding patch/sidecar files are created.
- All onboarding behavior lives in the onboarding owner files.

---

## 3. Add Public SEO in Owner Files

### Status

In progress.

The first owner-file SEO pass should cover the real public pages and public static assets, not private app screens and not sidecar scripts.

Current findings from the live site review on May 8, 2026:

- `landing.html` has a title, description, and partial Open Graph tags.
- Public pages do not yet have a consistent canonical host strategy.
- Public pages are missing or inconsistent on canonical tags, Twitter card tags, and structured data.
- No `robots.txt` or `sitemap.xml` was found under the public app tree.
- Auth flow pages should not be indexed.

### Owner files

Public marketing/legal/auth HTML:

- `In-Ex-Ledger-API/public/html/landing.html`
- `In-Ex-Ledger-API/public/html/pricing.html`
- `In-Ex-Ledger-API/public/html/legal.html`
- `In-Ex-Ledger-API/public/html/privacy.html`
- `In-Ex-Ledger-API/public/html/terms.html`
- `In-Ex-Ledger-API/public/html/login.html`
- `In-Ex-Ledger-API/public/html/register.html`
- `In-Ex-Ledger-API/public/html/verify-email.html`
- `In-Ex-Ledger-API/public/html/mfa-challenge.html`

Public static assets:

- `In-Ex-Ledger-API/public/robots.txt`
- `In-Ex-Ledger-API/public/sitemap.xml`

Runtime/canonical-host follow-up if redirects are added later:

- `In-Ex-Ledger-API/server.js`

### Required behavior

SEO work should live in the owner files above.

Required behavior:

- Public indexable pages have stable titles and meta descriptions.
- Public indexable pages have canonical tags.
- Public indexable pages have Open Graph metadata.
- Public indexable pages have Twitter card metadata.
- Landing and pricing have structured data where useful.
- Auth-only pages are marked `noindex`.
- `robots.txt` exists and points crawlers at the sitemap.
- `sitemap.xml` lists the real public pages worth indexing.
- Do not create script-injected SEO patches.

### Canonical-host note

Choose one production host and use it consistently everywhere:

- marketing page canonicals,
- Open Graph URLs,
- sitemap URLs,
- Stripe webhook URL,
- any future host redirect in `server.js` or at the edge.

Do not leave apex and `www` half-split.

### Definition of done

- Public indexable pages have complete metadata in their owner HTML files.
- Auth-only pages are not indexable.
- `robots.txt` and `sitemap.xml` exist in the public app tree.
- No SEO patch file or injected metadata layer exists.
- Canonical-host follow-up is documented if runtime redirects are not implemented yet.

---

## 4. Fix Stripe Webhook Host and Delivery Path

### Status

Complete.

The webhook route code and tests are in place, but the live Stripe endpoint configuration is still not aligned with the live host that actually reaches the route.

### Findings

Stripe reported failures to:

```text
https://inexledger.com/api/billing/webhook
```

Stripe's email said:

- first failure: May 2, 2026 at 8:08:30 PM UTC
- disable date if unresolved: May 11, 2026 at 8:08:30 PM UTC

Direct live checks on May 8, 2026 found:

- `POST https://inexledger.com/api/billing/webhook` returns `405 Method Not Allowed`
- `POST https://www.inexledger.com/api/billing/webhook` reaches the app route and returns `400 Invalid webhook signature` without a valid Stripe signature

Interpretation:

- the webhook route code is present,
- the `www` host is reaching the real Express webhook route,
- the apex host is not currently routing POST webhooks correctly,
- Stripe is likely pointed at the wrong live host today.

### Owner files / systems

Code already involved:

- `In-Ex-Ledger-API/server.js`
- `In-Ex-Ledger-API/routes/billing.routes.js`
- `In-Ex-Ledger-API/middleware/csrf.middleware.js`

Operational owners:

- Stripe Dashboard webhook endpoint settings
- production `STRIPE_WEBHOOK_SECRET`
- production host/canonical redirect configuration

### Required behavior

- Decide the canonical production host.
- Point Stripe at the host that actually reaches the webhook route.
- Confirm production `STRIPE_WEBHOOK_SECRET` matches the configured Stripe endpoint.
- Re-send failed webhook events after the endpoint is corrected.
- Keep webhook handling in the real billing owner flow.
- Do not add a webhook patch route or sidecar middleware.

### Definition of done

- Stripe's configured webhook endpoint matches the real production host.
- Test-mode webhook deliveries succeed with `2xx`.
- Production `STRIPE_WEBHOOK_SECRET` matches the active endpoint.
- Failed Stripe events are re-sent after the fix.
- Canonical host is documented and aligned with SEO and billing configuration.

---

## 5. Fold Residual Transactions Drift CSS into Owner Styles

### Status

Open.

There is still a drift-style CSS file that overrides transaction layout behavior which should now live in the real transaction owner styles.

Current file:

- `In-Ex-Ledger-API/public/css/core/transactions-no-actions-column.css`

Current issue:

- it still contains old `#txSelectAll` cleanup logic,
- it still acts like a cleanup override layer instead of owner CSS,
- the transaction behavior now belongs in `transactions.html`, `transactions.js`, and `transactions.css`.

### Owner files

- `In-Ex-Ledger-API/public/html/transactions.html`
- `In-Ex-Ledger-API/public/js/transactions.js`
- `In-Ex-Ledger-API/public/css/pages/transactions.css`

### Result

- Transaction layout rules were folded into `transactions.css`.
- `transactions-no-actions-column.css` was deleted.
- Dead `#txSelectAll` cleanup styling was removed from the global CSS layer.
- Transaction layout behavior is no longer kept in a cleanup drift stylesheet.

### Definition of done

- Transaction table layout is owned by `transactions.css`.
- No dead `#txSelectAll` styling remains.
- `transactions-no-actions-column.css` is deleted.

---

## Global rule

Do not create new files like:

```text
csv-import-patch.js
onboarding-fix.js
onboarding-v2.js
transaction-import-sidecar.js
```

If the behavior is product behavior, put it in the owner file.
