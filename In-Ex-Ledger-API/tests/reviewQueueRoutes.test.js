"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const ROUTE_PATH = require.resolve("../routes/review.routes.js");

function loadReviewRouterFixture(options = {}) {
  const originalLoad = Module._load.bind(Module);
  const state = {
    queries: [],
    datasetOptions: null,
    logErrors: []
  };

  Module._load = function(requestName, parent, isMain) {
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return {
        pool: {
          async query(sql, params = []) {
            state.queries.push({ sql, params });
            if (/FROM transactions(?:\s+t)?/i.test(sql)) {
              return { rows: [{ id: "tx_1" }], rowCount: 1 };
            }
            if (/FROM accounts/i.test(sql)) {
              return { rows: [{ id: "acc_1", name: "Checking" }], rowCount: 1 };
            }
            if (/FROM categories/i.test(sql)) {
              return { rows: [{ id: "cat_1", name: "Meals" }], rowCount: 1 };
            }
            if (/FROM receipts r/i.test(sql)) {
              return { rows: [{ id: "r_1", transaction_id: "tx_1", filename: "meal.pdf" }], rowCount: 1 };
            }
            if (/FROM support_artifacts/i.test(sql)) {
              return { rows: [], rowCount: 0 };
            }
            if (/FROM transaction_review_states/i.test(sql)) {
              return { rows: options.reviewStateRows || [], rowCount: (options.reviewStateRows || []).length };
            }
            if (/FROM businesses/i.test(sql)) {
              return { rows: [{ id: "biz_1", name: "Biz", region: "US", currency: "USD" }], rowCount: 1 };
            }
            if (/FROM vehicle_expense_details/i.test(sql)) {
              return { rows: [{ transaction_id: "tx_vehicle" }], rowCount: 1 };
            }
            if (/FROM capital_assets/i.test(sql)) {
              return { rows: [{ transaction_id: "tx_asset" }], rowCount: 1 };
            }
            if (/INSERT INTO transaction_review_states/i.test(sql)) {
              return {
                rows: [{
                  id: "issue_created",
                  transaction_id: params[0],
                  issue_code: params[2],
                  issue_severity: params[3],
                  issue_status: params[4],
                  review_notes: params[5],
                  resolved_at: null,
                  updated_at: new Date().toISOString()
                }],
                rowCount: 1
              };
            }
            if (/UPDATE transaction_review_states/i.test(sql)) {
              return {
                rows: [{
                  id: params[3],
                  transaction_id: "tx_1",
                  issue_code: "needs_category",
                  issue_severity: "hard",
                  issue_status: params[0] || "open",
                  review_notes: params[1],
                  resolved_at: params[0] && params[0] !== "open" ? new Date().toISOString() : null,
                  updated_at: new Date().toISOString()
                }],
                rowCount: options.missingIssue ? 0 : 1
              };
            }
            throw new Error(`Unhandled SQL: ${sql}`);
          }
        }
      };
    }

    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_1" };
          next();
        }
      };
    }

    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return {
        requireCsrfProtection(_req, _res, next) {
          next();
        }
      };
    }

    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return {
        resolveBusinessIdForUser: async () => "biz_1"
      };
    }

    if (requestName === "../services/exportDatasetService.js" || /exportDatasetService\.js$/.test(requestName)) {
      return {
        buildNormalizedExportDataset(input) {
          state.datasetOptions = input;
          if (options.throwDataset) {
            throw new Error("dataset failed");
          }
          return {
            rows: [
              {
                id: "tx_action",
                date: "2026-05-01",
                description: "",
                amount: 25,
                signedAmount: -25,
                rawType: "expense",
                currency: "USD",
                accountName: "Checking",
                categoryName: "Imported Expense",
                taxLineLabel: "",
                mappingStatus: "Needs category",
                supportStatus: "Needs category",
                reviewStatus: "Action needed",
                reviewFlags: ["NC", "MD"],
                receiptCount: 0,
                receiptAttached: false,
                supportSummary: "Assign category",
                reviewNotes: ""
              },
              {
                id: "tx_review",
                date: "2026-05-02",
                description: "Client lunch",
                amount: 40,
                signedAmount: -40,
                rawType: "expense",
                currency: "USD",
                accountName: "Checking",
                categoryName: "Meals",
                taxLineLabel: "Line 24b",
                mappingStatus: "Needs support",
                supportStatus: "Needs receipt/support",
                reviewStatus: "Needs review",
                reviewFlags: ["RS", "BP"],
                receiptCount: 0,
                receiptAttached: false,
                supportSummary: "Receipt needed + Business purpose needed",
                reviewNotes: ""
              },
              {
                id: "tx_mapping",
                date: "2026-05-01",
                description: "Phone line",
                amount: 55,
                signedAmount: -55,
                rawType: "expense",
                currency: "USD",
                accountName: "Checking",
                categoryName: "Phone & Internet",
                taxLineLabel: "",
                mappingStatus: "Needs tax mapping",
                supportStatus: "Mapped category needs tax mapping",
                reviewStatus: "Action needed",
                reviewFlags: ["UM"],
                receiptCount: 1,
                receiptAttached: true,
                supportSummary: "Map category to tax line",
                reviewNotes: ""
              },
              {
                id: "tx_excluded",
                date: "2026-05-03",
                description: "Refund",
                amount: 10,
                signedAmount: 10,
                rawType: "income",
                currency: "USD",
                accountName: "Checking",
                categoryName: "Imported Income",
                taxLineLabel: "",
                mappingStatus: "Excluded",
                supportStatus: "Excluded",
                reviewStatus: "Excluded - review schedule",
                reviewFlags: ["RR"],
                receiptCount: 0,
                receiptAttached: false,
                supportSummary: "Refund/reversal review",
                reviewNotes: ""
              },
              {
                id: "tx_mapped",
                date: "2026-05-04",
                description: "Ready item",
                amount: 15,
                signedAmount: -15,
                rawType: "expense",
                currency: "USD",
                accountName: "Checking",
                categoryName: "Supplies",
                taxLineLabel: "Line 18",
                mappingStatus: "Mapped",
                supportStatus: "Mapped",
                reviewStatus: "Mapped",
                reviewFlags: [],
                receiptCount: 1,
                receiptAttached: true,
                supportSummary: "Mapped",
                reviewNotes: ""
              }
            ],
            supportSummary: { needsCategoryCount: 1 },
            totals: { includedCount: 3 },
            metadata: { businessId: "biz_1" }
          };
        }
      };
    }

    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return {
        logError(...args) {
          state.logErrors.push(args);
        }
      };
    }

    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require(ROUTE_PATH);
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use("/api/review", router);

  return { app, state };
}

