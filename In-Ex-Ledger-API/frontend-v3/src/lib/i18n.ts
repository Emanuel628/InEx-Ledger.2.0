import type { AuthUser } from './authApi'
import { v3PhraseCatalog } from './i18nPhrases'

export type AppLanguage = 'en' | 'es' | 'fr'
export type TranslationKey = keyof typeof translations.en

const STORAGE_KEY = 'lb_language'
const TRANSLATABLE_ATTRS = ['aria-label', 'placeholder', 'title'] as const
type TranslationRecord = { original: string; lastOutput: string }
const originalTextNodes = new WeakMap<Text, TranslationRecord>()
const originalAttrs = new WeakMap<Element, Partial<Record<(typeof TRANSLATABLE_ATTRS)[number], TranslationRecord>>>()

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

export function translatePhrase(phrase: string, language: AppLanguage) {
  const normalized = normalizePhrase(phrase)
  if (!normalized) return phrase
  return v3PhraseCatalog[language][normalized as keyof typeof v3PhraseCatalog.en]
    || v3PhraseCatalog.en[normalized as keyof typeof v3PhraseCatalog.en]
    || phrase
}

export function applyV3PhraseTranslations(root: ParentNode, language: AppLanguage) {
  translateTextNodes(root, language)
  translateAttributes(root, language)
}

export function observeV3PhraseTranslations(root: ParentNode, languageProvider: () => AppLanguage) {
  applyV3PhraseTranslations(root, languageProvider())
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node as Text, languageProvider())
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          applyV3PhraseTranslations(node as Element, languageProvider())
        }
      }
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        translateElementAttributes(mutation.target, languageProvider())
      }
      // React frequently updates a computed label (e.g. a save button whose
      // text depends on active tab) by mutating an existing Text node's data
      // in place rather than replacing the node, which is neither an added
      // node nor an attribute change — only a characterData mutation.
      if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
        translateTextNode(mutation.target as Text, languageProvider())
      }
    }
  })
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRS],
    characterData: true,
  })
  return observer
}

function translateTextNodes(root: ParentNode, language: AppLanguage) {
  // Deliberately does not filter by "is the current text a catalog phrase":
  // once a node has been translated its current text is the *target*
  // language, not English, so that check would reject it on every later
  // pass (e.g. switching es -> fr, or a re-render that restores English).
  // translateTextNode decides translatability itself, from the tracked
  // original plus a fresh check when the underlying text has changed.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      // <option> is deliberately translatable: its visible text is display-only
      // (selection is driven by the `value` attribute, untouched here), and
      // dropdown labels like region/account-type options are common UI text.
      if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT
      }
      return (node.textContent || '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })

  let node = walker.nextNode()
  while (node) {
    translateTextNode(node as Text, language)
    node = walker.nextNode()
  }
}

function translateTextNode(node: Text, language: AppLanguage) {
  const currentText = node.textContent || ''
  const cached = originalTextNodes.get(node)
  // If the live text still matches what we last wrote, nothing external
  // touched this node since our last pass — keep translating from the
  // remembered original. Otherwise a re-render just replaced it with a
  // fresh English value (React always renders the literal source string),
  // so that fresh value becomes the new original.
  const original = cached && currentText === cached.lastOutput ? cached.original : normalizePhrase(currentText)

  if (!isCatalogPhrase(original)) {
    if (cached) originalTextNodes.delete(node)
    return
  }

  const translated = translatePhrase(original, language)
  const output = preserveEdgeWhitespace(currentText, translated)
  if (currentText !== output) {
    node.textContent = output
  }
  originalTextNodes.set(node, { original, lastOutput: output })
}

function translateAttributes(root: ParentNode, language: AppLanguage) {
  const elements = root instanceof Element ? [root, ...root.querySelectorAll('*')] : [...root.querySelectorAll('*')]
  for (const element of elements) {
    translateElementAttributes(element, language)
  }
}

function translateElementAttributes(element: Element, language: AppLanguage) {
  const stored = originalAttrs.get(element) || {}
  let changed = false
  for (const attr of TRANSLATABLE_ATTRS) {
    const current = element.getAttribute(attr)
    if (!current) {
      if (stored[attr]) {
        delete stored[attr]
        changed = true
      }
      continue
    }

    const cached = stored[attr]
    // Same reasoning as translateTextNode: only trust the cached original
    // while the live attribute still matches what we last wrote to it.
    const original = cached && current === cached.lastOutput ? cached.original : normalizePhrase(current)

    if (!isCatalogPhrase(original)) {
      if (cached) {
        delete stored[attr]
        changed = true
      }
      continue
    }

    const translated = translatePhrase(original, language)
    if (current !== translated) {
      element.setAttribute(attr, translated)
    }
    stored[attr] = { original, lastOutput: translated }
    changed = true
  }
  if (changed) {
    originalAttrs.set(element, stored)
  }
}

function isCatalogPhrase(value: string) {
  const normalized = normalizePhrase(value)
  return Object.prototype.hasOwnProperty.call(v3PhraseCatalog.en, normalized)
}

function normalizePhrase(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function preserveEdgeWhitespace(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] || ''
  const trailing = original.match(/\s*$/)?.[0] || ''
  return `${leading}${translated}${trailing}`
}
