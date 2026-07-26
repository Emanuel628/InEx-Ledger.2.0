const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend-v3", "src");
const i18nPath = path.join(frontendRoot, "lib", "i18n.ts");

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
  return [...block.matchAll(/'([^']+)':\s*'/g)].map((match) => match[1]).sort();
}

test("v3 i18n catalog ships identical key coverage for every supported language", () => {
  const source = fs.readFileSync(i18nPath, "utf8");
  const englishKeys = extractKeys(extractLanguageBlock(source, "en"));

  assert.ok(englishKeys.length > 0, "English catalog should define keys");
  for (const language of ["es", "fr"]) {
    assert.deepEqual(extractKeys(extractLanguageBlock(source, language)), englishKeys, `${language} keys must match English`);
  }
});

test("v3 i18n runtime is independent from the legacy data-i18n HTML pipeline", () => {
  const source = fs.readFileSync(i18nPath, "utf8");
  const appSource = read("App.tsx");
  const shellSource = read(path.join("components", "AppShell.tsx"));

  assert.match(source, /export const translations/);
  assert.match(source, /export function translate/);
  assert.match(source, /export function normalizeLanguage/);
  assert.match(source, /export function setStoredLanguage/);
  assert.match(appSource, /setStoredLanguage\(nextLanguage\)/);
  assert.match(shellSource, /const t = \(key: TranslationKey\) => translate\(key, language\)/);
  assert.doesNotMatch(`${source}\n${appSource}\n${shellSource}`, /data-i18n/);
  assert.doesNotMatch(`${source}\n${appSource}\n${shellSource}`, /public\/js\/i18n/);
});
