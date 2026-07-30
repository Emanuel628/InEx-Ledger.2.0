const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000
const CHECK_INTERVAL_MS = 15 * 1000
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000
const ACTIVITY_STORAGE_KEY = 'inex-last-activity'
const ACTIVITY_CHANNEL_NAME = 'inex-activity'
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const

/**
 * Starts a 15-minute inactivity timer for the authenticated session. Activity
 * in ANY tab (tracked via localStorage + BroadcastChannel, since a user often
 * has the app open in more than one tab) resets the timer for all of them, so
 * an idle background tab can't log out a tab the user is actively using.
 *
 * Returns a cleanup function that removes all listeners and stops the timer.
 */
export function startInactivityMonitor(onTimeout: () => void) {
  let lastActivity = Date.now()
  let lastWriteAt = 0
  let stopped = false

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(ACTIVITY_CHANNEL_NAME) : null

  function readSharedLastActivity() {
    try {
      const raw = window.localStorage.getItem(ACTIVITY_STORAGE_KEY)
      const parsed = raw ? Number(raw) : NaN
      return Number.isFinite(parsed) ? parsed : 0
    } catch {
      return 0
    }
  }

  function recordActivity() {
    const now = Date.now()
    lastActivity = now
    if (now - lastWriteAt < ACTIVITY_WRITE_THROTTLE_MS) return
    lastWriteAt = now
    try {
      window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now))
    } catch {
      // Storage can be unavailable (private browsing, quota) -- this tab's
      // own in-memory timer still works even if cross-tab sync doesn't.
    }
    channel?.postMessage(now)
  }

  function handleStorageEvent(event: StorageEvent) {
    if (event.key !== ACTIVITY_STORAGE_KEY || !event.newValue) return
    const value = Number(event.newValue)
    if (Number.isFinite(value) && value > lastActivity) {
      lastActivity = value
    }
  }

  function handleChannelMessage(event: MessageEvent<number>) {
    if (typeof event.data === 'number' && event.data > lastActivity) {
      lastActivity = event.data
    }
  }

  function checkTimeout() {
    if (stopped) return
    if (Date.now() - lastActivity >= INACTIVITY_TIMEOUT_MS) {
      stop()
      onTimeout()
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return
    // A backgrounded tab's timers are throttled by the browser -- re-check
    // immediately on foreground instead of waiting for the next interval
    // tick, picking up whatever the shared (cross-tab) activity says.
    const shared = readSharedLastActivity()
    if (shared > lastActivity) lastActivity = shared
    checkTimeout()
    recordActivity()
  }

  function stop() {
    if (stopped) return
    stopped = true
    for (const eventName of ACTIVITY_EVENTS) {
      window.removeEventListener(eventName, recordActivity)
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('storage', handleStorageEvent)
    channel?.removeEventListener('message', handleChannelMessage)
    channel?.close()
    window.clearInterval(intervalId)
  }

  const shared = readSharedLastActivity()
  if (shared > lastActivity) lastActivity = shared

  for (const eventName of ACTIVITY_EVENTS) {
    window.addEventListener(eventName, recordActivity, { passive: true })
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('storage', handleStorageEvent)
  channel?.addEventListener('message', handleChannelMessage)

  const intervalId = window.setInterval(checkTimeout, CHECK_INTERVAL_MS)

  return stop
}
