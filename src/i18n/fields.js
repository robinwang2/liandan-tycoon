const display = new Set('name desc tagline sub short boss model style blurb title intro label hint text textBay descBay bay us ui anchor credit'.split(' '));
const dictionaries = new Set('MOD_NAME START_OFFICE KIND_NAME INVESTORS INVESTORS_EAST INVESTORS_PROGRESSIVE NAMES NEWS ACT_TEXT'.split(' '));
export function displayFields(book, data) {
  const rows = [];
  function visit(host, group, all = false) {
    for (const [key, value] of Object.entries(host)) {
      if (key === 'start' && value?.dirt?.name) rows.push([value.dirt, 'name', value.dirt.name]);
      if (['p', 'when', 'req', 'check', 'mods', 'attr', 'start'].includes(key)) continue;
      const visible = all || display.has(key) || key === 'role' && group === 'IDEO_CAST' || key === 'note' && (['MODS', 'OFFERS'].includes(group) || 'id' in host);
      if (typeof value === 'string') { if (visible && /\p{Script=Han}/u.test(value)) rows.push([host, key, value]); }
      else if (value && typeof value === 'object') visit(value, group, all || ['desc', 'name'].includes(key));
    }
  }
  for (const [group, values] of Object.entries(data)) {
    if (group.endsWith('_DOC') || ['SHEET', 'VER', 'FLOOR_PLANS', 'CAT_ART'].includes(group)) continue;
    visit(values, group, dictionaries.has(group) || book === 'events' && group === 'TEXT');
  }
  return rows;
}
