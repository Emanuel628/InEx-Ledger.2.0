#!/usr/bin/env node
/**
 * seed-dev.mjs — Local Development Seed Script
 *
 * Connects to the local development database (DATABASE_URL), runs all pending
 * migrations, then inserts a realistic set of data so you can explore the app
 * immediately without manual setup.
 *
 * Personas seeded
 * ─────────────────────────────────────────────────────────────────────────────
 * Email                          Password        Notes
 * ─────────────────────────────────────────────────────────────────────────────
 * dev@inexledger.local           DevPassword1!   Fully onboarded US user.
 *                                                2 businesses (switch test),
 *                                                3 accounts, 21 categories,
 *                                                11 transactions (incl. 1 edge
 *                                                case), 4 mileage entries,
 *                                                2 recurring rules, 1 receipt.
 * unverified@inexledger.local    DevPassword1!   Brand-new signup — email NOT
 *                                                verified, no business yet.
 * verified@inexledger.local      DevPassword1!   Email verified, but onboarding
 *                                                not yet completed.
 * canada@inexledger.local        DevPassword1!   Fully onboarded Canadian user
 *                                                (CA / fr), 5 transactions in CAD.
 * mfa@inexledger.local           DevPassword1!   Email verified, MFA enabled,
 *                                                fully onboarded US user.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   # From the In-Ex-Ledger-API directory:
 *   node scripts/seed-dev.mjs
 *
 *   # Wipe all seed data first, then re-seed (DESTRUCTIVE — local only):
 *   node scripts/seed-dev.mjs --wipe
 *
 *   # Or via npm:
 *   npm run seed:dev
 *
 * Prerequisites:
 *   • DATABASE_URL must point to a running Postgres instance.
 *     The easiest way is:  docker compose -f ../docker-compose.dev.yml up -d
 *   • All env vars from .env (or .env.test) should be loaded first, e.g.:
 *       export $(grep -v '^#' .env | xargs) && node scripts/seed-dev.mjs
 *
 * Idempotency:
 *   Re-running the script inserts a fresh dataset under a new user/business
 *   (UUIDs are randomly generated each run).  Pass --wipe to truncate all
 *   seed tables before inserting (DESTRUCTIVE — use only on local dev DBs).
 */

import "dotenv/config";
import pg from "pg";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://inex:inex@localhost:5432/inex_ledger";

const WIPE = process.argv.includes("--wipe");

const SEED_USER_PASSWORD = "DevPassword1!";

// Persona definitions
const PERSONAS = {
  dev: {
    email: "dev@inexledger.local",
    label: "Fully onboarded US user",
    emailVerified: true,
    onboardingCompleted: true,
    twoFactorEnabled: false,
  },
  unverified: {
    email: "unverified@inexledger.local",
    label: "Brand-new unverified user",
    emailVerified: false,
    onboardingCompleted: false,
    twoFactorEnabled: false,
  },
  verified: {
    email: "verified@inexledger.local",
    label: "Verified but onboarding incomplete",
    emailVerified: true,
    onboardingCompleted: false,
    twoFactorEnabled: false,
  },
  canada: {
    email: "canada@inexledger.local",
    label: "Fully onboarded Canadian user (CA/fr)",
    emailVerified: true,
    onboardingCompleted: true,
    twoFactorEnabled: false,
  },
  mfa: {
    email: "mfa@inexledger.local",
    label: "MFA-enabled US user",
    emailVerified: true,
    onboardingCompleted: true,
    twoFactorEnabled: true,
  },
};

// Legacy constant kept for readability in section headers
const SEED_BUSINESS_NAME = "Acme Freelance LLC";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid() {
  return crypto.randomUUID();
}

/** Pad a number to 2 digits */
function pad(n) {
  return String(n).padStart(2, "0");
}

/** Returns an ISO date string YYYY-MM-DD offset by `daysAgo` from today */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function log(msg) {
  console.log(`[seed-dev] ${msg}`);
}

