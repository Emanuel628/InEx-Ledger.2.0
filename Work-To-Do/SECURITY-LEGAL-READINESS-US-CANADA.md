# Security & Legal Readiness — US + Canada

**Date:** 2026-05-20
**Scope:** Security/privacy law readiness review for InEx Ledger (bookkeeping SaaS, US + Canada users).
**Method:** Code inventory of `In-Ex-Ledger-API`, review of privacy policy / terms / in-app security settings / `Docs` (PIA, Security Plan, Breach Runbook), plus legal research.
**Overall readiness:** ~75–80%. Not "all fine" — concrete, fixable gaps exist. Remaining work is mostly documentation accuracy, sub-processor disclosure, and a few encryption fixes — not a security rebuild.

---

## Disclaimer & Framing

- This is an **engineering + research review, not legal advice.** A privacy lawyer must review the privacy policy and terms before "ready" can be claimed.
- **There is no single "security law."** Both countries use a patchwork: breach-notification statutes, "reasonable safeguards" duties, financial-data rules, and comprehensive privacy laws — each with different applicability triggers.
- **Thresholds matter.** Most US *comprehensive* privacy laws (CCPA + ~19 others) only apply at scale (~100k consumers or $25M revenue) — likely not triggered yet. But the following apply **regardless of size, today**:
  - **US:** FTC Act §5; 50-state + DC breach-notification laws.
  - **Canada:** PIPEDA; Quebec Law 25.
  - **FTC Safeguards Rule (GLBA):** genuinely ambiguous for a pure software vendor — position must be resolved (see US item 3).

---

# PART 1 — UNITED STATES

## ✅ What I Have (US)

- [x] Encryption in transit — TLS, HSTS (1yr, includeSubDomains, preload; production)
- [x] Encryption at rest — AES-256-GCM, correctly implemented (`encryptionService.js`) — **but coverage is inconsistent** (see gaps)
- [x] MFA available — email OTP
- [x] Access controls — least privilege, multi-tenant `business_id` scoping on every query
- [x] Strong password handling — bcrypt cost 12, brute-force lockout (5 attempts / 15 min)
- [x] Audit logging — tamper-evident, DB-enforced append-only
- [x] PCI — card data fully offloaded to Stripe (PCI SAQ A scope); card data never touches our servers
- [x] Written security program / PIA exists — `Docs/SECURITY_PLAN.md`, `Docs/PIA.md` (**stale — see gaps**)
- [x] Breach response runbook exists — `Docs/BREACH_NOTIFICATION_RUNBOOK.md` (**thin on US — see gaps**)
- [x] Public privacy policy — discloses no-sale, cross-border processing, user rights
- [x] Data subject rights — `/api/privacy/export` + `/erase` (exceeds requirements at current size)

> Technical controls broadly meet the "reasonable safeguards" standard under the **NY SHIELD Act**, **Massachusetts 201 CMR 17.00**, and the **FTC Safeguards Rule technical baseline**.

## ❌ What Has To Be Done (US)

