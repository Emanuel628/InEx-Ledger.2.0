# Programming Quality Research - 2026-08-09

Purpose:

- Build a practical rubric for identifying professional, human-maintained code versus AI-slop, overengineered, brittle, or unprofessional code.
- Use credible external references and mature codebase practices.
- Convert research into review criteria that can be applied back to InEx Ledger.

## Sources Started

Primary/credible sources reviewed in this first tranche:

- Google Engineering Practices - Code Review Standard: https://google.github.io/eng-practices/review/reviewer/standard.html
- Software Engineering at Google, Code Review chapter: https://abseil.io/resources/swe-book/html/ch09.html
- Linux kernel coding style: https://docs.kernel.org/process/coding-style.html
- React docs, Keeping Components Pure: https://react.dev/learn/keeping-components-pure
- Google SRE, Eliminating Toil: https://sre.google/sre-book/eliminating-toil/
- Google SRE, Simplicity: https://sre.google/sre-book/simplicity/
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- PostgreSQL Coding Conventions: https://www.postgresql.org/docs/current/source.html
- Martin Fowler, Refactoring: https://martinfowler.com/books/refactoring.html

## Early Research Conclusions

### Professional Code Optimizes For Long-Term Code Health

Google's code review standard frames the purpose of review as improving code health over time. The important part is not perfection; it is whether each change leaves the system more maintainable, understandable, and consistent than before.

Implication for our audits:

- A change can work today and still be bad if it creates future ambiguity.
- "It passes" is not enough.
- The question is: will the next competent developer understand, test, operate, and safely change this?

Signals of real professional code:

- Small, reviewable changes.
- Clear ownership boundaries.
- Consistent local style.
- Behavior tests where behavior matters.
- Comments explain why, not obvious mechanics.
- Error handling and logging follow shared contracts.

Signals of slop:

- Patch-shaped code that solves only the visible symptom.
- Code that adds a new local pattern instead of using the existing one.
- Duplicate implementations with tiny behavioral differences.
- Tests that assert formatting/source shape instead of product behavior.
- Docs claiming completeness while checks are failing.

### Human-Maintained Code Is Usually Boring In The Right Places

Linux kernel guidance is direct: functions should be short, do one thing, and avoid excessive local state. Mature systems usually prefer boring, readable control flow over cleverness.

Implication for our audits:

- Boring is good when it makes behavior obvious.
- Cleverness must earn its place with performance, safety, or real simplification.
- Big functions are not automatically bad, but big functions with high branching, many locals, hidden side effects, and mixed responsibilities are a strong smell.

Signals of professional code:

- Functions with a single job.
- Data normalization separated from IO.
- Domain decisions named explicitly.
- Complex conditionals extracted into named helpers.
- Hot paths optimized only after correctness and clarity are protected.

Signals of overengineering:

- Abstractions that hide simple behavior.
- Multiple layers that do not reduce duplicated decisions.
- Generic frameworks around one or two call sites.
- "Future-proofing" without current product need.
- Highly configurable code where the valid configuration space is actually small.

### Efficient Code Is Not Just Fast Code

Efficiency has several layers:

- Runtime efficiency: fewer unnecessary queries, smaller bundles, less polling, less repeated work.
- Cognitive efficiency: code can be read quickly without holding too many facts in memory.
- Operational efficiency: failures are diagnosable, repeatable tasks are automated, deployment is reproducible.
- Change efficiency: tests and structure make safe edits cheap.

Google SRE's toil model is useful here: manual, repetitive, automatable, low-enduring-value work is a smell. A codebase that requires constant manual cleanup, manual verification, or manual state repair is inefficient even if individual functions are fast.

Implication for our audits:

- A codebase with failing gates, manual migrations, and stale docs is inefficient.
- A codebase with huge files and duplicated patterns is cognitively inefficient.
- A codebase with direct production scripts and unclear runtime artifacts is operationally inefficient.

### React Code Should Keep Rendering Pure

React's current docs emphasize that components should behave like pure functions: same inputs, same output, and no mutation of external objects during render.

Implication for V3 review:

- Components should render from props/state/context.
- API calls and side effects belong in event handlers or effects.
- DOM mutation after React render should be treated as suspicious unless tightly contained.
- Large pages that own fetching, transformation, modal state, business rules, formatting, and navigation are controller components and should be split carefully.

Signals of professional React code:

- Small reusable components around real UI concepts.
- API/data logic in hooks or client modules.
- Controlled side effects.
- Minimal persistent browser state.
- Accessibility behavior built into components, not scattered afterthoughts.

Signals of slop:

- Pages that become giant procedural scripts.
- DOM mutation layered over React.
- Hard reloads instead of state updates where SPA behavior is expected.
- Repeated modal/body scroll/focus management.
- Presentation-only gates that do not map cleanly to backend contracts.

