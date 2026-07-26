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
  test('transaction create edit delete and undo flow works through v3 UI', async ({ page }) => {
    const stamp = Date.now()
    const accountName = `E2E Checking ${stamp}`
    const description = `E2E Expense ${stamp}`
    const updatedDescription = `E2E Expense Updated ${stamp}`

    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
    await page.getByRole('button', { name: 'Add account' }).click()
    await expect(page.getByRole('dialog', { name: 'Add account' })).toBeVisible()
    await page.getByLabel('Account name').fill(accountName)
    await page.getByLabel('Account type').selectOption('Checking')
    await page.getByRole('button', { name: 'Save account' }).click()
    await expect(page.getByText(accountName)).toBeVisible()

    await openTransactions(page)
    await page.getByRole('button', { name: 'Add transaction' }).click()
    await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeVisible()
    const transactionDrawer = page.getByRole('dialog', { name: 'Add transaction' })
    await page.getByRole('button', { name: 'Expense' }).click()
    await page.getByLabel('Amount').fill('42.15')
    await page.getByLabel('Description').fill(description)
    await page.getByLabel('Date').fill('2026-07-26')
    await transactionDrawer.locator('label').filter({ hasText: 'Category' }).locator('select').selectOption({ index: 1 })
    await transactionDrawer.locator('label').filter({ hasText: 'Account' }).locator('select').selectOption({ label: accountName })
    await page.getByRole('button', { name: 'Save transaction' }).click()
    await expect(page.getByText(description)).toBeVisible()

    await page.getByRole('button', { name: `Actions for ${description}` }).click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit transaction' })).toBeVisible()
    await page.getByLabel('Description').fill(updatedDescription)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(updatedDescription)).toBeVisible()

    await page.getByRole('button', { name: `Actions for ${updatedDescription}` }).click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(updatedDescription)).toBeHidden()
    await page.getByRole('button', { name: 'Undo delete' }).click()
    await expect(page.getByText(updatedDescription)).toBeVisible()
  })

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
