// @ts-check
const { chromium } = require("@playwright/test");
const { Pool } = require("pg");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const { seedDefaultCategoriesForBusiness } = require("../../api/utils/seedDefaultsForBusiness");

const BASE = "http://localhost:8080";
const SS_PATH = path.join(__dirname, "screenshots", "auth.json");
const STATE_FILE = path.join(__dirname, "screenshots", "run-state.json");
const TOKEN_FILE = path.join(__dirname, "screenshots", "session-token.json");

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
        "Origin": BASE,
        "Referer": `${BASE}/`,
      },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const DEFAULT_TRIAL_DAYS = 30;

module.exports = async function globalSetup() {
  const ts = Date.now();
  const email = `e2e+${ts}@test.inexledger.local`;
  const password = "E2eTest!9x";

  // 1. Register via HTTP
  console.log(`\n[setup] Registering ${email}`);
  const reg = await httpPost("/api/auth/register", {
    first_name: "E2E",
    last_name: "Smoke",
    email,
    password,
    country: "US",
    tos_consent: true,
    language: "en",
  });
  console.log(`[setup] Register → ${reg.status}`, JSON.stringify(reg.body).slice(0, 120));
  if (![201, 409].includes(reg.status)) {
    throw new Error(`Registration failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  }

  // 2. Set up account state directly in DB (bypass browser-based onboarding/trial-setup)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Verify email
  await pool.query("UPDATE users SET email_verified = true WHERE email = $1", [email]);
  console.log("[setup] Email verified in DB");

  // Get user ID
  const userRow = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  const userId = userRow.rows[0]?.id;
  if (!userId) throw new Error("User not found after registration");

  // Create business
  const businessId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO businesses (
       id, user_id, name, region, language, contact_full_name, address,
       business_activity_code, accounting_method, material_participation, business_type
     )
     VALUES ($1, $2, $3, 'US', 'en', $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING`,
    [
      businessId,
      userId,
      "Acme Consulting LLC",
      "E2E Smoke",
      "123 Main St, Austin, TX 78701",
      "541511",
      "cash",
      true,
      "sole_proprietorship"
    ]
  );

  // Set active business and mark onboarding complete
  const onboardingData = JSON.stringify({
    business_name: "Acme Consulting LLC",
    starter_account_type: "checking",
    start_focus: "transactions",
    region: "US",
    province: "",
    language: "en",
    business_activity_code: "541511",
    accounting_method: "cash",
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
    [businessId, onboardingData, userId]
  );
  console.log("[setup] Business + onboarding set up in DB");

  // Create trial subscription (30 days) with trial_plan_selection=free so
  // shouldRedirectToTrialSetup returns false and login goes straight to /transactions
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const subMetadata = JSON.stringify({ trial_plan_selection: "free" });
  await pool.query(
    `INSERT INTO business_subscriptions (id, business_id, provider, plan_code, status,
       trial_started_at, trial_ends_at, current_period_start, current_period_end, metadata_json)
     VALUES ($1, $2, 'stripe', 'v1', 'trialing', $3, $4, $3, $4, $5::jsonb)
     ON CONFLICT (business_id) DO NOTHING`,
    [crypto.randomUUID(), businessId, now, trialEndsAt, subMetadata]
  );
  console.log("[setup] Trial subscription created in DB (Basic plan selection)");

  // Seed default categories so the transaction drawer has options to pick from
  const seeded = await seedDefaultCategoriesForBusiness(pool, businessId);
  console.log(`[setup] Default categories seeded → ${seeded.length} categories`);

  await pool.end();

  // 3. Browser login — should go straight to /transactions now
  fs.mkdirSync(path.dirname(SS_PATH), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`);
  // Fields start as readonly — focus removes readonly per login.js
  await page.locator("#email").click();
  await page.locator("#email").fill(email);
  await page.locator("#password").click();
  await page.locator("#password").fill(password);
  await page.locator(".auth-submit").click();

  // Wait for URL to settle — should land on /transactions
  await page.waitForURL(/\/(onboarding|trial-setup|transactions)/, { timeout: 20_000 });
  await page.waitForTimeout(2000);
  console.log("[setup] Logged in →", page.url());

  // Fallback: handle onboarding if it appears (shouldn't, but just in case)
  if (page.url().includes("onboarding")) {
    console.warn("[setup] Unexpectedly on onboarding — completing via UI");
    await page.waitForSelector("#onboardingBusinessName", { timeout: 10_000 });
    await page.locator("#onboardingBusinessName").fill("Acme Consulting LLC");
    await page.locator("#onboardingRegion").selectOption("US");
    await page.locator("#onboardingNextBtn").click();
    await page.waitForSelector("#onboardingScreen2:not([hidden])", { timeout: 10_000 });
    await page.locator('[data-goal="transactions"]').click();
    await page.locator("#onboardingSubmitBtn").click();
    await page.waitForURL(/\/(trial-setup|transactions)/, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    console.log("[setup] Onboarding complete →", page.url());
  }

  if (page.url().includes("trial-setup")) {
    await page.waitForSelector("#trialSetupBasicBtn:not([disabled])", { timeout: 10_000 });
    await page.locator("#trialSetupBasicBtn").click();
    await page.waitForURL(/\/transactions/, { timeout: 15_000 });
    console.log("[setup] Trial setup → Basic selected");
  }

  // Save the access token from sessionStorage so tests can inject it directly
  // (avoiding the single-use refresh token rotation problem)
  const sessionToken = await page.evaluate(() => sessionStorage.getItem("token") || "").catch(() => "");
  console.log("[setup] Session token captured:", sessionToken ? "yes" : "no");

  // Pre-accept cookie consent so the banner never blocks form buttons during tests
  await page.evaluate(() => {
    localStorage.setItem("lb_cookie_consent", JSON.stringify({
      decision: "accepted",
      version: "1",
      at: Date.now(),
    }));
  }).catch(() => {});
  console.log("[setup] Cookie consent pre-accepted");

  await ctx.storageState({ path: SS_PATH });
  await browser.close();
  console.log("[setup] Auth state saved →", SS_PATH);

  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: sessionToken }));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ email, password }));
  console.log("[setup] Done\n");
};
