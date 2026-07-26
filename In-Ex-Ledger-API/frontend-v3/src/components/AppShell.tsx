import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bell,
  Building2,
  Car,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderTree,
  Landmark,
  LogOut,
  Menu,
  MessageSquare,
  Receipt,
  Search,
  Settings as SettingsIcon,
  Tags,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { AppPage, PageProps } from '../App'
import { getCurrentUser } from '../lib/authApi'
import { activateBusiness, loadBusinesses, type BusinessRecord } from '../lib/businessesApi'
import { formatCountLabel, getUserLanguage, translate, type TranslationKey } from '../lib/i18n'
import { loadUnreadCounts } from '../lib/messagesApi'

const navItems = [
  { label: 'Transactions', icon: FileText, i18nKey: 'shell.nav.transactions' },
  { label: 'Accounts', icon: Landmark, i18nKey: 'shell.nav.accounts' },
  { label: 'Categories', icon: Tags, i18nKey: 'shell.nav.categories' },
  { label: 'Receipts', icon: Receipt, i18nKey: 'shell.nav.receipts' },
  { label: 'Mileage', icon: Car, i18nKey: 'shell.nav.mileage' },
  { label: 'Exports', icon: Download, i18nKey: 'shell.nav.exports' },
  { label: 'Invoices', icon: FolderTree, i18nKey: 'shell.nav.invoices' },
  { label: 'Analytics', icon: ChartNoAxesCombined, i18nKey: 'shell.nav.analytics' },
  { label: 'Messages', icon: MessageSquare, i18nKey: 'shell.nav.messages' },
] satisfies { label: AppPage; icon: LucideIcon; i18nKey: TranslationKey }[]

type AppNotification = { id: string; title: string; body: string; page: AppPage }

type AppShellProps = PageProps & {
  searchPlaceholder: string
  searchValue?: string
  onSearch?: (value: string) => void
  children: ReactNode
  overlay?: ReactNode
  hideTopbar?: boolean
}

