"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

const ROUTE_PATH = require.resolve("../routes/business.routes.js");

const BASE_ROW = {
  id: "biz_001",
  name: "Acme LLC",
  region: "US",
  language: "en",
  fiscal_year_start: "01-01",
  province: null,
  business_type: "sole_proprietorship",
  tax_id: null,
  address: null,
  contact_full_name: "Owner Name",
  operating_name: null,
  business_activity_code: null,
  accounting_method: "cash",
  material_participation: true,
  gst_hst_registered: false,
  gst_hst_number: null,
  gst_hst_method: null,
  created_at: new Date("2026-01-01T00:00:00Z").toISOString()
};

function loadBusinessRouterFixture({ queryImpl } = {}) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function patchedLoad(requestName, parent, isMain) {
    if (requestName === "../middleware/auth.middleware.js" || /auth\.middleware\.js$/.test(requestName)) {
      return {
        requireAuth(req, _res, next) {
          req.user = { id: "user_001", email: "user@example.com" };
          next();
        }
      };
    }
    if (requestName === "../middleware/csrf.middleware.js" || /csrf\.middleware\.js$/.test(requestName)) {
      return { requireCsrfProtection: (_req, _res, next) => next() };
    }
    if (requestName === "../api/utils/resolveBusinessIdForUser.js" || /resolveBusinessIdForUser\.js$/.test(requestName)) {
      return { resolveBusinessIdForUser: async () => "biz_001" };
    }
    if (requestName === "../services/taxIdService.js" || /taxIdService\.js$/.test(requestName)) {
      return {
        decryptTaxId: (value) => value,
        encryptTaxId: (value) => value
      };
    }
    if (requestName === "../services/gstHstNumberService.js" || /gstHstNumberService\.js$/.test(requestName)) {
      return {
        decryptGstHstNumber: (value) => value,
        encryptGstHstNumber: (value) => value
      };
    }
    if (requestName === "../services/exportSnapshotService.js" || /exportSnapshotService\.js$/.test(requestName)) {
      return { invalidateSnapshotsForBusiness: async () => {} };
    }
    if (requestName === "../utils/logger.js" || /logger\.js$/.test(requestName)) {
      return { logError() {}, logWarn() {}, logInfo() {} };
    }
    if (requestName === "../db.js" || /db\.js$/.test(requestName)) {
      return { pool: { query: queryImpl } };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[ROUTE_PATH];
  const router = require("../routes/business.routes.js");
  const app = express();
  app.use(express.json());
  app.use("/api/business", router);
  attachCentralErrorHandler(app);

  return {
    app,
    cleanup() {
      delete require.cache[ROUTE_PATH];
      Module._load = originalLoad;
    }
  };
}

function fixedRowQuery(row = BASE_ROW) {
  return async (sql) => {
    if (/SELECT id, name, region, language/i.test(sql)) {
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };
}

test("GET /business returns the normalized business profile", async () => {
  const fixture = loadBusinessRouterFixture({ queryImpl: fixedRowQuery() });
  try {
    const response = await request(fixture.app).get("/api/business");
    assert.equal(response.status, 200);
    assert.equal(response.body.id, "biz_001");
    assert.equal(response.body.contact_full_name, "Owner Name");
  } finally {
    fixture.cleanup();
  }
});

test("GET /business returns a generic 500 for an unexpected DB failure", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: async () => { throw new Error("connection reset"); }
  });
  try {
    const response = await request(fixture.app).get("/api/business");
    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Internal server error");
  } finally {
    fixture.cleanup();
  }
});

