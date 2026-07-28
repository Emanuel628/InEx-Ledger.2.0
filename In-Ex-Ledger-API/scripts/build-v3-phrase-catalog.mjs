import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('../frontend-v3/node_modules/typescript')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(repoRoot, 'frontend-v3', 'src')
const outputPath = path.join(sourceRoot, 'lib', 'i18nPhrases.ts')
const checkOnly = process.argv.includes('--check')

const SKIP_DIRS = new Set(['node_modules', 'assets'])
const SKIP_FILES = new Set(['i18n.ts', 'i18nPhrases.ts'])
const STATIC_ATTRS = new Set(['aria-label', 'placeholder', 'title'])
const STRING_PROP_NAMES = new Set([
  'eyebrow',
  'title',
  'description',
  'label',
  'note',
  'placeholder',
  'searchPlaceholder',
  'message',
  'detail',
  'body',
  'text',
  'question',
  'answer',
  'action',
  'items',
  'features',
])
const USER_MESSAGE_CALLS = new Set([
  'Error',
  'setError',
  'setDataError',
  'setStatusMessage',
  'setUndoMessage',
  'alert',
  'confirm',
])

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(fullPath, files)
      continue
    }
    if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name) && !SKIP_FILES.has(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

function normalizePhrase(value) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

function isVisiblePhrase(value) {
  const normalized = normalizePhrase(value)
  if (!normalized || !/[A-Za-z]/.test(normalized)) return false
  if (normalized.length < 2) return false
  if (/^[A-Z]{2,5}$/.test(normalized)) return false
  if (/^[a-z0-9_.:/-]+$/.test(normalized) && !/\s/.test(normalized)) return false
  if (/^\/(?:api|app-v3|css|js)\//.test(normalized)) return false
  if (/^[.#][A-Za-z0-9_-]+$/.test(normalized)) return false
  return true
}

function addPhrase(phrases, value) {
  const phrase = normalizePhrase(value)
  if (isVisiblePhrase(phrase)) {
    phrases.add(phrase)
  }
}

function getJsxAttrName(nameNode) {
  if (ts.isIdentifier(nameNode)) return nameNode.text
  if (ts.isJsxNamespacedName(nameNode)) return `${nameNode.namespace.text}:${nameNode.name.text}`
  return ''
}

function stringFromExpression(expression) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }
  return ''
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return ''
}

function collectConditionalStrings(node, phrases) {
  for (const branch of [node.whenTrue, node.whenFalse]) {
    if (ts.isConditionalExpression(branch)) {
      collectConditionalStrings(branch, phrases)
    } else {
      addPhrase(phrases, stringFromExpression(branch))
    }
  }
}

function collectPhrases(file) {
  const source = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const phrases = new Set()

  function visit(node) {
    if (ts.isJsxText(node)) {
      addPhrase(phrases, node.getText(sourceFile).replace(/\{|\}/g, ''))
    }

    if (ts.isJsxAttribute(node)) {
      const attrName = getJsxAttrName(node.name)
      if (!node.initializer) return ts.forEachChild(node, visit)

      if (STATIC_ATTRS.has(attrName) && ts.isStringLiteral(node.initializer)) {
        addPhrase(phrases, node.initializer.text)
      }

      if (STRING_PROP_NAMES.has(attrName)) {
        if (ts.isStringLiteral(node.initializer)) {
          addPhrase(phrases, node.initializer.text)
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          // Covers both a braced string (`title={'...'}`) and a static array
          // of strings (`items={['Missing receipts', 'Cleanup marathons']}`),
          // the latter common for bullet lists passed as component props.
          const inner = node.initializer.expression
          if (ts.isArrayLiteralExpression(inner)) {
            for (const element of inner.elements) {
              addPhrase(phrases, stringFromExpression(element))
            }
          } else {
            addPhrase(phrases, stringFromExpression(inner))
          }
        }
      }
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = callName(node.expression)
      if (USER_MESSAGE_CALLS.has(name)) {
        for (const arg of node.arguments || []) {
          addPhrase(phrases, stringFromExpression(arg))
        }
      }
    }

    // Plain object-literal properties driving UI copy from a data array
    // (e.g. `{ label: 'Business', note: 'Identity and taxes' }` rendered via
    // `{note}`), not just JSX attributes of the same names.
    if (ts.isPropertyAssignment(node) && STRING_PROP_NAMES.has(getJsxAttrName(node.name))) {
      addPhrase(phrases, stringFromExpression(node.initializer))
    }

    // Computed UI labels are commonly a ternary (possibly chained) whose
    // leaf branches are plain strings, e.g. `saving ? 'Saving' : 'Save'`,
    // rendered directly as a JSX child or returned from a label helper.
    if (ts.isConditionalExpression(node)) {
      collectConditionalStrings(node, phrases)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return phrases
}

const phrases = [...new Set(walk(sourceRoot).flatMap((file) => [...collectPhrases(file)]))]
  .sort((left, right) => left.localeCompare(right))

function loadExistingCatalog() {
  if (!fs.existsSync(outputPath)) return { en: {}, es: {}, fr: {} }
  const source = fs.readFileSync(outputPath, 'utf8')
  const match = source.match(/export const v3PhraseCatalog = ([\s\S]*) as const/)
  if (!match) return { en: {}, es: {}, fr: {} }
  try {
    return JSON.parse(match[1])
  } catch {
    return { en: {}, es: {}, fr: {} }
  }
}

// Regenerating must not clobber reviewed human translations: carry forward any
// existing es/fr entry for a phrase that is still present, and only fall back
// to the English identity mapping for newly-added phrases.
const existingCatalog = loadExistingCatalog()

const header = `// Generated by scripts/build-v3-phrase-catalog.mjs.\n// English values are canonical phrase keys. Existing es/fr translations are\n// preserved across regeneration; only newly-added English phrases fall back\n// to English until translated (see scripts/build-v3-phrase-catalog.mjs).\n\n`
const catalog = {
  en: Object.fromEntries(phrases.map((phrase) => [phrase, phrase])),
  es: Object.fromEntries(phrases.map((phrase) => [phrase, existingCatalog.es?.[phrase] ?? phrase])),
  fr: Object.fromEntries(phrases.map((phrase) => [phrase, existingCatalog.fr?.[phrase] ?? phrase])),
}

const nextSource = `${header}export const v3PhraseCatalog = ${JSON.stringify(catalog, null, 2)} as const\n`

if (checkOnly) {
  const currentSource = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : ''
  if (currentSource !== nextSource) {
    console.error(`v3 phrase catalog is stale. Run: node scripts/build-v3-phrase-catalog.mjs`)
    process.exit(1)
  }
  console.log(`v3 phrase catalog is current (${phrases.length} phrases)`)
} else {
  fs.writeFileSync(outputPath, nextSource)
  console.log(`Wrote ${phrases.length} v3 phrases to ${path.relative(repoRoot, outputPath)}`)
}