test("GET /api/review/queue returns only unresolved items with summary", async () => {
  const { app, state } = loadReviewRouterFixture();

  const response = await request(app).get("/api/review/queue");

  assert.equal(response.status, 200);
  assert.equal(response.body.queue.length, 4);
  assert.deepEqual(
    response.body.queue.map((item) => item.id),
    ["tx_action", "tx_mapping", "tx_review", "tx_excluded"]
  );
  assert.equal(response.body.summary.total, 4);
  assert.equal(response.body.summary.actionNeededCount, 2);
  assert.equal(response.body.summary.needsReviewCount, 1);
  assert.equal(response.body.summary.excludedReviewCount, 1);
  assert.equal(response.body.summary.missingCategoryCount, 1);
  assert.equal(response.body.summary.missingReceiptCount, 1);
  assert.equal(response.body.summary.missingDescriptionCount, 1);
  assert.equal(response.body.queue[0].actionTarget.href, "/transactions");
  assert.equal(response.body.queue[1].actionTarget.href, "/categories");
  assert.equal(response.body.queue[2].actionTarget.href, "/receipts");
  assert.equal(response.body.queue[3].actionTarget.href, "/exports");
  assert.deepEqual(response.body.queue[0].quickAction, {
    label: "Assign category",
    action: "transactions"
  });
  assert.deepEqual(response.body.queue[1].quickAction, {
    label: "Open categories",
    action: "navigate",
    href: "/categories"
  });
  assert.deepEqual(response.body.queue[2].quickAction, {
    label: "Attach receipt",
    action: "support",
    supportType: "receipt"
  });
  assert.deepEqual(response.body.queue[3].quickAction, {
    label: "Review exclusions",
    action: "navigate",
    href: "/exports"
  });
  assert.equal(state.datasetOptions.vehicleClaimMap.get("tx_vehicle").transaction_id, "tx_vehicle");
  assert.equal(state.datasetOptions.capitalAssetTxMap.get("tx_asset").transaction_id, "tx_asset");
});

