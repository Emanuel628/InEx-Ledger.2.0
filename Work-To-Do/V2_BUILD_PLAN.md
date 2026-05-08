# V2 Build Plan

This document is the canonical build plan for `V2` of InEx Ledger.

`V2` is not a second app. It is the current InEx Ledger product gaining new capabilities through shared codepaths, shared business context, shared navigation, shared data rules, and backend-enforced entitlements.

## Non-Negotiable Build Rules

### 1. Single Product, No Parallel App Split

- `V2` is a capability expansion of the current app.
- Do not create separate `v1/` and `v2/` route trees unless absolutely unavoidable.
- Do not create duplicate page families for the same workflow unless the workflow is genuinely different.
- Keep one navigation shell, one account/business context, one subscription surface, and one auth foundation.
- Prefer extending current modules with entitlement checks over creating separate module copies.
- Avoid `v2_` naming in routes, tables, files, or services unless there is a hard technical reason.

### 2. Backend-Enforced Entitlements First, UI Gating Second

- API and service layers must reject access for non-entitled users even if the UI hides entry points.
- UI gating is for experience.
- Backend gating is for truth.
- There must be no drift between visible features and callable features.

### 3. Feature Flags for Incomplete V2 Work

- Incomplete V2 modules ship behind feature flags.
- Feature flags allow incremental merges without destabilizing the existing product.
- Feature flags are not a replacement for entitlements.
- Entitlements answer `who may use`.
- Feature flags answer `whether this feature is active yet`.

### 4. Append-Only Migrations Only

- Never edit an old applied migration.
- Never rewrite migration history.
- Every schema change gets a new migration file.
- Forward-fix only.

### 5. Live Data Safety

- No destructive backfills without an explicit plan.
- No silent data rewrites.
- Migrations must be safe on production-shaped data, not just clean databases.
- Schema changes must be validated against existing V1 assumptions before deployment.

### 6. AR/AP Are Derived, Not Separate Truth Systems

- `AR` derives from invoices plus invoice payments.
- `AP` derives from bills plus bill payments.
- Do not create an independent receivables or payables source of truth.
- Aging, balances, and summaries must derive from invoice/bill state plus payment application logic.

### 7. Shared Accounting Logic Layer

- Reports, dashboard totals, exports, tax summaries, AR/AP summaries, and review flags must read from shared service/query logic.
- Do not let each output compute its own private version of totals.
- There must be one authoritative accounting logic path for reused calculations.

### 8. Accounting Rules Before Deep Backend Work

These rules must be defined before backend implementation gets deep:

- invoice posting behavior
- bill posting behavior
- payment application behavior
- status-to-balance rules
- report/export derivation rules
- cash-vs-accrual positioning

### 9. No Forking Existing UI Unless Necessary

- Upgrade the existing shell instead of creating a separate V2 shell.
- Reuse existing page patterns wherever possible.
- Locked features, upgrade prompts, and entitlement messaging must use shared design patterns.

### 10. Later-Wave Modules Stay Later-Wave

- `Projects` and `Billable Expenses` are later-wave items.
- They are not foundation modules.
- Do not let them block Customers, Vendors, Invoices, Bills, AR/AP, or reporting expansion.

## Definition Of Done

A module or delivery wave is not complete until all of the following are true:

- UI complete
- frontend behavior complete
- backend/API complete
- entitlement enforcement complete
- feature flag behavior complete
- tests added or updated
- reporting/export impact reviewed
- accounting checks passed where applicable
- production logging/observability updated where applicable

## Phase 0 - Foundation Audit And Scope Lock

### Goal

Confirm what stays from the existing app, what gets upgraded, what gets added, and what is explicitly deferred.

### Outputs

- Keep list
- Upgrade list
- Add list
- Not-now list

### Required Decisions

- Which current pages remain shared without rebuild
- Which existing systems are stable enough to preserve
- Which existing exports/reporting flows must evolve rather than be replaced

## Phase 0.5 - Tier Entitlements And Feature Flag Matrix

### Goal

Define access rules before architecture drifts.

### Required Deliverables

For each tier:

- `Free`
- `V1`
- `V2`

Define access for:

- transactions
- accounts
- categories
- exports
- secure export
- customers
- vendors
- invoices
- bills
- AR/AP views
- reports
- projects
- billable expenses

Define for each feature:

- entitlement requirement
- feature flag name
- backend guard
- UI guard
- rollout notes

