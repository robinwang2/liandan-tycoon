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
  ['art-furnace', 'Capture'],
  ['editor-parity', 'RunEditor'],
  ['build-probe', 'BuildIl2cppProbe'],
  ['setup-ui', 'SetupUi'],
  ['audio-render', 'RenderAll'],
  ['build-game', 'BuildGame'],
  ['build-game-il2cpp', 'BuildGameIl2cpp'],
]);
const [mode, input, ...extra] = process.argv.slice(2);
const checking = mode === 'editor-parity' || mode === 'run-probe';

function run() {
  const gamePath = folder => join(project, 'Build', folder, 'Liandan.exe');
  const testPlayer = process.env.LIANDAN_PLAYER ? resolve(process.env.LIANDAN_PLAYER) : gamePath('Game');
  function checkMix(shots) {
    const proc = spawnSync(process.execPath, [join(root,'tools/audio/check-output.mjs'),shots], {stdio:'inherit'});
    if (proc.error || proc.status!==0) throw proc.error || new Error('播放器混音验收失败：'+shots);
  }
  if (mode === 'audiotest') {
    if (!input || extra.length) throw new Error('用法：audiotest <全新或空截图目录>');
    if (!existsSync(testPlayer)) throw new Error('找不到播放器：'+testPlayer);
    const shots=resolve(input); mkdirSync(shots,{recursive:true});
    if (readdirSync(shots).length) throw new Error('验收目录必须为空');
    for (const [flag,filename,marker] of [
      ['-audiotest','player.log','Liandan audiotest OK:'],
      ['-audiotest-readback','readback.log','Liandan audio prefs OK:'],
    ]) {
      const log=join(shots,filename);
      const proc=spawnSync(testPlayer,[flag,'-shots',shots,'-logFile',log,'-screen-fullscreen','0'],
        {cwd:project,stdio:'inherit',timeout:10*60*1000});
      const text=existsSync(log)?readFileSync(log,'utf8'):'';
      if(proc.error || proc.status!==0 || !text.includes(marker) || (flag==='-audiotest' && !text.includes('Liandan audio coverage:')))
        throw proc.error || new Error('播放器验收失败：'+log);
      console.log(text.split(/\r?\n/).find(line=>line.startsWith(marker)));
    }
    checkMix(shots); return;
  }
  if (mode === 'autoplay') {
    const size = extra.length > 1 && ['1280x720', '1600x900'].includes(extra.at(-1)) ? extra.pop() : '1600x900';
    const [width, height] = size.split('x');
    const [shotsArg, months] = extra;
    if (!/^-?\d+$/.test(input || '') || Number(input) < -2147483648 || Number(input) > 2147483647 || !shotsArg || extra.length > 2 || (months !== undefined && (!/^\d+$/.test(months) || Number(months) < 1 || Number(months) > 2147483647)))
      throw new Error('用法：autoplay <整数种子> <全新或空截图目录> [月数] [1280x720|1600x900]');
    const shots = resolve(shotsArg), exe = testPlayer;
    if (!existsSync(exe)) throw new Error('请先 build-game：' + exe);
    mkdirSync(shots, { recursive: true });
    if (readdirSync(shots).length) throw new Error('截图目录必须为空，以免混入旧截图');
    const log = join(shots, 'player.log');
    const proc = spawnSync(exe, ['-autoplay', input, '-shots', shots, ...(months ? ['-months', months] : []), '-screen-width', width, '-screen-height', height, '-screen-fullscreen', '0', '-logFile', log], { cwd: project, stdio: 'inherit', timeout: 15 * 60 * 1000 });
    const images = readdirSync(shots).filter(name => name.endsWith('.png')).sort();
    for (const image of images) console.log(join(shots, image));
    const output = existsSync(log) ? readFileSync(log, 'utf8') : '';
    const failure = output.match(/^Liandan autoplay FAILED:.*$/m);
    if (failure) throw new Error(failure[0] + '\n' + log);
    const required = ['01-title','02-wizard','03-month-1','04-event','05-result','menu','settings','theme-default','theme-soviet','theme-rose','theme-cold','tutorial-tip','illustrated-event'];
    required.push(...['board','chain','team','safe','perks','fin','log'].map(key=>'side-'+key),
      ...['rd','team','cap','pr','ops','ideo'].map(key=>'action-'+key),'dialog-recruit','dialog-policy-work','employee-hover');
    if (!months) required.push('07-ending');
    if (proc.error || proc.status !== 0 || !output.includes('Liandan audio coverage:') || !output.includes('Liandan autoplay OK:') || required.some(name => !images.includes(name + '.png')))
      throw proc.error || new Error('试玩或截图未完成：' + log);
    for (const name of images) {
      const png = readFileSync(join(shots, name));
      const actual = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      if (actual !== size) throw new Error(`${name} 实际为 ${actual}，要求 ${size}`);
    }
    checkMix(shots); return;
  }
  if ((!methods.has(mode) && mode !== 'run-probe') || extra.length || (input && !checking))
    throw new Error('用法：compile | editor-parity [数学样本] | build-probe | run-probe [数学样本] | setup-ui | audio-render | art-furnace | build-game | build-game-il2cpp | audiotest <录音目录> | autoplay <种子> <截图目录> [月数] [1280x720|1600x900]');
  const exe = mode === 'run-probe' ? player : editor;
  if (!existsSync(exe)) throw new Error('找不到可执行文件：' + exe);
  mkdirSync(logs, { recursive: true });
  const log = join(logs, mode + '.log');
  const result = join(logs, mode === 'run-probe' ? 'parity-il2cpp.txt' : 'parity-editor.txt');
  const args = ['-batchmode', ...(mode === 'art-furnace' ? [] : ['-nographics']), '-logFile', log];
  if (methods.has(mode))
    args.push('-quit', '-projectPath', project, '-buildTarget', 'Win64', '-executeMethod', 'Liandan.EditorTools.' + (mode==='art-furnace'?'FurnaceShots.':mode==='audio-render'?'Audio.':mode.startsWith('build-game') || mode === 'setup-ui' ? 'Build.' : 'Parity.') + methods.get(mode));
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
      (mode === 'art-furnace' && (!contents.includes('Liandan furnace shots OK:') || ['original','tripo','tripo-close','tripo-front','tripo-back-high'].some(name=>!existsSync(join(project,'Build/art-furnace',name+'.png'))))) ||
      (checking && !report.trimEnd().endsWith('对拍通过')) ||
      (mode === 'setup-ui' && !contents.includes('Liandan UI setup OK')) ||
      (mode === 'audio-render' && !contents.includes('Liandan audio render OK')) ||
      (mode === 'compile' && !contents.includes('URP 设置完成')) ||
      (mode.startsWith('build-game') && (!contents.includes('Liandan build OK:') || !existsSync(gamePath(mode === 'build-game' ? 'Game' : 'GameIl2cpp')))) ||
      (mode === 'build-probe' && (!existsSync(player) || !contents.includes('IL2CPP 探针构建完成'))))
    throw new Error('执行失败（进程退出码 ' + proc.status + '），请查看 ' + log);
}

try { run(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