const PUT_VALIDATION_CASES = [
  [{ region: "MX" }, "Invalid region. Must be 'US' or 'CA'."],
  [{ language: "de" }, "language must be 'en', 'es', or 'fr'."],
  [{ accounting_method: "fifo" }, "Invalid accounting method. Must be 'cash' or 'accrual'."],
  [{ business_activity_code: "12345" }, "Business Activity Code must be a 6-digit NAICS code."],
  [{ business_type: "trust" }, "Invalid legal entity structure."],
  [{ gst_hst_method: "annual" }, "gst_hst_method must be 'regular' or 'quick'."],
  [{ material_participation: "yes" }, "material_participation must be a boolean value."],
  [{ gst_hst_registered: "yes" }, "gst_hst_registered must be a boolean value."]
];

for (const [body, expectedMessage] of PUT_VALIDATION_CASES) {
  test(`PUT /business rejects ${Object.keys(body)[0]} with 400: ${expectedMessage}`, async () => {
    const fixture = loadBusinessRouterFixture({ queryImpl: fixedRowQuery() });
    try {
      const response = await request(fixture.app).put("/api/business").send(body);
      assert.equal(response.status, 400);
      assert.equal(response.body.error, expectedMessage);
    } finally {
      fixture.cleanup();
    }
  });
}

