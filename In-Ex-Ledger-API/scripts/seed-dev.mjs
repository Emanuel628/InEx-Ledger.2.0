#!/usr/bin/env node
/**
 * seed-dev.mjs — Local Development Seed Script
 *
 * Connects to the local development database (DATABASE_URL), runs all pending
 * migrations, then inserts a realistic set of data so you can explore the app
 * immediately without manual setup.
 *
 * What gets seeded:
 *   • 1 user                (dev@inexledger.local / password: DevPassword1!)
 *   • 1 US business         (Acme Freelance LLC)
 *   • 3 accounts            (Checking, Cash, Credit Card)
 *   • ~21 US categories     (default set — income + expense)
 *   • 10 transactions       (mix of income and expense, spread over Q1 2026)
 *   • 4 mileage entries     (client visits and supply runs)
 *   • 2 recurring rules     (monthly rent and weekly consulting income)
 *
 * Usage:
 *   # From the In-Ex-Ledger-API directory:
 *   node scripts/seed-dev.mjs
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

const SEED_USER_EMAIL = "dev@inexledger.local";
const SEED_USER_PASSWORD = "DevPassword1!";
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

  let ran = 0;
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const checksum = crypto.createHash("sha256").update(sql, "utf8").digest("hex");

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
  await pool.query("DELETE FROM mileage");
  await pool.query("DELETE FROM transactions");
  await pool.query("DELETE FROM categories");
  await pool.query("DELETE FROM accounts");
  await pool.query("DELETE FROM businesses");
  await pool.query("DELETE FROM users WHERE email = $1", [SEED_USER_EMAIL]);
  log("Wipe complete.");
}

// ---------------------------------------------------------------------------
// Seed: user
// ---------------------------------------------------------------------------

async function seedUser(pool) {
  const id = uuid();
  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (email) DO NOTHING`,
    [id, SEED_USER_EMAIL, passwordHash]
  );

  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [
    SEED_USER_EMAIL,
  ]);
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Seed: business
// ---------------------------------------------------------------------------

async function seedBusiness(pool, userId) {
  const id = uuid();
  await pool.query(
    `INSERT INTO businesses (id, user_id, name, region, language, created_at)
     VALUES ($1, $2, $3, 'US', 'en', NOW())`,
    [id, userId, SEED_BUSINESS_NAME]
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

async function seedAccounts(pool, businessId) {
  const ids = {};
  for (const acct of ACCOUNTS) {
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
// Seed: categories (US defaults)
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

async function seedCategories(pool, businessId) {
  const ids = {};
  for (const cat of CATEGORIES_US) {
    const id = uuid();
    await pool.query(
      `INSERT INTO categories
         (id, business_id, name, kind, color, tax_map_us, tax_map_ca, is_default, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, true, NOW())`,
      [id, businessId, cat.name, cat.kind, cat.color, cat.tax_map_us]
    );
    ids[cat.name] = id;
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Seed: transactions (Q1 2026)
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
  ];
}

async function seedTransactions(pool, businessId, accountIds, categoryIds) {
  const transactions = buildTransactions(businessId, accountIds, categoryIds);
  for (const tx of transactions) {
    await pool.query(
      `INSERT INTO transactions
         (id, business_id, account_id, category_id, type, amount, date,
          description, cleared, is_adjustment, is_void, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, false, false, NOW())`,
      [
        uuid(),
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
  return transactions.length;
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
// Seed: recurring transactions
// ---------------------------------------------------------------------------

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

async function printSummary(pool, userId, businessId) {
  const [txCount, mileCount, recurCount] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM transactions WHERE business_id = $1", [businessId]),
    pool.query("SELECT COUNT(*) FROM mileage WHERE business_id = $1", [businessId]),
    pool.query("SELECT COUNT(*) FROM recurring_transactions WHERE business_id = $1", [businessId]),
  ]);

  logSection("Seed complete — local dev data summary");
  console.log(`  User ID         : ${userId}`);
  console.log(`  Business ID     : ${businessId}`);
  console.log(`  Email           : ${SEED_USER_EMAIL}`);
  console.log(`  Password        : ${SEED_USER_PASSWORD}`);
  console.log(`  Business        : ${SEED_BUSINESS_NAME} (US)`);
  console.log(`  Accounts        : 3`);
  console.log(`  Categories      : ${CATEGORIES_US.length}`);
  console.log(`  Transactions    : ${txCount.rows[0].count}`);
  console.log(`  Mileage entries : ${mileCount.rows[0].count}`);
  console.log(`  Recurring rules : ${recurCount.rows[0].count}`);
  console.log();
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

    logSection(`Seeding "${SEED_BUSINESS_NAME}"`);

    log("Creating user…");
    const userId = await seedUser(pool);

    log("Creating business…");
    const businessId = await seedBusiness(pool, userId);

    log("Seeding accounts…");
    const accountIds = await seedAccounts(pool, businessId);
    log(`  ${ACCOUNTS.length} accounts created`);

    log("Seeding categories…");
    const categoryIds = await seedCategories(pool, businessId);
    log(`  ${CATEGORIES_US.length} categories created`);

    log("Seeding transactions…");
    const txCount = await seedTransactions(pool, businessId, accountIds, categoryIds);
    log(`  ${txCount} transactions created`);

    log("Seeding mileage…");
    const mileCount = await seedMileage(pool, businessId);
    log(`  ${mileCount} mileage entries created`);

    log("Seeding recurring rules…");
    const recurCount = await seedRecurring(pool, businessId, accountIds, categoryIds);
    log(`  ${recurCount} recurring rules created`);

    await printSummary(pool, userId, businessId);
  } catch (err) {
    console.error("\n[seed-dev] ERROR:", err.message);
    if (process.env.SEED_DEBUG) console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
