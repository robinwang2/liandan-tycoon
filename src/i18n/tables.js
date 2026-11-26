import { onLanguage, tr, units } from './index.js';
import { displayFields } from './fields.js';

export function localize(book, data, prepare) {
  const fields = displayFields(book, data);
  onLanguage(() => {
    for (const [host, key, source] of fields) host[key] = units(tr(source));
    prepare?.();
  });
}
