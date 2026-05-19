# Product Backlog

This file tracks product, billing, design, and UX items that are important but not part of the current critical-fix batch.

## Billing

### Additional Business yearly billing support

#### Status
Stripe prices already exist for Additional Business monthly and yearly in both US and Canada.

Existing Stripe prices:
- USD monthly additional business: `price_1TLT23B8saFLibPWFMI1gg63` — $5.00/month
- USD yearly additional business: `price_1TLT7RB8saFLibPWNuW1IXx9` — $51.00/year
- CAD monthly additional business: `price_1TLT2hB8saFLibPWd3djJv53` — CA$7.00/month
- CAD yearly additional business: `price_1TLT87B8saFLibPWiWQdhRwE` — CA$71.40/year

#### Issue
The app may currently expose only monthly Additional Business add-ons in the UI.

#### Desired behavior
- If user chooses Pro monthly, additional businesses should use the monthly add-on price.
- If user chooses Pro yearly, additional businesses should use the yearly add-on price.
- If an active Pro subscription is monthly, Business Access updates should use monthly add-on pricing.
- If an active Pro subscription is yearly, Business Access updates should use yearly add-on pricing.

#### Files to audit
- `In-Ex-Ledger-API/public/js/subscription.js`
- `In-Ex-Ledger-API/public/html/subscription.html`
- `In-Ex-Ledger-API/routes/billing.routes.js`
- `In-Ex-Ledger-API/services/stripePriceConfig.js`
- `In-Ex-Ledger-API/services/subscriptionService.js`

#### Checks
- Confirm initial checkout passes correct add-on price for yearly Pro.
- Confirm additional-business quantity selector is not monthly-only.
- Confirm `PATCH /api/billing/additional-businesses` resolves add-on price using the active subscription interval.
- Confirm UI copy shows `/month` vs `/year` correctly.
- Confirm tests cover monthly and yearly add-on behavior.

#### Priority
Medium. Not a launch blocker if additional-business yearly checkout is hidden, but should be fixed before promoting yearly plans heavily.

---

## Design / UX

### Redesign Categories page

#### Issue
The current Categories page has poor visual hierarchy. Category pills are too small and low-contrast, surrounded by large white rows and empty space. The result feels washed out and hard to scan, especially on mobile desktop view.

#### Goals
- Make income and expense categories easier to scan.
- Make category chips visually stronger and more readable.
- Reduce excessive white space in category rows.
- Improve hierarchy between category name, tax mapping, and actions.
- Avoid making every Delete button visually compete with the actual category data.

#### Possible redesign direction
- Use denser settings-style sections for Income and Expense categories.
- Show category name as the primary element.
- Show tax line / GST-HST metadata as secondary badges.
- Move destructive actions behind a kebab/menu, hover state, or less aggressive secondary action treatment.
- Improve mobile/desktop-view behavior so the page does not feel like tiny pills floating inside oversized cards.

#### Files to audit
- `In-Ex-Ledger-API/public/html/categories.html`
- `In-Ex-Ledger-API/public/css/pages/categories.css`
- `In-Ex-Ledger-API/public/js/categories-backend.js`

#### Priority
Medium. Visual quality issue, not a launch blocker.

---

### Landing page updates

#### Issue
Landing page needs another content/UX pass before heavier promotion.

#### Goals
- Improve CTA clarity.
- Make trial/payment conditions obvious.
- Strengthen positioning around calm bookkeeping, CPA-safe exports, receipts, mileage, and solo-operator use cases.
- Ensure mobile layout feels premium and not cramped.
- Confirm pricing/plan messaging matches the actual Stripe/app behavior.

#### Files to audit
- `In-Ex-Ledger-API/public/html/landing.html`
- `In-Ex-Ledger-API/public/css/pages/landing.css`
- `In-Ex-Ledger-API/public/js/landing.js`
- `In-Ex-Ledger-API/public/js/i18n.js`

#### Priority
Medium. Important for conversion, but separate from critical backend/security fixes.
