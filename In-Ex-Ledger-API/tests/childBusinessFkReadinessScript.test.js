"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CHILD_BUSINESS_FK_CHECKS,
  buildConstraintStatusQuery,
  buildReadinessReport,
  buildViolationCountQuery,
  buildViolationSampleQuery,
  parseArgs,
  quoteIdentifier
} = require("../scripts/check-child-business-fk-readiness.js");

test("child/business FK readiness script tracks the intended NOT VALID constraints", () => {
  assert.deepEqual(
    CHILD_BUSINESS_FK_CHECKS.map((check) => check.constraintName),
    [
      "fk_support_artifacts_transaction_business",
      "fk_support_artifacts_legacy_receipt_business",
      "fk_transaction_review_states_transaction_business",
      "fk_vehicle_expense_details_transaction_business"
    ]
  );
});

test("child/business FK readiness SQL is report-only", () => {
  const statusSql = buildConstraintStatusQuery();
  assert.match(statusSql, /FROM pg_constraint/i);
  assert.doesNotMatch(statusSql, /\bVALIDATE\s+CONSTRAINT\b|\bALTER\s+TABLE\b|\bDELETE\s+FROM\b/i);

  for (const check of CHILD_BUSINESS_FK_CHECKS) {
    const countSql = buildViolationCountQuery(check);
    const sampleSql = buildViolationSampleQuery(check);

    assert.match(countSql, new RegExp(`FROM "${check.childTable}" c`, "i"));
    assert.match(countSql, new RegExp(`LEFT JOIN "${check.parentTable}" p`, "i"));
    assert.match(countSql, new RegExp(`p\\.id = c\\."${check.childKey}"`, "i"));
    assert.match(countSql, /p\.business_id = c\.business_id/i);
    assert.doesNotMatch(`${countSql}\n${sampleSql}`, /\bVALIDATE\s+CONSTRAINT\b|\bALTER\s+TABLE\b|\bDELETE\s+FROM\b/i);
  }
});

test("nullable child/business FK readiness queries ignore null child keys", () => {
  const supportTransaction = CHILD_BUSINESS_FK_CHECKS.find(
    (check) => check.constraintName === "fk_support_artifacts_transaction_business"
  );
  const reviewState = CHILD_BUSINESS_FK_CHECKS.find(
    (check) => check.constraintName === "fk_transaction_review_states_transaction_business"
  );

  assert.match(buildViolationCountQuery(supportTransaction), /c\."transaction_id" IS NOT NULL/i);
  assert.doesNotMatch(buildViolationCountQuery(reviewState), /IS NOT NULL/i);
});

test("child/business FK readiness report marks missing and violating constraints", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/FROM pg_constraint/i.test(sql)) {
        return {
          rows: [
            { conname: "fk_support_artifacts_transaction_business", convalidated: false },
            { conname: "fk_support_artifacts_legacy_receipt_business", convalidated: true },
            { conname: "fk_transaction_review_states_transaction_business", convalidated: false }
          ]
        };
      }
      if (/FROM "vehicle_expense_details"/i.test(sql)) {
        return { rows: [{ violation_count: 1 }] };
      }
      if (/SELECT c\.id/i.test(sql)) {
        return {
          rows: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              transaction_id: "00000000-0000-4000-8000-000000000002",
              business_id: "00000000-0000-4000-8000-000000000003"
            }
          ]
        };
      }
      return { rows: [{ violation_count: 0 }] };
    }
  };

  const report = await buildReadinessReport(pool);

  assert.equal(report.readyToValidate, false);
  assert.equal(report.missingConstraints, 1);
  assert.equal(report.violatingConstraints, 1);
  assert.equal(report.checks.find((check) => check.constraintName === "fk_vehicle_expense_details_transaction_business").violationCount, 1);
  assert.equal(queries[0].params[0].length, 4);
});

test("child/business FK readiness helpers reject unsafe identifiers and parse flags", () => {
  assert.equal(quoteIdentifier("support_artifacts"), "\"support_artifacts\"");
  assert.throws(() => quoteIdentifier("support_artifacts;DROP TABLE users"));
  assert.deepEqual(parseArgs(["--json", "--fail-on-not-ready"]), {
    json: true,
    failOnNotReady: true
  });
});
