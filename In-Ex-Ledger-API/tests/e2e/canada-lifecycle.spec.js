// @ts-check
const { test, expect } = require("@playwright/test");
const { chromium } = require("playwright");
const { Pool } = require("pg");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { seedDefaultCategoriesForBusiness } = require("../../api/utils/seedDefaultsForBusiness");

const BASE = "http://localhost:8080";
const CURRENT_YEAR = new Date().getFullYear();
const SHOT_DIR = path.join(__dirname, "screenshots");
const TOKEN_PATH = path.join(SHOT_DIR, "session-token-ca.json");
const STATE = {
  email: "",
  password: "E2eCanada!9x",
  businessId: "",
  accountId: "",
  categoryId: "",
  token: "",
};

function httpPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "localhost",
      port: 8080,
      path: urlPath,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        Origin: BASE,
        Referer: `${BASE}/`,
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function setupCanadaUser() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  STATE.email = `e2e+ca+${Date.now()}@test.inexledger.local`;

  const reg = await httpPost("/api/auth/register", {
    first_name: "E2E",
    last_name: "Canada",
    email: STATE.email,
    password: STATE.password,
    country: "CA",
    tos_consent: true,
    language: "en",
  });
  if (![201, 409].includes(reg.status)) {
    throw new Error(`CA registration failed: ${reg.status}`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query("UPDATE users SET email_verified = true WHERE email = $1", [STATE.email]);
    const userRow = await pool.query("SELECT id FROM users WHERE email = $1", [STATE.email]);
    const userId = userRow.rows[0]?.id;
    if (!userId) throw new Error("Canada user not found after registration");

    STATE.businessId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO businesses (id, user_id, name, region, province, language, contact_full_name)
       VALUES ($1, $2, $3, 'CA', 'ON', 'en', $4)
       ON CONFLICT DO NOTHING`,
      [STATE.businessId, userId, "Maple Studio Inc", "E2E Canada"]
    );

    const onboardingData = JSON.stringify({
      business_name: "Maple Studio Inc",
      starter_account_type: "checking",
      start_focus: "transactions",
      region: "CA",
      province: "ON",
      language: "en",
      guided_setup_active: false,
      guided_setup_step: "complete",
    });
    await pool.query(
      `UPDATE users
          SET active_business_id = $1,
              onboarding_completed = true,
              onboarding_completed_at = NOW(),
              onboarding_data = $2::jsonb
        WHERE id = $3`,
      [STATE.businessId, onboardingData, userId]
    );

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const subMetadata = JSON.stringify({
      trial_plan_selection: "free",
      currency: "cad",
      billing_interval: "monthly",
    });
    await pool.query(
      `INSERT INTO business_subscriptions (
         id, business_id, provider, plan_code, status,
         trial_started_at, trial_ends_at, current_period_start, current_period_end,
         metadata_json
       )
       VALUES ($1, $2, 'stripe', 'v1', 'trialing', $3, $4, $3, $4, $5::jsonb)
       ON CONFLICT (business_id) DO NOTHING`,
      [crypto.randomUUID(), STATE.businessId, now, trialEndsAt, subMetadata]
    );

    await seedDefaultCategoriesForBusiness(pool, STATE.businessId);
  } finally {
    await pool.end();
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator("#email").click();
  await page.locator("#email").fill(STATE.email);
  await page.locator("#password").click();
  await page.locator("#password").fill(STATE.password);
  await page.locator(".auth-submit").click();
  await page.waitForURL(/\/(transactions|trial-setup|onboarding)/, { timeout: 20000 });

  if (page.url().includes("trial-setup")) {
    await page.locator("#trialSetupBasicBtn").click();
    await page.waitForURL(/\/transactions/, { timeout: 15000 });
  }
  const token = await page.evaluate(() => sessionStorage.getItem("token") || "").catch(() => "");
  STATE.token = token;
  await page.evaluate(() => {
    localStorage.setItem("lb_cookie_consent", JSON.stringify({
      decision: "accepted",
      version: "1",
      at: Date.now(),
    }));
  }).catch(() => {});
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token }));
  await browser.close();
}

test.beforeAll(async () => {
  await setupCanadaUser();
});

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.locator("#email").click();
  await page.locator("#email").fill(STATE.email);
  await page.locator("#password").click();
  await page.locator("#password").fill(STATE.password);
  await page.locator(".auth-submit").click();
  await page.waitForURL(/\/(transactions|trial-setup|onboarding)/, { timeout: 20000 });

  if (page.url().includes("trial-setup")) {
    await page.locator("#trialSetupBasicBtn").click();
    await page.waitForURL(/\/transactions/, { timeout: 15000 });
  }

  await page.evaluate(() => {
    localStorage.setItem("lb_cookie_consent", JSON.stringify({
      decision: "accepted",
      version: "1",
      at: Date.now(),
    }));
  }).catch(() => {});
});

async function api(page, method, urlPath, body) {
  return page.evaluate(
    async ({ method, urlPath, body }) => {
      const opts = { method, headers: { "Content-Type": "application/json" } };
      if (body) opts.body = JSON.stringify(body);
      const res = await apiFetch(urlPath, opts);
      const text = await res.text();
      try {
        return { ok: res.ok, status: res.status, data: JSON.parse(text) };
      } catch {
        return { ok: res.ok, status: res.status, data: text };
      }
    },
    { method, urlPath, body }
  );
}

async function ss(page, name) {
  await page.screenshot({
    path: path.join(SHOT_DIR, `ca-${name}.png`),
    fullPage: true,
  }).catch(() => {});
}

test.describe.serial("Canada lifecycle", () => {
  test("creates CAD account, transactions, mileage, and validates export math surfaces", async ({ page }) => {
    await page.goto(`${BASE}/accounts`);
    await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 20000 });
    await page.locator("#showAccountForm").click();
    await page.waitForSelector("#accountFormContainer:not([hidden])", { timeout: 8000 });
    await page.locator("#account-name").fill("RBC Business Chequing");
    await page.locator('[data-chip-type="checking"]').click();
    await page.locator('#accountForm button[type="submit"]').click();
    await page.waitForTimeout(1500);

    const accountsResult = await api(page, "GET", "/api/accounts");
    const accounts = accountsResult.data.accounts || accountsResult.data.data || accountsResult.data || [];
    const accountArr = Array.isArray(accounts) ? accounts : Object.values(accounts);
    const account = accountArr.find((item) => /RBC Business Chequing/i.test(item.name));
    expect(account).toBeTruthy();
    STATE.accountId = account.id;

    const categoriesResult = await api(page, "GET", "/api/categories");
    const categories = categoriesResult.data.categories || categoriesResult.data.data || categoriesResult.data || [];
    const categoryArr = Array.isArray(categories) ? categories : Object.values(categories);
    const expenseCategory =
      categoryArr.find((item) => /office/i.test(item.name)) ||
      categoryArr.find((item) => item.kind === "expense");
    const incomeCategory =
      categoryArr.find((item) => /service income|sales revenue|income/i.test(item.name)) ||
      categoryArr.find((item) => item.kind === "income");
    expect(expenseCategory).toBeTruthy();
    expect(incomeCategory).toBeTruthy();

    const txPayloads = [
      { type: "income", date: `${CURRENT_YEAR}-01-12`, description: "Toronto retainers", amount: 5000, category_id: incomeCategory.id, account_id: STATE.accountId },
      { type: "income", date: `${CURRENT_YEAR}-02-12`, description: "Montreal project", amount: 2400, category_id: incomeCategory.id, account_id: STATE.accountId },
      { type: "expense", date: `${CURRENT_YEAR}-01-16`, description: "Office Depot supplies", amount: 200, category_id: expenseCategory.id, account_id: STATE.accountId },
      { type: "expense", date: `${CURRENT_YEAR}-02-22`, description: "Client train travel", amount: 150, category_id: expenseCategory.id, account_id: STATE.accountId },
    ];
    for (const payload of txPayloads) {
      const result = await api(page, "POST", "/api/transactions", payload);
      expect(result.ok, `Transaction failed: ${JSON.stringify(result.data)}`).toBe(true);
    }

    await page.goto(`${BASE}/transactions`);
    await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 20000 });
    const allChip = page.locator('.tx-period-chip[data-period="all"]');
    if (await allChip.count()) {
      await allChip.click();
    }
    await page.waitForFunction(
      () => document.body.innerText.includes("Toronto retainers"),
      { timeout: 15000 }
    );
    const body = await page.locator("body").innerText();
    expect(body).toContain("CA$");
    expect(/Canada T2125/i.test(body)).toBe(true);
    expect(/Toronto retainers/i.test(body)).toBe(true);
    await ss(page, "transactions");

    await page.goto(`${BASE}/mileage`);
    await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 20000 });
    await page.waitForSelector("#mileageDate", { timeout: 10000 });
    await page.locator("#mileageDate").fill(`${CURRENT_YEAR}-03-03`);
    await page.locator("#mileagePurpose").fill("Ottawa client visit");
    await page.locator("#mileageDistance").fill("124");
    await page.locator('#mileageForm button[type="submit"]').click();
    await page.waitForTimeout(2000);
    const mileageBody = await page.locator("body").innerText();
    expect(/km|kilomet/i.test(mileageBody)).toBe(true);
    await ss(page, "mileage");

    const mileageResult = await api(page, "GET", "/api/mileage");
    expect(mileageResult.ok).toBe(true);
    const mileageItems = mileageResult.data.items || mileageResult.data.data || mileageResult.data || [];
    const mileageArr = Array.isArray(mileageItems) ? mileageItems : Object.values(mileageItems);
    const createdTrip = mileageArr.find((item) => /Ottawa client visit/i.test(item.purpose || item.title || ""));
    expect(createdTrip).toBeTruthy();
    const numericDistance = Number(createdTrip.km || createdTrip.distance_km || createdTrip.distance || 0);
    expect(numericDistance).toBeCloseTo(124, 0);

    await page.goto(`${BASE}/exports`);
    await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 20000 });
    await page.waitForTimeout(2500);
    const exportsBody = await page.locator("body").innerText();
    expect(/T2125|Canada|GST|HST|CAD/i.test(exportsBody)).toBe(true);
    await ss(page, "exports");

    const overviewResult = await api(page, "GET", "/api/billing/overview");
    expect(overviewResult.ok).toBe(true);
    expect(String(overviewResult.data?.subscription?.currency || "").toLowerCase()).toBe("cad");

    const transactionsResult = await api(page, "GET", "/api/transactions?period=all");
    expect(transactionsResult.ok).toBe(true);
    const summary = transactionsResult.data.summary || null;
    if (summary) {
      expect(Number(summary.income_total || 0)).toBeCloseTo(7400, 2);
      expect(Number(summary.expense_total || 0)).toBeCloseTo(350, 2);
    }
  });
});
