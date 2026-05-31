# InEx Ledger Product Roadmap

## Destination

Build InEx into a focused bookkeeping system for solo operators that is:

- easy to keep current weekly
- strong at import, mapping, receipts, review, invoices, and exports
- trustworthy enough for CPA hand-off
- clearly not trying to be QuickBooks

Everything in this roadmap should serve that.

## North Star

A user should be able to:

1. bring in transactions
2. get mostly correct categories
3. fix only the uncertain items
4. keep receipts and support tied to the record
5. send invoices when needed
6. export a package an accountant can actually use

If a task does not improve that flow, it is secondary.

## Phase 0: Product Discipline

Goal: stop drift before adding more work.

- freeze major new feature expansion
- stop treating side modules as equal to the core path
- define the product boundary as:
  - bookkeeping
  - receipts and support
  - invoices
  - review
  - exports
  - CPA hand-off
- explicitly de-prioritize:
  - full accounting-suite behavior
  - enterprise features
  - deep collaboration surfaces
  - broad connector/platform work

Exit criteria:

- the team uses one decision rule:
  - `Does this improve import, mapping, receipts, review, invoices, or exports?`
- work that fails that test is parked

## Phase 1: Re-Unify The Core

Goal: make the core bookkeeping loop coherent.

### 1. One transaction status truth

- unify review queue logic with export status logic
- remove duplicate `mapped/unmapped/review` interpretations
- make UI and export agree on the same transaction state

### 2. One category policy truth

- choose canonical mappings for policy-sensitive categories
- especially fix Canada drift like `Phone & Internet`
- make seeds, migrations, fallback logic, and exports agree

### 3. One import truth

- verify live CSV import and Plaid-like import paths produce the same category behavior
- ensure mapping metadata persists consistently
- confirm history, rules, and provider hints are actually influencing live inserts

### 4. One cleanup workflow

- make `needs category`, `needs receipt`, `needs allocation`, and `needs review` feel predictable
- keep uncertainty explicit and actionable

Exit criteria:

- no review/export contradictions
- no seed/backfill/fallback tax-map contradictions
- same merchant inputs produce consistent live categorization
- review queue is understandable without mental translation

## Phase 2: Mapping Reliability

Goal: make categorization dependable enough that users trust the app.

### 1. Real-world import regression coverage

- test actual merchant examples and ugly bank text
- cover recurring problem merchants
- cover unresolved cases intentionally left for review

### 2. Hardening the rule stack

- provider hints
- merchant normalization
- business-specific learned rules
- rule precedence
- confidence handling
- fallback review buckets

### 3. Bad auto-learning prevention

- avoid generic junk rules poisoning future imports
- keep rules scoped by transaction kind and signal quality
- preserve auditability of why a category was chosen

### 4. User control over mapping

- inspect learned rules
- remove bad rules
- keep mapping from becoming a black box

Exit criteria:

- common imports map correctly at high rates
- intentionally uncertain rows stay in review, not fake certainty
- users can understand and correct mapping behavior

## Phase 3: Review Workflow Excellence

Goal: make the product feel fast, not fussy.

### 1. Review queue cleanup

- make flags precise
- reduce noisy or duplicated warnings
- sort by highest-value fixes first

### 2. Fix-next workflow

- give users a clear path to process uncertainty quickly
- category, receipt, allocation, note, support gaps should be easy to clear

### 3. Bulk action support where safe

- bulk recategorize
- bulk mark reviewed
- bulk attach expectations where appropriate

### 4. Strong `why` visibility

- why it was categorized this way
- why it is flagged
- what is blocking export readiness

Exit criteria:

- a user can work through the queue quickly
- review feels like a cleanup assistant, not a punishment layer
- warning states feel justified and useful

## Phase 4: Receipts And Support Integrity

Goal: make proof-handling feel strong and calm.

### 1. Full receipt lifecycle verification

- upload
- OCR
- link
- unlink
- relink
- replace
- keep file without destructive deletion

### 2. Missing-proof workflow

- missing receipts are easy to find
- `Link next receipt` and related actions actually work
- receipt state stays consistent in transactions, receipts, and exports

### 3. Support beyond receipts

- notes
- mileage support
- allocation explanations
- invoice-related evidence where relevant

Exit criteria:

- no dead CTAs
- no destructive workaround required for normal tasks
- support trail stays attached to the books

## Phase 5: Export And CPA Hand-Off Quality

Goal: make the promise real at the handoff layer.

### 1. Export truth audit

