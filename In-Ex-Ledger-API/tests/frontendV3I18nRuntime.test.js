const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend-v3", "src");
const i18nPath = path.join(frontendRoot, "lib", "i18n.ts");
const phraseCatalogPath = path.join(frontendRoot, "lib", "i18nPhrases.ts");

function read(relativePath) {
  return fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

function extractLanguageBlock(source, language) {
  const marker = `${language}: {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${language} translation block`);

  let depth = 0;
  let blockStart = -1;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
      if (blockStart === -1) blockStart = index;
    } else if (source[index] === "}") {
      depth -= 1;
      if (blockStart !== -1 && depth === 0) {
        return source.slice(blockStart, index + 1);
      }
    }
  }

  throw new Error(`could not parse ${language} translation block`);
}

function extractKeys(block) {
  return [...block.matchAll(/["']([^"']+)["']:\s*["']/g)].map((match) => match[1]).sort();
}

test("v3 i18n catalog ships identical key coverage for every supported language", () => {
  const source = fs.readFileSync(i18nPath, "utf8");
  const englishKeys = extractKeys(extractLanguageBlock(source, "en"));

  assert.ok(englishKeys.length > 0, "English catalog should define keys");
  for (const language of ["es", "fr"]) {
    assert.deepEqual(extractKeys(extractLanguageBlock(source, language)), englishKeys, `${language} keys must match English`);
  }
});

test("v3 i18n runtime is independent from the legacy data-i18n HTML pipeline", async () => {
  const source = fs.readFileSync(i18nPath, "utf8");
  const appSource = read("App.tsx");
  const translationHookSource = read(path.join("hooks", "useV3PhraseTranslations.ts"));
  const shellSource = read(path.join("components", "AppShell.tsx"));
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const runner = await import("../scripts/run-all-node-tests.mjs");

  assert.match(source, /export const translations/);
  assert.match(source, /import \{ v3PhraseCatalog \} from '\.\/i18nPhrases'/);
  assert.match(source, /export function translate/);
  assert.match(source, /export function translatePhrase/);
  assert.match(source, /export function applyV3PhraseTranslations/);
  assert.match(source, /export function observeV3PhraseTranslations/);
  assert.match(source, /export function normalizeLanguage/);
  assert.match(source, /export function setStoredLanguage/);
  assert.match(appSource, /setStoredLanguage\(nextLanguage\)/);
  assert.match(appSource, /useV3PhraseTranslations\(language, currentPage\)/);
  assert.doesNotMatch(appSource, /observeV3PhraseTranslations\(root/);
  assert.doesNotMatch(appSource, /applyV3PhraseTranslations\(root/);
  assert.match(translationHookSource, /observeV3PhraseTranslations\(root, \(\) => languageRef\.current\)/);
  assert.match(translationHookSource, /applyV3PhraseTranslations\(root, language\)/);
  assert.match(shellSource, /const t = \(key: TranslationKey\) => translate\(key, language\)/);
  assert.match(pkg.scripts["build:frontend-v3"], /build-v3-phrase-catalog\.mjs/);
  assert.ok(runner.listNodeTestFiles(repoRoot).includes("tests/frontendV3I18nRuntime.test.js"));
  assert.doesNotMatch(`${source}\n${appSource}\n${translationHookSource}\n${shellSource}`, /data-i18n/);
  assert.doesNotMatch(`${source}\n${appSource}\n${translationHookSource}\n${shellSource}`, /public\/js\/i18n/);
});

test("v3 phrase catalog is generated from current TSX visible copy", () => {
  const result = spawnSync(process.execPath, ["scripts/build-v3-phrase-catalog.mjs", "--check"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("v3 phrase catalog ships identical phrase coverage for every supported language", () => {
  const source = fs.readFileSync(phraseCatalogPath, "utf8");
  const englishKeys = extractKeys(extractLanguageBlock(source, '"en"'));

  assert.ok(englishKeys.length > 100, "v3 phrase catalog should include page-level copy");
  for (const language of ['"es"', '"fr"']) {
    assert.deepEqual(extractKeys(extractLanguageBlock(source, language)), englishKeys, `${language} phrase keys must match English`);
  }
});
