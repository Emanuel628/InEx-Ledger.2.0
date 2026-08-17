# Paid-Feature Enforcement

How a route decides whether a business's current plan allows an action. Three
layers, each with one job:

## 1. The catalog — `In-Ex-Ledger-API/config/planCatalog.js`

Single source of truth for plan/feature/limit data. No other module hardcodes
a feature list or a plan limit.

- `PLAN_CODES` — the three internal codes (`free`, `v1`, `business`). These
  are database values kept for backward compatibility; user-facing names are
  Basic/Pro (`business` currently inherits Pro's feature set in full — it's
  reserved for a future tier, not yet a distinct one).
- `FEATURE_KEYS` — the canonical set of gateable features (e.g.
  `PDF_EXPORTS`, `RECURRING_TRANSACTIONS`, `ADDITIONAL_BUSINESSES`).
- `PLAN_FEATURES` — an explicit `{ plan: { feature: true|false } }` matrix.
  Every plan must list every known feature; there is no default-allow.
- `PLAN_LIMITS` — metered Basic-tier caps (transactions, receipts), reset on
  the UTC calendar month boundary. Pro/Business have no cap (`null`).
- `planHasFeature(planCode, featureKey)` — the actual lookup. An unknown
  feature key **fails closed** (returns `false`, and throws in non-production
  so the mistake is caught in dev/CI) rather than defaulting to allowed, so a
  typo'd or newly-added feature key can't silently grant free access.

## 2. The subscription bridge — `services/subscriptionService.js`

- `hasFeatureAccess(subscription, featureKey)` and
  `getFeatureLimit(subscription, limitKey)` read `subscription.effectiveTier`
  (the already-resolved trial/paid/canceled-with-remaining-access state, not
  the raw Stripe status) and delegate to the catalog above.

## 3. Enforcement at the route

Two call shapes exist, both producing the same response body:

- **Middleware** — `middleware/requirePlanFeature.js`'s
  `requirePlanFeature(featureKey)` factory. Resolves the business and
  subscription snapshot once (cached on `req.businessId`/`req.subscription`
  so a second `requirePlanFeature()` call in the same request chain, or the
  route handler itself, doesn't re-query), then either calls `next()` or
  responds `403` with a structured body: `{ error, code:
  "feature_requires_plan", feature, current_plan, required_plan,
  required_plan_name }`.
- **Direct call** — routes that already resolved `subscription` mid-handler
  for other reasons (so can't cleanly insert the middleware ahead of that
  work) call `hasFeatureAccess(subscription, featureKey)` themselves and, on
  failure, return the same shape via the exported
  `buildFeatureRequiresPlanResponse(subscription, featureKey)` — see
  `routes/exports.routes.js`'s `POST /secure-export` for an example.

Either way, the client always sees the same `feature_requires_plan` error
shape regardless of which route hit the gate, which is what the frontend's
upgrade-prompt UI keys off of.

## A second, separate gate — legacy V2/Business surfaces

The three-layer catalog/bridge/route system above is the current mechanism
for gating the main product's paid features. A second, older, self-contained
gate also exists: `api/utils/requireV2BusinessEnabled.js`, which exports
`requireV2BusinessEnabled` and `requireV2Entitlement`. It does not go through
`planCatalog.js` at all — it hardcodes a single check against
`PLAN_BUSINESS`.

- `requireV2BusinessEnabled` — first checks `req.user`, then short-circuits
  `403` unless the `ENABLE_V2_BUSINESS` env flag is `'true'`, then resolves
  the business and its subscription snapshot and `403`s unless
  `subscription.effectiveTier === PLAN_BUSINESS` exactly (not Pro). On
  success it stashes `req.business.subscription` for the next middleware.
- `requireV2Entitlement` — a thin follow-up check that just confirms
  `req.business.subscription` was actually set by the middleware above (i.e.
  it must run after `requireV2BusinessEnabled`, not standalone).

Both are always applied together as `...businessTierOnly` (see
`routes/index.js`), gating every `ENABLE_V2_BUSINESS`-flagged legacy route
family (`/api/vendors`, `/api/customers`, `/api/invoices`, `/api/bills`,
`/api/projects`, `/api/billable-expenses`) plus the standalone
`GET /api/arap-summary` route — see `Docs/API_ROUTE_INVENTORY.md` for the
full list. This flag is off by default in production; these are legacy V2
business-tier surfaces, not the primary paid-feature gate a new route should
use.

## Adding a new gated feature

1. Add the key to `FEATURE_KEYS` and a label to `FEATURE_LABELS` in
   `planCatalog.js`.
2. Set it `true`/`false` for **every** plan in `PLAN_FEATURES` — there's no
   implicit default.
3. Gate the route with `requirePlanFeature(FEATURE_KEYS.YOUR_KEY)`, or the
   direct-call pattern if the route needs the subscription snapshot for
   other logic first.
