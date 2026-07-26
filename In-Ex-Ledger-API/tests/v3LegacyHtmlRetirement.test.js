"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret";

const apiRoot = path.resolve(__dirname, "..");
const publicHtmlDir = path.join(apiRoot, "public", "html");
const archivedHtmlDir = path.join(apiRoot, "legacy", "public-html", "app-core");
const { app } = require("../server.js");

const retiredAppHtmlPages = [
  "accounts",
  "analytics",
  "categories",
  "change-email",
  "exports",
  "help",
  "invoices",
  "messages",
  "mileage",
  "onboarding",
  "receipts",
  "sessions",
  "settings",
  "settings-mobile",
  "subscription",
  "transactions",
  "trial-setup",
  "upgrade"
];

test("Phase 2 retired app HTML is archived outside active public/html", () => {
  for (const page of retiredAppHtmlPages) {
    assert.equal(fs.existsSync(path.join(publicHtmlDir, `${page}.html`)), false, `${page}.html should not be active legacy HTML`);
    assert.equal(fs.existsSync(path.join(archivedHtmlDir, `${page}.html`)), true, `${page}.html should be archived`);
  }
});

test("Phase 2 retired app HTML URLs redirect to v3 canonical routes", async () => {
  for (const page of ["transactions", "accounts", "settings", "subscription", "trial-setup"]) {
    const canonical = `/${page}`;

    await request(app).get(`/${page}.html`).expect(301).expect("Location", canonical);
    await request(app).get(`/html/${page}`).expect(301).expect("Location", canonical);
    await request(app).get(`/html/${page}.html`).expect(301).expect("Location", canonical);
  }

  await request(app).get("/settings-mobile").expect(301).expect("Location", "/settings");
  await request(app).get("/html/settings-mobile.html").expect(301).expect("Location", "/settings");
});