### Secure Code Makes Unsafe States Unrepresentable Or Hard To Reach

OWASP guidance keeps coming back to validation, generic client-facing errors, avoiding leaked internals, and structured/auditable security events.

Implication for our audits:

- Validation should happen at boundaries and use allowlists for structured input.
- Server-side authorization must not depend on client presentation gates.
- Error messages to clients should be stable and non-leaky.
- Logs should help defenders without dumping sensitive raw state.
- Security-sensitive workflows need durable audit trails and tests.

Signals of professional code:

- Input validation is centralized or consistently structured.
- Authorization and tenancy checks happen near data access.
- DB constraints enforce critical invariants.
- Errors have stable codes and sanitized messages.
- Side effects are required, compensating, or explicitly best-effort.

Signals of slop:

- Shared secrets standing in for identity.
- Route-local ad hoc validation everywhere.
- Cross-tenant safety depending on duplicated app checks.
- Catch blocks that swallow important failures.
- Internal stacks/raw errors in logs.

## Working Rubric For Future Review

Use these questions when judging any file:

1. Does this file have one clear reason to exist?
2. Can a competent developer understand the main flow in one reading?
3. Are business rules named and centralized, or copied locally?
4. Are inputs validated before use?
5. Are errors shaped, logged, and tested consistently?
6. Is behavior protected by tests that would catch a real regression?
7. Does the code follow the repo's current truth, especially V3 as frontend truth?
8. Does it avoid unnecessary configuration, abstraction, and future-proofing?
9. Does it make operational failure visible and recoverable?
10. Would deleting or changing this code have an obvious blast radius?

## Research Status

This is the first research tranche, not the end of the research.

Next areas to study:

- Real-world Node/Express service structure and error handling.
- Mature React app architecture and component boundaries.
- Database-backed SaaS multi-tenant patterns.
- Open-source examples of clean integration/webhook idempotency.
- Practical performance engineering for web apps and APIs.
- Examples of high-quality tests versus brittle tests.

## Review Of This File As A Remediation Source Of Truth

This file is suitable as the quality standard for removing AI-slop, overengineering, and unprofessional code, but only after translating the principles into an execution order. The research is strongest where it ties maintainability, simplicity, security boundaries, operational safety, and React purity to concrete review questions. That maps directly to the findings in `CODEBASE-100PCT-AUDIT-2026-08-09.md`.

The main gap is that research by itself is too abstract. It must not become a license for a broad rewrite. The remediation work needs strict ordering, small scopes, repeatable tests, and explicit anti-goals. The safest approach is to first make the codebase harder to damage, then repair security/runtime contracts, then simplify the messy areas with tests around the existing behavior.

Use this rule throughout remediation:

- Fix the system in the order that reduces future regression risk fastest.
- Prefer deleting stale paths over wiring them back in.
- Prefer tests around behavior over tests around source formatting.
- Prefer small local simplification over new architecture.
- Treat V3 as frontend truth. Archived legacy frontend remains reference-only.

## Ordered Remediation Strategy

### Phase 0 - Safety Rules Before Any Fix

Goal: make sure cleanup work does not damage the product.

Actions:

- Work in small, reviewable branches or commits.
- Do not wire archived legacy frontend into runtime paths.
- Do not manually edit generated bundles or migration history.
- Do not combine unrelated cleanup with behavior changes.
- For every fix, record the audit finding it addresses.
- Before changing behavior, capture the current behavior with a focused test or a clear manual verification note.

Definition of done:

- The scope is named.
- The rollback path is obvious.
- No unrelated files are changed.
- Relevant lint/type/test commands are run or explicitly blocked.

### Phase 1 - Stop New Damage: Gates, Secrets, And Repo Hygiene

Goal: make the project stop accepting broken, insecure, or stale work.

Why first:

- Cleanup is inefficient if failing tests, weak secret scanning, and incomplete CI allow the same problems to return.
- This phase reduces future review cost immediately.

Actions:

- Fix `npm run test:all` so the repo has a trustworthy baseline.
- Replace brittle source-shape tests with behavior tests where practical.
- Remove tracked E2E/session artifacts containing cookies, refresh tokens, JWT-shaped tokens, passwords, or browser state.
- Tighten `.gitleaks.toml`; do not broadly allowlist all tests/docs/scripts.
- Add or verify ignores for runtime/browser/session artifacts.
- Add CI coverage for V3 lint, V3 TypeScript, V3 i18n check, V3 build, backend audit, frontend audit, and pdf-worker audit.
- Resolve or explicitly ticket the high dependency audit findings.

Definition of done:

- Clean repo status except intentional audit/planning files.
- Secret scan is meaningful.
- CI catches the checks we already run locally.
- `test:all` either passes or has documented, intentionally skipped integration prerequisites.

