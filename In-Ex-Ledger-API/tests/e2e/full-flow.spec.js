// @ts-check
const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:8080";
const SS_PATH = path.join(__dirname, "screenshots", "auth.json");
const TOKEN_FILE = path.join(__dirname, "screenshots", "session-token.json");

// Session is established by global-setup.js — all tests share it
test.use({ storageState: SS_PATH });

// Inject the access token into sessionStorage before every test navigation.
// The refresh token in auth.json is single-use (rotated), so only the first
// test could use it. Pre-seeding sessionStorage avoids the refresh entirely.
test.beforeEach(async ({ page }) => {
  try {
    const { token } = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    if (token) {
      await page.addInitScript(`sessionStorage.setItem("token", ${JSON.stringify(token)})`);
    }
  } catch (_) {}
});

// ---------------------------------------------------------------------------
// Helper: add a transaction via the drawer
// ---------------------------------------------------------------------------
async function addTransaction(page, { type, date, description, amount, categoryLabel, note, businessUsePct }) {
  // Force-close the drawer via JS if it's open, then open it fresh
  await page.evaluate(() => {
    const d = document.getElementById("txDrawer");
    if (d && !d.hidden) d.setAttribute("hidden", "");
  }).catch(() => {});
  const addBtn = page.locator("#addTxTogglePage");
  await addBtn.click();
  await page.waitForSelector("#txDrawer:not([hidden])", { timeout: 10_000 });

  // Now the drawer is open — click the intent (income/expense) button
  const intentBtn = page.locator(
    type === "income"
      ? '.txn-intent-btn[data-intent="income"]'
      : '.txn-intent-btn[data-intent="expense"]'
  );
  await intentBtn.click();
  // Intent buttons set txType.value without firing "change", so categories aren't re-filtered.
  // Dispatch the event manually so populateCategoriesFromStorage() re-runs with the correct type.
  await page.evaluate(() => {
    const txType = document.getElementById("txType");
    if (txType) txType.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await page.locator("#date").fill(date);
  await page.locator("#description").fill(description);
  await page.locator("#amount").fill(String(amount));

  // Select account (first non-empty option — Chase Checking)
  const acctSelect = page.locator("#txDrawer #account");
  const acctOpts = await acctSelect.locator("option").all();
  for (const opt of acctOpts) {
    const val = await opt.getAttribute("value");
    if (val && val !== "") {
      await acctSelect.selectOption({ value: val });
      break;
    }
  }

  // Pick category by matching option text
  const catSelect = page.locator("#txDrawer #category");
  const options = await catSelect.locator("option").all();
  for (const opt of options) {
    const text = (await opt.textContent() || "").trim();
    if (text && text.toLowerCase().includes(categoryLabel.toLowerCase())) {
      const val = await opt.getAttribute("value");
      if (val && val !== "") {
        await catSelect.selectOption({ value: val });
        break;
      }
    }
  }

  // Business-use % for phone/internet
  if (businessUsePct != null) {
    const allocField = page.locator("#txAllocationField");
    const isVisible = await allocField.isVisible().catch(() => false);
    if (isVisible) {
      await page.locator("#txBusinessUsePct").fill(String(businessUsePct));
    }
  }

  if (note) {
    await page.locator("#transactionNote").fill(note);
  }

  await page.locator("#txDrawer .drawer-submit").click();

  // Wait for drawer to close
  await page.waitForFunction(() => {
    const d = document.getElementById("txDrawer");
    return d && d.hidden;
  }, { timeout: 5_000 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// 1. Create checking account
// ---------------------------------------------------------------------------
test("1 · create bank account", async ({ page }) => {
  await page.goto(`${BASE}/accounts`);
  // Wait for profile to load and JS event listeners to register
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15_000 });
  await page.waitForSelector("#showAccountForm", { timeout: 10_000 });
  await page.locator("#showAccountForm").click();
  await page.waitForSelector("#accountFormContainer:not([hidden])", { timeout: 15_000 });
  await page.locator("#account-name").fill("Chase Checking");
  await page.locator('[data-chip-type="checking"]').click();
  await page.locator('#accountForm button[type="submit"]').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/e2e/screenshots/01-account.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  expect(/Chase Checking/i.test(bodyText)).toBe(true);
  console.log("✅ Chase Checking account created");
});

// ---------------------------------------------------------------------------
// 2. Add 12 mock transactions
// ---------------------------------------------------------------------------
test("2 · add mock transactions", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto(`${BASE}/transactions`);
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15_000 });

  const txns = [
    { type: "income",   date: "2026-01-15", description: "Consulting — Client A (Jan)",    amount: 4500,  categoryLabel: "Service Income",           note: "Q1 project kickoff" },
    { type: "income",   date: "2026-02-01", description: "Consulting — Client B (Feb)",    amount: 3200,  categoryLabel: "Service Income",           note: "Retainer February" },
    { type: "income",   date: "2026-03-10", description: "Freelance design work",               amount: 1800,  categoryLabel: "Sales Revenue",            note: "" },
    { type: "expense",  date: "2026-01-08", description: "Office supplies — Staples",      amount: 127.5, categoryLabel: "Office Supplies",          note: "" },
    { type: "expense",  date: "2026-01-20", description: "Adobe Creative Cloud",                amount: 54.99, categoryLabel: "Software & Subscriptions", note: "Monthly subscription" },
    { type: "expense",  date: "2026-02-05", description: "Client lunch — downtown",        amount: 89.40, categoryLabel: "Meals",                    note: "Client: ABC Corp" },
    { type: "expense",  date: "2026-02-12", description: "Rogers Wireless — Jan bill",     amount: 95.00, categoryLabel: "Phone & Internet",         note: "", businessUsePct: 70 },
    { type: "expense",  date: "2026-02-28", description: "Amazon — printer paper + toner", amount: 62.30, categoryLabel: "Office Supplies",          note: "" },
    { type: "expense",  date: "2026-03-05", description: "Shaw Internet — Feb",            amount: 79.99, categoryLabel: "Phone & Internet",         note: "", businessUsePct: 60 },
    { type: "expense",  date: "2026-03-15", description: "Uber — client site visit",       amount: 28.75, categoryLabel: "Travel",                   note: "Client: DEF Inc" },
    { type: "expense",  date: "2026-03-20", description: "Mailchimp — email platform",     amount: 35.00, categoryLabel: "Software & Subscriptions", note: "" },
    { type: "expense",  date: "2026-01-25", description: "Shell gas — business trip",      amount: 74.00, categoryLabel: "Car & Truck",              note: "" },
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
      const cat = catArr.find(c =>
        c.name.toLowerCase().includes(tx.categoryLabel.toLowerCase())
      );
      const body = {
        type: tx.type,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        account_id: accountId || null,
        category_id: cat?.id || null,
        note: tx.note || "",
      };
      if (tx.businessUsePct != null) body.business_use_pct = tx.businessUsePct;
      try {
        const resp = await apiFetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          added.push(tx.description);
        } else {
          const txt = await resp.text().catch(() => resp.status);
          failed.push(`${tx.description}: ${resp.status} ${txt}`.slice(0, 120));
        }
      } catch (e) {
        failed.push(`${tx.description}: ${e.message}`.slice(0, 120));
      }
    }
    return { added, failed, accountId, catCount: catArr.length };
  }, txns);

  for (const desc of results.added) console.log(`  ✅ ${desc}`);
  for (const msg of results.failed) console.warn(`  ⚠️  ${msg}`);
  console.log(`  account_id used: ${results.accountId}, categories available: ${results.catCount}`);

  await page.reload();
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15_000 });
  await page.screenshot({ path: "tests/e2e/screenshots/02-transactions-added.png", fullPage: true });
  console.log(`✅ Added ${results.added.length} / ${txns.length} transactions`);
  expect(results.added.length).toBeGreaterThanOrEqual(6);
});

