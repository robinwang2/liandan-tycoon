import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { displayFields } from '../../src/i18n/fields.js';
import { english, setLang, tr, units } from '../../src/i18n/index.js';

const source = new URL('../../src/data/tables/', import.meta.url);
function exportEnglish(directory) {
  setLang('en');
  const books = {}, history = new Set();
  function historical(value) {
    if (typeof value === 'string' && value.includes('{')) history.add(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(historical);
  }
  for (const book of ['text', 'events', 'actions', 'defs', 'chains', 'ideology_cn', 'ideology_us']) {
    const data = JSON.parse(readFileSync(new URL(book + '.json', source), 'utf8'));
    if (book === 'events') historical(data.NEWS);
    for (const [key, row] of Object.entries(data.TEXT || {}))
      if (key.includes('news') || /\.note|^ideo\.bars|^ideo\.yank\.month/.test(key)) historical(row);
    for (const [row, key, raw] of displayFields(book, data)) row[key] = units(tr(raw));
    books[book] = data;
  }
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'en.json');
  const output = JSON.stringify({ books, catalog: english, history: [...history] });
  if (!existsSync(file) || readFileSync(file, 'utf8') !== output) writeFileSync(file, output);
}

exportEnglish(resolve(process.argv[2] || 'unity/Game/Assets/StreamingAssets/i18n'));
