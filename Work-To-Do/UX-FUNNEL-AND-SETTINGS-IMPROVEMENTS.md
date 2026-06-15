# UX Funnel & Settings Improvements - Agreed Next Changes

Working list of agreed UX changes from the 2026-06-15 review session. Not started
(deferred) unless otherwise noted. Code locations are included for whoever implements.

## Entry funnel / auth

1. **Email verification -> email-link only (no blocking page at signup).**
   Today registration redirects to a full `/verify-email` page that gates the
   flow; the user then has to come back and log in again. Replace with a plain
   verification link emailed to the user; do not block signup with a dedicated
   page, and auto-continue/auto-login once verified.
   - Areas: `routes/auth.routes.js` (register/verify), `public/html/verify-email.html`, `public/js/auth.js`
   - Note: auth/security-sensitive; handle as its own careful PR.

2. **Remove `readonly` from the login fields.**
   `#email` / `#password` in `login.html` ship `readonly` (autofill suppression),
   which breaks password managers and adds friction even when testing.
   - Area: `public/html/login.html:48,53`

3. **Collect country earlier - at register, not deferred to onboarding.**
   - Areas: `public/html/register.html`, `routes/auth.routes.js` register handler.

4. **Move the cookie-consent banner to the bottom of the page.**
   Currently pinned to the very top, overlapping the auth/onboarding cards.
   - Area: `public/js/global.js` (consent banner), associated CSS.

## Onboarding / first-run

5. **Auto-seed all default categories at business creation; remove the "Add default categories" button.**
   The seeder exists (`seedDefaultCategoriesForBusiness`), but the onboarding
   business-creation path runs with `seedDefaults: false`
   (`routes/me.routes.js:260`), so a new business starts with no categories -
   which is the only reason the manual button exists.
   - Areas: business-creation path in `routes/me.routes.js`, `api/utils/seedDefaultsForBusiness.js`, remove `seedDefaultCategoriesBtn` in `public/js/categories-backend.js` + `public/html/categories.html`.

6. **Add a mandatory "add your first account" onboarding step; stop auto-seeding default accounts.**
   `seedDefaultsForBusiness` currently auto-creates two accounts (`"Checking"`,
   `"Cash"`, `api/utils/seedDefaultsForBusiness.js:4`). Decouple the seeder: seed
   categories but not accounts, and require the user to add a real first account
   before "Open my books". Onboarding goes 2 -> 3 steps (business -> first account
   -> first action).
   - Areas: `api/utils/seedDefaultsForBusiness.js`, onboarding flow (`public/html/onboarding.html` + its JS), `routes/me.routes.js`.

## Responsive (assigned to Codex)

7. **Two-column form fields touch in "Desktop Version" (1280) view.**
   Affects New Invoice (issue/due date), Exports (start/end date), Mileage
   (date/purpose, date/expense-title), Transactions (date/description). The view
   forces `width=1280` (`public/js/global.js:324`); at the phone's downscale the
   real gaps render too small.
   - Status: shared `min-width: 0` shrink fixes were implemented in PR #256 via
     `public/css/core/components.css`.
   - Keep this item open only if follow-up visual QA still finds Safari/mobile edge cases.

---

## Settings page audit (2026-06-15, live Playwright walkthrough)

Walked all 8 sections (Overview, Business, Billing, Security, Preferences,
Privacy & Data, Danger Zone, Help) and exercised every CTA on a fully
onboarded trial account.

**Works well:** clear Overview state cards (business / plan+renewal / MFA
status / lock status) with "Manage" deep-links; danger actions are isolated
and all open confirm modals (delete transactions / delete data / delete
account verified - cancel works); Security has MFA enable + password change +
session management; Privacy & Data has data download + analytics opt-out +
policy links; "Your data is encrypted" reassurance.

**Hard spots / confusion / bugs (to fix):**

8. **`GET /api/review/queue` returns HTTP 500 for a fresh account** (no data).
   Real backend bug - the transactions review queue fails to load. Surfaced
   when "Restart tour" landed on `/transactions`.
   - Area: `routes/review.routes.js:443` (`buildQueueRows`/dataset throws on empty data), consumed by `public/js/transactions.js:2002`, `exports.js`, `review.js`.

9. **"Add another business" silently redirects to `/subscription`.**
   `addBusinessBtn` -> `openAddBusinessModal()` bounces to billing when the plan
   doesn't include multi-business, with no inline "requires Business plan" cue.
   The button reads like a normal action. Replace the silent redirect with an
   inline upgrade affordance / upsell modal.
   - Area: `public/js/settings.js:673` + `openAddBusinessModal`.

10. **"Restart tour" (Reset guided setup) leaves Settings to `/transactions`**
    and threw console errors. Should re-enter the tour in context (or confirm
    intent) rather than silently bouncing away.
    - Area: `#replayOnboardingTips` in `public/js/settings.js`.

11. **Cookie-consent banner overlaps the Settings left-nav** at the top (same
    banner as funnel item #4 - confirmed it also covers the section list here).

12. **MFA is off by default** with an "MFA off / No account protection" nudge.
    Good that it's surfaced, but a financial account with no MFA on day one is a
    posture concern - consider stronger enrollment prompting.

13. **Redundant Overview vs. inline sections.** The page shows Overview state
    + "Manage" cards and also renders every section inline in one long scroll, so
    it's unclear whether to use the left nav or just scroll. Consider committing
    to nav-driven panels or a single scroll, not both.

14. **Verify empty "Update password" validation** - confirm the button blocks
    empty/short submissions client-side (inconclusive in the automated pass).
    - Area: `public/js/settings.js:2285` (`securitySaveButton`).