function logSection(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

// ---------------------------------------------------------------------------
// Migration runner (mirrors db.js logic, self-contained)
// ---------------------------------------------------------------------------

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum   TEXT        NOT NULL
    )
  `);

  const { rows } = await pool.query(
    "SELECT filename, checksum FROM schema_migrations ORDER BY filename"
  );
  const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

  const migrationsDir = path.resolve(__dirname, "../db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const normalizeChecksumContent = (content) => String(content).replace(/\r\n/g, "\n");

  let ran = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const checksum = crypto
      .createHash("sha256")
      .update(normalizeChecksumContent(sql), "utf8")
      .digest("hex");

    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(
          `Migration content drift detected: ${file} — checksum mismatch. ` +
            "Do not edit applied migrations."
        );
      }
      continue; // already applied
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
        [file, checksum]
      );
      await client.query("COMMIT");
      log(`  ✓  ${file}`);
      ran++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  if (ran === 0) {
    log("  All migrations already applied.");
  } else {
    log(`  ${ran} migration(s) applied.`);
  }
}

// ---------------------------------------------------------------------------
// Wipe helpers
// ---------------------------------------------------------------------------

async function wipeSeedData(pool) {
  log("Wiping seed tables (--wipe flag detected)…");
  // Order respects FK constraints
  await pool.query("DELETE FROM recurring_transaction_runs");
  await pool.query("DELETE FROM recurring_transactions");
  await pool.query("DELETE FROM receipts");
  await pool.query("DELETE FROM mileage");
  await pool.query("DELETE FROM transactions");
  await pool.query("DELETE FROM categories");
  await pool.query("DELETE FROM accounts");
  await pool.query("DELETE FROM businesses");
  const emails = Object.values(PERSONAS).map((p) => p.email);
  await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [emails]);
  log("Wipe complete.");
}

// ---------------------------------------------------------------------------
// Seed: user (supports multiple personas)
// ---------------------------------------------------------------------------

async function seedUser(pool, persona) {
  const id = uuid();
  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users
       (id, email, password_hash,
        email_verified,
        onboarding_completed,
        mfa_enabled,
        created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (email) DO NOTHING`,
    [id, persona.email, passwordHash,
     persona.emailVerified,
     persona.onboardingCompleted,
     persona.twoFactorEnabled]
  );

  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [persona.email]);
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Seed: business
// ---------------------------------------------------------------------------

