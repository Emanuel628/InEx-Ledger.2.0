# InEx Ledger — Breach Notification & Incident Response Runbook

**Document type:** Operational Runbook  
**Effective date:** April 2026  
**Owner:** InEx Ledger Privacy Officer (`privacy@inexledger.com`)  
**Referenced by:** Privacy Policy · PIA · SECURITY_PLAN.md

---

## 1. Purpose

This runbook describes the procedures for detecting, containing, investigating, and reporting
personal-information security incidents for InEx Ledger. It operationalises the 72-hour breach
notification requirement under **PIPEDA**, **Quebec Law 25 (Loi 25)**, and comparable U.S. state
privacy laws.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **Security incident** | Any event that compromises the confidentiality, integrity, or availability of personal information |
| **Breach of security safeguards** | An incident that creates a real risk of significant harm to an individual |
| **72-hour clock** | Starts when InEx Ledger becomes aware of a breach that meets the reporting threshold |
| **Privacy Officer** | `privacy@inexledger.com` — person responsible under Quebec Law 25 |

---

## 3. Incident Response Phases

### Phase 1 — Detection & Triage (0–4 hours)

1. Any team member who suspects or confirms an incident must **immediately** notify the Privacy
   Officer at `privacy@inexledger.com` with subject line:
   `[INCIDENT] YYYY-MM-DD — Brief description`.
2. Privacy Officer creates an incident record (see §6 below) and assigns a severity level.
3. Determine whether personal information was involved.

**Severity levels:**

| Level | Criteria |
|---|---|
| P0 — Critical | Confirmed exfiltration of personal data; active attack in progress |
| P1 — High | Probable exposure of personal data; credentials compromised |
| P2 — Medium | Potential exposure, investigation required; no confirmed harm |
| P3 — Low | Security event with no apparent personal-data impact |

---

### Phase 2 — Containment (0–24 hours)

- Revoke compromised credentials or tokens via Railway.app dashboard.
- Force-expire active sessions for affected users (call `DELETE /api/sessions/all` internally or
  via the Railway admin console).
- Block suspicious IPs at the network layer if applicable.
- Preserve all logs before any remediation that could alter them.
- Notify infrastructure provider (Railway.app) if their platform is implicated.

---

### Phase 3 — Assessment (0–48 hours)

Determine:

1. **What personal information was involved** (categories, approximate number of records,
   approximate number of individuals).
2. **How the incident occurred** (root-cause hypothesis).
3. **Whether a real risk of significant harm exists** to individuals (identity theft, financial
   harm, reputational harm, physical harm, humiliation).
4. **Regulatory reporting threshold**: Does this meet the threshold under PIPEDA / Quebec Law 25?

---

### Phase 4 — Notification (within 72 hours of awareness)

#### 4a. Regulatory notification (PIPEDA / Quebec Law 25)

If the incident poses a real risk of significant harm:

| Regulator | Contact |
|---|---|
| **OPC (Canada — PIPEDA)** | [Report a breach — priv.gc.ca](https://www.priv.gc.ca/en/report-a-concern/report-a-privacy-breach-as-an-organization/) |
| **CAI (Quebec — Law 25)** | [cai.gouv.qc.ca](https://www.cai.gouv.qc.ca) — use the incident declaration form |

**Required information for OPC/CAI report:**
- Description of the incident
- Date / time range
- Categories and number of records involved
- Approximate number of individuals affected
- Containment measures taken
- Harm-risk assessment
- Contact details for Privacy Officer

**Deadline:** Within **72 hours** of becoming aware of the breach (OPC / CAI).

---

#### 4b. Individual notification

If a real risk of significant harm exists for specific individuals, notify them **as soon as
reasonably possible** after the regulatory report.

**Notification must include:**
- Description of what happened
- Categories of personal information involved
- Steps InEx Ledger has taken to mitigate
- Steps the individual can take to protect themselves
- Contact for questions: `privacy@inexledger.com`

**Notification channel:** Email to the affected user's registered address, plus an in-app banner
if the user is still active.

---

#### 4c. Notification template (email)

```
Subject: Important security notice from InEx Ledger

Dear [User],

We are writing to inform you of a security incident affecting InEx Ledger that may have
involved your personal information.

WHAT HAPPENED
[Brief factual description — date range, how discovered]

WHAT INFORMATION WAS INVOLVED
[Categories of data: e.g., email address, session tokens]

WHAT WE ARE DOING
[Containment actions, remediation steps, monitoring]

WHAT YOU CAN DO
- Change your InEx Ledger password immediately at: https://inexledger.com/forgot-password
- Enable Multi-Factor Authentication (MFA) in Settings > Security.
- Review your account activity in Settings > Sessions and revoke any unrecognised sessions.
- Be cautious of phishing emails that reference InEx Ledger.

CONTACT US
If you have questions, contact our Privacy Officer at privacy@inexledger.com.
Reference incident number: [INCIDENT-YYYYMMDD-NNN]

InEx Ledger Privacy Team
```

---

### Phase 5 — Remediation & Post-Incident Review (within 30 days)

1. Fix the root cause.
2. Update security controls as needed.
3. Document lessons learned.
4. Update this runbook and SECURITY_PLAN.md if procedures changed.
5. File internal incident record (see §6) with final status.

---

## 5. Internal Incident Record Template

```
Incident ID:        INCIDENT-YYYYMMDD-NNN
Date detected:      YYYY-MM-DD HH:MM UTC
Detected by:        [person or system]
Description:        [brief summary]
Severity:           P0 / P1 / P2 / P3
Personal info involved: Yes / No / Unknown
Categories of data: [list]
Records affected:   [count or range]
Individuals affected: [count or range]
Harm risk:          Real risk / No real risk / Under assessment
Containment steps:  [list with timestamps]
OPC reported:       Yes / No / N/A — Date: YYYY-MM-DD
CAI reported:       Yes / No / N/A — Date: YYYY-MM-DD
Individuals notified: Yes / No / N/A — Date: YYYY-MM-DD
Root cause:         [description]
Remediation:        [description]
Status:             Open / Closed
Closed date:        YYYY-MM-DD
```

---

## 6. Contact Directory

| Role | Contact |
|---|---|
| Privacy Officer | privacy@inexledger.com |
| Infrastructure (Railway.app) | [Railway support](https://railway.app/help) |
| OPC (PIPEDA breaches) | priv.gc.ca |
| CAI (Quebec Law 25 breaches) | cai.gouv.qc.ca |

---

## 7. Revision History

| Date | Change | Author |
|---|---|---|
| April 2026 | Initial version | InEx Ledger Privacy Officer |
