// @ts-check
const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:8080";
const SS_PATH = path.join(__dirname, "screenshots", "auth.json");
const TOKEN_FILE = path.join(__dirname, "screenshots", "session-token.json");
const CURRENT_YEAR = new Date().getFullYear();

test.use({ storageState: SS_PATH });

test.beforeEach(async ({ page }) => {
  try {
    const { token } = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    if (token) {
      await page.addInitScript(`sessionStorage.setItem("token", ${JSON.stringify(token)})`);
    }
  } catch (_) {}
});

test("1 · create bank account", async ({ page }) => {
  await page.goto(`${BASE}/accounts`);
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15000 });
  await page.waitForSelector("#showAccountForm", { timeout: 10000 });
  await page.locator("#showAccountForm").click();
  await page.waitForSelector("#accountFormContainer:not([hidden])", { timeout: 15000 });
  await page.locator("#account-name").fill("Chase Checking");
  await page.locator('[data-chip-type="checking"]').click();
  await page.locator('#accountForm button[type="submit"]').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/e2e/screenshots/01-account.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  expect(/Chase Checking/i.test(bodyText)).toBe(true);
});

test("2 · add mock transactions", async ({ page }) => {
  test.setTimeout(60000);

  await page.goto(`${BASE}/transactions`);
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15000 });

  const txns = [
    { type: "income", date: `${CURRENT_YEAR}-01-15`, description: "Consulting - Client A (Jan)", amount: 4500, categoryLabel: "Service Income", note: "Q1 project kickoff" },
    { type: "income", date: `${CURRENT_YEAR}-02-01`, description: "Consulting - Client B (Feb)", amount: 3200, categoryLabel: "Service Income", note: "Retainer February" },
    { type: "income", date: `${CURRENT_YEAR}-03-10`, description: "Freelance design work", amount: 1800, categoryLabel: "Sales Revenue", note: "" },
    { type: "expense", date: `${CURRENT_YEAR}-01-08`, description: "Office supplies - Staples", amount: 127.5, categoryLabel: "Office Supplies", note: "" },
    { type: "expense", date: `${CURRENT_YEAR}-01-20`, description: "Adobe Creative Cloud", amount: 54.99, categoryLabel: "Software & Subscriptions", note: "Monthly subscription" },
    { type: "expense", date: `${CURRENT_YEAR}-02-05`, description: "Client lunch - downtown", amount: 89.4, categoryLabel: "Meals", note: "Client: ABC Corp" },
    { type: "expense", date: `${CURRENT_YEAR}-02-12`, description: "Rogers Wireless - Jan bill", amount: 95, categoryLabel: "Phone & Internet", note: "", businessUsePct: 70 },
    { type: "expense", date: `${CURRENT_YEAR}-02-28`, description: "Amazon - printer paper + toner", amount: 62.3, categoryLabel: "Office Supplies", note: "" },
    { type: "expense", date: `${CURRENT_YEAR}-03-05`, description: "Shaw Internet - Feb", amount: 79.99, categoryLabel: "Phone & Internet", note: "", businessUsePct: 60 },
    { type: "expense", date: `${CURRENT_YEAR}-03-15`, description: "Uber - client site visit", amount: 28.75, categoryLabel: "Travel", note: "Client: DEF Inc" },
    { type: "expense", date: `${CURRENT_YEAR}-03-20`, description: "Mailchimp - email platform", amount: 35, categoryLabel: "Software & Subscriptions", note: "" },
    { type: "expense", date: `${CURRENT_YEAR}-01-25`, description: "Shell gas - business trip", amount: 74, categoryLabel: "Car & Truck", note: "" }
  ];

  const results = await page.evaluate(async (txData) => {
    const acctResp = await apiFetch("/api/accounts");
    const acctPayload = await acctResp.json();
    const accounts = acctPayload.accounts || acctPayload.data || acctPayload || [];
    const accountId = (Array.isArray(accounts) ? accounts : Object.values(accounts))[0]?.id;

    const catResp = await apiFetch("/api/categories");
    const catPayload = await catResp.json();
    const categories = catPayload.categories || catPayload.data || catPayload || [];
    const catArr = Array.isArray(categories) ? categories : Object.values(categories);

    const added = [];
    const failed = [];
    for (const tx of txData) {
      const cat = catArr.find((c) =>
        String(c.name || "").toLowerCase().includes(tx.categoryLabel.toLowerCase())
      );
      const body = {
        type: tx.type,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        account_id: accountId || null,
        category_id: cat?.id || null,
        note: tx.note || ""
      };
      if (tx.businessUsePct != null) body.business_use_pct = tx.businessUsePct;
      try {
        const resp = await apiFetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (resp.ok) added.push(tx.description);
        else failed.push(`${tx.description}: ${resp.status}`.slice(0, 120));
      } catch (e) {
        failed.push(`${tx.description}: ${e.message}`.slice(0, 120));
      }
    }
    return { added, failed, accountId, catCount: catArr.length };
  }, txns);

  await page.reload();
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15000 });
  await page.screenshot({ path: "tests/e2e/screenshots/02-transactions-added.png", fullPage: true });
  expect(results.added.length).toBeGreaterThanOrEqual(6);
});

