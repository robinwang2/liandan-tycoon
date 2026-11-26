import { TEXT } from './text.js';
import { sourceField } from '../i18n/tables.js';
import { tr } from '../i18n/index.js';

export const nameBits = { name: 1, coName: 2, modelName: 4 };
const lists = { name: 'ui.rand.name', coName: 'ui.rand.co', modelName: 'ui.rand.model' };
const defaults = { name: 'ui.wiz.default.name', coName: 'ui.wiz.default.co', modelName: 'default.model' };
export const defaultName = field => sourceField(TEXT[defaults[field]], 'text');
const pool = (field, region) => {
  const row = TEXT[lists[field]];
  return sourceField(row, region === 'bay' && row.bay != null ? 'bay' : 'text');
};
export const namePool = (field, region) => pool(field, region).split('\n');
export function displayName(field, value, region, autoNames) {
  if (!(autoNames & nameBits[field])) return value;
  const list = pool(field, region), index = list.split('\n').indexOf(value);
  return index < 0 ? tr(value) : tr(list).split('\n')[index];
}
export const playerName = (state, field) => displayName(field,
  field === 'name' ? state.founder.name : field === 'coName' ? state.co.name : state.co.modelName,
  state.co.region, state.flags?.autoNames);
export const playerModel = state => state.model && (state.flags?.autoNames & nameBits.modelName)
  ? `${playerName(state, 'modelName')}-${state.model.ver}` : state.model?.name || playerName(state, 'modelName');
