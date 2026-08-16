import { useState } from 'react'
import { Download, Globe2, Trash2, X } from 'lucide-react'
import type { AuthUser } from '../../lib/authApi'
import { deleteMyAccount, requestAccountDeleteReauth } from '../../lib/authApi'
import { loadAccounts, type AccountRecord } from '../../lib/accountsApi'
import { exportAccountData, type PrivacySettings } from '../../lib/settingsApi'
import { deleteAllTransactions } from '../../lib/transactionsApi'
import { Field, SettingsPanel, SettingsRow, Toggle } from './SettingsPrimitives'

type DataSettingsPanelProps = {
  privacySettings: PrivacySettings | null
  updatePrivacy: <K extends keyof PrivacySettings>(key: K, value: PrivacySettings[K]) => void
  setError: (value: string) => void
  setStatusMessage: (value: string) => void
  authUser: AuthUser | null
  onAuthChange: (user: AuthUser | null) => void
}

export default function DataSettingsPanel({
  privacySettings,
  updatePrivacy,
  setError,
  setStatusMessage,
  authUser,
  onAuthChange,
}: DataSettingsPanelProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaToken, setMfaToken] = useState('')
  const [reauthToken, setReauthToken] = useState('')
  const [awaitingMfaCode, setAwaitingMfaCode] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [showDeleteTransactionsModal, setShowDeleteTransactionsModal] = useState(false)
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('ALL')
  const [transactionsConfirmText, setTransactionsConfirmText] = useState('')
  const [transactionsDeleteError, setTransactionsDeleteError] = useState('')
  const [deletingTransactions, setDeletingTransactions] = useState(false)

  async function runExport(format: 'json' | 'csv') {
    try {
      await exportAccountData(format)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export account data.')
    }
  }

  async function openDeleteTransactionsModal() {
    setSelectedAccountId('ALL')
    setTransactionsConfirmText('')
    setTransactionsDeleteError('')
    setShowDeleteTransactionsModal(true)
    setLoadingAccounts(true)
    try {
      setAccounts(await loadAccounts())
    } catch {
      setAccounts([])
    } finally {
      setLoadingAccounts(false)
    }
  }

  function closeDeleteTransactionsModal() {
    setShowDeleteTransactionsModal(false)
  }

  async function submitDeleteAllTransactions() {
    if (transactionsConfirmText.trim() !== 'DELETE') {
      setTransactionsDeleteError('Type DELETE to confirm.')
      return
    }
    setTransactionsDeleteError('')
    setStatusMessage('')
    setDeletingTransactions(true)
    try {
      const result = await deleteAllTransactions(selectedAccountId === 'ALL' ? undefined : selectedAccountId)
      setShowDeleteTransactionsModal(false)
      setTransactionsConfirmText('')
      setSelectedAccountId('ALL')
      setStatusMessage(`Deleted ${result.count} transaction(s).`)
    } catch (deleteError) {
      setTransactionsDeleteError(deleteError instanceof Error ? deleteError.message : 'Unable to delete transactions.')
    } finally {
      setDeletingTransactions(false)
    }
  }

  function resetDeleteAccountState() {
    setConfirmingDelete(false)
    setConfirmText('')
    setDeletePassword('')
    setMfaCode('')
    setMfaToken('')
    setReauthToken('')
    setAwaitingMfaCode(false)
    setDeleteError('')
  }

  async function submitDeleteAccount() {
    if (confirmText.trim() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.')
      return
    }
    if (!deletePassword) {
      setDeleteError('Enter your password to continue.')
      return
    }
    setDeleteError('')
    setDeleting(true)
    try {
      let tokenForDelete = reauthToken
      if (authUser?.mfaEnabled && !tokenForDelete) {
        if (awaitingMfaCode && !mfaCode.trim()) {
          setDeleteError('Enter the verification code we emailed you.')
          return
        }
        const reauth = await requestAccountDeleteReauth({
          currentPassword: deletePassword,
          ...(awaitingMfaCode ? { code: mfaCode.trim(), mfaToken } : {}),
        })
        if (reauth.pending_verification && reauth.mfa_token) {
          setMfaToken(reauth.mfa_token)
          setAwaitingMfaCode(true)
          setDeleteError(reauth.message || 'We emailed you a verification code. Enter it to continue.')
          return
        }
        if (!reauth.reauth_token) {
          setDeleteError('Unable to verify. Try again.')
          return
        }
        tokenForDelete = reauth.reauth_token
        setReauthToken(reauth.reauth_token)
      }

      await deleteMyAccount({ password: deletePassword, mfaReauthToken: tokenForDelete || undefined })
      onAuthChange(null)
    } catch (accountDeleteError) {
      setDeleteError(accountDeleteError instanceof Error ? accountDeleteError.message : 'Unable to delete account.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <SettingsPanel eyebrow="Data" title="Privacy, exports, and deletion" description="Sensitive exports and deletion controls stay explicit and reviewable.">
      <SettingsRow icon={Download} title="Account data export" description="Download a complete data package for records or migration.">
        <div className="filter-actions">
          <button className="secondary-button" type="button" onClick={() => void runExport('csv')}>CSV</button>
        </div>
      </SettingsRow>
      <SettingsRow icon={Globe2} title="Data sharing" description="Control privacy consent and data sharing preferences.">
        <Toggle enabled={!privacySettings?.dataSharingOptOut} label={privacySettings?.dataSharingOptOut ? 'Off' : 'On'} onClick={() => {
          updatePrivacy('dataSharingOptOut', !privacySettings?.dataSharingOptOut)
          updatePrivacy('consentGiven', Boolean(privacySettings?.dataSharingOptOut))
        }} />
      </SettingsRow>
      <div className="settings-danger-zone">
        <div>
          <strong>Delete all transactions</strong>
          <p>Permanently deletes every transaction in this business. Locked accounting periods are protected.</p>
        </div>
        <button className="secondary-button danger-button" type="button" onClick={() => void openDeleteTransactionsModal()}>
          <Trash2 size={17} />
          Delete all
        </button>
      </div>

      {showDeleteTransactionsModal ? (
        <div className="transaction-modal-backdrop" role="presentation" onMouseDown={closeDeleteTransactionsModal}>
          <section
            className="transaction-detail-modal subscription-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleteTransactionsTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="deleteTransactionsTitle">Delete all transactions</h2>
                <p>Choose which account's transactions to permanently delete. Locked accounting periods are protected.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close delete transactions" onClick={closeDeleteTransactionsModal}>
                <X size={18} />
              </button>
            </div>
            <div className="transaction-detail-body">
              <form className="drawer-form" onSubmit={(event) => { event.preventDefault(); void submitDeleteAllTransactions() }}>
                <label>
                  Account
                  <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} disabled={loadingAccounts}>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                    <option value="ALL" style={{ color: '#d83b3b', fontWeight: 900 }}>ALL - delete every account's transactions</option>
                  </select>
                </label>
                {selectedAccountId === 'ALL' ? (
                  <p className="delete-all-warning">This deletes every transaction in this business, across every account.</p>
                ) : null}
                <Field label="Type DELETE to confirm" value={transactionsConfirmText} onChange={setTransactionsConfirmText} />
                {transactionsDeleteError ? <p className="drawer-error" role="alert">{transactionsDeleteError}</p> : null}
              </form>
            </div>
            <div className="drawer-actions">
              <button className="secondary-button" type="button" onClick={closeDeleteTransactionsModal} disabled={deletingTransactions}>Cancel</button>
              <button className="secondary-button danger-button" type="button" onClick={() => void submitDeleteAllTransactions()} disabled={deletingTransactions || loadingAccounts}>
                {deletingTransactions ? 'Deleting...' : 'DELETE'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {!confirmingDelete ? (
        <div className="settings-danger-zone">
          <div>
            <strong>Danger zone</strong>
            <p>Permanently deletes your account, businesses, and all associated data. This cannot be undone.</p>
          </div>
          <button className="secondary-button danger-button" type="button" onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={17} />
            Delete account
          </button>
        </div>
      ) : (
        <div className="settings-danger-zone settings-danger-form">
          <div>
            <strong>Delete account</strong>
            <p>Type DELETE and enter your password to permanently delete your account and all its data.</p>
          </div>
          <Field label="Type DELETE to confirm" value={confirmText} onChange={setConfirmText} />
          <Field label="Password" type="password" value={deletePassword} onChange={setDeletePassword} />
          {awaitingMfaCode ? (
            <Field label="Verification code" value={mfaCode} onChange={setMfaCode} />
          ) : null}
          {deleteError ? <p className="drawer-error" role="alert">{deleteError}</p> : null}
          <div className="filter-actions">
            <button className="secondary-button" type="button" onClick={resetDeleteAccountState} disabled={deleting}>Cancel</button>
            <button className="secondary-button danger-button" type="button" onClick={() => void submitDeleteAccount()} disabled={deleting}>
              {deleting ? 'Deleting...' : awaitingMfaCode ? 'Verify and delete' : 'Confirm delete'}
            </button>
          </div>
        </div>
      )}
    </SettingsPanel>
  )
}
