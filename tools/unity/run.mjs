import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
  ['setup-ui', 'SetupUi'],
  ['build-game', 'BuildGame'],
  ['build-game-il2cpp', 'BuildGameIl2cpp'],
]);
const [mode, input, ...extra] = process.argv.slice(2);
const checking = mode === 'editor-parity' || mode === 'run-probe';

function run() {
  const gamePath = folder => join(project, 'Build', folder, 'Liandan.exe');
  if (mode === 'autoplay') {
    const [shotsArg, months] = extra;
    if (!/^-?\d+$/.test(input || '') || Number(input) < -2147483648 || Number(input) > 2147483647 || !shotsArg || extra.length > 2 || (months !== undefined && (!/^\d+$/.test(months) || Number(months) < 1 || Number(months) > 2147483647)))
      throw new Error('用法：autoplay <整数种子> <全新或空截图目录> [月数]');
    const shots = resolve(shotsArg), exe = gamePath('Game');
    if (!existsSync(exe)) throw new Error('请先 build-game：' + exe);
    mkdirSync(shots, { recursive: true });
    if (readdirSync(shots).length) throw new Error('截图目录必须为空，以免混入旧截图');
    const log = join(shots, 'player.log');
    const proc = spawnSync(exe, ['-autoplay', input, '-shots', shots, ...(months ? ['-months', months] : []), '-screen-width', '1600', '-screen-height', '900', '-screen-fullscreen', '0', '-logFile', log], { cwd: project, stdio: 'inherit', timeout: 15 * 60 * 1000 });
    const images = readdirSync(shots).filter(name => name.endsWith('.png')).sort();
    for (const image of images) console.log(join(shots, image));
    const output = existsSync(log) ? readFileSync(log, 'utf8') : '';
    const failure = output.match(/^Liandan autoplay FAILED:.*$/m);
    if (failure) throw new Error(failure[0] + '\n' + log);
    const required = ['01-title','02-wizard','03-month-1','04-event','05-result'];
    if (!months) required.push('07-ending');
    if (proc.error || proc.status !== 0 || !output.includes('Liandan autoplay OK:') || required.some(name => !images.includes(name + '.png')))
      throw proc.error || new Error('试玩或截图未完成：' + log);
    return;
  }
  if ((!methods.has(mode) && mode !== 'run-probe') || extra.length || (input && !checking))
    throw new Error('用法：compile | editor-parity [数学样本] | build-probe | run-probe [数学样本] | setup-ui | build-game | build-game-il2cpp | autoplay <种子> <截图目录> [月数]');
  const exe = mode === 'run-probe' ? player : editor;
  if (!existsSync(exe)) throw new Error('找不到可执行文件：' + exe);
  mkdirSync(logs, { recursive: true });
  const log = join(logs, mode + '.log');
  const result = join(logs, mode === 'run-probe' ? 'parity-il2cpp.txt' : 'parity-editor.txt');
  const args = ['-batchmode', '-nographics', '-logFile', log];
  if (methods.has(mode))
    args.push('-quit', '-projectPath', project, '-buildTarget', 'Win64', '-executeMethod', 'Liandan.EditorTools.' + (mode.startsWith('build-game') || mode === 'setup-ui' ? 'Build.' : 'Parity.') + methods.get(mode));
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
  const proc = spawnSync(exe, args, { cwd: project, stdio: 'inherit', windowsHide: true, env: { ...process.env, LIANDAN_REPO: root } });
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
      (mode === 'setup-ui' && !contents.includes('Liandan UI setup OK')) ||
      (mode === 'compile' && !contents.includes('URP 设置完成')) ||
      (mode.startsWith('build-game') && (!contents.includes('Liandan build OK:') || !existsSync(gamePath(mode === 'build-game' ? 'Game' : 'GameIl2cpp')))) ||
      (mode === 'build-probe' && (!existsSync(player) || !contents.includes('IL2CPP 探针构建完成'))))
    throw new Error('执行失败（进程退出码 ' + proc.status + '），请查看 ' + log);
}

try { run(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
