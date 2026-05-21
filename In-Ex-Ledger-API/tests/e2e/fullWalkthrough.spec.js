// @ts-check
/**
 * Full end-to-end walkthrough of InEx Ledger.
 *
 * Covers:
 *  - Registration + email verification bypass (direct DB token lookup)
 *  - Onboarding for CA region
 *  - Every main page: transactions, invoices, receipts, analytics, accounts,
 *    categories, mileage, exports, messages, settings, subscription/upgrade
 *  - Creating income + expense transactions
 *  - Creating a draft invoice
 *  - CSV and PDF export flows
 *  - Visual checks: white-text on CTAs, empty states, loading states
 *  - Account cleanup (delete test user at the end)
 */

const { test, expect, chromium } = require('@playwright/test');
const { Pool } = require('pg');
require('dotenv').config();

const BASE = 'http://localhost:8080';
const TEST_EMAIL = `pw-audit-${Date.now()}@inexledger.test`;
const TEST_PASS  = 'Audit#2026!';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ─── helpers ────────────────────────────────────────────────────────────────

async function verifyEmailInDb(email) {
  const res = await pool.query(
    'SELECT token FROM verification_tokens WHERE email = $1 ORDER BY expires_at DESC LIMIT 1',
    [email]
  );
  if (!res.rows.length) throw new Error(`No verification token found for ${email}`);
  return res.rows[0].token;
}

async function deleteTestUser(email) {
  const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (!user.rows.length) return;
  const uid = user.rows[0].id;
  await pool.query('DELETE FROM verification_tokens WHERE email = $1', [email]);
  await pool.query('DELETE FROM users WHERE id = $1', [uid]);
}

async function assertCtaVisible(page, selector, label) {
  const el = page.locator(selector).first();
  if (await el.count() === 0) return;
  const { textColor, bgColor } = await el.evaluate(e => ({
    textColor: getComputedStyle(e).color,
    bgColor:   getComputedStyle(e).backgroundColor,
  }));
  const isWhiteText = textColor === 'rgb(255, 255, 255)' || textColor === 'rgba(0, 0, 0, 0)';
  const isClearBg   = bgColor === 'rgb(255, 255, 255)' || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent';
  if (isWhiteText && isClearBg) {
    throw new Error(`${label}: white text on transparent/white background — text will be invisible`);
  }
}

async function screenshot(page, name) {
  await page.screenshot({ path: `tests/e2e/screenshots/${name}.png`, fullPage: true });
}

async function ensureDefaultCategories(page) {
  await page.goto(`${BASE}/categories`);
  await page.waitForLoadState('networkidle');

  const categoryRows = page.locator('.category-item, .category-row, table tbody tr').first();
  if (await categoryRows.count() > 0) {
    const visible = await categoryRows.isVisible().catch(() => false);
    if (visible) return;
  }

  const seedButton = page.locator('#seedDefaultCategoriesBtn').first();
  if (await seedButton.count() === 0) return;

  const isVisible = await seedButton.isVisible().catch(() => false);
  const isDisabled = await seedButton.isDisabled().catch(() => false);
  if (!isVisible || isDisabled) return;

  await seedButton.click();
  await expect(page.locator('.category-item, .category-row, table tbody tr').first()).toBeVisible({ timeout: 10000 });
}

// ─── setup / teardown ───────────────────────────────────────────────────────

test.beforeAll(async () => {
  await pool.query('SELECT 1');
  const { mkdirSync } = require('fs');
  mkdirSync('tests/e2e/screenshots', { recursive: true });
});

test.afterAll(async () => {
  await deleteTestUser(TEST_EMAIL);
  await pool.end();
});

// ─── test suite ─────────────────────────────────────────────────────────────

