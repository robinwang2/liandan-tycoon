import { onLanguage, tr, units } from './index.js';
import { displayFields } from './fields.js';

const originals = new WeakMap();
export const sourceField = (row, key) => originals.get(row)?.[key] ?? row[key];

export function localize(book, data, prepare) {
  const fields = displayFields(book, data);
  for (const [host, key, source] of fields) {
    if (!originals.has(host)) originals.set(host, Object.create(null));
    originals.get(host)[key] = source;
  }
  onLanguage(() => {
    for (const [host, key, source] of fields) host[key] = units(tr(source));
    prepare?.();
  });
}