test("GET /api/review/queue forwards date filters to transaction query", async () => {
  const { app, state } = loadReviewRouterFixture();

  const response = await request(app)
    .get("/api/review/queue?startDate=2026-05-01&endDate=2026-05-31");

  assert.equal(response.status, 200);
  const transactionQuery = state.queries.find((entry) => /FROM transactions t/i.test(entry.sql));
  assert.ok(transactionQuery);
  assert.deepEqual(transactionQuery.params, ["biz_1", "2026-05-01", "2026-05-31"]);
});

test("GET /api/review/queue reads review states without requiring created_at in the sort", async () => {
  const { app, state } = loadReviewRouterFixture();

  const response = await request(app).get("/api/review/queue");

  assert.equal(response.status, 200);
  const reviewStateQuery = state.queries.find((entry) => /FROM transaction_review_states/i.test(entry.sql));
  assert.ok(reviewStateQuery);
  assert.doesNotMatch(reviewStateQuery.sql, /created_at\s+DESC/i);
  assert.match(reviewStateQuery.sql, /updated_at\s+DESC/i);
});

test("GET /api/review/queue returns 500 when dataset build fails", async () => {
  const { app, state } = loadReviewRouterFixture({ throwDataset: true });

  const response = await request(app).get("/api/review/queue");

  assert.equal(response.status, 500);
  assert.equal(response.body.error, "Failed to load review queue.");
  assert.equal(state.logErrors.length, 1);
});

test("GET /api/review/queue suppresses derived issues already marked resolved", async () => {
  const { app } = loadReviewRouterFixture({
    reviewStateRows: [
      {
        id: "issue_1",
        transaction_id: "tx_action",
        issue_code: "needs_category",
        issue_severity: "hard",
        issue_status: "resolved",
        review_notes: "Handled",
        updated_at: new Date().toISOString()
      },
      {
        id: "issue_2",
        transaction_id: "tx_action",
        issue_code: "missing_description",
        issue_severity: "hard",
        issue_status: "resolved",
        review_notes: "Handled",
        updated_at: new Date().toISOString()
      }
    ]
  });

  const response = await request(app).get("/api/review/queue");

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.queue.map((item) => item.id),
    ["tx_mapping", "tx_review", "tx_excluded"]
  );
});

test("POST /api/review/issues creates a reviewer issue", async () => {
  const { app } = loadReviewRouterFixture();

  const response = await request(app)
    .post("/api/review/issues")
    .send({
      transaction_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      issue_code: "reviewer_note",
      issue_severity: "warning",
      issue_status: "open",
      review_notes: "Check supporting memo"
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.issue_code, "reviewer_note");
  assert.equal(response.body.issue_status, "open");
});

test("PATCH /api/review/issues/:id updates reviewer issue state", async () => {
  const { app } = loadReviewRouterFixture();

  const response = await request(app)
    .patch("/api/review/issues/3fa85f64-5717-4562-b3fc-2c963f66afa6")
    .send({
      issue_status: "waived",
      review_notes: "Immaterial test item"
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.issue_status, "waived");
  assert.equal(response.body.review_notes, "Immaterial test item");
});