async function seedBusiness(pool, userId, { name = SEED_BUSINESS_NAME, region = "US", language = "en" } = {}) {
  const id = uuid();
  await pool.query(
    `INSERT INTO businesses (id, user_id, name, region, language, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [id, userId, name, region, language]
  );
  return id;
}

// ---------------------------------------------------------------------------
// Seed: accounts
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  { name: "Checking", type: "asset" },
  { name: "Cash", type: "asset" },
  { name: "Credit Card", type: "liability" },
];

async function seedAccounts(pool, businessId, list = ACCOUNTS) {
  const ids = {};
  for (const acct of list) {
    const id = uuid();
    await pool.query(
      `INSERT INTO accounts (id, business_id, name, type, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [id, businessId, acct.name, acct.type]
    );
    ids[acct.name] = id;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Seed: categories
// ---------------------------------------------------------------------------

const CATEGORIES_US = [
  { name: "Sales Revenue",          kind: "income",  color: "green", tax_map_us: "gross_receipts_sales" },
  { name: "Service Income",         kind: "income",  color: "green", tax_map_us: "gross_receipts_sales" },
  { name: "Interest Income",        kind: "income",  color: "green", tax_map_us: "interest_income" },
  { name: "Other Income",           kind: "income",  color: "slate", tax_map_us: "other_income" },
  { name: "Advertising & Marketing",kind: "expense", color: "blue",  tax_map_us: "advertising" },
  { name: "Bank Fees",              kind: "expense", color: "slate", tax_map_us: "bank_fees" },
  { name: "Car & Truck Expenses",   kind: "expense", color: "amber", tax_map_us: "car_truck" },
  { name: "Contract Labor",         kind: "expense", color: "blue",  tax_map_us: "contract_labor" },
  { name: "Home Office",            kind: "expense", color: "amber", tax_map_us: "home_office" },
  { name: "Insurance",              kind: "expense", color: "blue",  tax_map_us: "insurance_other_than_health" },
  { name: "Legal & Professional",   kind: "expense", color: "slate", tax_map_us: "legal_professional" },
  { name: "Meals",                  kind: "expense", color: "amber", tax_map_us: "meals" },
  { name: "Office Supplies",        kind: "expense", color: "blue",  tax_map_us: "office_expense" },
  { name: "Rent",                   kind: "expense", color: "blue",  tax_map_us: "rent_lease_other" },
  { name: "Repairs & Maintenance",  kind: "expense", color: "slate", tax_map_us: "repairs_maintenance" },
  { name: "Sales Tax",              kind: "expense", color: "red",   tax_map_us: "taxes_licenses" },
  { name: "Software & Subscriptions",kind:"expense", color: "blue",  tax_map_us: "software_subscriptions" },
  { name: "Travel",                 kind: "expense", color: "amber", tax_map_us: "travel" },
  { name: "Utilities",              kind: "expense", color: "slate", tax_map_us: "utilities" },
  { name: "Wages & Salaries",       kind: "expense", color: "blue",  tax_map_us: "wages" },
  { name: "Other Expense",          kind: "expense", color: "slate", tax_map_us: "other_expense" },
];

const CATEGORIES_CA = [
  { name: "Sales Revenue",            kind: "income",  color: "green", tax_map_ca: "sales" },
  { name: "Service Income",           kind: "income",  color: "green", tax_map_ca: "sales" },
  { name: "GST/HST Collected",        kind: "income",  color: "green", tax_map_ca: "gst_hst_collected" },
  { name: "Grants & Subsidies",       kind: "income",  color: "green", tax_map_ca: "subsidies_grants" },
  { name: "Other Income",             kind: "income",  color: "slate", tax_map_ca: "other_income" },
  { name: "Advertising",              kind: "expense", color: "blue",  tax_map_ca: "advertising" },
  { name: "Business Tax & Licenses",  kind: "expense", color: "red",   tax_map_ca: "business_tax_fees_licenses_memberships" },
  { name: "Delivery & Freight",       kind: "expense", color: "amber", tax_map_ca: "delivery_freight" },
  { name: "GST/HST Paid",             kind: "expense", color: "red",   tax_map_ca: "gst_hst_paid" },
  { name: "Home Office",              kind: "expense", color: "amber", tax_map_ca: "home_office" },
  { name: "Insurance",                kind: "expense", color: "blue",  tax_map_ca: "insurance" },
  { name: "Interest & Bank Charges",  kind: "expense", color: "slate", tax_map_ca: "interest_bank_charges" },
  { name: "Legal & Accounting Fees",  kind: "expense", color: "slate", tax_map_ca: "legal_accounting" },
  { name: "Meals & Entertainment",    kind: "expense", color: "amber", tax_map_ca: "meals_entertainment" },
  { name: "Motor Vehicle",            kind: "expense", color: "amber", tax_map_ca: "motor_vehicle" },
  { name: "Office Supplies",          kind: "expense", color: "blue",  tax_map_ca: "office_expense" },
  { name: "Property Taxes",           kind: "expense", color: "red",   tax_map_ca: "property_taxes" },
  { name: "Rent",                     kind: "expense", color: "blue",  tax_map_ca: "rent" },
  { name: "Repairs & Maintenance",    kind: "expense", color: "slate", tax_map_ca: "maintenance_repairs" },
  { name: "Salaries & Wages",         kind: "expense", color: "blue",  tax_map_ca: "salaries_wages_benefits" },
  { name: "Travel",                   kind: "expense", color: "amber", tax_map_ca: "travel" },
  { name: "Utilities",                kind: "expense", color: "slate", tax_map_ca: "utilities" },
  { name: "Other Expense",            kind: "expense", color: "slate", tax_map_ca: "other_expense" },
];

async function seedCategories(pool, businessId, region = "US") {
  const list = region === "CA" ? CATEGORIES_CA : CATEGORIES_US;
  const ids = {};
  for (const cat of list) {
    const id = uuid();
    await pool.query(
      `INSERT INTO categories
         (id, business_id, name, kind, color, tax_map_us, tax_map_ca, is_default, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())`,
      [id, businessId, cat.name, cat.kind, cat.color,
       cat.tax_map_us || null, cat.tax_map_ca || null]
    );
    ids[cat.name] = id;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Seed: transactions
// ---------------------------------------------------------------------------

function buildTransactions(businessId, accountIds, categoryIds) {
  const checking = accountIds["Checking"];
  const card = accountIds["Credit Card"];

  return [
    // Income
    {
      type: "income",
      amount: 4500.0,
      date: daysAgo(90),
      description: "January consulting invoice — Client A",
      account_id: checking,
      category_id: categoryIds["Service Income"],
    },
    {
      type: "income",
      amount: 3200.0,
      date: daysAgo(75),
      description: "Website build — Client B",
      account_id: checking,
      category_id: categoryIds["Sales Revenue"],
    },
    {
      type: "income",
      amount: 1800.0,
      date: daysAgo(60),
      description: "February consulting invoice — Client A",
      account_id: checking,
      category_id: categoryIds["Service Income"],
    },
    {
      type: "income",
      amount: 5000.0,
      date: daysAgo(30),
      description: "March retainer — Client C",
      account_id: checking,
      category_id: categoryIds["Service Income"],
    },
    {
      type: "income",
      amount: 12.5,
      date: daysAgo(15),
      description: "Bank interest",
      account_id: checking,
      category_id: categoryIds["Interest Income"],
    },
    // Expenses
    {
      type: "expense",
      amount: 1200.0,
      date: daysAgo(89),
      description: "January home office rent",
      account_id: checking,
      category_id: categoryIds["Rent"],
    },
    {
      type: "expense",
      amount: 49.99,
      date: daysAgo(80),
      description: "Figma annual subscription",
      account_id: card,
      category_id: categoryIds["Software & Subscriptions"],
    },
    {
      type: "expense",
      amount: 87.4,
      date: daysAgo(70),
      description: "Client dinner",
      account_id: card,
      category_id: categoryIds["Meals"],
    },
    {
      type: "expense",
      amount: 320.0,
      date: daysAgo(45),
      description: "Printer and toner cartridges",
      account_id: card,
      category_id: categoryIds["Office Supplies"],
    },
    {
      type: "expense",
      amount: 1200.0,
      date: daysAgo(59),
      description: "February home office rent",
      account_id: checking,
      category_id: categoryIds["Rent"],
    },
    // Edge-case: uncategorized transaction with no description
    {
      type: "expense",
      amount: 0.01,
      date: daysAgo(5),
      description: null,
      account_id: checking,
      category_id: null,
    },
  ];
}

async function seedTransactions(pool, businessId, accountIds, categoryIds) {
  const transactions = buildTransactions(businessId, accountIds, categoryIds);
  let firstId = null;
  for (const tx of transactions) {
    const id = uuid();
    if (!firstId) firstId = id;
    await pool.query(
      `INSERT INTO transactions
         (id, business_id, account_id, category_id, type, amount, date,
          description, cleared, is_adjustment, is_void, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, false, false, NOW())`,
      [
        id,
        businessId,
        tx.account_id,
        tx.category_id,
        tx.type,
        tx.amount,
        tx.date,
        tx.description,
      ]
    );
  }
  return { count: transactions.length, firstId };
}

// ---------------------------------------------------------------------------
// Seed: mileage
// ---------------------------------------------------------------------------

async function seedMileage(pool, businessId) {
  const entries = [
    { date: daysAgo(85), purpose: "Client A onsite meeting", destination: "123 Main St", miles: 22.4 },
    { date: daysAgo(72), purpose: "Office supplies run", destination: "Staples", miles: 8.1 },
    { date: daysAgo(55), purpose: "Client B project kickoff", destination: "456 Oak Ave", miles: 31.0 },
    { date: daysAgo(40), purpose: "Post office — contract delivery", destination: "US Post Office", miles: 5.6 },
  ];

  for (const entry of entries) {
    await pool.query(
      `INSERT INTO mileage
         (id, business_id, trip_date, purpose, destination, miles, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [uuid(), businessId, entry.date, entry.purpose, entry.destination, entry.miles]
    );
  }
  return entries.length;
}

// ---------------------------------------------------------------------------
// Seed: receipt (attached to a transaction)
// ---------------------------------------------------------------------------

async function seedReceipt(pool, businessId, transactionId) {
  const id = uuid();
  await pool.query(
    `INSERT INTO receipts
       (id, business_id, transaction_id, filename, mime_type, storage_path, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      id,
      businessId,
      transactionId,
      "january-rent-receipt.pdf",
      "application/pdf",
      "dev-seed/receipts/january-rent-receipt.pdf",
    ]
  );
  return id;
}

// ---------------------------------------------------------------------------
// Seed: Canadian transactions
// ---------------------------------------------------------------------------

function buildTransactionsCA(businessId, accountIds, categoryIds) {
  const checking = accountIds["Chequing"];
  const card = accountIds["Credit Card"];
  return [
    {
      type: "income",
      amount: 6000.0,
      date: daysAgo(85),
      description: "Contrat de service — Client Montréal",
      account_id: checking,
      category_id: categoryIds["Service Income"],
    },
    {
      type: "income",
      amount: 300.0,
      date: daysAgo(85),
      description: "TPS/TVQ perçue sur contrat",
      account_id: checking,
      category_id: categoryIds["GST/HST Collected"],
    },
    {
      type: "expense",
      amount: 1500.0,
      date: daysAgo(80),
      description: "Loyer bureau à domicile — janvier",
      account_id: checking,
      category_id: categoryIds["Rent"],
    },
    {
      type: "expense",
      amount: 120.0,
      date: daysAgo(60),
      description: "Repas d'affaires — client Québec",
      account_id: card,
      category_id: categoryIds["Meals & Entertainment"],
    },
    {
      type: "expense",
      amount: 45.0,
      date: daysAgo(40),
      description: "TPS/TVQ payée sur fournitures",
      account_id: card,
      category_id: categoryIds["GST/HST Paid"],
    },
  ];
}

async function seedTransactionsCA(pool, businessId, accountIds, categoryIds) {
  const transactions = buildTransactionsCA(businessId, accountIds, categoryIds);
  for (const tx of transactions) {
    await pool.query(
      `INSERT INTO transactions
         (id, business_id, account_id, category_id, type, amount, date,
          description, cleared, is_adjustment, is_void, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, false, false, NOW())`,
      [uuid(), businessId, tx.account_id, tx.category_id,
       tx.type, tx.amount, tx.date, tx.description]
    );
  }
  return transactions.length;
}

async function seedRecurring(pool, businessId, accountIds, categoryIds) {
  const checking = accountIds["Checking"];
  const rules = [
    {
      account_id: checking,
      category_id: categoryIds["Rent"],
      amount: 1200.0,
      type: "expense",
      description: "Monthly home office rent",
      cadence: "monthly",
      start_date: daysAgo(90),
      next_run_date: daysAgo(0),
    },
    {
      account_id: checking,
      category_id: categoryIds["Service Income"],
      amount: 4500.0,
      type: "income",
      description: "Weekly consulting retainer — Client A",
      cadence: "weekly",
      start_date: daysAgo(90),
      next_run_date: daysAgo(0),
    },
  ];

  for (const rule of rules) {
    await pool.query(
      `INSERT INTO recurring_transactions
         (id, business_id, account_id, category_id, amount, type,
          description, cadence, start_date, next_run_date, active, cleared_default, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, false, NOW())`,
      [
        uuid(),
        businessId,
        rule.account_id,
        rule.category_id,
        rule.amount,
        rule.type,
        rule.description,
        rule.cadence,
        rule.start_date,
        rule.next_run_date,
      ]
    );
  }
  return rules.length;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary(personas, devBusinessId, caBizId) {
  logSection("Seed complete — login credentials");

  console.log("  ┌─────────────────────────────────────────────────────────────────┐");
  console.log("  │  All personas use password:  DevPassword1!                      │");
  console.log("  └─────────────────────────────────────────────────────────────────┘");
  console.log();

  for (const [key, { email, label, emailVerified, onboardingCompleted, twoFactorEnabled }] of Object.entries(personas)) {
    const flags = [
      emailVerified ? "✓ email verified" : "✗ email NOT verified",
      onboardingCompleted ? "✓ onboarded" : "✗ onboarding incomplete",
      twoFactorEnabled ? "✓ MFA enabled" : null,
    ].filter(Boolean).join("  ");
    console.log(`  ${email.padEnd(36)}  ${flags}`);
    console.log(`    ↳ ${label}`);
    if (key === "dev") {
      console.log(`    ↳ Two businesses (switch via app): "${SEED_BUSINESS_NAME}" and "Acme Consulting Inc"`);
    }
    console.log();
  }

  console.log("  Start the server:  npm start");
  console.log("  Open in browser:   http://localhost:8080");
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: false,
  });

  try {
    logSection("Running migrations");
    await runMigrations(pool);

    if (WIPE) {
      await wipeSeedData(pool);
    }

    // ── Persona: unverified ────────────────────────────────────────────────
    logSection(`Seeding persona: ${PERSONAS.unverified.email}`);
    log("Creating user (unverified)…");
    await seedUser(pool, PERSONAS.unverified);
    log("  Done — no business or data (brand-new signup state).");

    // ── Persona: verified (mid-onboarding) ────────────────────────────────
    logSection(`Seeding persona: ${PERSONAS.verified.email}`);
    log("Creating user (verified, onboarding incomplete)…");
    await seedUser(pool, PERSONAS.verified);
    log("  Done — no business or data.");

    // ── Persona: canada (CA/fr, fully onboarded) ──────────────────────────
    logSection(`Seeding persona: ${PERSONAS.canada.email}`);
    log("Creating user (Canadian, fr)…");
    const canadaUserId = await seedUser(pool, PERSONAS.canada);
    log("Creating CA business…");
    const caBizId = await seedBusiness(pool, canadaUserId, {
      name: "Services-Conseil Tremblay",
      region: "CA",
      language: "fr",
    });
    log("Seeding CA accounts…");
    const caAccountIds = await seedAccounts(pool, caBizId, [
      { name: "Chequing", type: "asset" },
      { name: "Cash", type: "asset" },
      { name: "Credit Card", type: "liability" },
    ]);
    log(`  3 accounts created`);
    log("Seeding CA categories…");
    const caCategoryIds = await seedCategories(pool, caBizId, "CA");
    log(`  ${CATEGORIES_CA.length} categories created`);
    log("Seeding CA transactions…");
    const caTxCount = await seedTransactionsCA(pool, caBizId, caAccountIds, caCategoryIds);
    log(`  ${caTxCount} transactions created`);

    // ── Persona: mfa ──────────────────────────────────────────────────────
    logSection(`Seeding persona: ${PERSONAS.mfa.email}`);
    log("Creating user (MFA enabled)…");
    const mfaUserId = await seedUser(pool, PERSONAS.mfa);
    log("Creating MFA user business…");
    const mfaBizId = await seedBusiness(pool, mfaUserId, {
      name: "SecureBooks Inc",
      region: "US",
      language: "en",
    });
    log("Seeding accounts for MFA user…");
    await seedAccounts(pool, mfaBizId);
    log(`  3 accounts created`);
    log("Seeding categories for MFA user…");
    await seedCategories(pool, mfaBizId, "US");
    log(`  ${CATEGORIES_US.length} categories created`);

    // ── Persona: dev (main US user, two businesses) ───────────────────────
    logSection(`Seeding persona: ${PERSONAS.dev.email}`);
    log("Creating user (fully onboarded US)…");
    const devUserId = await seedUser(pool, PERSONAS.dev);

    log("Creating primary business…");
    const devBizId = await seedBusiness(pool, devUserId, {
      name: SEED_BUSINESS_NAME,
      region: "US",
      language: "en",
    });

    log("Creating second business (for switch-business testing)…");
    await seedBusiness(pool, devUserId, {
      name: "Acme Consulting Inc",
      region: "US",
      language: "en",
    });

    log("Seeding accounts…");
    const accountIds = await seedAccounts(pool, devBizId);
    log(`  ${ACCOUNTS.length} accounts created`);

    log("Seeding categories…");
    const categoryIds = await seedCategories(pool, devBizId, "US");
    log(`  ${CATEGORIES_US.length} categories created`);

    log("Seeding transactions (incl. 1 edge-case)…");
    const { count: txCount, firstId: firstTxId } = await seedTransactions(
      pool, devBizId, accountIds, categoryIds
    );
    log(`  ${txCount} transactions created`);

    log("Seeding receipt (attached to first transaction)…");
    await seedReceipt(pool, devBizId, firstTxId);
    log("  1 receipt created");

    log("Seeding mileage…");
    const mileCount = await seedMileage(pool, devBizId);
    log(`  ${mileCount} mileage entries created`);

    log("Seeding recurring rules…");
    const recurCount = await seedRecurring(pool, devBizId, accountIds, categoryIds);
    log(`  ${recurCount} recurring rules created`);

    await printSummary(PERSONAS, devBizId, caBizId);
  } catch (err) {
    console.error("\n[seed-dev] ERROR:", err.message);
    if (process.env.SEED_DEBUG) console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