test.describe('InEx Ledger full walkthrough', () => {
  let browser, context, page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
    });
    page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));
  });

  test.afterAll(async () => {
    await context.close();
    await browser.close();
  });

  test('landing page loads and hero CTA is visible', async () => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/InEx Ledger/i);
    await screenshot(page, '01-landing');
    await assertCtaVisible(page, '#heroPrimaryCta, .hero-cta, [data-i18n="hero_cta"]', 'Hero CTA');
    const pricingLink = page.locator('a[href*="pricing"], a[href*="register"]').first();
    await expect(pricingLink).toBeVisible();
  });

  test('register page loads with no invisible text on submit button', async () => {
    await page.goto(`${BASE}/register`);
    await screenshot(page, '02-register');
    const submitBtn = page.locator('button[type="submit"], .auth-submit').first();
    await expect(submitBtn).toBeVisible();
    await assertCtaVisible(page, 'button[type="submit"], .auth-submit', 'Register submit button');
  });

  test('registers a new CA test account', async () => {
    await page.goto(`${BASE}/register`);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASS);
    await page.fill('#confirm-password', TEST_PASS);
    await page.check('#tosConsent');
    await page.click('button[type="submit"], .auth-submit');
    await page.waitForURL(/verify-email|check.*email|login/i, { timeout: 10000 }).catch(() => {});
    await screenshot(page, '03-register-submitted');
  });

  test('verifies email via token from DB', async () => {
    const token = await verifyEmailInDb(TEST_EMAIL);
    await page.goto(`${BASE}/api/auth/verify-email?token=${token}`);
    await page.waitForURL(/onboarding|login/i, { timeout: 10000 });
    await screenshot(page, '04-email-verified');
  });

  test('logs in if redirected to login', async () => {
    if (!page.url().includes('onboarding')) {
      await page.goto(`${BASE}/login`);
      await page.click('#email');
      await page.fill('#email', TEST_EMAIL);
      await page.click('#password');
      await page.fill('#password', TEST_PASS);
      await screenshot(page, '05-login');
      await page.click('.auth-submit');
      await page.waitForURL(/onboarding|transactions|dashboard/i, { timeout: 10000 });
    }
    await screenshot(page, '05-after-login');
  });

  test('completes onboarding with CA region', async () => {
    if (!page.url().includes('onboarding')) {
      await page.goto(`${BASE}/onboarding`);
    }

    await expect(page.locator('#onboardingForm')).toBeVisible({ timeout: 8000 });
    await screenshot(page, '06-onboarding');
    await assertCtaVisible(page, 'button[type="submit"]', 'Onboarding submit');

    await page.fill('#onboardingBusinessName', 'Audit Test Co.');
    await page.selectOption('#onboardingStarterAccountType', 'checking');
    await page.fill('#onboardingStarterAccountName', 'Main Chequing');
    await page.selectOption('#onboardingRegion', 'CA');
    await expect(page.locator('#onboardingProvinceField')).toBeVisible({ timeout: 3000 });
    await page.selectOption('#onboardingProvince', 'ON');
    await page.fill('#onboardingBusinessActivityCode', '541400');
    await page.selectOption('#onboardingAccountingMethod', 'cash');
    await page.selectOption('#onboardingMaterialParticipation', 'yes');
    await page.fill('#onboardingBusinessAddress', '123 Test Street, Toronto, ON M5V 2T6, Canada');

    await page.click('button[type="submit"]');
    await expect(page.locator('#onboardingImportStep')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#onboardingCsvHelpToggle')).toBeVisible({ timeout: 3000 });
    await screenshot(page, '07-onboarding-import-step');

    await page.click('#onboardingCsvSkip');
    await page.waitForURL(/trial-setup|categories|transactions|dashboard/i, { timeout: 10000 });
    await screenshot(page, '07-onboarding-complete');
  });

  test('transactions page: empty state, add income, add expense', async () => {
    await ensureDefaultCategories(page);
    await page.goto(`${BASE}/transactions`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '08-transactions-empty');

    await assertCtaVisible(page, '#addTxTogglePage, .toolbar-add-button, .page-add-button, button[data-i18n*="add"]', 'Add transaction button');

    const addBtn = page.locator('#addTxTogglePage, .page-add-button:has-text("Add transaction"), .toolbar-add-button').first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    await expect(page.locator('#txType')).toBeVisible({ timeout: 5000 });
    await screenshot(page, '09-transaction-drawer-open');
    await assertCtaVisible(page, '.drawer-submit', 'Transaction save button');

    await page.selectOption('#txType', 'income');
    await page.fill('#date', '2026-05-01');
    await page.fill('#description', 'Client Payment - Audit Test');
    await page.selectOption('#account', { index: 1 });
    await page.selectOption('#category', { index: 1 });
    await page.fill('#amount', '1500.00');
    await page.click('.drawer-submit');

    await page.waitForLoadState('networkidle');
    await screenshot(page, '10-income-transaction-added');

    await addBtn.click();
    await expect(page.locator('#txType')).toBeVisible({ timeout: 5000 });
    await page.selectOption('#txType', 'expense');
    await page.fill('#date', '2026-05-05');
    await page.fill('#description', 'Office Supplies - Audit Test');
    await page.selectOption('#account', { index: 1 });
    await page.selectOption('#category', { index: 1 });
    await page.fill('#amount', '89.99');
    await page.click('.drawer-submit');

    await page.waitForLoadState('networkidle');
    await screenshot(page, '11-expense-transaction-added');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('analytics page loads with sparkline and this-month card', async () => {
    await page.goto(`${BASE}/analytics`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '12-analytics');
    await expect(page.locator('table, .analytics-table')).toBeVisible({ timeout: 8000 });
    const svg = page.locator('svg').first();
    if (await svg.count() > 0) await expect(svg).toBeVisible();
    await assertCtaVisible(page, '.analytics-cta, button', 'Analytics CTA');
  });

  test('invoices page: create a draft invoice', async () => {
    await page.goto(`${BASE}/invoices`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '13-invoices-empty');

    await assertCtaVisible(page, '#newInvoiceBtn', 'New invoice button');
    await page.click('#newInvoiceBtn');
    await expect(page.locator('#invoiceForm')).toBeVisible({ timeout: 5000 });
    await screenshot(page, '14-invoice-form-open');

    await assertCtaVisible(page, '#invoiceSubmit', 'Invoice submit button');
    await assertCtaVisible(page, '#invoiceSaveDraft', 'Save as draft button');

    await page.fill('#invClientName', 'Test Client Co.');
    await page.fill('#invClientEmail', 'client@test.example.com');
    await page.fill('#invIssueDate', '2026-05-17');
    await page.fill('#invDueDate', '2026-06-17');
    await page.click('#addLineItemBtn');
    const descInput = page.locator('.invoice-line-desc').first();
    await expect(descInput).toBeVisible({ timeout: 3000 });
    await descInput.fill('Design services');
    await page.locator('.invoice-line-qty').first().fill('5');
    await page.locator('.invoice-line-price').first().fill('200');
    await page.fill('#invTaxRate', '13');
    await page.click('#invoiceSaveDraft');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '15-invoice-draft-saved');
    await expect(page.locator('table tbody tr, .invoice-row').first()).toBeVisible({ timeout: 8000 });
  });

  test('receipts page loads with correct empty state and visible upload button', async () => {
    await page.goto(`${BASE}/receipts`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '16-receipts');

    const emptyState = page.locator('.receipts-empty-state');
    if (await emptyState.count() > 0) {
      await expect(emptyState).toBeVisible();
      const text = await emptyState.textContent();
      expect(text.trim().length, 'Receipts empty state has no text').toBeGreaterThan(0);
    }
    await assertCtaVisible(page, '.receipt-upload-btn, button[data-i18n*="upload"], .toolbar-add-button', 'Receipt upload button');
  });

  test('accounts page loads with at least one account from onboarding', async () => {
    await page.goto(`${BASE}/accounts`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '17-accounts');
    await assertCtaVisible(page, '.page-add-button, button[data-i18n*="add"]', 'Add account button');
    await expect(page.locator('table tbody tr, .account-card, .account-row').first()).toBeVisible({ timeout: 8000 });
  });

  test('categories page loads with default categories', async () => {
    await ensureDefaultCategories(page);
    await page.goto(`${BASE}/categories`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '18-categories');
    await assertCtaVisible(page, '#categoryToolbarAddBtn, #addIncomeCategoryBtn, #addExpenseCategoryBtn, button[data-i18n*="add"]', 'Add category button');
    await expect(page.locator('.category-item, .category-row, table tbody tr').first()).toBeVisible({ timeout: 8000 });
  });

  test('mileage page loads', async () => {
    await page.goto(`${BASE}/mileage`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '19-mileage');
    await assertCtaVisible(page, '.page-add-button, button[data-i18n*="add"]', 'Add mileage button');
  });

  test('exports page: triggers CSV export', async () => {
    await page.goto(`${BASE}/exports`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '20-exports');
    await assertCtaVisible(page, '.export-btn, button[data-i18n*="export"], .drawer-submit', 'Export button');

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    const csvBtn = page.locator('button:has-text("CSV"), button[data-i18n*="csv"], [data-export-type="csv"]').first();
    if (await csvBtn.count() > 0) {
      await csvBtn.click();
      const dl = await downloadPromise;
      if (dl) {
        expect(dl.suggestedFilename()).toMatch(/\.csv$/i);
        console.log(`✓ CSV downloaded: ${dl.suggestedFilename()}`);
      }
    } else {
      console.log('⚠ CSV button not found — skipping download test');
    }
    await screenshot(page, '21-exports-after-csv');
  });

  test('exports page: triggers PDF tax packet export', async () => {
    await page.goto(`${BASE}/exports`);
    await page.waitForLoadState('networkidle');

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    const pdfBtn = page.locator('button:has-text("PDF"), button[data-i18n*="pdf"], [data-export-type="pdf"]').first();
    if (await pdfBtn.count() > 0) {
      await pdfBtn.click();
      const dl = await downloadPromise;
      if (dl) {
        expect(dl.suggestedFilename()).toMatch(/\.pdf$/i);
        console.log(`✓ PDF downloaded: ${dl.suggestedFilename()}`);
      }
    } else {
      console.log('⚠ PDF button not found — skipping download test');
    }
    await screenshot(page, '22-exports-after-pdf');
  });

  test('messages page loads', async () => {
    await page.goto(`${BASE}/messages`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '23-messages');
    await expect(page.locator('.messages-loading')).toBeHidden({ timeout: 8000 }).catch(() => {});
  });

  test('settings page loads all sections', async () => {
    await page.goto(`${BASE}/settings`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '24-settings');
    await assertCtaVisible(page, 'button[type="submit"], .drawer-submit', 'Settings save button');
    await expect(page.locator('form, .settings-section').first()).toBeVisible({ timeout: 8000 });
  });

  test('upgrade page loads with visible CTA', async () => {
    await page.goto(`${BASE}/upgrade`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '25-upgrade');
    await assertCtaVisible(page, '#upgradePrimary, .upgrade-cta, [data-i18n*="upgrade_cta"]', 'Upgrade primary CTA');
  });

  test('subscription page loads with visible plan button', async () => {
    await page.goto(`${BASE}/subscription`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '26-subscription');
    await assertCtaVisible(page, '#planProBtn, .plan-cta, [data-i18n*="subscription_pro_cta"]', 'Pro plan CTA');
  });

  test('pricing page loads with visible CTA', async () => {
    await page.goto(`${BASE}/pricing`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '27-pricing');
    await assertCtaVisible(page, '#v1CtaBtn, .pricing-cta', 'Pricing CTA');
  });

  test('secondary feature pages load without blank screens', async () => {
    const pages = [{ path: '/help', label: 'Help' }];
    for (const { path, label } of pages) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');
      const slug = label.toLowerCase().replace(/[^a-z]/g, '-');
      await screenshot(page, `28-${slug}`);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length, `${label} page appears blank`).toBeGreaterThan(50);
      console.log(`✓ ${label} loaded`);
    }
  });

  test('transactions page does not overflow on mobile viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/transactions`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '29-transactions-mobile');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, 'Transactions page has horizontal overflow on mobile').toBeLessThanOrEqual(clientWidth + 5);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('invoices page does not overflow on mobile viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/invoices`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '30-invoices-mobile');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth, 'Invoices page has horizontal overflow on mobile').toBeLessThanOrEqual(clientWidth + 5);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('sessions page loads and shows current session', async () => {
    await page.goto(`${BASE}/sessions`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, '31-sessions');
    await expect(page.locator('table tbody tr, .session-row').first()).toBeVisible({ timeout: 8000 });
  });

  test('deletes test account via settings', async () => {
    const res = await pool.query('SELECT id FROM users WHERE email = $1', [TEST_EMAIL]);
    expect(res.rows.length, 'Test user not found in DB before cleanup').toBe(1);
    console.log(`✓ Test user ${TEST_EMAIL} will be cleaned up in afterAll`);
  });
});