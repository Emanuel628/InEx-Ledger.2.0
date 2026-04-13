# Freelancer & Gig Worker Pivot — Feature & UX Roadmap

**Context:** InEx Ledger's infrastructure (auth, billing, mileage, receipts, exports, multi-region tax mapping, PDF generation) is already well-suited for independent contractors and gig workers. The pivot from "business owner" to "freelancer / 1099-NEC / T4A filer" is primarily a language overhaul, a simplified onboarding path, and four targeted feature additions. No data model rearchitecture is needed.

---

## 1. Language & UX Reframe

The current UI reads like software for an LLC owner. Freelancers find terms like "Business," "Accounts," and "Ledger" intimidating. The goal is to feel like a smart notebook, not accounting software.

| Current | Replacement |
|---|---|
| "Create a business" | "Set up your freelance profile" |
| "Business name" | "Your name or trade name" |
| "Business type" | Remove or default to Sole Proprietor silently |
| "Accounts" (nav) | "Bank Accounts" |
| "Ledger" / "InEx Ledger" brand | Keep brand, but tagline should say "built for freelancers & independent contractors" |
| "Record a transaction" | "Log income" / "Log an expense" |
| Dashboard KPI "12-Month Net" | "Your profit so far" |

**Files to update:** `public/html/*.html` (nav labels, page titles), `public/js/i18n.js` (translation keys), onboarding copy in `routes/me.routes.js` and `public/html/onboarding*.html`.

---

## 2. Onboarding Simplification

The current onboarding flow asks for business type, region, language, province (CA), and start focus — all on one screen. For a freelancer opening the app for the first time, this is friction.

### Proposed fast-path
1. **Step 1 — "What do you do?"** — Three tiles: Rideshare / Delivery, Creative / Consulting, Other Independent Work. Selection pre-fills sensible category defaults and sets `business_type = sole_proprietor` silently.
2. **Step 2 — "Where are you based?"** — US or Canada (two buttons, no dropdown). Sets `region`.
3. **Step 3 — "What's your name?"** — First name only displayed in the UI; legal name only required at export time.

**Skip everything else.** Province, language, business structure — all default automatically and can be changed later in Settings.

**Files:** `public/html/onboarding.html` (or equivalent), `routes/me.routes.js` `PUT /onboarding`, `public/js/onboarding*.js`.

---

## 3. 1099-NEC / T4A Income Tagging

### The problem
Gig workers receive 1099-NEC forms (US) or T4A slips (Canada) from each platform they work for (Uber, DoorDash, Fiverr, Stripe, etc.). At tax time they need to reconcile what each payer reported against what they actually deposited. Right now there is no way to flag income by payer or form type.

### What to build
**Database:** Add two nullable columns to `transactions`:
```sql
ALTER TABLE transactions ADD COLUMN payer_name TEXT;
ALTER TABLE transactions ADD COLUMN tax_form_type TEXT
  CHECK (tax_form_type IN ('1099-NEC', '1099-K', 'T4A', 'none') OR tax_form_type IS NULL);
```

**UI — Transaction form:** When `type = income`, show an optional "Payer / Platform" text field and a "Reported on 1099 / T4A?" toggle. Pre-populate payer suggestions from previously entered values (datalist).

**Report — Year-End Income Summary:** A new export panel (or an additional tab in Exports) that groups income by `payer_name` and shows:
- Total received per payer
- Whether a 1099-NEC / T4A is expected (> $600 US / > $500 CA threshold)
- A reconciliation column: "Reported by payer vs. recorded by you"

This report is the single highest-value feature for a freelancer's tax prep workflow.

**Files to create/modify:**
- New migration: `migrations/NNNN_add_payer_fields_to_transactions.sql`
- `routes/transactions.routes.js` — accept and persist `payer_name`, `tax_form_type`
- `public/html/transactions.html` — add payer fields to add/edit modal
- `public/js/transactions.js` — wire up payer fields
- `public/html/exports.html` — add "1099 / T4A Summary" tab
- `public/js/exports.js` — build the payer reconciliation report

---

## 4. Self-Employment Tax Estimate Widget

### The problem
Freelancers owe both the employee and employer share of FICA — 15.3% on the first $168,600 of net self-employment income (2024 US rate), applied to 92.35% of net profit. This surprises first-year freelancers badly. Canadian equivalents are CPP contributions on net self-employment income.

### What to build
In `public/html/analytics.html`, add a **"Tax Snapshot"** KPI card to the Dashboard panel:

**US calculation:**
```
SE Net = Net Profit × 0.9235
SE Tax = SE Net × 0.153   (up to the SS wage base)
SE Deduction = SE Tax / 2  (above-the-line deduction)
Taxable Income Estimate = Net Profit − SE Deduction
Federal Income Tax Estimate = Taxable Income × effective_bracket_rate
Total Tax Burden = SE Tax + Federal Income Tax Estimate
```