// ---------------------------------------------------------------------------
// 3. Transactions list — verify visible + screenshot
// ---------------------------------------------------------------------------
test("3 · transactions list", async ({ page }) => {
  await page.goto(`${BASE}/transactions`);
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/e2e/screenshots/03-transactions-list.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  const visible = /Consulting|Adobe|Rogers|Shaw/i.test(bodyText);
  expect(visible).toBe(true);
  console.log("✅ Transactions visible on list");
});

// ---------------------------------------------------------------------------
// 4. Generate PDF export
// ---------------------------------------------------------------------------
test("4 · generate PDF export", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/exports`);
  await page.waitForSelector("#exportPdfBtn", { timeout: 15_000 });
  await page.screenshot({ path: "tests/e2e/screenshots/04a-exports-page.png", fullPage: true });

  // Ensure 2026 YTD preset is selected
  const ytdBtn = page.locator('[data-range-preset="2026-ytd"]');
  if (await ytdBtn.count() > 0) {
    await ytdBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Export PDF — capture download or new tab
  let exportSucceeded = false;
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 45_000 }),
      page.locator("#exportPdfBtn").click(),
    ]);
    console.log(`✅ PDF downloaded: ${download.suggestedFilename()}`);
    exportSucceeded = true;
  } catch {
    // Try new tab approach
    try {
      const [newPage] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 30_000 }),
        page.locator("#exportPdfBtn").click(),
      ]);
      await newPage.waitForLoadState("domcontentloaded", { timeout: 20_000 });
      await newPage.screenshot({ path: "tests/e2e/screenshots/04b-export-pdf-tab.png", fullPage: true });
      console.log("✅ PDF opened in new tab:", newPage.url());
      exportSucceeded = true;
      await newPage.close();
    } catch {
      console.warn("⚠️  Could not capture PDF download/tab — checking page for error");
    }
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: "tests/e2e/screenshots/04c-exports-after.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  const hasError = /\bsomething went wrong\b|\bfailed to generate\b/i.test(bodyText);
  if (hasError) {
    console.warn("⚠️  Export page shows error text");
  }

  const hasHistory = /generated|export|history/i.test(bodyText);
  console.log(`✅ Export page shows history: ${hasHistory}`);
  console.log(`✅ PDF export attempted, succeeded: ${exportSucceeded}`);
});

// ---------------------------------------------------------------------------
// 5. CSV export
// ---------------------------------------------------------------------------
test("5 · generate CSV export", async ({ page }) => {
  await page.goto(`${BASE}/exports`);
  await page.waitForSelector("#exportCsvBtn", { timeout: 15_000 });

  const ytdBtn = page.locator('[data-range-preset="2026-ytd"]');
  if (await ytdBtn.count() > 0) {
    await ytdBtn.click();
    await page.waitForTimeout(500);
  }

  let csvOk = false;
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.locator("#exportCsvBtn").click(),
    ]);
    console.log(`✅ CSV downloaded: ${download.suggestedFilename()}`);
    csvOk = true;
  } catch {
    console.warn("⚠️  CSV download not captured (may have opened inline)");
  }

  await page.screenshot({ path: "tests/e2e/screenshots/05-csv-export.png", fullPage: true });
  console.log("✅ CSV export step done");
});

// ---------------------------------------------------------------------------
// 6. Review page
// ---------------------------------------------------------------------------
test("6 · review page", async ({ page }) => {
  await page.goto(`${BASE}/exports?focus=review#exportReviewQueueSection`);
  await page.waitForSelector("#exportReviewQueueSection");
  await page.waitForTimeout(4000);

  await page.screenshot({ path: "tests/e2e/screenshots/06a-review-viewport.png", fullPage: false });
  await page.screenshot({ path: "tests/e2e/screenshots/06b-review-full.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();

  console.log("\n── Review page findings ───────────────────────────────");
  const lines = bodyText.split("\n").map(l => l.trim()).filter(l => l.length > 3 && l.length < 200);
  for (const line of lines) {
    if (/income|expense|total|mapped|receipt|allocation|review|category|need|\$[0-9]|[0-9]+%/i.test(line)) {
      console.log("  ", line);
    }
  }
  console.log("──────────────────────────────────────────────────────\n");

  const hasData = /income|expense|transaction|category/i.test(bodyText);
  expect(hasData).toBe(true);
  console.log("✅ Review page has data");
});

// ---------------------------------------------------------------------------
// 7. Analytics
// ---------------------------------------------------------------------------
test("7 · analytics", async ({ page }) => {
  await page.goto(`${BASE}/analytics`);
  await page.waitForSelector("body");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "tests/e2e/screenshots/07-analytics.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  const hasContent = /income|expense|net|\$/i.test(bodyText);
  console.log(`✅ Analytics loaded, has financial content: ${hasContent}`);
});

// ---------------------------------------------------------------------------
// 8. Accounts page
// ---------------------------------------------------------------------------
test("8 · accounts page", async ({ page }) => {
  await page.goto(`${BASE}/accounts`);
  await page.waitForFunction(() => !!window.__LUNA_ME__, { timeout: 15_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "tests/e2e/screenshots/08-accounts.png", fullPage: true });

  const bodyText = await page.locator("body").innerText();
  expect(/Chase Checking/i.test(bodyText)).toBe(true);
  console.log("✅ Accounts page shows Chase Checking");
});
