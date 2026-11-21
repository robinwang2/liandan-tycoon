import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = process.env.UNITY_PROJECT ? resolve(process.env.UNITY_PROJECT) : join(root, 'unity/Game');   // 工程被别的 Unity 锁住时可以指到一份副本
const logs = join(project, 'Logs');
const editor = process.env.UNITY_EXE || String.raw`D:\Unity edititor\6000.5.2f1\Editor\Unity.exe`;
const player = join(project, 'Build/ParityProbe/ParityProbe.exe');
const methods = new Map([
  ['compile', 'ConfigureUrp'],
  ['editor-parity', 'RunEditor'],
  ['build-probe', 'BuildIl2cppProbe'],
]);
const [mode, input, ...extra] = process.argv.slice(2);
const checking = mode === 'editor-parity' || mode === 'run-probe';

function run() {
  if ((!methods.has(mode) && mode !== 'run-probe') || extra.length || (input && !checking))
    throw new Error('用法：node tools/unity/run.mjs compile | editor-parity [数学样本] | build-probe | run-probe [数学样本]');
  const exe = mode === 'run-probe' ? player : editor;
  if (!existsSync(exe)) throw new Error('找不到可执行文件：' + exe);
  mkdirSync(logs, { recursive: true });
  const log = join(logs, mode + '.log');
  const result = join(logs, mode === 'run-probe' ? 'parity-il2cpp.txt' : 'parity-editor.txt');
  const args = ['-batchmode', '-nographics', '-logFile', log];
  if (methods.has(mode))
    args.push('-quit', '-projectPath', project, '-buildTarget', 'Win64', '-executeMethod', 'Liandan.EditorTools.Parity.' + methods.get(mode));
  if (checking) {
    const bits = input ? resolve(input) : join(logs, 'math-bits.bin');
    if (!input && (mode === 'editor-parity' || !existsSync(bits))) {
      const gen = spawnSync(process.execPath, ['--allow-natives-syntax', 'tools/verify/math-bits.mjs', bits],
        { cwd: root, stdio: 'inherit' });
      if (gen.error || gen.status !== 0) throw gen.error || new Error('生成数学样本失败');
    }
    if (!existsSync(bits)) throw new Error('找不到数学样本：' + bits);
    args.push('-repoRoot', root.replace(/[\\/]$/, ''), '-mathBits', bits, '-resultFile', result);
    rmSync(result, { force: true });
  }
  rmSync(log, { force: true });
  console.log('日志 ' + log);
  const proc = spawnSync(exe, args, { cwd: project, stdio: 'inherit', windowsHide: true });
  if (proc.error) throw proc.error;
  const contents = existsSync(log) ? readFileSync(log, 'utf8') : '';
  const errors = contents.split(/\r?\n/).filter(line => /\berror (?:CS|BC|IL)\d+|compilation failed|executeMethod.*(?:exception|failed)|unable to resolve packages/i.test(line));
  if (errors.length) console.error([...new Set(errors)].join('\n'));
  let report = '';
  if (checking && existsSync(result)) {
    report = readFileSync(result, 'utf8');
    console.log(result + '\n' + report);
  }
  if (proc.status !== 0 || errors.length || !contents ||
      (checking && !report.trimEnd().endsWith('对拍通过')) ||
      (mode === 'compile' && !contents.includes('URP 设置完成')) ||
      (mode === 'build-probe' && (!existsSync(player) || !contents.includes('IL2CPP 探针构建完成'))))
    throw new Error('执行失败（进程退出码 ' + proc.status + '），请查看 ' + log);
}

try { run(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
