const fs = require('fs');
let content = fs.readFileSync('c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/js/i18n.js', 'utf8');

function insertAfterKey(content, anchorKey, newLines, searchFrom) {
  const idx = content.indexOf(anchorKey, searchFrom || 0);
  if (idx < 0) return { content, found: false, anchorKey };
  let end = content.indexOf('\n', idx);
  if (end < 0) return { content, found: false, anchorKey };
  end++;
  return { content: content.slice(0, end) + newLines + content.slice(end), found: true };
}

// The file uses literal backslash + u2019 (a JS unicode escape in the source)
// fs.readFileSync returns these as the literal characters \ u 2 0 1 9
const BACKSLASH = '\\';

const enKey = "    settings_delete_business_error: 'Unable to delete business.',";
const enNew = "    settings_delete_biz_pricing_current: 'Current total',\r\n    settings_delete_biz_pricing_new: 'After deleting',\r\n";

const esKey = "    settings_delete_business_error: 'No se pudo eliminar el negocio.',";
const esNew = "    settings_delete_biz_pricing_current: 'Total actual',\r\n    settings_delete_biz_pricing_new: 'Despés de eliminar',\r\n";

// French: the file has l’entreprise as literal chars (backslash-u-2019)
const frKey = "    settings_delete_business_error: 'Impossible de supprimer l" + BACKSLASH + "u2019entreprise.',";
const frNew = "    settings_delete_biz_pricing_current: 'Total actuel',\r\n    settings_delete_biz_pricing_new: 'Après suppression',\r\n";

// Debug
const frIdx = content.indexOf(frKey, 250000);
console.log('FR key idx:', frIdx);
console.log('FR key value repr:', JSON.stringify(frKey.slice(frKey.indexOf('primer l') + 7, frKey.indexOf('primer l') + 25)));

let r;

r = insertAfterKey(content, enKey, enNew, 0);
if (!r.found) { console.log('EN not found'); process.exit(1); }
content = r.content;
console.log('EN OK');

r = insertAfterKey(content, esKey, esNew, 100000);
if (!r.found) { console.log('ES not found'); process.exit(1); }
content = r.content;
console.log('ES OK');

r = insertAfterKey(content, frKey, frNew, 250000);
if (!r.found) { console.log('FR not found at 250000, trying 0');
  r = insertAfterKey(content, frKey, frNew, 0);
}
if (!r.found) { console.log('FR not found anywhere'); process.exit(1); }
content = r.content;
console.log('FR OK');

fs.writeFileSync('c:/Projects/InEx-Ledger.2.0/In-Ex-Ledger-API/public/js/i18n.js', content, 'utf8');
console.log('Written OK');
