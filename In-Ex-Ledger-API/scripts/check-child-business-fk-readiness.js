"use strict";

const CHILD_BUSINESS_FK_CHECKS = [
  {
    constraintName: "fk_support_artifacts_transaction_business",
    childTable: "support_artifacts",
    childKey: "transaction_id",
    parentTable: "transactions",
    nullableChildKey: true
  },
  {
    constraintName: "fk_support_artifacts_legacy_receipt_business",
    childTable: "support_artifacts",
    childKey: "legacy_receipt_id",
    parentTable: "receipts",
    nullableChildKey: true
  },
  {
    constraintName: "fk_transaction_review_states_transaction_business",
    childTable: "transaction_review_states",
    childKey: "transaction_id",
    parentTable: "transactions",
    nullableChildKey: false
  },
  {
    constraintName: "fk_vehicle_expense_details_transaction_business",
    childTable: "vehicle_expense_details",
    childKey: "transaction_id",
    parentTable: "transactions",
    nullableChildKey: false
  }
];

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function buildConstraintStatusQuery() {
  return `
    SELECT con.conname, con.convalidated
      FROM pg_constraint con
     WHERE con.conname = ANY($1::text[])
     ORDER BY con.conname
  `;
}

function buildViolationCountQuery(check) {
  const childTable = quoteIdentifier(check.childTable);
  const parentTable = quoteIdentifier(check.parentTable);
  const childKey = quoteIdentifier(check.childKey);
  const keyPredicate = check.nullableChildKey ? `c.${childKey} IS NOT NULL AND ` : "";

  return `
    SELECT COUNT(*)::int AS violation_count
      FROM ${childTable} c
      LEFT JOIN ${parentTable} p
        ON p.id = c.${childKey}
       AND p.business_id = c.business_id
     WHERE ${keyPredicate}p.id IS NULL
  `;
}

function buildViolationSampleQuery(check) {
  const childTable = quoteIdentifier(check.childTable);
  const parentTable = quoteIdentifier(check.parentTable);
  const childKey = quoteIdentifier(check.childKey);
  const keyPredicate = check.nullableChildKey ? `c.${childKey} IS NOT NULL AND ` : "";

  return `
    SELECT c.id, c.${childKey}, c.business_id
      FROM ${childTable} c
      LEFT JOIN ${parentTable} p
        ON p.id = c.${childKey}
       AND p.business_id = c.business_id
     WHERE ${keyPredicate}p.id IS NULL
     ORDER BY c.id
     LIMIT 10
  `;
}

async function buildReadinessReport(pool) {
  const constraintNames = CHILD_BUSINESS_FK_CHECKS.map((check) => check.constraintName);
  const statusResult = await pool.query(buildConstraintStatusQuery(), [constraintNames]);
  const statusByName = new Map(
    statusResult.rows.map((row) => [row.conname, Boolean(row.convalidated)])
  );

  const checks = [];
  for (const check of CHILD_BUSINESS_FK_CHECKS) {
    const countResult = await pool.query(buildViolationCountQuery(check));
    const violationCount = Number(countResult.rows[0]?.violation_count || 0);
    const sampleResult = violationCount > 0
      ? await pool.query(buildViolationSampleQuery(check))
      : { rows: [] };

    checks.push({
      constraintName: check.constraintName,
      childTable: check.childTable,
      childKey: check.childKey,
      parentTable: check.parentTable,
      exists: statusByName.has(check.constraintName),
      validated: statusByName.get(check.constraintName) === true,
      violationCount,
      sampleRows: sampleResult.rows
    });
  }

  const missingConstraints = checks.filter((check) => !check.exists).length;
  const violatingConstraints = checks.filter((check) => check.violationCount > 0).length;

  return {
    checkedAt: new Date().toISOString(),
    readyToValidate: missingConstraints === 0 && violatingConstraints === 0,
    missingConstraints,
    violatingConstraints,
    checks
  };
}

function printTextReport(report) {
  console.log("Child/business FK validation readiness");
  console.log(`Checked at: ${report.checkedAt}`);
  console.log(`Ready to validate: ${report.readyToValidate ? "yes" : "no"}`);
  console.log("");

  for (const check of report.checks) {
    const state = !check.exists
      ? "missing"
      : check.validated
        ? "already validated"
        : check.violationCount === 0
          ? "ready"
          : "blocked";

    console.log(`- ${check.constraintName}: ${state}`);
    console.log(`  ${check.childTable}.${check.childKey} -> ${check.parentTable}.id + business_id`);
    console.log(`  violating rows: ${check.violationCount}`);

    if (check.sampleRows.length) {
      console.log("  sample child ids:");
      for (const row of check.sampleRows) {
        console.log(`    ${row.id}`);
      }
    }
  }

  if (report.readyToValidate) {
    console.log("");
    console.log("Report only. Validate later in a reviewed maintenance window.");
  }
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
    failOnNotReady: argv.includes("--fail-on-not-ready")
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { pool } = require("../db.js");

  try {
    const report = await buildReadinessReport(pool);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report);
    }

    if (args.failOnNotReady && !report.readyToValidate) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CHILD_BUSINESS_FK_CHECKS,
  buildConstraintStatusQuery,
  buildReadinessReport,
  buildViolationCountQuery,
  buildViolationSampleQuery,
  parseArgs,
  printTextReport,
  quoteIdentifier
};
