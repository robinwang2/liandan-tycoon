import assert from 'node:assert/strict';

const special = { undefined, NaN, Infinity, '-Infinity': -Infinity, '-0': -0 };

export function restore(value) {
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, '$js')) {
      assert.ok(Object.keys(value).length === 1 && Object.hasOwn(special, value.$js));
      return special[value.$js];
    }
    for (const key of Object.keys(value)) value[key] = restore(value[key]);
  }
  return value;
}

export function snapshot(state) {
  const json = JSON.stringify(state, (key, value) => {
    if (value === undefined || typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
      return { $js: Object.is(value, -0) ? '-0' : String(value) };
    }
    if (value && typeof value === 'object' && Object.hasOwn(value, '$js')) throw Error(`保留键冲突：${key}`);
    return value;
  });
  assert.deepStrictEqual(restore(JSON.parse(json)), state);
  return json;
}
