# Sub-Processors and Service Providers

Last reviewed: 2026-05-20
Contact: privacy@inexledger.com

This document lists the third-party processors and service providers visible from the current repository and public product flows.

This is a technical inventory, not a contract-status ledger. It does not by itself confirm DPA execution.

| Provider | Purpose | Data categories involved | Notes |
|---|---|---|---|
| Railway | Hosting, application runtime, database, storage infrastructure | account data, business data, receipts, logs, exports | Primary infrastructure provider |
| Stripe | Billing, subscriptions, customer portal, invoice/payment metadata | billing identifiers, subscription state, payment-related metadata | Card processing is offloaded to Stripe |
| Resend | Transactional email delivery | email address, message metadata, email content | Used for auth and lifecycle emails |
| Plaid | Bank-linking and transaction import features when enabled | bank-link tokens, institution metadata, transaction import data | Feature-gated by configuration |
| Anthropic | Receipt OCR when enabled | receipt images and extracted receipt fields | Used only when `ANTHROPIC_API_KEY` is configured |
| ipapi.co or configured approved host | Sign-in geolocation lookups | IP address lookup data | Controlled by `GEOLOCATION_API_URL` and approved host allowlist |

Operational follow-up required outside the repo:

- confirm which processors are enabled in production
- confirm DPA / contractual status with each enabled processor
- keep public privacy disclosures aligned with this inventory
