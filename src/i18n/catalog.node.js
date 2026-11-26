import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('./en/', import.meta.url);
export default Object.fromEntries(readdirSync(dir).filter(file => file.endsWith('.json')).sort().map(file =>
  [file.slice(0, -5), JSON.parse(readFileSync(new URL(file, dir), 'utf8'))]));
