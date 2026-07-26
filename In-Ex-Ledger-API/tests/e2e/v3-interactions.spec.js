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

  test('transaction CSV import opens the legacy account and date range modal', async ({ page }) => {
    await openTransactions(page)

    await page.getByRole('button', { name: 'Import CSV' }).click()
    await expect(page.getByRole('dialog', { name: 'Import CSV' })).toBeVisible()
    await expect(page.getByLabel('Destination account')).toBeVisible()
    await expect(page.getByLabel('Start date')).toBeVisible()
    await expect(page.getByLabel('End date')).toBeVisible()
    await expect(page.getByText('Choose CSV file')).toBeVisible()
  })

  test('archived message three-dot menu shows actions without opening the message', async ({ page }) => {
    await page.route('**/api/messages/inbox', async (route) => route.fulfill({ json: { messages: [] } }))
    await page.route('**/api/messages/sent', async (route) => route.fulfill({ json: { messages: [] } }))
    await page.route('**/api/messages/unread-count', async (route) => route.fulfill({ json: { total: 0, messages: 0, support: 0, notifications: 0 } }))
    await page.route('**/api/messages/archived', async (route) => route.fulfill({
      json: {
        messages: [{
          id: '00000000-0000-4000-8000-000000000999',
          sender_id: 'sender',
          receiver_id: 'receiver',
          sender_name: 'Client',
          sender_email: 'client@example.com',
          subject: 'Archived thread',
          body: 'Archived message body',
          message_type: 'general',
          is_read: true,
          is_archived: true,
          created_at: new Date().toISOString(),
          thread_count: 1,
        }],
      },
    }))

    await page.goto('/messages')
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
    await page.getByRole('button', { name: 'Archived' }).click()
    await page.getByRole('button', { name: 'Actions for Archived thread' }).click()

    await expect(page.getByRole('button', { name: 'Unarchive' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Archived thread' })).toBeHidden()
  })
})
