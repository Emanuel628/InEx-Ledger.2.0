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

const navItems = [
  { label: 'Transactions', icon: FileText },
  { label: 'Accounts', icon: Landmark },
  { label: 'Categories', icon: Tags },
  { label: 'Receipts', icon: Receipt },
  { label: 'Mileage', icon: Car },
  { label: 'Exports', icon: Download },
  { label: 'Invoices', icon: FolderTree },
  { label: 'Analytics', icon: ChartNoAxesCombined },
  { label: 'Messages', icon: MessageSquare },
] satisfies { label: AppPage; icon: LucideIcon }[]

const initialNotifications: { id: number; title: string; body: string; page: AppPage }[] = []

type AppShellProps = PageProps & {
  searchPlaceholder: string
  children: ReactNode
  overlay?: ReactNode
  hideTopbar?: boolean
}

function AppShell({
  activePage,
  onNavigate,
  authUser,
  onLogout,
  sidebarCollapsed,
  setSidebarCollapsed,
  theme,
  searchPlaceholder,
  children,
  overlay,
  hideTopbar = false,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const topbarActionsRef = useRef<HTMLDivElement | null>(null)
  const goToPage = (page: AppPage) => {
    onNavigate(page)
    setMobileNavOpen(false)
    setUserMenuOpen(false)
    setNotificationsOpen(false)
  }

  useEffect(() => {
    if (!userMenuOpen && !notificationsOpen) return undefined

    const closeTopbarMenus = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (topbarActionsRef.current?.contains(target)) return
      setUserMenuOpen(false)
      setNotificationsOpen(false)
    }

    document.addEventListener('pointerdown', closeTopbarMenus)
    return () => document.removeEventListener('pointerdown', closeTopbarMenus)
  }, [notificationsOpen, userMenuOpen])

  return (
    <div
      className={`ledger-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-is-open' : ''}`}
      data-theme={theme}
    >
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <LogoMark />
          </div>
          <div className="brand-copy">
            <strong>InEx Ledger</strong>
            <span>Books without noise</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              className={`sidebar-link ${activePage === label ? 'is-active' : ''}`}
              key={label}
              type="button"
              onClick={() => {
                goToPage(label)
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button
          className="sidebar-collapse"
          type="button"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          <span>Collapse</span>
        </button>
      </aside>

      {mobileNavOpen ? (
        <button
          className="mobile-nav-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div className="app-workspace">
        {hideTopbar ? (
          <button
            className="icon-button mobile-menu topbarless-mobile-menu"
            type="button"
            aria-label="Open navigation"
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
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>

          <button className="business-button" type="button">
            <Building2 size={18} />
            <span>{authUser?.business?.name || 'No business yet'}</span>
            <ChevronDown size={16} />
          </button>

          <div className="topbar-search" role="search">
            <Search size={18} />
            <input type="search" placeholder={searchPlaceholder} />
          </div>

          <div className="topbar-actions" ref={topbarActionsRef}>
            <button
              className="icon-button"
              type="button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((value) => !value)
                setUserMenuOpen(false)
              }}
            >
              <Bell size={18} />
              {notifications.length ? <span className="notification-dot">{notifications.length}</span> : null}
            </button>
            <button
              className="user-menu"
              type="button"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
              onClick={() => {
                setUserMenuOpen((value) => !value)
                setNotificationsOpen(false)
              }}
            >
              <div className="user-avatar">{authUser?.firstName?.charAt(0).toUpperCase() || 'U'}</div>
              <span>{authUser?.firstName || 'User'}</span>
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
                  <span>Settings</span>
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
                  <span>Sign out</span>
                </button>
              </div>
            ) : null}
            {notificationsOpen ? (
              <div className="notification-menu" role="dialog" aria-label="Notifications">
                <div className="notification-menu-head">
                  <strong>Notifications</strong>
                  <button className="icon-button" type="button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}>
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
                          setNotifications((items) => items.filter((item) => item.id !== notification.id))
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
                  <p className="notification-empty">No unread notifications.</p>
                )}
                {notifications.length ? (
                  <button className="notification-clear" type="button" onClick={() => setNotifications([])}>
                    Mark all as read
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>
        )}

        {children}
      </div>

      {overlay}
    </div>
  )
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="14" width="5" height="12" rx="1.6" />
      <rect x="13.5" y="8" width="5" height="18" rx="1.6" />
      <rect x="23" y="4" width="5" height="22" rx="1.6" />
    </svg>
  )
}

export default AppShell
