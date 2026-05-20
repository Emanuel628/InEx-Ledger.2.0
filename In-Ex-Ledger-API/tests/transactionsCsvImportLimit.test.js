"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-csv-import-limit";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret-csv-import-limit";
process.env.FIELD_ENCRYPTION_KEY =
  process.env.FIELD_ENCRYPTION_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000000";

const {
  countImportableCsvRows,
  isPlannedCsvDuplicate
} = require("../routes/transactions.routes.js").__private;

test("isPlannedCsvDuplicate matches same-file duplicates within the 2-day window", () => {
  const plannedRows = [{
    accountId: "acct-1",
    date: "2026-05-01",
    amount: 42,
    type: "expense",
    description: "Coffee shop"
  }];

  assert.equal(
    isPlannedCsvDuplicate(plannedRows, {
      accountId: "acct-1",
      date: "2026-05-03",
      amount: 42,
      type: "expense",
      description: "Coffee shop"
    }),
    true
  );

  assert.equal(
    isPlannedCsvDuplicate(plannedRows, {
      accountId: "acct-1",
      date: "2026-05-04",
      amount: 42,
      type: "expense",
      description: "Coffee shop"
    }),
    false
  );
});

test("countImportableCsvRows excludes rows that would later be skipped", async () => {
  const rows = [
    { date: "2026-05-01", description: "Alpha", amount: "10.00" },
    { date: "2026-05-01", description: "Alpha", amount: "10.00" },
    { date: "2026-05-02", description: "Locked row", amount: "20.00" },
    { date: "2026-05-03", description: "DB duplicate", amount: "30.00" },
    { date: "2026-04-15", description: "Out of range", amount: "40.00" },
    { date: "2026-05-04", description: "", amount: "50.00" }
  ];
  const cols = {
    dateCol: "date",
    descCol: "description",
    amountCol: "amount",
    withdrawalCol: null,
    depositCol: null
  };

  const duplicateChecks = [];
  const count = await countImportableCsvRows(rows, cols, {
    client: {},
    businessId: "biz-1",
    accountId: "acct-1",
    filterStartDate: "2026-05-01",
    filterEndDate: "2026-05-31",
    skipDuplicates: true,
    lockState: { lockedThroughDate: "2026-04-30" },
    findDuplicateCandidatesFn: async (_client, candidate) => {
      duplicateChecks.push(candidate.description);
      return candidate.description === "DB duplicate" ? [{ id: "dup-1" }] : [];
    },
    assertDateUnlockedFn: (_lockState, date) => {
      if (date === "2026-05-02") {
        throw new Error("locked");
      }
    }
  });

  assert.equal(count, 1);
  assert.deepEqual(duplicateChecks, ["Alpha", "DB duplicate"]);
});
