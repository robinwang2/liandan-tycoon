import { readFileSync, readdirSync } from 'node:fs';
import { parseAst } from 'vite';
import catalogs from '../../src/i18n/catalog.node.js';
import { english } from '../../src/i18n/index.js';
import { displayFields } from '../../src/i18n/fields.js';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const sources = new Map();
for (const book of ['text', 'events', 'actions', 'defs', 'chains', 'ideology_cn', 'ideology_us']) {
  sources.set(book, new Set(displayFields(book, JSON.parse(read(`src/data/tables/${book}.json`))).map(row => row[2])));
}
const ui = new Set();
const argumentPositions = new Map(Object.entries({ tr: [0], fill: [0], mark: [1, 2], textSign: [1] }));
function collectUI(node, file, visible = false) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Literal' && visible && typeof node.value === 'string' && /\p{Script=Han}/u.test(node.value)) ui.add(node.value);
  if (node.type === 'CallExpression') {
    collectUI(node.callee, file);
    const positions = argumentPositions.get(node.callee.name) || [];
    node.arguments.forEach((arg, index) => collectUI(arg, file, positions.includes(index)));
    return;
  }
  if (node.type === 'Property') {
    if (file === 'city.js' && ['signs', 'sz'].includes(node.key.name)) visible = true;
    if (file === 'stage.js' && ['name', 'desc'].includes(node.key.name)) visible = true;
  }
  if (file === 'stage.js' && node.type === 'VariableDeclarator' && node.id.name === 'name') visible = true;
  for (const child of Object.values(node)) collectUI(child, file, visible);
}
for (const dir of ['ui', 'scene3a', 'game', 'data']) {
  for (const file of readdirSync(new URL(`../../src/${dir}/`, import.meta.url)).filter(name => name.endsWith('.js'))) {
    const code = read(`src/${dir}/${file}`);
    collectUI(parseAst(code), file);
  }
}
sources.set('ui', ui);
const allSources = new Set([...sources.values()].flatMap(keys => [...keys]));
const tokens = value => JSON.stringify((value.match(/\{[^{}\s]+\}/g) || []).sort());
let done = 0, total = 0, errors = 0, warnings = 0;
for (const [book, keys] of sources) {
  let translated = 0;
  for (const key of keys) {
    const value = english[key];
    if (typeof value !== 'string' || !value.trim()) console.error(`${book}: missing ${JSON.stringify(key)}`);
    else { translated++; continue; }
    errors++;
  }
  total += keys.size; done += translated;
  console.log(`${book}: ${translated}/${keys.size} (${keys.size - translated} missing)`);
}
for (const [book, dict] of Object.entries(catalogs)) for (const [key, value] of Object.entries(dict)) {
  if (!allSources.has(key)) { warnings++; console.warn(`${book}: unused key: ${JSON.stringify(key)}`); }
  const reason = typeof value !== 'string' || !value.trim() ? 'empty' : tokens(key) !== tokens(value) ? 'placeholders' : key.split('\n').length !== value.split('\n').length ? 'line count' : /\p{Script=Han}/u.test(value.replace(/(\d|\})\s*[万亿]/g, '$1').replace(/\{[^{}\s]+\}/g, '')) ? 'residual Han' : null;
  if (reason) { errors++; console.error(`${book}: ${reason}: ${JSON.stringify(key)}`); }
  if (typeof value === 'string' && /[「」『』（），。：；！？、]/.test(value.replace(/\{[^{}\s]+\}/g, ''))) { warnings++; console.warn(`${book}: punctuation: ${JSON.stringify(key)}`); }
}
console.log(`Total ${done}/${total} (${(100 * done / total).toFixed(2)}%), ${errors} errors, ${warnings} warnings`);
process.exitCode = errors ? 1 : 0;