Example flags:

- `FEATURE_CUSTOMERS`
- `FEATURE_VENDORS`
- `FEATURE_INVOICES`
- `FEATURE_BILLS`
- `FEATURE_AR_AP`
- `FEATURE_V2_REPORTS`
- `FEATURE_PROJECTS`
- `FEATURE_BILLABLE_EXPENSES`

## Phase 1 - Information Architecture And Unified App Map

### Goal

Map the upgraded app as one unified product.

### Required Outputs

- unified navigation map
- page inventory
- module relationship map
- cross-link map
- list/detail/create conventions

### Required Decisions

- where upgrade prompts live
- where locked V2 features appear in navigation
- which locked modules are visible versus hidden by entitlement

## Phase 2 - Accounting Rules, Source-Of-Truth Rules, And Shared Service Design

### Goal

Define the financial truth model before backend implementation gets deep.

### Must Define

#### Source-Of-Truth Rules

- invoices plus invoice payments drive `AR`
- bills plus bill payments drive `AP`
- reports derive from source transactions and shared accounting logic
- exports derive from the same shared logic as reports
- dashboard totals derive from shared service outputs

#### Posting Logic

Clarify:

- when invoice creation affects balances
- whether invoice send state affects accounting or is only workflow state
- when payments reduce invoice balance
- when bills become payable
- how partial payments behave
- how void/cancel/reopen states behave
- whether transactions are created directly, derived, or both

#### Basis Strategy

Clarify whether the product is:

- cash-first now with room for accrual later
- accrual-aware from the start
- dual-basis later but not fully supported yet

This must be stated explicitly.

#### Shared Service Layer

Define service/query domains for:

- dashboard summaries
- report aggregation
- export data assembly
- AR/AP summaries
- tax mapping summaries
- review/exception summaries

### Output

A written accounting rules spec plus service-layer plan.

## Phase 3 - Shared UI/UX Rules And Unified Component Standards

### Goal

Define the shared design rules so all modules feel like one product.

### Required Standards

- layout rules
- page header rules
- table rules
- form rules
- status badge rules
- empty/loading/error state rules
- entitlement messaging rules
- locked feature card style
- upgrade CTA pattern
- incomplete-module placeholder style

## Phase 4 - Static HTML/CSS: Shared Shell And Existing Page Upgrades

### Goal

Upgrade the existing shell rather than create a second shell.

### Scope

- sidebar
- topbar
- shared layout wrappers
- current dashboard structure
- current reports/export center structure
- transactions/accounts layout improvements where needed
- static navigation wiring
- locked V2 entries where appropriate

### Hard Rule

No separate V2 skin living beside the current UI.

## Phase 5 - Static HTML/CSS: New V2 Modules

### Build Order

1. Customers
2. Vendors
3. Invoices
4. Bills
5. AR/AP overviews
6. Expanded reports
7. Projects
8. Billable expenses

### Required Module Families

- list pages
- detail pages
- create/edit forms
- empty states
- locked states where applicable

## Phase 6 - Frontend Interaction Specs

### Goal

Define exactly what each page does in the browser before implementing behavior.

### Every Page Spec Must Include

- visible actions by entitlement
- hidden or locked actions by entitlement
- behavior when feature flag is off
- behavior when feature flag is on but module is incomplete
- behavior when route is manually accessed without entitlement
- form behavior
- modal behavior
- filters
- validation
- draft/dirty state behavior

## Phase 7 - Shared JavaScript Layer

### Goal

Create reusable interaction patterns before page-specific logic.

### Shared JS Responsibilities

- sidebar behavior
- tabs
- dropdowns
- modals/drawers
- table sorting UI
- filter chips
- search state
- pagination state
- toasts
- validation helpers
- currency/amount formatting
- status helpers
- entitlement-aware rendering helpers
- feature-flag-aware page guards
- locked-module CTA helpers

## Phase 8 - Module JavaScript Behaviors

### Build Order

1. Customers and Vendors
2. Invoices and Bills
3. AR/AP views
4. Expanded reports
5. Projects
6. Billable expenses

### Rule

Do not build AR/AP behavior until invoice/bill and payment behavior is stable.

## Phase 9 - Schema Planning And Migration Plan

### Goal

Design the schema after workflows are proven, not guessed.

### Required Scope

- reuse of current V1 schema where valid
- new entities
- relationships
- statuses/enums
- constraints
- indexing plan
- migration sequence

