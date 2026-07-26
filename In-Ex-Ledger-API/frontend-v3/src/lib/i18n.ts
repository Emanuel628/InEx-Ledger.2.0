import type { AuthUser } from './authApi'

export type AppLanguage = 'en' | 'es' | 'fr'
export type TranslationKey = keyof typeof translations.en

const STORAGE_KEY = 'lb_language'

export const translations = {
  en: {
    'app.loading.title': 'Loading InEx Ledger',
    'app.loading.body': 'Checking your session...',
    'shell.brand.name': 'InEx Ledger',
    'shell.brand.tagline': 'Books without noise',
    'shell.nav.transactions': 'Transactions',
    'shell.nav.accounts': 'Accounts',
    'shell.nav.categories': 'Categories',
    'shell.nav.receipts': 'Receipts',
    'shell.nav.mileage': 'Mileage',
    'shell.nav.exports': 'Exports',
    'shell.nav.invoices': 'Invoices',
    'shell.nav.analytics': 'Analytics',
    'shell.nav.messages': 'Messages',
    'shell.sidebar.expand': 'Expand sidebar',
    'shell.sidebar.collapse': 'Collapse sidebar',
    'shell.sidebar.collapseLabel': 'Collapse',
    'shell.nav.open': 'Open navigation',
    'shell.nav.close': 'Close navigation',
    'shell.nav.main': 'Main navigation',
    'shell.business.switch': 'Switch business',
    'shell.business.none': 'No business yet',
    'shell.business.loading': 'Loading businesses...',
    'shell.business.empty': 'No businesses found.',
    'shell.business.loadError': 'Unable to load businesses.',
    'shell.business.switchError': 'Unable to switch business.',
    'shell.user.menu': 'User menu',
    'shell.user.fallback': 'User',
    'shell.user.settings': 'Settings',
    'shell.user.signOut': 'Sign out',
    'shell.notifications.label': 'Notifications',
    'shell.notifications.close': 'Close notifications',
    'shell.notifications.empty': 'No unread notifications.',
    'shell.notifications.supportOne': 'Support reply',
    'shell.notifications.supportMany': 'support replies',
    'shell.notifications.supportBody': 'Open Messages to review support updates.',
    'shell.notifications.messageOne': 'Unread email',
    'shell.notifications.messageMany': 'unread emails',
    'shell.notifications.messageBody': 'Open Messages to review email and invoice replies.',
    'shell.notifications.noticeOne': 'Account notice',
    'shell.notifications.noticeMany': 'account notices',
    'shell.notifications.noticeBody': 'Open Messages to review account notifications.',
  },
  es: {
    'app.loading.title': 'Cargando InEx Ledger',
    'app.loading.body': 'Revisando tu sesion...',
    'shell.brand.name': 'InEx Ledger',
    'shell.brand.tagline': 'Libros sin ruido',
    'shell.nav.transactions': 'Transacciones',
    'shell.nav.accounts': 'Cuentas',
    'shell.nav.categories': 'Categorias',
    'shell.nav.receipts': 'Recibos',
    'shell.nav.mileage': 'Millaje',
    'shell.nav.exports': 'Exportaciones',
    'shell.nav.invoices': 'Facturas',
    'shell.nav.analytics': 'Analiticas',
    'shell.nav.messages': 'Mensajes',
    'shell.sidebar.expand': 'Expandir barra lateral',
    'shell.sidebar.collapse': 'Contraer barra lateral',
    'shell.sidebar.collapseLabel': 'Contraer',
    'shell.nav.open': 'Abrir navegacion',
    'shell.nav.close': 'Cerrar navegacion',
    'shell.nav.main': 'Navegacion principal',
    'shell.business.switch': 'Cambiar negocio',
    'shell.business.none': 'Sin negocio todavia',
    'shell.business.loading': 'Cargando negocios...',
    'shell.business.empty': 'No se encontraron negocios.',
    'shell.business.loadError': 'No se pudieron cargar los negocios.',
    'shell.business.switchError': 'No se pudo cambiar de negocio.',
    'shell.user.menu': 'Menu de usuario',
    'shell.user.fallback': 'Usuario',
    'shell.user.settings': 'Configuracion',
    'shell.user.signOut': 'Cerrar sesion',
    'shell.notifications.label': 'Notificaciones',
    'shell.notifications.close': 'Cerrar notificaciones',
    'shell.notifications.empty': 'No hay notificaciones sin leer.',
    'shell.notifications.supportOne': 'Respuesta de soporte',
    'shell.notifications.supportMany': 'respuestas de soporte',
    'shell.notifications.supportBody': 'Abre Mensajes para revisar respuestas de soporte.',
    'shell.notifications.messageOne': 'Correo sin leer',
    'shell.notifications.messageMany': 'correos sin leer',
    'shell.notifications.messageBody': 'Abre Mensajes para revisar correos y respuestas de facturas.',
    'shell.notifications.noticeOne': 'Aviso de cuenta',
    'shell.notifications.noticeMany': 'avisos de cuenta',
    'shell.notifications.noticeBody': 'Abre Mensajes para revisar notificaciones de cuenta.',
  },
  fr: {
    'app.loading.title': 'Chargement d InEx Ledger',
    'app.loading.body': 'Verification de votre session...',
    'shell.brand.name': 'InEx Ledger',
    'shell.brand.tagline': 'Comptes sans bruit',
    'shell.nav.transactions': 'Transactions',
    'shell.nav.accounts': 'Comptes',
    'shell.nav.categories': 'Categories',
    'shell.nav.receipts': 'Recus',
    'shell.nav.mileage': 'Kilometrage',
    'shell.nav.exports': 'Exports',
    'shell.nav.invoices': 'Factures',
    'shell.nav.analytics': 'Analytique',
    'shell.nav.messages': 'Messages',
    'shell.sidebar.expand': 'Agrandir la barre laterale',
    'shell.sidebar.collapse': 'Reduire la barre laterale',
    'shell.sidebar.collapseLabel': 'Reduire',
    'shell.nav.open': 'Ouvrir la navigation',
    'shell.nav.close': 'Fermer la navigation',
    'shell.nav.main': 'Navigation principale',
    'shell.business.switch': 'Changer d entreprise',
    'shell.business.none': 'Aucune entreprise',
    'shell.business.loading': 'Chargement des entreprises...',
    'shell.business.empty': 'Aucune entreprise trouvee.',
    'shell.business.loadError': 'Impossible de charger les entreprises.',
    'shell.business.switchError': 'Impossible de changer d entreprise.',
    'shell.user.menu': 'Menu utilisateur',
    'shell.user.fallback': 'Utilisateur',
    'shell.user.settings': 'Parametres',
    'shell.user.signOut': 'Se deconnecter',
    'shell.notifications.label': 'Notifications',
    'shell.notifications.close': 'Fermer les notifications',
    'shell.notifications.empty': 'Aucune notification non lue.',
    'shell.notifications.supportOne': 'Reponse du soutien',
    'shell.notifications.supportMany': 'reponses du soutien',
    'shell.notifications.supportBody': 'Ouvrez Messages pour consulter les reponses du soutien.',
    'shell.notifications.messageOne': 'Courriel non lu',
    'shell.notifications.messageMany': 'courriels non lus',
    'shell.notifications.messageBody': 'Ouvrez Messages pour consulter les courriels et reponses aux factures.',
    'shell.notifications.noticeOne': 'Avis de compte',
    'shell.notifications.noticeMany': 'avis de compte',
    'shell.notifications.noticeBody': 'Ouvrez Messages pour consulter les notifications du compte.',
  },
} satisfies Record<AppLanguage, Record<string, string>>

export function normalizeLanguage(value?: string | null): AppLanguage {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es'
  if (normalized === 'fr' || normalized.startsWith('fr-')) return 'fr'
  return 'en'
}

export function getStoredLanguage(): AppLanguage {
  return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY))
}

export function setStoredLanguage(language: AppLanguage) {
  window.localStorage.setItem(STORAGE_KEY, language)
  document.documentElement.lang = language
}

export function getUserLanguage(user: AuthUser | null): AppLanguage {
  return normalizeLanguage(user?.business?.language || getStoredLanguage())
}

export function translate(key: TranslationKey, language: AppLanguage) {
  return translations[language][key] || translations.en[key] || key
}

export function formatCountLabel(count: number, oneKey: TranslationKey, manyKey: TranslationKey, language: AppLanguage) {
  return count === 1 ? translate(oneKey, language) : `${count} ${translate(manyKey, language)}`
}
