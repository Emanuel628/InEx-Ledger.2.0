const assert = require("node:assert/strict");
const test = require("node:test");

function mockModule(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath);
  const hadOriginal = Object.prototype.hasOwnProperty.call(require.cache, resolved);
  const original = require.cache[resolved];
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  };

  return () => {
    if (hadOriginal) {
      require.cache[resolved] = original;
    } else {
      delete require.cache[resolved];
    }
  };
}

test("materializeTemplateRuns skips locked occurrences and only posts the next unlocked one", async () => {
  const queries = [];
  let released = false;

  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("FROM businesses")) {
        return { rowCount: 1, rows: [{ locked_through_date: "2000-03-31" }] };
      }
      if (sql.includes("FROM recurring_transactions") && sql.includes("FOR UPDATE")) {
        return {
          rowCount: 1,
          rows: [{
            id: "tmpl_1",
            business_id: "biz_1",
            account_id: "acct_1",
            category_id: "cat_1",
            amount: 500,
            type: "expense",
            description: "Retainer",
            note: "",
            cadence: "monthly",
            start_date: "2000-03-15",
            next_run_date: "2000-03-15",
            end_date: "2000-04-15",
            last_run_date: null,
            cleared_default: false,
            active: true,
            created_at: "2000-03-01T00:00:00Z",
            updated_at: "2000-03-01T00:00:00Z"
          }]
        };
      }
      if (sql.includes("INSERT INTO recurring_transaction_runs")) {
        return { rowCount: 1, rows: [{ id: "run_1" }] };
      }
      if (sql.includes("INSERT INTO transactions")) {
        return { rowCount: 1, rows: [{ id: "tx_1" }] };
      }
      if (sql.includes("UPDATE recurring_transaction_runs")) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("UPDATE recurring_transactions")) {
        return { rowCount: 1, rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {
      released = true;
    }
  };

  const restoreDb = mockModule("../db.js", {
    pool: {
      async connect() {
        return client;
      }
    }
  });

  const servicePath = require.resolve("../services/recurringTransactionsService.js");
  delete require.cache[servicePath];
  const { materializeTemplateRuns } = require("../services/recurringTransactionsService.js");

  try {
    const createdAny = await materializeTemplateRuns("biz_1", "tmpl_1");
    assert.equal(createdAny, true);
    assert.equal(released, true);

    const insertedRun = queries.find((entry) => entry.sql.includes("INSERT INTO recurring_transaction_runs"));
    const insertedTransaction = queries.find((entry) => entry.sql.includes("INSERT INTO transactions"));
    const templateUpdate = queries.find((entry) => entry.sql.includes("UPDATE recurring_transactions"));

    assert.ok(insertedRun, "expected a recurring run insert");
    assert.ok(insertedTransaction, "expected a transaction insert");
    assert.ok(templateUpdate, "expected a recurring template update");

    assert.equal(insertedRun.params[3], "2000-04-15");
    assert.equal(insertedTransaction.params[8], "2000-04-15");
    assert.equal(templateUpdate.params[0], "2000-05-15");
    assert.equal(templateUpdate.params[1], "2000-04-15");
    assert.equal(templateUpdate.params[2], false);
  } finally {
    delete require.cache[servicePath];
    restoreDb();
  }
});