**CA calculation:**
```
CPP Contributions = (Net Self-Employment Income − $3,500 exemption) × 0.1188  (2024 combined rate)
Federal Income Tax = Net Income × marginal_bracket
Total = CPP + Federal Income Tax
```

Display as: **"Estimated tax owed: $X,XXX"** with a "How is this calculated?" expandable tooltip. Add a disclaimer: *"This is an estimate. Consult a tax professional."*

**Files:** `public/js/analytics.js` (new `renderTaxSnapshot()` function), `routes/analytics.routes.js` (add SE tax calc to `/dashboard` response or compute client-side from existing `summary` payload).

---

## 5. Quarterly Estimated Tax Reminders

### The problem
Self-employed workers in the US must pay estimated taxes four times a year (April 15, June 15, September 15, January 15). In Canada, instalments are due March 15, June 15, September 15, and December 15. Missing these results in penalties. Most first-year freelancers don't know this.

### What to build
**Backend:** A new table `tax_reminders` (or reuse the existing notifications/messages system) that stores per-user quarterly reminder preferences.

**Simpler approach — use the existing trial/banner system:** The `trial.js` + `trialBanner` div already renders dismissible banners. Add a `getTaxReminderBanner()` function that checks today's date against the four quarterly deadlines and returns a banner message in the 14 days leading up to each:

```
"Q2 estimated taxes are due June 15 — your current estimate is $X,XXX. Pay at IRS Direct Pay."
```

For Canada: link to CRA My Account.

**Files:**
- `public/js/trial.js` or new `public/js/taxReminders.js`
- All page HTML files — include the new script tag
- No new API route needed if done client-side using stored region + calculated estimate

---

## 6. Schedule C / T2125 Category Mapping

### The problem
The `categories` table already has `tax_map_us` and `tax_map_ca` columns. These are not surfaced to users or used in exports. At tax time, a freelancer needs to know which of their expense categories maps to which line on Schedule C (US) or T2125 (CA).

### What to build
**Categories page:** Show the Schedule C line (e.g., "Line 9 — Car and truck expenses", "Line 18 — Office expense") next to each expense category. Allow users to confirm or override the mapping.

**PDF Export:** The existing PDF export generates a summary of income/expenses. Extend it to include a **Schedule C Worksheet** section that groups expenses by their tax form line number and shows:
- Line number and description
- Total amount for the year
- Number of receipts attached

**Default mappings to implement** (the `tax_map_us` column should store the line key):

| Category | Schedule C Line |
|---|---|
| Advertising | Line 8 |
| Car / Mileage | Line 9 |
| Commissions | Line 10 |
| Contract labor | Line 11 |
| Depreciation | Line 13 |
| Insurance | Line 15 |
| Legal / Professional | Line 17 |
| Office expense | Line 18 |
| Rent / Lease | Line 20a / 20b |
| Repairs / Maintenance | Line 21 |
| Supplies | Line 22 |
| Taxes / Licenses | Line 23 |
| Travel | Line 24a |
| Meals (50% deductible) | Line 24b |
| Utilities | Line 25 |
| Phone / Internet | Line 25 |
| Other | Line 48 |

**Files:**
- `public/html/categories.html` — show tax line badge on each category row
- `public/js/categories.js` — render tax mapping
- `public/js/pdf_export.js` — add Schedule C worksheet section
- Migration to populate default `tax_map_us` / `tax_map_ca` values on existing seed categories

---

## 7. Mileage Rate Auto-Update

The mileage feature exists and works. One small but high-value improvement: the IRS standard mileage rate changes annually (67¢/mile for 2024). Right now the rate used in calculations appears to be hardcoded.

**What to build:** A `mileage_rates` table (or a config value in settings) with `year`, `region`, `rate_per_unit`. Pre-populate with current rates. Surface the current rate in the Mileage page header ("Using $0.67/mile — 2024 IRS standard rate. Update in Settings."). Let users override for years when the rate changed mid-year.

**Files:** New migration, `routes/mileage.routes.js`, `public/js/mileage.js`, `public/css/pages/mileage.css`.

---

## Priority Order

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| P0 | Language & UX reframe | Low | High — first impression |
| P0 | Onboarding simplification | Medium | High — activation rate |
| P1 | 1099-NEC / T4A income tagging | Medium | Very High — core tax workflow |
| P1 | SE tax estimate widget | Low | High — anxiety-reducer |
| P2 | Quarterly tax reminders | Low | High — retention / trust |
| P2 | Schedule C / T2125 category mapping | Medium | High — tax prep time savings |
| P3 | Mileage rate auto-update | Low | Medium — accuracy |

---

## What Does NOT Need to Change

- Auth, billing, and subscription infrastructure — solid as-is
- Mileage tracking core functionality — already best-in-class for freelancers
- Receipt capture and storage — works well
- Multi-region (US/CA) data model — already bifurcated correctly
- PDF export engine — extend it, don't replace it
- Analytics forecasting — reframe the language, keep the math
- Multi-business support — keep it; many freelancers have side projects or run two sole-prop activities

---

*Document created 2026-04-13. Reflects codebase state at that date.*
