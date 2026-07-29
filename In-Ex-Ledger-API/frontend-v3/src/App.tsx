import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import Transactions from './pages/Transactions'
import Accounts from './pages/Accounts'
import Categories from './pages/Categories'
import Receipts from './pages/Receipts'
import Exports from './pages/Exports'
import Mileage from './pages/Mileage'
import Invoices from './pages/Invoices'
import Messages from './pages/Messages'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import Billing from './pages/Billing'
import Subscription from './pages/Subscription'
import BusinessWorkspaces from './pages/BusinessWorkspaces'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'
import Legal from './pages/Legal'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import Sessions from './pages/Sessions'
import ChangeEmail from './pages/ChangeEmail'
import Upgrade from './pages/Upgrade'
import TrialSetup from './pages/TrialSetup'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import MfaChallenge from './pages/MfaChallenge'
import Onboarding from './pages/Onboarding'
import Help from './pages/Help'
import PlaceholderPage from './pages/PlaceholderPage'
import { getCurrentUser, logoutUser, type AuthUser } from './lib/authApi'
import { startInactivityMonitor } from './lib/inactivityMonitor'
import { applyV3PhraseTranslations, getStoredLanguage, getUserLanguage, observeV3PhraseTranslations, setStoredLanguage, translate, type AppLanguage } from './lib/i18n'
import { PlanProvider } from './context/PlanContext'

declare global {
  interface Window {
    __LUNA_ME__?: AuthUser | null
  }
}

export type AppPage =
  | 'Transactions'
  | 'Accounts'
  | 'Categories'
  | 'Receipts'
  | 'Mileage'
  | 'Exports'
  | 'Invoices'
  | 'Analytics'
  | 'Messages'
  | 'Settings'
  | 'Billing'
  | 'Subscription'
  | 'BusinessWorkspaces'
  | 'Landing'
  | 'Pricing'
  | 'Legal'
  | 'Privacy'
  | 'Terms'
  | 'Sessions'
  | 'ChangeEmail'
  | 'Upgrade'
  | 'TrialSetup'
  | 'Login'
  | 'Register'
  | 'ForgotPassword'
  | 'ResetPassword'
  | 'VerifyEmail'
  | 'MfaChallenge'
  | 'Onboarding'
  | 'Help'

export type ThemeMode = 'light' | 'dark'

export type PageProps = {
  activePage: AppPage
  onNavigate: (page: AppPage) => void
  onNavigateToPath: (path: string) => void
  authUser: AuthUser | null
  authLoading: boolean
  onAuthChange: (user: AuthUser | null) => void
  onLogout: () => Promise<void>
  sidebarCollapsed: boolean
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  theme: ThemeMode
  setTheme: Dispatch<SetStateAction<ThemeMode>>
  language: AppLanguage
  onLanguageChange: (language: AppLanguage) => void
}

const publicPages = new Set<AppPage>([
  'Landing',
  'Pricing',
  'Legal',
  'Privacy',
  'Terms',
  'Login',
  'Register',
  'ForgotPassword',
  'ResetPassword',
  'VerifyEmail',
  'MfaChallenge',
])

const authFlowPages = new Set<AppPage>([
  'Login',
  'Register',
  'ForgotPassword',
  'ResetPassword',
  'VerifyEmail',
  'MfaChallenge',
])

const pageSlugByPage: Partial<Record<AppPage, string>> = {
  Transactions: 'transactions',
  Accounts: 'accounts',
  Categories: 'categories',
  Receipts: 'receipts',
  Mileage: 'mileage',
  Exports: 'exports',
  Invoices: 'invoices',
  Analytics: 'analytics',
  Messages: 'messages',
  Settings: 'settings',
  Billing: 'billing',
  Subscription: 'subscription',
  BusinessWorkspaces: 'workspaces',
  Landing: '',
  Pricing: 'pricing',
  Legal: 'legal',
  Privacy: 'privacy',
  Terms: 'terms',
  Sessions: 'sessions',
  ChangeEmail: 'change-email',
  Onboarding: 'onboarding',
  Help: 'help',
  Upgrade: 'upgrade',
  TrialSetup: 'trial-setup',
  Login: 'login',
  Register: 'register',
  ForgotPassword: 'forgot-password',
  ResetPassword: 'reset-password',
  VerifyEmail: 'verify-email',
  MfaChallenge: 'mfa-challenge',
}

