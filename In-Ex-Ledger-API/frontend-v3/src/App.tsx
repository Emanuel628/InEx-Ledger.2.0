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

const legacyAuthRoutes: Partial<Record<AppPage, string>> = {
  Login: '/login?next=/app-v3/',
  Register: '/register',
  ForgotPassword: '/forgot-password',
  ResetPassword: '/reset-password',
  VerifyEmail: '/verify-email',
  MfaChallenge: '/login?next=/app-v3/',
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

function getPathForPage(page: AppPage) {
  const slug = pageSlugByPage[page]
  return slug ? `/${slug}` : null
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
    let active = true
    getCurrentUser()
      .then(({ user }) => {
        if (!active) {
          return
        }
        setAuthUser(user)
        if (user) {
          setCurrentPage(chooseAuthenticatedPage(user))
        }
      })
      .catch(() => {
        if (active) {
          setAuthUser(null)
          const requestedPage = getInitialPageFromPath()
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

  const navigate = (page: AppPage) => {
    const legacyAuthRoute = legacyAuthRoutes[page]
    if (legacyAuthRoute) {
      window.location.assign(legacyAuthRoute)
      return
    }

    if (!authUser && !publicPages.has(page)) {
      window.location.assign('/login?next=/app-v3/')
      return
    }

    setCurrentPage(page)
    const path = getPathForPage(page)
    if (path && window.location.pathname !== path) {
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
