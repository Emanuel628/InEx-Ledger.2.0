# Terms of Service Review

Date: 2026-05-20
Scope: Verified review of `In-Ex-Ledger-API/public/html/terms.html` against the current InEx Ledger product and common production SaaS contract structure.
Status: Open. This stays in `Work-To-Do/` because the Terms are improved but still incomplete.

## What This Review Is

- This is a product and drafting readiness review, not legal advice.
- The focus is whether the current Terms are structurally complete enough for a production SaaS handling financial records, OCR-derived data, exports, and third-party integrations.
- This review is based on the current shipped Terms page and current repo features.

## Bottom Line

The current Terms are materially better than before, but they are not complete enough to treat as a finished production-grade ToS.

The strongest remaining gaps are:

- no clear contracting entity
- no explicit software license / IP ownership structure
- billing language that is still too high level
- missing survival and standard contract boilerplate
- thin treatment of user content rights and generated-output reliability

## Verified Items That Are Already Present

These sections exist and do not need to be created from scratch:

- acceptable use restrictions
- account responsibility language
- subscription / renewal / refund language at a high level
- no professional, legal, tax, or accounting advice disclaimer
- warranty disclaimer
- limitation of liability
- indemnity language
- termination language
- governing law / venue language
- baseline third-party services language
- privacy / security / cross-border processing language
- OCR / automated assistance language

## Verified Gaps That Still Need Work

### 1. No actual contracting party is identified

The Terms refer to "InEx Ledger" but do not clearly identify the legal entity the user is contracting with.

What needs to be added:

- legal entity name
- formation jurisdiction if applicable
- business or notice address
- legal notice email if different from support

Why this matters:

- users should know who the counterparty is
- legal notices and enforcement mechanics are weak without it

### 2. No clear license grant to use the service

The current Terms restrict misuse but do not clearly grant the user a limited, revocable, non-transferable right to use the software and site.

What needs to be added:

- a license section granting limited access to the service
- a statement that the license is conditioned on compliance with the Terms
- a statement that access may be suspended or revoked for breach, risk, abuse, or nonpayment

Why this matters:

- the permission model is incomplete without an affirmative license
- this is standard SaaS contract structure

### 3. Ownership boundaries are not defined well enough

The Terms should distinguish between:

- InEx Ledger ownership of the platform, branding, interface, code, and site content
- user ownership of uploaded content and financial records
- the platform rights needed to host, process, export, secure, and transmit user content

What needs to be added:

- an "Ownership; User Content; Feedback" section
- user retains ownership of their own submitted data
- user grants the service the limited rights needed to operate the product
- InEx Ledger retains ownership of the software, templates, branding, and service materials
- optional feedback license for feature suggestions

Why this matters:

- current responsibility language is not the same thing as a usable IP and content-rights framework

### 4. Billing terms are not yet specific enough

The current billing language is directionally correct but still too thin for a subscription product.

What needs to be added:

- when paid billing begins after any trial or promotional period
- what happens after failed payment attempts
- whether access may be downgraded, paused, or terminated for nonpayment
- whether prices may change and how notice is provided
- whether taxes are added where required
- whether plan changes apply immediately, next cycle, or prorated

Why this matters:

- billing disputes usually arise from missing detail, not missing headings

### 5. Generated outputs and integrations need a stronger reliability disclaimer

The Terms already mention AI-assisted text, OCR, and automation, but the product risk profile warrants more explicit language.

What needs to be added:

- OCR extraction may be incomplete, inaccurate, or misclassified
- tax categorization, summaries, mappings, dashboards, exchange-rate references, checklists, and exports may contain errors
- third-party integrations such as banking, billing, email, or geolocation may be unavailable, delayed, or changed by the provider
- users must review records before filing, reporting, or relying on them

Why this matters:

- this product is adjacent to tax and bookkeeping decisions
- the current disclaimer is good, but not yet specific enough to the feature set

### 6. Survival clause is missing

The termination section exists, but it should expressly state which provisions survive termination.

What needs to be added:

- payment obligations
- IP ownership
- user-content license as needed for retention / compliance
- disclaimers
- limitation of liability
- indemnity
- dispute resolution / governing law
- records retention / compliance obligations where applicable

Why this matters:

- this is standard contract hygiene and reduces avoidable interpretation disputes

### 7. Standard contract boilerplate is missing

The current Terms do not appear to include several common general clauses.

What needs to be added:

- severability
- waiver
- entire agreement
- assignment
- force majeure if desired
- interpretation / headings clause if desired

Why this matters:

- these provisions help keep the contract enforceable and administrable when one section is challenged or a business event occurs

### 8. Legal-notice mechanics are weak

The current contact block appears to provide support contact information, but not a stronger notice channel.

What needs to be added:

- legal notice email or dedicated notices address
- clear statement of how users may send formal notices
- optional statement on how InEx Ledger may provide notices to users

Why this matters:

- support and legal notices should not be conflated in a production contract

### 9. Dispute structure should be an intentional policy choice

The current Terms include governing law and forum, which is useful, but the broader dispute framework still looks incomplete.

What needs to be decided and then written clearly:

- court litigation only, or arbitration
- whether there will be a class-action waiver
- whether there will be a claim-filing limitation period
- whether injunctive relief carveouts are needed for IP misuse, abuse, or security threats

Why this matters:

- this is less about adding boilerplate mechanically and more about making an explicit policy decision

## What Does Not Need Immediate Rework

Based on the current Terms structure, these areas do not look like the highest-priority drafting gaps:

- the existence of a professional-advice disclaimer
- the existence of a warranty disclaimer
- the existence of a limitation-of-liability section
- the existence of an indemnity section
- the existence of termination language
- the existence of governing law / venue language
- the existence of third-party service disclosures at a baseline level

These sections may still need refinement, but they are not the clearest missing pieces.

## Recommended Implementation Order

1. Add the contracting entity and legal-notice details.
2. Add a license / ownership / user-content framework.
3. Expand billing terms for trial conversion, failed payments, taxes, and price changes.
4. Strengthen generated-output and integration-reliability disclaimers.
5. Add survival and general boilerplate clauses.
6. Make an explicit decision on arbitration / class waiver / court-only dispute handling.

## Completion Standard

This file can move out of `Work-To-Do/` only when:

- `terms.html` includes the missing sections above
- the contracting party and notice details are confirmed with real business information
- the billing language matches actual product behavior
- dispute-handling choices are intentional and documented
- the resulting Terms are reviewed for consistency with the Privacy Policy and current product features