const pageBySlug = new Map(
  Object.entries(pageSlugByPage).map(([page, slug]) => [slug, page as AppPage]),
)

function getInitialPageFromPath(): AppPage | null {
  const normalized = window.location.pathname
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/^\/app-v3\/?/, '/')
    .replace(/^\/+/, '')

  if (!normalized || normalized === 'app-v3') {
    return null
  }

  return pageBySlug.get(normalized) || null
}

/** Canonical product URLs are bare paths: /transactions, /settings, ... */
function getPathForPage(page: AppPage) {
  if (page === 'Landing') {
    return '/'
  }
  const slug = pageSlugByPage[page]
  return slug ? `/${slug}` : '/transactions'
}

function getCanonicalCurrentPath() {
  const requestedPage = getInitialPageFromPath()
  return requestedPage ? getPathForPage(requestedPage) : '/transactions'
}

function normalizeLegacyAppV3Path() {
  const path = window.location.pathname
  if (path === '/app-v3' || (path.startsWith('/app-v3/') && !path.startsWith('/app-v3/assets'))) {
    const canonical = getCanonicalCurrentPath()
    const nextUrl = `${canonical}${window.location.search}${window.location.hash}`
    if (`${path}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history.replaceState({}, '', nextUrl)
    }
  }
}

/** Resolves a `?next=` redirect target (e.g. after a session-expired bounce
 *  to /login) to a known in-app page, ignoring anything that isn't a safe
 *  internal path or that points back into the auth flow itself. */
function getNextPageFromQuery(): AppPage | null {
  const next = String(new URLSearchParams(window.location.search).get('next') || '')
  if (!next.startsWith('/') || next.startsWith('//')) {
    return null
  }

  const normalized = next.toLowerCase().split(/[?#]/)[0].replace(/^\/+/, '').replace(/\/+$/, '')
  const page = pageBySlug.get(normalized)
  return page && !authFlowPages.has(page) ? page : null
}

/** Resolves a raw app path (as returned by the backend's `redirect_to`, e.g.
 *  `/trial-setup?next=%2Ftransactions`) to a known in-app page, defaulting to
 *  Transactions for anything unrecognized. The query string is left in the
 *  address bar for the destination page to read if it cares (see
 *  navigateToPath). */
function resolvePageFromRawPath(path: string): AppPage {
  const normalized = String(path || '')
    .toLowerCase()
    .split(/[?#]/)[0]
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  return pageBySlug.get(normalized) || 'Transactions'
}

function chooseAuthenticatedPage(user: AuthUser) {
  // A placeholder business/account is auto-created the moment a session
  // exists (see resolveBusinessIdForUser), so currentBusinessId is set well
  // before onboarding runs and can't be used to detect "still onboarding"
  // anymore. onboarding_completed is the real signal now.
  if (!user.emailVerified) {
    // MfaChallenge reads its context from sessionStorage (same pattern used
    // by the login and email-change challenges); it sends its own signup
    // verification code on mount, so no token needs to be stashed here.
    window.sessionStorage.setItem('inex-mfa-context', 'signup')
    return 'MfaChallenge'
  }

  if (!user.onboardingCompleted) {
    return 'Onboarding'
  }

  const nextPage = getNextPageFromQuery()
  if (nextPage) {
    return nextPage
  }

  const requestedPage = getInitialPageFromPath()
  return requestedPage && !authFlowPages.has(requestedPage) ? requestedPage : 'Transactions'
}

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('Landing')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => (
    window.localStorage.getItem('inex-theme') === 'dark' ? 'dark' : 'light'
  ))
  const [language, setLanguage] = useState(getStoredLanguage)
  const languageRef = useRef(language)

  useEffect(() => {
    window.localStorage.setItem('inex-theme', theme)
  }, [theme])

  useEffect(() => {
    languageRef.current = language
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return undefined
    const observer = observeV3PhraseTranslations(root, () => languageRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    window.requestAnimationFrame(() => applyV3PhraseTranslations(root, language))
  }, [currentPage, language])

  useEffect(() => {
    const nextLanguage = getUserLanguage(authUser)
    setLanguage(nextLanguage)
    setStoredLanguage(nextLanguage)
  }, [authUser])

  // Applies a language pick immediately (Settings, Onboarding) instead of
  // waiting for a save + refetch round trip through authUser.
  const handleLanguageChange = (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage)
    setStoredLanguage(nextLanguage)
  }

  useEffect(() => {
    window.__LUNA_ME__ = authUser
  }, [authUser])

  useEffect(() => {
    normalizeLegacyAppV3Path()
  }, [])

  useEffect(() => {
    let active = true
    getCurrentUser()
      .then(({ user }) => {
        if (!active) {
          return
        }
        setAuthUser(user)
        if (user) {
          const page = chooseAuthenticatedPage(user)
          setCurrentPage(page)
          const requested = getInitialPageFromPath()
          if (requested) {
            const path = getPathForPage(requested)
            if (window.location.pathname !== path && !window.location.pathname.startsWith('/app-v3/assets')) {
              window.history.replaceState({}, '', path)
            }
          }
        }
      })
      .catch(() => {
        if (active) {
          setAuthUser(null)
          const requestedPage = getInitialPageFromPath()
          if (requestedPage && !publicPages.has(requestedPage)) {
            window.location.assign(`/login?next=${encodeURIComponent(getPathForPage(requestedPage))}`)
            return
          }
          setCurrentPage(requestedPage && publicPages.has(requestedPage) ? requestedPage : 'Landing')
        }
      })
      .finally(() => {
        if (active) {
          setAuthLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const requestedPage = getInitialPageFromPath()
      if (!authUser && requestedPage && !publicPages.has(requestedPage)) {
        setCurrentPage('Landing')
        return
      }
      setCurrentPage(requestedPage || (authUser ? chooseAuthenticatedPage(authUser) : 'Landing'))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [authUser])

  const navigate = (page: AppPage) => {
    if (!authUser && !publicPages.has(page)) {
      window.location.assign(`/login?next=${encodeURIComponent(getPathForPage(page))}`)
      return
    }

    setCurrentPage(page)
    const path = getPathForPage(page)
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
  }

  // Navigates using a raw path (as returned by the backend's onboarding
  // `redirect_to`, e.g. "/trial-setup?next=%2Ftransactions") instead of an
  // AppPage enum value, preserving the query string so the destination page
  // can read it (see getNextPageFromQuery's `?next=` convention).
  const navigateToPath = (path: string) => {
    const page = resolvePageFromRawPath(path)
    setCurrentPage(page)
    const fullPath = String(path || '').startsWith('/') ? path : `/${path || ''}`
    if (`${window.location.pathname}${window.location.search}` !== fullPath) {
      window.history.pushState({}, '', fullPath)
    }
  }

  const handleAuthChange = (user: AuthUser | null) => {
    setAuthUser(user)
    if (!user) {
      setCurrentPage('Landing')
      if (window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/')
      }
      return
    }

    const nextPage = chooseAuthenticatedPage(user)
    setCurrentPage(nextPage)
    // Callers of onAuthChange (Register, Login's MFA success, email-change
    // confirm, ...) don't separately push a history entry -- without this the
    // address bar is left showing whatever auth-flow page the user came from
    // even though the rendered page has already moved on.
    const path = getPathForPage(nextPage)
    if (window.location.pathname !== path) {
      window.history.replaceState({}, '', path)
    }
  }

  const handleLogout = async () => {
    await logoutUser()
    handleAuthChange(null)
  }

  // Signs the user out after 15 minutes with no activity in any tab, landing
  // on Login with a reason so the sign-out isn't a silent surprise.
  async function handleInactivityLogout() {
    try {
      await logoutUser()
    } catch {
      // Best-effort -- still clear local state and send the user to Login
      // even if the network call fails (e.g. offline).
    }
    setAuthUser(null)
    setCurrentPage('Login')
    window.history.replaceState({}, '', '/login?reason=inactive')
  }

  // Only the identity of authUser should (re)arm the inactivity monitor.
  const authUserId = authUser?.id
  useEffect(() => {
    if (!authUserId) return undefined
    const stopMonitor = startInactivityMonitor(() => {
      void handleInactivityLogout()
    })
    return () => stopMonitor()
  }, [authUserId])

  const pageProps = {
    activePage: currentPage,
    onNavigate: navigate,
    onNavigateToPath: navigateToPath,
    authUser,
    authLoading,
    onAuthChange: handleAuthChange,
    onLogout: handleLogout,
    sidebarCollapsed,
    setSidebarCollapsed,
    theme,
    setTheme,
    language,
    onLanguageChange: handleLanguageChange,
  }

  function renderPage() {
  if (authLoading) {
    return (
      <div className="app-v3-loading" data-theme={theme} role="status" aria-live="polite">
        <div>
          <strong>{translate('app.loading.title', language)}</strong>
          <span>{translate('app.loading.body', language)}</span>
        </div>
      </div>
    )
  }

  if (currentPage === 'Accounts') {
    return <Accounts {...pageProps} />
  }

  if (currentPage === 'Categories') {
    return <Categories {...pageProps} />
  }

  if (currentPage === 'Receipts') {
    return <Receipts {...pageProps} />
  }

  if (currentPage === 'Exports') {
    return <Exports {...pageProps} />
  }

  if (currentPage === 'Mileage') {
    return <Mileage {...pageProps} />
  }

  if (currentPage === 'Invoices') {
    return <Invoices {...pageProps} />
  }

  if (currentPage === 'Messages') {
    return <Messages {...pageProps} />
  }

  if (currentPage === 'Analytics') {
    return <Analytics {...pageProps} />
  }

  if (currentPage === 'Settings') {
    return <Settings {...pageProps} />
  }

  if (currentPage === 'Billing') {
    return <Billing {...pageProps} />
  }

  if (currentPage === 'Subscription') {
    return <Subscription {...pageProps} />
  }

  if (currentPage === 'BusinessWorkspaces') {
    return <BusinessWorkspaces {...pageProps} />
  }

  if (currentPage === 'Landing') {
    return <Landing {...pageProps} />
  }

  if (currentPage === 'Pricing') {
    return <Pricing {...pageProps} />
  }

  if (currentPage === 'Legal') {
    return <Legal {...pageProps} />
  }

  if (currentPage === 'Privacy') {
    return <Privacy {...pageProps} />
  }

  if (currentPage === 'Terms') {
    return <Terms {...pageProps} />
  }

  if (currentPage === 'Sessions') {
    return <Sessions {...pageProps} />
  }

  if (currentPage === 'ChangeEmail') {
    return <ChangeEmail {...pageProps} />
  }

  if (currentPage === 'Upgrade') {
    return <Upgrade {...pageProps} />
  }

  if (currentPage === 'TrialSetup') {
    return <TrialSetup {...pageProps} />
  }

  if (currentPage === 'Login') {
    return <Login {...pageProps} />
  }

  if (currentPage === 'Register') {
    return <Register {...pageProps} />
  }

  if (currentPage === 'ForgotPassword') {
    return <ForgotPassword {...pageProps} />
  }

  if (currentPage === 'ResetPassword') {
    return <ResetPassword {...pageProps} />
  }

  if (currentPage === 'VerifyEmail') {
    return <VerifyEmail {...pageProps} />
  }

  if (currentPage === 'MfaChallenge') {
    return <MfaChallenge {...pageProps} />
  }

  if (currentPage === 'Onboarding') {
    return <Onboarding {...pageProps} />
  }

  if (currentPage === 'Help') {
    return <Help {...pageProps} />
  }

  if (currentPage === 'Transactions') {
    return <Transactions {...pageProps} />
  }

  return <PlaceholderPage {...pageProps} />
  }

  return <PlanProvider authUser={authUser}>{renderPage()}</PlanProvider>
}

export default App
