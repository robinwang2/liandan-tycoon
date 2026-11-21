import fs from 'node:fs';

const path = process.argv[2];
const rounds = Number(process.argv[3] ?? 50000);
let seed = Number(process.argv[4] ?? 0xc001d00d);
if (!path || process.argv.length > 5 || !Number.isSafeInteger(rounds) || rounds < 1 ||
    !Number.isInteger(seed) || seed < 1 || seed > 0xffffffff)
  throw new Error('用法：node --allow-natives-syntax tools/verify/math-bits.mjs <输出文件> [随机轮数] [非零 uint32 种子]');
const { P: rules } = JSON.parse(fs.readFileSync(new URL('../../src/data/tables/params.json', import.meta.url)));
console.log(process.version, process.versions.v8, `随机轮数 ${rounds}，种子 0x${seed.toString(16)}`);
// 固定两个字面量调用点的优化层级。带负载 NaN 在乘法/平方根指令和动态 pow 中的结果不同。
function square(x) { return x ** 2; }
function halfPower(x) { return x ** 0.5; }
for (const fn of [square, halfPower]) {
  %PrepareFunctionForOptimization(fn);
  fn(1.25);
  fn(1.5);
  %OptimizeFunctionOnNextCall(fn);
  fn(1.75);
}
const fd = fs.openSync(path, 'w');
const block = Buffer.alloc(80 * 2048);
let offset = 0, count = 0;
function flush() {
  fs.writeFileSync(fd, block.subarray(0, offset));
  offset = 0;
}
function writeLiteralPowers(x) {
  block.writeDoubleLE(square(x), offset + 64);
  block.writeDoubleLE(halfPower(x), offset + 72);
}
// 保留已优化的字面量调用点，避免外层分层编译时重新内联。
%NeverOptimizeFunction(writeLiteralPowers);

function record(x, y, pow = Math.pow(x, y), operator = x ** y) {
  block.writeDoubleLE(x, offset);
  block.writeDoubleLE(y, offset + 8);
  block.writeDoubleLE(pow, offset + 16);
  block.writeDoubleLE(operator, offset + 24);
  block.writeDoubleLE(Math.log(x), offset + 32);
  block.writeDoubleLE(Math.log2(x), offset + 40);
  block.writeDoubleLE(Math.log10(x), offset + 48);
  block.writeDoubleLE(Math.exp(x), offset + 56);
  writeLiteralPowers(x);
  offset += 80;
  if (offset === block.length) flush();
  count++;
}


function word() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}
const unit = () => word() / 2 ** 32;
const scratch = Buffer.alloc(8);
function raw() {
  scratch.writeUInt32LE(word());
  scratch.writeUInt32LE(word(), 4);
  return scratch.readDoubleLE();
}
function neighbors(x) {
  scratch.writeDoubleLE(x);
  const bits = scratch.readBigUInt64LE();
  return [-1n, 0n, 1n].map(d => {
    scratch.writeBigUInt64LE(BigInt.asUintN(64, bits + d));
    return scratch.readDoubleLE();
  });
}
try {
  fs.writeFileSync(fd, 'JSMATH02');
  const edges = [0, -0, Infinity, -Infinity, NaN, Number.MIN_VALUE, -Number.MIN_VALUE,
    ...[2 ** -1022, 0.5, 1, 2, 3, -1, -2, 2 ** 52, 2 ** 53, Number.MAX_VALUE,
      709.782712893384, -745.1332191019411, -1075, -1022, 1024].flatMap(neighbors)];
  for (const x of edges) for (const y of edges) record(x, y);
  // 显式写入带符号和负载的 NaN，防止用 JSON 中转时丢掉这些位。
  for (const bits of [0x7ff0000000000023n, 0xfff0000000000023n, 0x7ff8000000000042n, 0xfff8000000000042n]) {
    scratch.writeBigUInt64LE(bits);
    const nan = scratch.readDoubleLE();
    for (const y of edges) {
      record(nan, y);
      record(y, nan);
    }
  }
  // 同时走动态指数、字面量指数和两边都是常量的调用点。
  record(2, 9.973200356415402);
  record(2, 9.973200356415402, Math.pow(2, 9.973200356415402), 2 ** 9.973200356415402);
  record(2, 32, Math.pow(2, 32), 2 ** 32);
  for (const base of [0.5, 1, 2, 3, -2, 0, -0, Infinity, -Infinity])
    for (const exponent of [0.5, 2, 3, -1, 1]) record(base, exponent);
  // 覆盖整个二进制指数范围，以及溢出、次正规数舍入边界两侧。
  for (let exponent = -1074; exponent <= 1023; exponent++) {
    for (const x of neighbors(2 ** exponent)) record(x, 1.25);
    for (const y of neighbors(exponent + 0.5)) record(2, y);
  }
  for (let month = 0; month <= 240; month++) {
    for (const key of ['gpu.quotaGrowth', 'market.growth', 'rev.apiGrowth', 'ideo.lean.decay'])
      record(rules[key], month);
    record(rules['rival.frontierGrowth'], (month - 1) / 12);
  }
  for (let i = 0; i < rounds; i++) {
    record(raw(), raw());
    record(raw(), unit() * 4 - 2);
    record(unit() * 1500 - 750, (word() % 201) - 100);
    record(0.25 + unit() * 5, rules[['users.growModExp', 'rev.payModExp', 'rev.modExp', 'model.resModExp'][i % 4]]);
    const x = unit() * 20 - 10;
    record(x, 0.5, Math.pow(x, 0.5), x ** 0.5);
    record(x, 2, Math.pow(x, 2), x ** 2);
    record(x, 3, Math.pow(x, 3), x ** 3);
    const energy = unit() * 1e6;
    record(1 + energy / rules['model.capE0'], 1);
    record(2, unit() * 100 / rules['model.capK']);
    record(1 + Math.floor(unit() * 1e8), -1);
    record(2, unit() * 2150 - 1100);
    record(1 + (unit() - 0.5) * 1e-8, (unit() - 0.5) * 2 ** 42);
  }
  flush();
  console.log(`已写入 ${count} 组输入`);
} finally {
  fs.closeSync(fd);
}
