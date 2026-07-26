// @ts-check
const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

const SS_PATH = path.join(__dirname, 'screenshots', 'auth.json')
const TOKEN_FILE = path.join(__dirname, 'screenshots', 'session-token.json')

test.use({ storageState: SS_PATH })

test.beforeEach(async ({ page }) => {
  const { token } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
  if (token) {
    await page.addInitScript((value) => {
      sessionStorage.setItem('token', value)
    }, token)
  }
})

async function openTransactions(page) {
  await page.goto('/transactions')
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
}

test.describe('v3 app interactions', () => {
  test('topbar dropdowns close when clicking outside', async ({ page }) => {
    await openTransactions(page)

    await page.getByRole('button', { name: 'User menu' }).click()
    await expect(page.getByRole('menu')).toBeVisible()

    await page.locator('.page-heading').click({ position: { x: 10, y: 10 } })
    await expect(page.getByRole('menu')).toBeHidden()

    await page.getByRole('button', { name: 'Notifications' }).click()
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible()

    await page.locator('.page-heading').click({ position: { x: 10, y: 10 } })
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeHidden()
  })

  test('transaction overlays can be dismissed from the backdrop', async ({ page }) => {
    await openTransactions(page)

    await page.getByRole('button', { name: 'Add transaction' }).click()
    await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeVisible()
    await page.locator('.drawer-backdrop').click({ position: { x: 12, y: 12 } })
    await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeHidden()

    await page.getByRole('button', { name: 'More filters' }).click()
    await expect(page.getByRole('dialog', { name: 'More filters' })).toBeVisible()
    await page.locator('.transaction-modal-backdrop').click({ position: { x: 12, y: 12 } })
    await expect(page.getByRole('dialog', { name: 'More filters' })).toBeHidden()
  })
})