### Phase 2 - Security Contract Cleanup

Goal: remove ambiguous authentication and authorization behavior.

Why now:

- Security contracts are product boundaries. Refactoring around unclear auth creates risk.

Actions:

- Decide and enforce the V3 cookie-auth contract.
- Remove Bearer-token acceptance from normal app auth paths unless there is a documented external API requirement.
- Replace or harden internal support shared-secret access with identity/role-based authorization.
- Add CSRF/origin tests for representative mutating API routes and allowed webhook exceptions.
- Confirm MFA/signup transient tokens are short-lived, single-purpose, and aggressively cleared.
- Add a V3 check that persistent auth tokens are not stored in browser storage.
- Sanitize route-local error/log paths that could expose raw internals.

Definition of done:

- Auth behavior is documented in one place.
- Tests prove accepted and rejected auth modes.
- Browser storage contains no long-lived access credentials.

### Phase 3 - Startup, Deployment, And Migration Safety

Goal: make production startup deterministic and non-mutating unless explicitly requested.

Why now:

- Operational damage is high-impact. Startup should not silently repair or mutate migration metadata.

Actions:

- Remove checksum repair writes from `prestart`.
- Ensure the server does not listen before database initialization/migration readiness is known.
- Split read-only migration verification from explicit repair commands.
- Add environment validation for required production settings.
- Reconcile Docker/Nixpacks/start scripts so they tell one deployment story.
- Use reproducible install commands in deployment/CI where lockfiles exist.

Definition of done:

- Startup cannot silently rewrite migration metadata.
- Failed DB readiness fails deployment visibly.
- Local, CI, and production start commands are consistent.

### Phase 4 - API Error And Response Consistency

Goal: remove ad hoc route behavior and make failures predictable.

Why now:

- Once security and startup are stable, API consistency makes later refactors safer.

Actions:

- Introduce or consolidate a small `ApiError` / `sendError` / async-route pattern.
- Normalize client-facing error envelopes and status codes.
- Fix V2 CRUD routes that return `500` for bad IDs or validation problems.
- Move repeated validation helpers into local shared modules only where duplication is real.
- Add representative tests for error status, code, and sanitized message.

Definition of done:

- New route code has one obvious error pattern.
- Existing high-traffic routes stop leaking inconsistent errors.
- Tests assert behavior, not implementation shape.

### Phase 5 - Database Invariants And Multi-Tenant Boundaries

Goal: move critical business truth into the database where possible.

Why now:

- Professional SaaS code should not depend only on repeated app-layer checks for tenant and status invariants.

Actions:

- Add `CHECK` constraints for subscription plan/status fields.
- Add a `CHECK` constraint for `transactions.review_status`.
- Enforce cross-business child relationships for `support_artifacts`, `transaction_review_states`, and `vehicle_expense_details`.
- Review account type/currency assumptions and add constraints where product rules are closed.
- Add migration tests or schema verification checks for new invariants.

Definition of done:

- Invalid core states are impossible or hard to persist.
- Multi-tenant child rows cannot silently point across business boundaries.
- Migrations are reversible or have an explicit forward-only reason.

### Phase 6 - Product Truth And Legacy/Static Cleanup

Goal: ensure the runtime serves the product that is actually current.

Why now:

- This prevents wasting cleanup time on dead UI and avoids accidentally reviving archived code.

Actions:

- Keep archived legacy frontend reference-only.
- Inventory active `public/js` and static HTML paths that are still directly serveable.
- Remove, block, or clearly quarantine old auth scripts and V2 placeholders that are not part of the product.
- Keep V3 canonical routing tests.
- Make direct URL behavior explicit for `/app`, V3 routes, blocked legacy routes, and static assets.

Definition of done:

- There is one frontend truth: V3.
- Archived files cannot be confused with runtime UI.
- Static files that remain serveable have a reason.

### Phase 7 - Route And Service Decomposition

Goal: simplify high-risk server files without inventing a new architecture.

Why now:

- After contracts and gates are stable, decomposition can be done safely with tests.

Actions:

- Start with `transactions.routes.js`: move list query construction, filter parsing, and review-summary logic into tested service/helpers.
- Codify dynamic SQL rules:
  - values are parameters,
  - identifiers come only from local constants/allowlists,
  - structural fragments come only from closed enums,
  - request-derived text is never interpolated into SQL strings.
- Add SQL-shape and parameter tests for transaction filters, mileage date-column mode, tax-region columns, usage-limit email threshold claims, and review date filters.
- Then clean privacy/export/billing/messages routes by separating request parsing, business decisions, side effects, and response shaping.
- Remove duplicated email sender plumbing only after behavior is covered.