test("PUT /business returns 404 when the business row is missing", async () => {
  const fixture = loadBusinessRouterFixture({ queryImpl: fixedRowQuery(null) });
  try {
    const response = await request(fixture.app).put("/api/business").send({ name: "New Name" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Business not found.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business rejects Single-Member LLC for a Canadian business", async () => {
  const fixture = loadBusinessRouterFixture({ queryImpl: fixedRowQuery({ ...BASE_ROW, region: "CA", province: "ON" }) });
  try {
    const response = await request(fixture.app).put("/api/business").send({ business_type: "single_member_llc" });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Single-Member LLC is not a valid CRA tax classification for Canada.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business requires a province for Canadian businesses", async () => {
  const fixture = loadBusinessRouterFixture({ queryImpl: fixedRowQuery({ ...BASE_ROW, region: "CA", province: null }) });
  try {
    const response = await request(fixture.app).put("/api/business").send({});
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Province is required for Canadian businesses.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business rejects an invalid Canadian province code", async () => {
  const fixture = loadBusinessRouterFixture({ queryImpl: fixedRowQuery({ ...BASE_ROW, region: "CA", province: "ON" }) });
  try {
    const response = await request(fixture.app).put("/api/business").send({ province: "ZZ" });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Invalid Canadian province code.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business requires fiscal_year_start for Canadian businesses", async () => {
  // Sole proprietorships are force-set to fiscal_year_start "01-01" further down
  // this handler, so this branch is only reachable for a non-sole-prop entity type.
  const fixture = loadBusinessRouterFixture({
    queryImpl: fixedRowQuery({
      ...BASE_ROW,
      region: "CA",
      province: "ON",
      business_type: "corporation",
      fiscal_year_start: null
    })
  });
  try {
    const response = await request(fixture.app).put("/api/business").send({});
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "fiscal_year_start is required for Canadian businesses.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business rejects a blank contact_full_name", async () => {
  const fixture = loadBusinessRouterFixture({ queryImpl: fixedRowQuery() });
  try {
    const response = await request(fixture.app).put("/api/business").send({ contact_full_name: "   " });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "contact_full_name is required.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business requires material_participation for US businesses", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: fixedRowQuery({ ...BASE_ROW, material_participation: null })
  });
  try {
    const response = await request(fixture.app).put("/api/business").send({});
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "material_participation is required for US businesses.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business succeeds and returns the updated row", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: async (sql) => {
      if (/SELECT id, name, region, language/i.test(sql)) {
        return { rows: [BASE_ROW], rowCount: 1 };
      }
      if (/UPDATE businesses/i.test(sql)) {
        return { rows: [{ ...BASE_ROW, name: "Updated Name" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app).put("/api/business").send({ name: "Updated Name" });
    assert.equal(response.status, 200);
    assert.equal(response.body.name, "Updated Name");
  } finally {
    fixture.cleanup();
  }
});

const CHECK_CONSTRAINT_CASES = [
  ["chk_business_activity_code", "Business Activity Code must be exactly 6 digits (e.g. 541511)."],
  ["chk_business_type", "The selected entity type is not valid for this region."],
  ["chk_ca_entity_match", "Single-member LLC is not a recognized entity type in Canada. Use Sole Proprietorship or another supported type."]
];

for (const [constraint, expectedMessage] of CHECK_CONSTRAINT_CASES) {
  test(`PUT /business maps the ${constraint} DB constraint to a 400`, async () => {
    const fixture = loadBusinessRouterFixture({
      queryImpl: async (sql) => {
        if (/SELECT id, name, region, language/i.test(sql)) {
          return { rows: [BASE_ROW], rowCount: 1 };
        }
        if (/UPDATE businesses/i.test(sql)) {
          const err = new Error("check constraint violated");
          err.constraint = constraint;
          throw err;
        }
        return { rows: [], rowCount: 0 };
      }
    });
    try {
      const response = await request(fixture.app).put("/api/business").send({ name: "X" });
      assert.equal(response.status, 400);
      assert.equal(response.body.error, expectedMessage);
    } finally {
      fixture.cleanup();
    }
  });
}

test("PUT /business returns a generic 500 for an unmapped DB failure", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: async (sql) => {
      if (/SELECT id, name, region, language/i.test(sql)) {
        return { rows: [BASE_ROW], rowCount: 1 };
      }
      if (/UPDATE businesses/i.test(sql)) {
        throw new Error("connection reset");
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app).put("/api/business").send({ name: "X" });
    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Internal server error");
  } finally {
    fixture.cleanup();
  }
});

test("GET /business/accounting-lock returns the current lock state", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: async (sql) => {
      if (/SELECT locked_through_date/i.test(sql)) {
        return { rows: [{ locked_through_date: "2026-01-31", locked_period_note: "Q1 close" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app).get("/api/business/accounting-lock");
    assert.equal(response.status, 200);
    assert.equal(response.body.lock.lockedThroughDate, "2026-01-31");
    assert.equal(response.body.lock.isLocked, true);
  } finally {
    fixture.cleanup();
  }
});

test("GET /business/accounting-lock returns a generic 500 for an unexpected DB failure", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: async () => { throw new Error("connection reset"); }
  });
  try {
    const response = await request(fixture.app).get("/api/business/accounting-lock");
    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Internal server error");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business/accounting-lock rejects an invalid date", async () => {
  const fixture = loadBusinessRouterFixture({ queryImpl: async () => ({ rows: [], rowCount: 0 }) });
  try {
    const response = await request(fixture.app)
      .put("/api/business/accounting-lock")
      .send({ locked_through_date: "not-a-date" });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "locked_through_date must be a valid date.");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business/accounting-lock succeeds with a valid date", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: async (sql) => {
      if (/UPDATE businesses/i.test(sql)) {
        return {
          rows: [{ locked_through_date: "2026-02-28", locked_period_note: "Q1 close" }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app)
      .put("/api/business/accounting-lock")
      .send({ locked_through_date: "2026-02-28", note: "Q1 close" });
    assert.equal(response.status, 200);
    assert.equal(response.body.locked, true);
    assert.equal(response.body.lock.lockedThroughDate, "2026-02-28");
  } finally {
    fixture.cleanup();
  }
});

test("PUT /business/accounting-lock clears the lock when given an empty date", async () => {
  const fixture = loadBusinessRouterFixture({
    queryImpl: async (sql) => {
      if (/UPDATE businesses/i.test(sql)) {
        return { rows: [{ locked_through_date: null, locked_period_note: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  });
  try {
    const response = await request(fixture.app)
      .put("/api/business/accounting-lock")
      .send({ locked_through_date: "" });
    assert.equal(response.status, 200);
    assert.equal(response.body.locked, false);
  } finally {
    fixture.cleanup();
  }
});