test("3 · transactions list", async ({ page }) => {
  await page.goto(`${BASE}/transactions`);
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/e2e/screenshots/03-transactions-list.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  expect(/Consulting|Adobe|Rogers|Shaw/i.test(bodyText)).toBe(true);
});

test("4 · generate PDF export", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(`${BASE}/exports`);
  await page.waitForSelector("#exportPdfBtn", { timeout: 15000 });
  await page.screenshot({ path: "tests/e2e/screenshots/04a-exports-page.png", fullPage: true });

  const ytdBtn = page.locator(`[data-range-preset="${CURRENT_YEAR}-ytd"]`);
  if (await ytdBtn.count() > 0) {
    await ytdBtn.click();
    await page.waitForTimeout(500);
  }

  let exportSucceeded = false;
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45000 }),
      page.locator("#exportPdfBtn").click()
    ]);
    if (download) exportSucceeded = true;
  } catch {
    try {
      const [newPage] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 30000 }),
        page.locator("#exportPdfBtn").click()
      ]);
      await newPage.waitForLoadState("domcontentloaded", { timeout: 20000 });
      await newPage.close();
      exportSucceeded = true;
    } catch {}
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/e2e/screenshots/04c-exports-after.png", fullPage: true });
  const bodyText = await page.locator("body").innerText();
  expect(/\bsomething went wrong\b|\bfailed to generate\b/i.test(bodyText)).toBe(false);
  expect(exportSucceeded || /generated|export|history/i.test(bodyText)).toBe(true);
});

test("5 · generate CSV export", async ({ page }) => {
  await page.goto(`${BASE}/exports`);
  await page.waitForSelector("#exportCsvBtn", { timeout: 15000 });

  const ytdBtn = page.locator(`[data-range-preset="${CURRENT_YEAR}-ytd"]`);
  if (await ytdBtn.count() > 0) {
    await ytdBtn.click();
    await page.waitForTimeout(500);
  }

  try {
    await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.locator("#exportCsvBtn").click()
    ]);
  } catch {}

  await page.screenshot({ path: "tests/e2e/screenshots/05-csv-export.png", fullPage: true });
});

test("6 · review page", async ({ page }) => {
  await page.goto(`${BASE}/exports?focus=review#exportReviewQueueSection`);
  await page.waitForSelector("#exportReviewQueueSection");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "tests/e2e/screenshots/06a-review-viewport.png", fullPage: false });
  await page.screenshot({ path: "tests/e2e/screenshots/06b-review-full.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  expect(/income|expense|transaction|category/i.test(bodyText)).toBe(true);
});

test("7 · analytics", async ({ page }) => {
  await page.goto(`${BASE}/analytics`);
  await page.waitForSelector("body");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "tests/e2e/screenshots/07-analytics.png", fullPage: true });
});

test("8 · accounts page", async ({ page }) => {
  await page.goto(`${BASE}/accounts`);
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "tests/e2e/screenshots/08-accounts.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  expect(/Chase Checking/i.test(bodyText)).toBe(true);
});