Definition of done:

- Route files read as orchestration, not query-builder scripts.
- Dynamic SQL has tests or a named safety boundary.
- No generic framework is added unless it removes real duplicated decisions.

### Phase 8 - V3 React Cleanup

Goal: make the frontend easier to reason about without changing product truth.

Why now:

- Backend contracts and routing should be stable before frontend cleanup.

Actions:

- Split large controller pages by workflow, not by arbitrary component count.
- Move API/data orchestration into hooks or client modules where it reduces local state complexity.
- Confine or replace DOM-mutation i18n patterns.
- Consolidate modal focus/body-scroll handling.
- Replace hard reloads with state updates where SPA behavior is expected.
- Normalize `PlanGate` usage against backend feature keys.
- Share internal path normalization for `next`, backend `redirect_to`, and programmatic navigation.

Definition of done:

- Components render from props/state/context.
- Side effects live in effects, event handlers, hooks, or clients.
- No archived frontend code is wired in.

### Phase 9 - Integrations, Idempotency, And Side Effects

Goal: make external side effects reliable and diagnosable.

Why now:

- These are high-value cleanup targets, but they benefit from earlier test and error-envelope work.

Actions:

- Review Stripe mutation idempotency keys and webhook behavior.
- Add durable dedupe/outbox behavior for important emails where duplicate sends matter.
- Harden Plaid partial failure, cursor, and retry behavior.
- Make export/receipt cleanup paths explicit and testable.
- Separate required side effects from best-effort side effects.

Definition of done:

- Retries do not duplicate money-moving or customer-visible effects.
- Partial failures have clear recovery behavior.
- Logs identify the operation without leaking sensitive raw state.

### Phase 10 - Documentation And Final Stabilization

Goal: leave the codebase easier to maintain than it was found.

Why last:

- Documentation should describe the stabilized system, not the broken intermediate states.

Actions:

- Update only source-of-truth docs.
- Remove or archive stale Work docs that contradict runtime behavior.
- Add concise architecture notes for auth, startup/migrations, V3 routing, dynamic SQL, and paid-feature enforcement.
- Run final lint/type/test/audit checks.
- Re-run a targeted file inventory to confirm no review-only or generated artifacts were accidentally promoted into runtime.

Definition of done:

- Docs match code.
- Checks are green or blocked only by named external services.
- The remediation list is closed or reduced to explicit future tickets.

## Efficiency Order Rationale

This order is intentional:

1. Gates and repo hygiene come first because they prevent new slop from entering while cleanup is underway.
2. Security and startup come before aesthetics because they define whether the app is safe to run.
3. API and database contracts come before UI polish because frontend cleanup depends on stable backend behavior.
4. Legacy/static cleanup comes before broad frontend work because V3 is the product truth and old UI must not be revived accidentally.
5. Decomposition comes after behavior is protected, so simplification does not become a rewrite.
6. Integrations come late because idempotency and side effects need stable error handling, logging, and tests.
7. Documentation comes last so it records the cleaned system rather than the mess.

## Global Definition Of Done For Every Fix PR

Every remediation PR should satisfy these rules:

- It references one or more audit findings.
- It has a narrow scope and no unrelated cleanup.
- It includes behavior tests, schema checks, or a clear manual verification note.
- It does not add a new abstraction unless it removes real duplication or isolates real risk.
- It preserves V3 as frontend truth.
- It does not change archived legacy frontend behavior except to quarantine it more clearly.
- It updates docs only when the source of truth changed.
- It leaves `git status` understandable.

## Explicit Anti-Goals

Do not do these during cleanup:

- Do not rewrite the app.
- Do not wire archived legacy frontend back into runtime.
- Do not make broad style-only sweeps.
- Do not create generic frameworks around one or two call sites.
- Do not manually edit generated bundles.
- Do not delete or rewrite historical migrations without a dedicated migration plan.
- Do not hide failing tests by weakening assertions without replacing them with behavior coverage.
- Do not treat "less code" as automatically better if it removes necessary safety checks.
- Do not treat "more abstraction" as automatically professional.

## First Work Package To Execute

Recommended first package: repository hygiene and quality gates.

Scope:

- Fix the failing `test:all` baseline, starting with the brittle frontend V3 wiring assertion.
- Remove tracked browser/session/token artifacts from the repository.
- Tighten secret scanning allowlists.
- Add missing CI checks for V3 lint, TypeScript, i18n, build, and audits for backend/frontend/pdf-worker.
- Record remaining external-service blockers separately, especially local Postgres requirements for migration checksum verification.

Why this package first:

- It is the highest-leverage safety layer.
- It does not require changing product behavior.
- It prevents the cleanup effort from being undermined by weak gates.
- It gives every later phase a trustworthy verification baseline.
