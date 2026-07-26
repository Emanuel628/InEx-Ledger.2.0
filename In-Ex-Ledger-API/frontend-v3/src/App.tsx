import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
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
  authUser: AuthUser | null
  authLoading: boolean
  onAuthChange: (user: AuthUser | null) => void
  onLogout: () => Promise<void>
  sidebarCollapsed: boolean
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  theme: ThemeMode
  setTheme: Dispatch<SetStateAction<ThemeMode>>
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
])

const legacyAuthRoutes: Partial<Record<AppPage, string | ((next: string) => string)>> = {
  Login: (next) => `/login?next=${encodeURIComponent(next)}`,
  Register: '/register',
  ForgotPassword: '/forgot-password',
  ResetPassword: '/reset-password',
  VerifyEmail: '/verify-email',
  MfaChallenge: (next) => `/login?next=${encodeURIComponent(next)}`,
}

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

function getLegacyAuthRoute(page: AppPage, next = getCanonicalCurrentPath()) {
  const route = legacyAuthRoutes[page]
  return typeof route === 'function' ? route(next) : route
}

function chooseAuthenticatedPage(user: AuthUser) {
  if (!user.currentBusinessId) {
    return user.emailVerified ? 'Onboarding' : 'VerifyEmail'
  }

  const requestedPage = getInitialPageFromPath()
  return requestedPage || 'Transactions'
}

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('Landing')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => (
    window.localStorage.getItem('inex-theme') === 'dark' ? 'dark' : 'light'
  ))

  useEffect(() => {
    window.localStorage.setItem('inex-theme', theme)
  }, [theme])

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
    const legacyAuthRoute = legacyAuthRoutes[page]
    if (legacyAuthRoute) {
      window.location.assign(getLegacyAuthRoute(page) || '/login')
      return
    }

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

  const handleAuthChange = (user: AuthUser | null) => {
    setAuthUser(user)
    if (!user) {
      setCurrentPage('Landing')
      return
    }

    setCurrentPage(chooseAuthenticatedPage(user))
  }

  const handleLogout = async () => {
    await logoutUser()
    handleAuthChange(null)
  }

  const pageProps = {
    activePage: currentPage,
    onNavigate: navigate,
    authUser,
    authLoading,
    onAuthChange: handleAuthChange,
    onLogout: handleLogout,
    sidebarCollapsed,
    setSidebarCollapsed,
    theme,
    setTheme,
  }

  if (authLoading) {
    return (
      <div className="app-v3-loading" data-theme={theme} role="status" aria-live="polite">
        <div>
          <strong>Loading InEx Ledger</strong>
          <span>Checking your session...</span>
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

export default App
