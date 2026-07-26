// @ts-check
const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

const SS_PATH = path.join(__dirname, 'screenshots', 'auth.json')
const TOKEN_FILE = path.join(__dirname, 'screenshots', 'session-token.json')

test.use({ storageState: SS_PATH })

test.beforeEach(async ({ page }) => {
  try {
    const { token } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
    if (token) {
      await page.addInitScript((value) => {
        sessionStorage.setItem('token', value)
      }, token)
    }
  } catch (_) {}
})

const appPages = [
  { path: '/transactions', heading: 'Transactions' },
  { path: '/accounts', heading: 'Accounts' },
  { path: '/categories', heading: 'Tax Categories' },
  { path: '/receipts', heading: 'Receipts' },
  { path: '/mileage', heading: 'Mileage' },
  { path: '/exports', heading: 'Exports' },
  { path: '/invoices', heading: 'Invoices' },
  { path: '/analytics', heading: 'Analytics' },
  { path: '/messages', heading: 'Messages' },
  { path: '/settings', heading: 'Settings' },
  { path: '/billing', heading: 'Billing' },
  { path: '/subscription', heading: 'Subscription' },
  { path: '/sessions', heading: 'Sessions' },
  { path: '/help', heading: 'Help' },
]

test.describe('v3 authenticated page wiring', () => {
  for (const { path: route, heading } of appPages) {
    test(`${route} renders the v3 page without a client crash`, async ({ page }) => {
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))

      await page.goto(route)
      await expect(page.getByRole('heading', { name: new RegExp(`^${heading}$`, 'i') }).first()).toBeVisible()
      await expect(page.locator('.ledger-shell')).toBeVisible()
      expect(pageErrors, `${route} emitted client errors`).toEqual([])
    })
  }
})
