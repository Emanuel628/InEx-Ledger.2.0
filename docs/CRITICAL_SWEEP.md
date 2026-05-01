# Critical Sweep

This file records the paused state of the current critical-bug sweep so it can resume without losing context.

## Date

- `2026-05-01`

## Scope already checked

- startup and migration safety
- auth and device verification
- billing webhook and subscription recovery
- business creation and plan limits
- account deletion and accounting locks
- transaction feature gating

## Verified results

- auth-focused suites passed
- billing and gating suites passed
- migration startup blocker was fixed and Railway recovered

## Unresolved item

- `tests/criticalFlows.test.js` still needs controlled follow-up
- current evidence points to a test-runner / worker-process issue in this environment, not a confirmed product defect

## Next step when resuming

1. run `criticalFlows.test.js` in a controlled way without broad suite churn
2. inspect any remaining open-handle or worker-spawn issue
3. continue the critical-path audit from there
