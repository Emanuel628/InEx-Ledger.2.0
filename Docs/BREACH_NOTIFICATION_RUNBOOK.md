# InEx Ledger Breach Notification and Incident Response Runbook

Document type: Operational runbook
Effective date: 2026-05-20
Owner contact: privacy@inexledger.com
Referenced by: `Docs/PIA.md`, `Docs/SECURITY_PLAN.md`, public privacy policy

## 1. Purpose

This runbook describes how InEx Ledger should detect, contain, investigate, document, and report confidentiality or security incidents affecting personal information.

This runbook is designed to:

- support PIPEDA breach handling
- support Quebec confidentiality-incident handling
- support U.S. state-law breach execution

This runbook does not assume a fixed 72-hour Quebec deadline. Quebec handling should be prompt and threshold-based under the current statute and regulation.

## 2. Definitions

| Term | Meaning |
|---|---|
| Security incident | Any event that may compromise confidentiality, integrity, or availability |
| Breach of security safeguards | A reportable incident under PIPEDA when it creates a real risk of significant harm |
| Confidentiality incident | A Quebec concept covering unauthorized access, use, disclosure, loss, or other compromise |
| Incident register | The maintained record of all confidentiality/security incidents, whether reportable or not |

## 3. Immediate Response Phases

### Phase 1: Detection and triage

1. Notify the incident owner immediately at `privacy@inexledger.com`.
2. Open a new entry in `Docs/CONFIDENTIALITY_INCIDENT_REGISTER.md` or its operational successor.
3. Classify the incident:
   - P0 critical
   - P1 high
   - P2 medium
   - P3 low
4. Preserve relevant logs, request traces, export records, and receipt-storage evidence.

### Phase 2: Containment

- revoke exposed sessions or credentials
- disable affected flows if necessary
- preserve evidence before destructive cleanup
- involve Railway, Stripe, Plaid, Resend, or other implicated vendors where required

### Phase 3: Assessment

Determine:

- what data was involved
- how many people or records may be affected
- whether the data was encrypted, redacted, or otherwise protected
- whether harm thresholds are likely met
- whether any regulator or individual notice is required

## 4. Canada and Quebec Handling

### 4.1 PIPEDA

When a breach of security safeguards creates a real risk of significant harm:

- notify the Office of the Privacy Commissioner of Canada as soon as feasible
- notify affected individuals as soon as feasible
- keep breach records for the required retention period

Official reporting page:

- https://www.priv.gc.ca/en/report-a-concern/report-a-privacy-breach-as-an-organization/

### 4.2 Quebec Law 25

When a confidentiality incident presents a risk of serious injury:

- notify the Commission d'acces a l'information promptly
- notify affected individuals promptly unless an exception applies
- record the incident in the incident register

Official authority:

- https://www.cai.gouv.qc.ca

Register requirement:

- retain the register for at least 5 years from the date the enterprise becomes aware of the incident

## 5. United States Handling

U.S. breach handling is state-law specific. Do not rely on a generic "prompt notice" assumption for all residents.

### 5.1 Minimum U.S. operating rule

For any incident that affects U.S. residents:

1. identify the resident states involved
2. determine whether any state regulator notice is required
3. determine whether a specific resident notice deadline applies
4. document the result in the incident register

### 5.2 Baseline state matrix

This matrix is intentionally narrow until expanded state-by-state.

| State | Baseline note | Source status |
|---|---|---|
| California | Civil Code 1798.82 includes a 30-calendar-day notice rule, subject to listed delays and exceptions | verified |
| All other states | Check the current state statute before sending notices or concluding no regulator notice is needed | required operational step |

Required follow-up:

- expand this table to cover every state where users may reside before public scale-up

## 6. Notice Content Checklist

Include at least:

- what happened
- when it happened or was discovered
- categories of information involved
- what InEx Ledger has done
- what users should do
- how to contact InEx Ledger

## 7. Incident Register

Use `Docs/CONFIDENTIALITY_INCIDENT_REGISTER.md` as the maintained register template unless an operationally controlled system replaces it.

Minimum fields:

- incident ID
- date detected
- detection source
- systems affected
- data categories affected
- jurisdictions implicated
- harm-threshold assessment
- whether notices were sent
- remediation status

## 8. Post-Incident Review

After containment and any required notices:

- confirm the root cause
- patch the system
- update docs if claims or controls changed
- capture lessons learned
- close the register entry only when remediation is complete

## 9. Review History

| Date | Change |
|---|---|
| 2026-05-20 | Rewritten to remove incorrect fixed Quebec 72-hour language, add state-specific U.S. handling baseline, and add incident-register maintenance requirements |
