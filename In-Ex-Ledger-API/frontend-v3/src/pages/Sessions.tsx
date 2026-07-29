import { useEffect, useState } from 'react'
import { Monitor, ShieldCheck } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { listSessions, revokeOtherSessions, revokeSession, type AuthSession } from '../lib/authApi'

function Sessions(props: PageProps) {
  const [sessions, setSessions] = useState<AuthSession[]>([])
  const [error, setError] = useState('')

  async function refreshSessions() {
    try {
      const response = await listSessions()
      setSessions(response.sessions)
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'Unable to load sessions.')
    }
  }

  useEffect(() => {
    void refreshSessions()
  }, [])

  async function removeSession(sessionId: string) {
    try {
      await revokeSession(sessionId)
      await refreshSessions()
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'Unable to remove session.')
    }
  }

  async function removeOtherSessions() {
    try {
      await revokeOtherSessions()
      await refreshSessions()
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'Unable to remove sessions.')
    }
  }

  return (
    <AppShell {...props}>
      <main className="transactions-page support-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Security</p>
            <h1>Sessions</h1>
            <p>Review signed-in devices and remove access that should no longer be active.</p>
          </div>
          <button className="secondary-button danger-button" type="button" onClick={() => void removeOtherSessions()}>Sign out other sessions</button>
        </section>

        {error ? <section className="top-alert" role="alert"><ShieldCheck size={17} /><div><strong>{error}</strong></div></section> : null}

        <section className="support-card-list">
          {sessions.map((session) => (
            <article className="support-card" key={session.id}>
              <span className="support-card-icon"><Monitor size={21} /></span>
              <div>
                <h2>{formatDevice(session.userAgent)}</h2>
                <p>{session.ip} - last seen {formatDateTime(session.lastSeenAt)}</p>
              </div>
              {session.current ? (
                <span className="status-pill status-cleared">Current</span>
              ) : (
                <button className="secondary-button" type="button" onClick={() => void removeSession(session.id)}>Remove</button>
              )}
            </article>
          ))}
        </section>

        <section className="support-note-card">
          <ShieldCheck size={20} />
          <p>Session controls are connected to the auth backend. Removing a session revokes that cookie.</p>
        </section>
      </main>
    </AppShell>
  )
}

function formatDevice(userAgent: string) {
  if (userAgent.includes('Firefox')) return 'Firefox browser'
  if (userAgent.includes('Edg')) return 'Edge browser'
  if (userAgent.includes('Chrome')) return 'Chrome browser'
  if (userAgent.includes('Safari')) return 'Safari browser'
  return 'Signed-in device'
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

export default Sessions