function AppShell({
  activePage,
  onNavigate,
  authUser,
  onAuthChange,
  onLogout,
  sidebarCollapsed,
  setSidebarCollapsed,
  theme,
  searchPlaceholder,
  searchValue = '',
  onSearch,
  children,
  overlay,
  hideTopbar = false,
}: AppShellProps) {
  const language = getUserLanguage(authUser)
  const t = (key: TranslationKey) => translate(key, language)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [businessMenuOpen, setBusinessMenuOpen] = useState(false)
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([])
  const [businessLoading, setBusinessLoading] = useState(false)
  const [businessError, setBusinessError] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const topbarMenusRef = useRef<HTMLDivElement | null>(null)
  const goToPage = (page: AppPage) => {
    onNavigate(page)
    setMobileNavOpen(false)
    setBusinessMenuOpen(false)
    setUserMenuOpen(false)
    setNotificationsOpen(false)
  }

  useEffect(() => {
    if (!businessMenuOpen && !userMenuOpen && !notificationsOpen) return undefined

    const closeTopbarMenus = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (topbarMenusRef.current?.contains(target)) return
      setBusinessMenuOpen(false)
      setUserMenuOpen(false)
      setNotificationsOpen(false)
    }

    document.addEventListener('pointerdown', closeTopbarMenus)
    return () => document.removeEventListener('pointerdown', closeTopbarMenus)
  }, [businessMenuOpen, notificationsOpen, userMenuOpen])

  useEffect(() => {
    if (!businessMenuOpen || !authUser) return undefined

    let active = true
    setBusinessLoading(true)
    setBusinessError('')
    loadBusinesses()
      .then((data) => {
        if (active) {
          setBusinesses(data.businesses || [])
        }
      })
      .catch((error) => {
        if (active) {
          setBusinessError(error instanceof Error ? error.message : t('shell.business.loadError'))
          setBusinesses([])
        }
      })
      .finally(() => {
        if (active) {
          setBusinessLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [authUser, businessMenuOpen])

  useEffect(() => {
    let active = true

    async function refreshNotifications() {
      if (!authUser) {
        setNotifications([])
        return
      }

      try {
        const counts = await loadUnreadCounts()
        if (!active) return
        setNotifications(buildNotifications(counts, language))
      } catch {
        if (active) {
          setNotifications([])
        }
      }
    }

    void refreshNotifications()
    const interval = window.setInterval(() => void refreshNotifications(), 60000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [authUser, language])

  return (
    <div
      className={`ledger-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-is-open' : ''}`}
      data-theme={theme}
    >
      <aside className="app-sidebar" aria-label={t('shell.nav.main')}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <LogoMark />
          </div>
          <div className="brand-copy">
            <strong>{t('shell.brand.name')}</strong>
            <span>{t('shell.brand.tagline')}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ label, icon: Icon, i18nKey }) => (
            <button
              className={`sidebar-link ${activePage === label ? 'is-active' : ''}`}
              key={label}
              type="button"
              onClick={() => {
                goToPage(label)
              }}
            >
              <Icon size={19} />
              <span>{t(i18nKey)}</span>
            </button>
          ))}
        </nav>

        <button
          className="sidebar-collapse"
          type="button"
          aria-label={sidebarCollapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          <span>{t('shell.sidebar.collapseLabel')}</span>
        </button>
      </aside>

      {mobileNavOpen ? (
        <button
          className="mobile-nav-backdrop"
          type="button"
          aria-label={t('shell.nav.close')}
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div className="app-workspace">
        {hideTopbar ? (
          <button
            className="icon-button mobile-menu topbarless-mobile-menu"
            type="button"
            aria-label={t('shell.nav.open')}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
        ) : (
        <header className="app-topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label={t('shell.nav.open')}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="topbar-menus" ref={topbarMenusRef}>
            <div className="business-switcher">
              <button
                className="business-button"
                type="button"
                aria-label={t('shell.business.switch')}
                aria-expanded={businessMenuOpen}
                onClick={() => {
                  setBusinessMenuOpen((value) => !value)
                  setUserMenuOpen(false)
                  setNotificationsOpen(false)
                }}
              >
                <Building2 size={18} />
                <span>{authUser?.business?.name || t('shell.business.none')}</span>
                <ChevronDown size={16} />
              </button>
              {businessMenuOpen ? (
                <div className="business-dropdown" role="menu">
                  {businessLoading ? <p>{t('shell.business.loading')}</p> : null}
                  {businessError ? <p className="dropdown-error">{businessError}</p> : null}
                  {!businessLoading && !businessError && businesses.length === 0 ? (
                    <p>{t('shell.business.empty')}</p>
                  ) : null}
                  {businesses.map((business) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={business.id}
                      className={business.id === authUser?.currentBusinessId ? 'is-active' : ''}
                      onClick={async () => {
                        if (business.id === authUser?.currentBusinessId) {
                          setBusinessMenuOpen(false)
                          return
                        }
                        setBusinessLoading(true)
                        setBusinessError('')
                        try {
                          await activateBusiness(business.id)
                          const { user } = await getCurrentUser()
                          onAuthChange(user)
                          window.location.reload()
                        } catch (error) {
                          setBusinessError(error instanceof Error ? error.message : t('shell.business.switchError'))
                        } finally {
                          setBusinessLoading(false)
                        }
                      }}
                    >
                      <Building2 size={16} />
                      <span>{business.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {onSearch ? (
              <form
                className="topbar-search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  onSearch(String(data.get('topbar-search') || ''))
                }}
              >
                <Search size={18} />
                <input
                  name="topbar-search"
                  type="search"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(event) => onSearch(event.target.value)}
                />
              </form>
            ) : null}

          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label={t('shell.notifications.label')}
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((value) => !value)
                setBusinessMenuOpen(false)
                setUserMenuOpen(false)
              }}
            >
              <Bell size={18} />
              {notifications.length ? <span className="notification-dot">{notifications.length}</span> : null}
            </button>
            <button
              className="user-menu"
              type="button"
              aria-label={t('shell.user.menu')}
              aria-expanded={userMenuOpen}
              onClick={() => {
                setUserMenuOpen((value) => !value)
                setBusinessMenuOpen(false)
                setNotificationsOpen(false)
              }}
            >
              <div className="user-avatar">{authUser?.firstName?.charAt(0).toUpperCase() || t('shell.user.fallback').charAt(0)}</div>
              <span>{authUser?.firstName || t('shell.user.fallback')}</span>
              <ChevronDown size={16} />
            </button>
            {userMenuOpen ? (
              <div className="user-dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    goToPage('Settings')
                  }}
                >
                  <SettingsIcon size={17} />
                  <span>{t('shell.user.settings')}</span>
                </button>
                <button
                  className="user-dropdown-signout"
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    await onLogout()
                  }}
                >
                  <LogOut size={17} />
                  <span>{t('shell.user.signOut')}</span>
                </button>
              </div>
            ) : null}
            {notificationsOpen ? (
              <div className="notification-menu" role="dialog" aria-label={t('shell.notifications.label')}>
                <div className="notification-menu-head">
                  <strong>{t('shell.notifications.label')}</strong>
                  <button className="icon-button" type="button" aria-label={t('shell.notifications.close')} onClick={() => setNotificationsOpen(false)}>
                    <X size={16} />
                  </button>
                </div>
                {notifications.length ? (
                  <div className="notification-list">
                    {notifications.map((notification) => (
                      <button
                        className="notification-item"
                        type="button"
                        key={notification.id}
                        onClick={() => {
                          goToPage(notification.page)
                        }}
                      >
                        <span />
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.body}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="notification-empty">{t('shell.notifications.empty')}</p>
                )}
              </div>
            ) : null}
          </div>
          </div>
        </header>
        )}

        {children}
      </div>

      {overlay}
    </div>
  )
}

function buildNotifications(counts: { total?: number; messages?: number; support?: number; notifications?: number }, language = getUserLanguage(null)) {
  const items: AppNotification[] = []
  const supportCount = Number(counts.support || 0)
  const noticeCount = Number(counts.notifications || 0)
  const messageCount = Number(counts.messages || 0)

  if (supportCount > 0) {
    items.push({
      id: 'support',
      title: formatCountLabel(supportCount, 'shell.notifications.supportOne', 'shell.notifications.supportMany', language),
      body: translate('shell.notifications.supportBody', language),
      page: 'Messages',
    })
  }

  if (messageCount > 0) {
    items.push({
      id: 'messages',
      title: formatCountLabel(messageCount, 'shell.notifications.messageOne', 'shell.notifications.messageMany', language),
      body: translate('shell.notifications.messageBody', language),
      page: 'Messages',
    })
  }

  if (noticeCount > 0) {
    items.push({
      id: 'account-notices',
      title: formatCountLabel(noticeCount, 'shell.notifications.noticeOne', 'shell.notifications.noticeMany', language),
      body: translate('shell.notifications.noticeBody', language),
      page: 'Messages',
    })
  }

  return items
}

function LogoMark() {
  return <img src="/brand/inex-mark-onnavy.svg" alt="" aria-hidden="true" />
}

export default AppShell