### Hard Rules

- append-only migrations only
- no editing old migrations
- no speculative tables
- schema must respect existing business scoping
- no duplicate truth sources for AR/AP

## Phase 10 - Migration Implementation

### Required Checks

- clean DB migration test
- production-shaped DB migration test
- foreign key validation
- constraint validation
- index validation
- rollback awareness, even if rollback is manual

## Phase 11 - API Contracts And Shared Service Contracts

### Goal

Define where logic lives before implementation sprawls.

### Contract Categories

- customers/vendors
- invoices/bills
- payments
- AR/AP summaries
- reports
- exports
- dashboard summaries
- review flags
- entitlement enforcement
- feature flag checks where needed

### Hard Rule

Do not allow reports, exports, and dashboard summaries to compute the same business concept in different ways.

## Phase 12 - Backend Implementation: Core Modules

### Recommended Order

#### Wave 1 Backend

- customers
- vendors

#### Wave 2 Backend

- invoices
- invoice payments
- bills
- bill payments

#### Wave 3 Backend

- AR/AP summaries derived from invoices/bills plus payments
- expanded reports
- export data structures updated accordingly

#### Wave 4 Backend

- projects
- billable expenses

### Rules

- follow existing business scoping patterns
- keep entitlement enforcement in backend
- do not bypass shared accounting logic

## Phase 13 - Frontend/Backend Wiring

### Goal

Replace placeholder data with real application flows, one module at a time.

### Wiring Rule

Do not wire a module until all of the following are ready:

- static UI complete
- JS interactions complete
- schema exists
- endpoint contract is stable
- entitlement path is defined
- feature flag path is defined

### Recommended Wiring Order

1. Customers
2. Vendors
3. Invoices
4. Bills
5. AR/AP
6. Reports
7. Exports
8. Projects
9. Billable expenses

## Phase 14 - Reporting And Export Integrity Pass

### Goal

Confirm that V2 additions integrate cleanly into reports, exports, dashboard summaries, AR/AP views, tax mappings, and review flags.

### Required Checks

- totals consistency
- aging consistency
- export/report parity
- tax mapping consistency
- secure/redacted behavior consistency

### Hard Rule

Reports and exports must read from shared accounting logic, not output-specific calculations.

## Phase 15 - Accounting Integrity And Regression Pass

### Goal

Validate that the product is financially coherent and does not regress V1.

### Required Checks

- invoice totals reconcile
- bill totals reconcile
- payment application logic holds
- AR/AP derivations are correct
- reports match source records
- exports match reports
- V1 workflows still behave correctly
- entitlements block unauthorized use
- feature flags do not leak incomplete modules

## Phase 16 - System Unification And Cleanup

### Goal

Make the upgraded product feel like one system, not an old app with bolted-on modules.

### Tasks

- unify naming
- unify status language
- remove duplicate UI patterns
- remove duplicate service logic
- remove one-off route patterns
- unify upgrade messaging
- unify shared shell behavior

## Phase 17 - Hardening, QA, And Release Prep

### Goal

Make the upgraded product stable enough for real-world use and release.

### Required Work

- validation tightening
- permission review
- rate limiting where needed
- transaction safety
- migration safety review
- performance review
- regression testing
- visual QA
- responsive QA
- copy cleanup
- release notes
- deploy checklist

### Observability Requirements

Track at minimum:

- failed entitlement checks
- payment application failures
- invoice/bill state transition failures
- report generation failures
- export generation failures

## Release Gates Per Wave

Every wave must satisfy all of the following before it is considered complete:

- UI complete
- JS behavior complete
- API complete
- entitlement enforced
- feature flag in place
- regression tests added
- accounting checks passed
- shared service layer used
- exports/reports validated where impacted

## Recommended Wave Sequence

### Wave 1

- entitlement matrix
- feature flags
- shared shell upgrades
- customers
- vendors

### Wave 2

- invoices
- bills
- payment flows
- accounting rules validation

### Wave 3

- AR/AP derived views
- report expansion
- export/report shared-service alignment

### Wave 4

- projects
- billable expenses

### Wave 5

- deeper polish
- CPA-grade export refinement
- production hardening

## Immediate Next Actions

Before major V2 implementation begins, produce these three working documents:

1. Keep / Upgrade / Add / Not-now scope list
2. Unified page inventory and navigation map
3. Entitlement matrix plus feature flag matrix

After those are complete, begin shared shell and static UI work.
