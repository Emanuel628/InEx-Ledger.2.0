// @ts-check
const { Pool } = require("pg");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const { seedDefaultCategoriesForBusiness } = require("../../api/utils/seedDefaultsForBusiness");
const { generateCsrfToken } = require("../../middleware/csrf.middleware.js");
const { buildSslConfig } = require("../../utils/dbSslConfig.js");

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
        "Referer": `${BASE}/`
      }
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: {}, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const DEFAULT_TRIAL_DAYS = 30;

function parseSetCookieHeader(setCookieHeader) {
  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : (setCookieHeader ? [setCookieHeader] : []);

  return headers.map((header) => {
    const parts = String(header).split(";").map((part) => part.trim()).filter(Boolean);
    const [nameValue, ...attrs] = parts;
    const separatorIndex = nameValue.indexOf("=");
    const name = separatorIndex >= 0 ? nameValue.slice(0, separatorIndex) : nameValue;
    const value = separatorIndex >= 0 ? nameValue.slice(separatorIndex + 1) : "";
    const cookie = {
      name,
      value,
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax"
    };

    for (const attr of attrs) {
      const [rawKey, ...rawValueParts] = attr.split("=");
      const key = rawKey.toLowerCase();
      const attrValue = rawValueParts.join("=");
      if (key === "path" && attrValue) cookie.path = attrValue;
      if (key === "expires" && attrValue) {
        const expiresAt = Date.parse(attrValue);
        if (!Number.isNaN(expiresAt)) cookie.expires = Math.floor(expiresAt / 1000);
      }
      if (key === "httponly") cookie.httpOnly = true;
      if (key === "secure") cookie.secure = true;
      if (key === "samesite" && attrValue) {
        const normalized = attrValue.toLowerCase();
        cookie.sameSite = normalized === "strict" ? "Strict" : normalized === "none" ? "None" : "Lax";
      }
    }

    return cookie;
  }).filter((cookie) => cookie.name);
}

function writeStorageState({ authCookies }) {
  fs.writeFileSync(SS_PATH, JSON.stringify({
    cookies: [
      ...authCookies.filter((cookie) => cookie.name !== "csrf_token"),
      {
        name: "csrf_token",
        value: generateCsrfToken(),
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: "Strict"
      }
    ],
    origins: [{
      origin: BASE,
      localStorage: [{
        name: "lb_cookie_consent",
        value: JSON.stringify({
          decision: "accepted",
          version: "1",
          at: Date.now()
        })
      }]
    }]
  }, null, 2));
}

module.exports = async function globalSetup() {
  const ts = Date.now();
  const email = `e2e+${ts}@test.inexledger.local`;
  const password = "E2eTest!9x";

  console.log(`\n[setup] Registering ${email}`);
  const reg = await httpPost("/api/auth/register", {
    first_name: "E2E",
    last_name: "Smoke",
    email,
    password,
    country: "US",
    tos_consent: true,
    language: "en"
  });
  console.log(`[setup] Register -> ${reg.status}`, JSON.stringify(reg.body).slice(0, 120));
  if (![201, 409].includes(reg.status)) {
    throw new Error(`Registration failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: buildSslConfig()
  });

  await pool.query("UPDATE users SET email_verified = true WHERE email = $1", [email]);
  console.log("[setup] Email verified in DB");

  const userRow = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  const userId = userRow.rows[0]?.id;
  if (!userId) throw new Error("User not found after registration");

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
    guided_setup_step: "complete"
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

  const seeded = await seedDefaultCategoriesForBusiness(pool, businessId);
  console.log(`[setup] Default categories seeded -> ${seeded.length} categories`);
  await pool.end();

  fs.mkdirSync(path.dirname(SS_PATH), { recursive: true });
  const login = await httpPost("/api/auth/login", { email, password });
  console.log(`[setup] Login -> ${login.status}`, JSON.stringify(login.body).slice(0, 120));
  if (login.status !== 200 || login.body?.mfa_required) {
    throw new Error(`Login failed during setup: ${login.status} ${JSON.stringify(login.body)}`);
  }

  const authCookies = parseSetCookieHeader(login.headers?.["set-cookie"]);
  const authCookieNames = new Set(authCookies.map((cookie) => cookie.name));
  if (!authCookieNames.has("access_token") || !authCookieNames.has("refresh_token")) {
    throw new Error(`Login did not return required auth cookies: ${[...authCookieNames].join(", ") || "none"}`);
  }

  writeStorageState({ authCookies });
  console.log("[setup] Auth state saved ->", SS_PATH);

  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: "" }));
  fs.writeFileSync(STATE_FILE, JSON.stringify({ email, password }));
  console.log("[setup] Done\n");
};