- [ ] **1. Fix stale/overstated documentation (#1 legal exposure).** PIA & Security Plan reference features that do not exist in code: CPA-portfolio access (`cpa_access_grants`, `/api/cpa-access/*`, "MFA mandatory for CPA accounts"), `accounts.account_number_encrypted` (column exists, never used), `express-validator` (not a dependency). Under **FTC Act §5, "deceptive" = the gap between claims and reality.** Make docs exactly match code.
- [ ] **2. Build US breach-notification readiness.** Runbook treats US as "comparable state laws." Reality: all 50 states + DC have distinct rules — California now requires individual notice within **30 days** (SB 446, 2026); **36 states** require **state Attorney General** notification; deadlines range 30–60 days; substitute-notice thresholds and credit-monitoring expectations vary. Build a **50-state AG-notification matrix + contacts + deadlines** into the runbook.
- [ ] **3. Resolve FTC Safeguards Rule (GLBA) position.** Whether a pure bookkeeping *software vendor* is a "financial institution" is debatable, but (a) if any customers are bookkeepers/accountants you are a *service provider to* financial institutions and inherit contractual safeguard duties, and (b) the Safeguards baseline is the de facto standard. If it applies, add: **named "Qualified Individual,"** **annual penetration testing + biannual vulnerability scans**, documented **employee security training**, **annual written report**.
- [ ] **4. Produce a formal WISP (MA 201 CMR 17.00).** Security Plan is close but missing required administrative elements: **named coordinator**, documented **employee training + disciplinary measures**, documented **service-provider contractual oversight**, **scheduled annual review**.
- [ ] **5. Publish sub-processor list + confirm DPAs.** Personal data flows to **Anthropic** (receipt OCR), **ipapi.co** (IP geolocation), **Plaid**, **Resend**, **Stripe**, **Railway**. Publish the list; confirm a Data Processing Agreement is in place with each.
- [ ] **6. Add retention specifics to the public privacy policy.** PIA has concrete periods (7 years); public policy is vague. Move specifics into the public document.
- [ ] **7. Plan CCPA/CPRA-format disclosures** (categories of PI, notice at collection, "Do Not Sell/Share"). Not required *now* by threshold — required as the user base grows.

---

# PART 2 — CANADA

> This is the **stronger** side. The app was visibly built with PIPEDA and Quebec Law 25 in mind.

## ✅ What I Have (Canada)

- [x] Privacy Impact Assessment exists — `Docs/PIA.md`, `Docs/SECURITY_PLAN.md` (Law 25 requires one) — **stale & incomplete (see gaps)**
- [x] Privacy Officer designated + contact published — `privacy@inexledger.com`
- [x] 72-hour breach notification process — `Docs/BREACH_NOTIFICATION_RUNBOOK.md` (genuinely good for PIPEDA / Law 25)
- [x] Privacy by Default for Quebec residents — **actually coded** (QC users default to data-sharing opt-out; analytics opt-in = false)
- [x] Consent tracking — `privacy_consent_log` with timestamp, IP, user-agent
- [x] Cookie consent — `consent.routes.js`, `cookie_consent_log`
- [x] Right of access / portability — `/api/privacy/export` machine-readable JSON (satisfies Law 25 portability)
- [x] Right to erasure / rectification — `/api/privacy/erase`, profile/business updates
- [x] Cross-border transfer disclosure — privacy policy discloses US processing (**PIA assessment incomplete — see gaps**)
- [x] Regulator complaint contacts published — OPC (Canada) + CAI (Quebec)
- [x] Safeguards — encryption, access control, logging (**inconsistent — see gaps**)

## ❌ What Has To Be Done (Canada)

- [ ] **1. Encrypt the GST/HST number.** `businesses.gst_hst_number` is written/read in **plaintext**, while `tax_id` (EIN/BN/SIN) is correctly AES-256-GCM encrypted. PIPEDA's safeguards principle requires protection proportional to sensitivity. Encrypt it or stop claiming "all sensitive fields encrypted."
- [ ] **2. Update + complete the PIA.** Same stale content as US item 1. Critically, the cross-border section **only assesses Railway (US East)** — it omits **Anthropic** (receipt OCR — receipts contain names/addresses), **Plaid**, **Resend**, **ipapi.co**. Law 25 requires a PIA assessment for **each** transfer of personal information outside Quebec.
- [ ] **3. Stand up a confidentiality incident register.** Law 25 requires a register of **all** confidentiality incidents (not just reportable ones), retained **5 years**; PIPEDA requires breach records **24 months**. Runbook has a template but no standing register; unclear non-reportable incidents are logged.
- [ ] **4. Identify a named Privacy Officer internally.** "InEx Ledger Privacy Team" is acceptable publicly, but Law 25 expects the responsible **individual** to be identifiable (defaults to highest-ranking person absent written delegation).
- [ ] **5. Encrypt receipts and the transaction `note` field at rest.** Both can contain PII of Canadian users; receipts are stored unencrypted (disk or DB BYTEA); `note` is plaintext and is even searched in plaintext.
- [ ] **6. Disclose AI / automated processing.** Tax-estimate cockpit, CSV auto-categorization, and AI receipt OCR. Likely not "decisions based solely on automated processing" in the strict Law 25 sense, but the **AI OCR data flow (receipts sent to a third party) must be explicitly disclosed and consented.**
- [ ] **7. Confirm CASL compliance for marketing email.** `marketing_email_opt_in` flag exists (opt-in is correct). Confirm any marketing email carries a compliant unsubscribe + sender identification.

---

# PART 3 — Cross-Cutting Technical Security Gaps

> Applies to both countries. Prioritized by legal materiality. (Consolidated from the full code inventory — 15 flags.)

## Higher priority

- [ ] **Inconsistent encryption at rest** — GST/HST number plaintext; transaction `note` plaintext; receipts unencrypted (disk or DB BYTEA); `accounts.account_number_encrypted` column provisioned but **never used**. Either encrypt these or stop claiming "all sensitive fields encrypted."
- [ ] **Stale PIA / Security Plan / privacy representations** — FTC §5 deception risk + Law 25 PIA-accuracy requirement.
- [ ] **Rate limiting fails *soft* in production** — if Redis is unavailable it silently falls back to a per-instance in-memory store; across multiple instances this materially weakens IP brute-force protection.
- [ ] **No automated breach detection / alerting** — detection is manual; this lengthens the 72-hour clock.

## Medium priority

- [ ] **Hand-rolled JWT** — correctly implemented (timing-safe compare, no algorithm-confusion vuln), but no library, no `iss`/`aud` claims, and **no access-token revocation/denylist** — a stolen access token is valid up to 15 minutes.
- [ ] **CSRF protection is opt-in per route**, not globally applied — depends on each router remembering to attach `requireCsrfProtection`; no app-level enforcement.
- [ ] **Cookie `Secure` flag gated on `NODE_ENV==='production'`** — any non-production deployment serves auth cookies without the Secure flag.
- [ ] **`.env.example` ships `DB_SSL_REJECT_UNAUTHORIZED=false`** (also the non-prod default) — dangerous if copied into a production `.env`.
- [ ] **CSV exports not protected against formula/CSV injection** (`=`, `+`, `-`, `@` cell prefixes).
- [ ] **File upload validation has no magic-byte/content sniffing** — a file with a spoofed Content-Type matching its extension passes.
- [ ] **Log sanitizer is denylist-based** — a sensitive value under an unlisted key name is not redacted.
- [ ] **Field-encryption key management** — single static env var (`FIELD_ENCRYPTION_KEY`); no KMS, no rotation, no key versioning beyond a `v1` prefix, no per-tenant keys.

## Lower priority

- [ ] **Global MFA-trust cookie bound only to a User-Agent hash** — weak device binding.
- [ ] **Audit-table immutability depends on the app DB role not owning the tables / not being superuser** — not enforceable from application code.

---

# What's Already Done Well (for balance)

- DB-enforced **append-only audit immutability** (`ON UPDATE/DELETE DO INSTEAD NOTHING`).
- **Privacy-by-default for Quebec actually coded**, not just promised.
- Correct **AES-256-GCM** (random 96-bit IV, 128-bit auth tag, fail-closed for transaction descriptions).
- All tokens (password reset / refresh / MFA) **hashed at rest**; reset token kept in URL fragment so it never reaches server logs.
- **Strict CSP** (`script-src 'self'`, no `unsafe-inline`), full Helmet, CSRF double-submit with HMAC.
- **100% parameterized SQL** — no string-concatenated queries.
- Card data fully offloaded to **Stripe**.
- ~25 security-specific test files.
- A real **breach runbook** with a working 72-hour process.

---

# Verdict — Are We Security-Ready?

**No — it is not "all fine, nothing missing." But the position is not bad either.**

- **Technical security is above average** for an indie SaaS and broadly meets "reasonable safeguards" under PIPEDA, NY SHIELD Act, MA 201 CMR 17, and the FTC Safeguards baseline.
- **Canada / Quebec: good shape** — better than most startups. Real gaps: plaintext GST/HST number, stale/incomplete PIA (missing sub-processors), missing incident register.
- **United States: breach-notification readiness is the weakest live obligation** — the runbook barely addresses the 50-state reality.
- **Single biggest exposure is not code — it is that the written documents claim more than the code delivers.** Under FTC §5 that gap *is* the violation; under Law 25 the PIA must be accurate.

**Readiness: ~75–80%.** The remaining 20–25% is mostly **paperwork accuracy, sub-processor disclosure, and a handful of encryption fixes** — not a security rebuild.

## Top 5 Fastest, Highest-Value Moves

1. [ ] Make the PIA / Security Plan / privacy policy **exactly match the code**.
2. [ ] **Encrypt GST/HST number + transaction notes + receipts** (or stop claiming you do).
3. [ ] Build the **US breach-notification matrix** and a **Law 25 confidentiality incident register**.
4. [ ] Publish a **sub-processor list** and confirm **DPAs** with all of them.
5. [ ] Have a **privacy lawyer** review the privacy policy and terms before launch.

---

# Appendix — Legal Sources

- 20 State Privacy Laws in Effect in 2026 — MultiState
- Data Breach Notification Laws: A 50-State Survey (2026 Edition) — Privacy Rights Clearinghouse
- Key Breach Notification Updates in California and Oklahoma for 2026 — Alston & Bird
- State Data Breach Notification Laws — Foley & Lardner
- FTC Safeguards Rule — Federal Trade Commission; 16 CFR Part 314
- 201 CMR 17.00: Standards for the Protection of Personal Information of MA Residents — Mass.gov
- Data Breach Notification Laws Canada 2026: PIPEDA Requirements & Provincial Rules
- Quebec's Law 25 — OneTrust; BigID
- Privacy, data protection, and cybersecurity laws in Canada — Miller Thomson
