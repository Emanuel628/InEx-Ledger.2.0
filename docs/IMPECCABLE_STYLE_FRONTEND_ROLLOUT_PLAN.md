# Impeccable Style Frontend Rollout Plan

This document defines the rollout plan for applying the `impeccable.style` design direction across the frontend in a controlled way.

The goal is not to restyle pages randomly. The goal is to standardize trust, clarity, spacing, action hierarchy, and visual consistency across the product without breaking workflows.

## Rollout Strategy

1. Treat this as a controlled system rollout, not page-by-page improvisation.
2. Lock the visual rules first.
3. Update shared tokens and shell patterns next.
4. Move through the app by workflow priority, not alphabetically.
5. Validate each phase before starting the next one.

## Phase 0 - Design Baseline

1. Capture the current best reference surfaces:
   - landing page
   - transactions page
2. Extract the design rules now visible there:
   - spacing rhythm
   - card density
   - button hierarchy
   - heading scale
   - table styling
   - toolbar styling
   - input styling
   - trust-oriented copy tone
3. Write those rules into a small internal style spec:
   - what counts as primary / secondary / quiet action
   - how sections are separated
   - allowed shadows
   - allowed border radii
   - allowed background treatments
   - typography scale
   - empty state pattern
   - stats card pattern
   - upsell pattern
4. Freeze that as the source of truth for the rest of the rollout.

## Phase 1 - Shared Frontend Foundation

1. Audit and normalize shared CSS in:
   - `public/css/core/tokens.css`
   - `public/css/core/base.css`
   - `public/css/core/components.css`
   - `public/css/core/layout.css`
2. Add or standardize shared tokens for:
   - background layers
   - surface colors
   - borders
   - shadows
   - radii
   - text hierarchy
   - action colors
   - status colors
3. Standardize shared component classes for:
   - primary buttons
   - secondary buttons
   - quiet buttons
   - cards
   - section headers
   - page headers
   - input groups
   - pills/chips
   - data tables
   - empty states
   - modals/drawers
4. Remove one-off visual hacks where they overlap with the new shared system.
5. Do not change JS hooks or IDs while doing this.

## Phase 2 - App Shell Consistency

1. Unify the topbar visually across all authenticated pages.
2. Unify the sidebar visually across all authenticated pages.
3. Standardize:
   - header height
   - nav spacing
   - icon sizing
   - active states
   - user pill styling
   - page container widths
   - content padding
4. Ensure all pages inherit the same shell spacing and alignment rules.
5. Verify mobile and tablet breakpoints before moving on.

Priority pages for shell validation:
- analytics
- accounts
- categories
- receipts
- mileage
- exports
- settings
- subscription

## Phase 3 - Core Workflows

Roll out by the pages users trust most for day-to-day work.

### Analytics

- align cards, charts, and summary hierarchy to the transactions standard
- remove generic decorative styling
- make comparisons and KPIs more readable

### Accounts

- standardize management tables, add/edit forms, and helper copy
- tighten density and action clarity

### Categories

- clean card hierarchy
- improve instructions and default-category affordances
- remove any dead or duplicate controls

### Receipts

- make upload, scan, filter, and state transitions feel operational
- strengthen empty state and processing states

### Mileage

- unify filters, activity types, summary cards, and history styling
- reduce visual clutter in entry flows

## Phase 4 - Settings / Subscription / Help

### Settings

- reorganize into clearer sections
- improve scannability of security, region, profile, and recovery settings
- use tighter panel hierarchy

### Subscription / Billing

- make plan comparison, checkout handoff, add-on management, and billing history feel high-trust
- ensure buttons read as secure financial actions

### Help

- bring typography and section spacing in line with the new standard
- reduce any leftover generic copy tone
- keep content useful, not bloated

## Phase 5 - Secondary / Edge Surfaces

After the main product trust surfaces are consistent:

1. invoices
2. messages
3. sessions
4. onboarding
5. login / register / recovery / verify-email
6. upgrade / pricing support pages

Goal here:
- same visual language
- no old-UI vs new-UI split
- auth screens should feel as polished as the main product

## Phase 6 - Copy Pass

After the UI structure is stable:

1. review all customer-facing copy
2. remove generic AI-sounding text
3. tighten product positioning:
   - simpler than QuickBooks
   - built for solo operators
   - tax-ready without extra clutter
4. standardize CTA language
5. standardize empty-state language
6. standardize helper text and upsell tone

The design will still feel fake if the copy remains vague.

## Phase 7 - Interaction Polish

1. button hover / active / disabled consistency
2. input focus states
3. table row hover / selection states
4. modal open/close polish
5. drawer transitions
6. loading skeletons or loading states
7. success/error feedback consistency
8. mobile tap-target consistency

This is the phase where the app stops feeling styled and starts feeling deliberate.

## Phase 8 - QA and Regression Control

For every rollout batch:

1. test desktop widths
2. test tablet widths
3. test mobile widths
4. confirm no text overlap
5. confirm no broken hooks
6. confirm drawers/modals/forms still submit
7. confirm plan gating still works
8. confirm auth redirects still work
9. confirm no visual split between old and new components on touched pages

Also keep:
- before screenshots
- after screenshots
- touched-file list
- rollback branch or commit checkpoint

## Suggested Execution Order

Implement in this order:

1. shared tokens/components
2. shell
3. analytics
4. accounts
5. categories
6. receipts
7. mileage
8. exports
9. settings
10. subscription
11. help
12. onboarding + auth pages
13. remaining secondary pages
14. copy cleanup
15. interaction polish
16. final QA sweep

## Rules to Keep This Safe

1. no backend changes unless required by a UI bug
2. no ID / JS hook churn unless absolutely necessary
3. no mixed redesign + feature expansion in the same batch
4. commit in small, reviewable vertical slices
5. one page family at a time
6. verify after every slice

## Recommended Commit Structure

Use commits like:

1. `Standardize design tokens and shared surface styles`
2. `Polish app shell with impeccable style system`
3. `Redesign analytics presentation`
4. `Redesign accounts and categories workflows`
5. `Redesign receipts and mileage workflows`
6. `Redesign exports settings and billing surfaces`
7. `Polish onboarding auth and secondary pages`
8. `Refine frontend copy and interaction states`

## Recommended Next Slice

Start with:

1. shared tokens/components audit
2. app shell rollout
3. analytics as the first post-transactions page

That spreads the new design language across the product without touching the most fragile data-entry surfaces first.