- category totals
- tax-line mapping
- support visibility
- unresolved-item visibility
- exclusion logic
- redacted history behavior

### 2. Stronger workpapers

- cleaner PDF and CSV outputs
- explicit blockers and warnings
- clearer `ready vs still needs judgment` communication

### 3. Export consistency

- same source records produce same output logic across pages and packet views
- no hidden fallback behavior that surprises the user

Exit criteria:

- exports match the internal bookkeeping state
- an accountant can see what is ready, what is missing, and what still needs judgment
- no silent contradictions between UI and export packet

## Phase 6: CPA Hand-Off Hardening

Goal: add only the compliance depth that directly strengthens the handoff.

### 1. Depreciation / CCA worksheet

- asset schedule output
- not vague `capital item` handling only

### 2. Vehicle worksheet

- business-use support
- region-appropriate handling
- method context and supporting details

### 3. GST/HST worksheet

- especially for regular vs quick method clarity
- make the output reviewable and explicit

### 4. Home office worksheet

- enough structure to avoid pretending a full deduction engine exists without support

### 5. Payer / information return support later

- only if it materially improves handoff value

Exit criteria:

- judgment-heavy bookkeeping areas are supported by worksheet-grade exports, not just implied by flags

## Phase 7: Product Surface Simplification

Goal: make the app feel sharper without removing its value.

### 1. Keep core surfaces primary

- transactions
- receipts
- invoices
- review
- exports
- categories and accounts where needed

### 2. Demote secondary surfaces

- analytics
- advanced tax helper prominence
- heavy collaboration and admin concepts
- optional side modules

### 3. Simplify settings

- remove or hide fields that imply unsupported behavior
- especially anything that creates accounting-suite expectations without real downstream logic

### 4. Keep copy aligned

- serious bookkeeping
- cleaner books
- stronger CPA hand-off
- no timid language
- no fake full-suite claims

Exit criteria:

- the product feels focused
- navigation and settings reflect the real workflow hierarchy
- users are not misled about scope

## Phase 8: Onboarding, Billing, And Support

Goal: make entry and ongoing use operationally clean.

### 1. Onboarding clarity

- no duplicate billing prompts
- no confusing tier language
- route users into the real core workflow fast

### 2. Support path

- in-app support behavior works
- email fallback is clear
- messages are positioned honestly

### 3. Billing clarity

- Basic vs Pro is understandable
- plan meaning matches product reality
- no scope confusion from tier language

Exit criteria:

- signup and first use feel clean
- support path is dependable
- pricing and plan language fit the actual app

## Phase 9: Launch Readiness

Goal: reach a real stop/go point.

### 1. Functional readiness

- core flow works end to end
- imports are dependable
- receipts are stable
- review is fast
- exports are strong

### 2. Legal and operator consistency

- Mejor Tech LLC operator language is consistent
- public pages, support, and legal identity align

### 3. Marketing readiness

- landing page sells the right promise
- ads point to the right product story
- no undersell, no overclaim

### 4. External sanity check

- one accountant or bookkeeper reviews outputs and wording
- not to certify the app as CPA-approved
- to validate handoff usefulness and obvious mistakes

Exit criteria:

- you can honestly market it as bookkeeping + CPA hand-off software with confidence

## Phase 10: Post-Launch Improvement Loop

Goal: improve from real usage, not speculation.

### 1. Watch failure patterns

- bad mappings
- stalled review states
- missing proof habits
- export confusion
- onboarding drop-off

### 2. Tighten the core weekly

- mapping rules
- review ergonomics
- receipt flow
- export clarity

### 3. Avoid breadth creep

- do not answer every request with a new module
- only expand where the core workflow earns it

Exit criteria:

- improvements are driven by user friction in the main workflow, not random expansion

## Priority Order

If you want the strict sequence:

1. unify transaction status truth
2. unify category policy truth
3. harden live import behavior
4. sharpen review workflow
5. verify receipt and support lifecycle
6. strengthen exports
7. add worksheet-grade CPA hand-off support
8. simplify surface area and settings
9. polish onboarding, billing, and support
10. launch and tighten from real usage

## What We Are Not Doing

- becoming QuickBooks
- building a full accounting suite
- prioritizing enterprise features
- expanding side modules before the core loop is tight

## What Success Looks Like

InEx becomes:

- simpler than a full suite
- more structured than a generic tracker
- strong enough that solo operators keep the books current
- strong enough that a CPA gets a cleaner handoff
- focused enough that the product finally feels inevitable instead of scattered
