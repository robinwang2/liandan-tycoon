import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchConfig } from '../art/batch-options.mjs';
import { summarizeDraws } from './art-ab-summary.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const project = process.env.UNITY_PROJECT ? resolve(process.env.UNITY_PROJECT) : join(root, 'unity/Game');   // 工程被别的 Unity 锁住时可以指到一份副本
const logs = join(project, 'Logs');
const editor = process.env.UNITY_EXE || String.raw`D:\Unity edititor\6000.5.2f1\Editor\Unity.exe`;
const player = join(project, 'Build/ParityProbe/ParityProbe.exe');
const methods = new Map([
  ['compile', 'ConfigureUrp'],
  ['art-furnace', 'Capture'],
  ['office-shots', 'Capture'],
  ['art-repair', 'CaptureRepair'],
  ['build-game-art','BuildArtProbe'],
  ['editor-parity', 'RunEditor'],
  ['build-probe', 'BuildIl2cppProbe'],
  ['setup-ui', 'SetupUi'],
  ['audio-render', 'RenderAll'],
  ['build-game', 'BuildGame'],
  ['build-game-il2cpp', 'BuildGameIl2cpp'],
]);
const [mode, input, ...extra] = process.argv.slice(2);
const motionShots=mode==='office-shots' && input==='motion';
if(motionShots)methods.set(mode,'CaptureMotion');
const shotBatch = /^art-(batch[1-9]\d*)$/.exec(mode)?.[1];
const checking = mode === 'editor-parity' || mode === 'run-probe';

async function run() {
  const resource = shotBatch==='batch7'?'Batch7':shotBatch==='batch6'?'Batch6':shotBatch && batchConfig(shotBatch).resource;
  if (shotBatch) methods.set(mode, 'CaptureSelectedBatch');
  const gamePath = folder => join(project, 'Build', folder, 'Liandan.exe');
  const testPlayer = process.env.LIANDAN_PLAYER ? resolve(process.env.LIANDAN_PLAYER) : gamePath('Game');
  function checkMix(shots) {
    const proc = spawnSync(process.execPath, [join(root,'tools/audio/check-output.mjs'),shots], {stdio:'inherit'});
    if (proc.error || proc.status!==0) throw proc.error || new Error('播放器混音验收失败：'+shots);
  }
  if(mode==='art-batch1-ab' && !input){
    const dest=join(project,'Build/art-batch1'),exe=gamePath('ArtProbe');mkdirSync(dest,{recursive:true});
    if(!existsSync(exe))throw Error('请先运行 build-game-art：'+exe);
    const log=join(dest,'ab.log');
    for(const file of ['ab.log','draws.csv','structure-A.json','structure-B.json','office-A.png','office-B.png','ab-summary.txt'])rmSync(join(dest,file),{force:true});
    console.log('A/B 图形播放器（最多 180 秒），阶段日志：'+log);
    const result=spawnSync(exe,['-art-batch1-ab',dest,'-screen-fullscreen','0','-screen-width','1280','-screen-height','720','-logFile',log],{cwd:project,windowsHide:false,timeout:180000});
    const text=existsSync(log)?readFileSync(log,'utf8'):'';
    if(result.error || result.status!==0 || !text.includes('Liandan batch1 A/B OK:')){
      const stage=text.split(/\r?\n/).filter(line=>/^Liandan A\/B(?: FAILED)?:/.test(line)).at(-1)??'未进入探针';
      const diagnostic=`A/B ${result.error?.code==='ETIMEDOUT'?'超时（180 秒）':result.error?.message??'退出码 '+result.status}；${stage}`;
      appendFileSync(log,'\nRunner: '+diagnostic+'\n');throw Error(`${diagnostic}；详见 ${log}`);
    }
    for(const mode of ['A','B']){
      const image=readFileSync(join(dest,`office-${mode}.png`));
      if(image.length<24 || image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' || image.readUInt32BE(16)!==1280 || image.readUInt32BE(20)!==720)throw Error(`office-${mode}.png 不是有效的 1280×720 截图`);
    }
    const summary=summarizeDraws(readFileSync(join(dest,'draws.csv'),'utf8'),['A','B'].map(mode=>JSON.parse(readFileSync(join(dest,`structure-${mode}.json`),'utf8').replace(/^\uFEFF/,'')))).join('\n');
    writeFileSync(join(dest,'ab-summary.txt'),summary+'\n');console.log(summary+'\n绘制次数与截图：'+dest);return;
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
    const size = extra.length > 1 && ['1280x720', '1600x900', '1920x1080'].includes(extra.at(-1)) ? extra.pop() : '1600x900';
    const [width, height] = size.split('x');
    const [shotsArg, months] = extra;
    if (!/^-?\d+$/.test(input || '') || Number(input) < -2147483648 || Number(input) > 2147483647 || !shotsArg || extra.length > 2 || (months !== undefined && (!/^\d+$/.test(months) || Number(months) < 1 || Number(months) > 2147483647)))
      throw new Error('用法：autoplay <整数种子> <全新或空截图目录> [月数] [1280x720|1600x900|1920x1080]');
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
    for (const kind of ['burn','frost','bloom']) {
      required.push(...[1,2,3].map(index=>`theme-fx-${kind}-${index}`));
      if (!new RegExp(`^Liandan theme fx ${kind}: worst frame [0-9]+\\.[0-9] ms over [1-9][0-9]* frames`, 'm').test(output))
        throw new Error(`缺少 ${kind} 实播帧耗时记录：${log}`);
    }
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
  if ((!methods.has(mode) && mode !== 'run-probe') || extra.length || (input && !checking && !motionShots))
    throw new Error('用法：compile | editor-parity [数学样本] | build-probe | run-probe [数学样本] | setup-ui | office-shots | audio-render | art-furnace | art-batchN | art-repair | build-game | build-game-il2cpp | audiotest <录音目录> | autoplay <种子> <截图目录> [月数] [1280x720|1600x900|1920x1080]');
  const exe = mode === 'run-probe' ? player : editor;
  if (!existsSync(exe)) throw new Error('找不到可执行文件：' + exe);
  if (mode==='office-shots' || mode==='setup-ui' || mode==='build-game' || mode==='build-game-il2cpp') {
    const exportRun=spawnSync(process.execPath,[join(root,'tools/unity/export-office.mjs'),project],{stdio:'inherit'});
    if(exportRun.error || exportRun.status!==0)throw exportRun.error || new Error('办公室导出失败');
  }
  mkdirSync(logs, { recursive: true });
  const log = join(logs, mode + '.log');
  const result = join(logs, mode === 'run-probe' ? 'parity-il2cpp.txt' : 'parity-editor.txt');
  const args = ['-batchmode', ...(mode.startsWith('art-') || mode==='office-shots' ? [] : ['-nographics']), '-logFile', log];
  if(shotBatch || mode==='art-repair') { const dest=join(project,'Assets/StreamingAssets/tables');mkdirSync(dest,{recursive:true});copyFileSync(join(root,'src/data/tables/art.json'),join(dest,'art.json')); }
  if (methods.has(mode))
    args.push('-quit', '-projectPath', project, '-buildTarget', 'Win64', '-executeMethod', 'Liandan.EditorTools.' + (mode==='office-shots'?'OfficeShots.':shotBatch||mode==='art-repair'?'PropShots.':mode==='art-furnace'?'FurnaceShots.':mode==='audio-render'?'Audio.':mode.startsWith('build-game') || mode === 'setup-ui' ? 'Build.' : 'Parity.') + methods.get(mode));
  if (shotBatch) args.push('-artSelection', resource);
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
  if(shotBatch)for(const line of contents.split(/\r?\n/).filter(line=>line.startsWith('Liandan '+shotBatch+' shots:') || line.startsWith('Liandan '+shotBatch+' FAIL:')))console.log(line);
  const errors = contents.split(/\r?\n/).filter(line => /\berror (?:CS|BC|IL)\d+|compilation failed|executeMethod.*(?:exception|failed)|unable to resolve packages/i.test(line));
  if (errors.length) console.error([...new Set(errors)].join('\n'));
  let report = '';
  if (checking && existsSync(result)) {
    report = readFileSync(result, 'utf8');
    console.log(result + '\n' + report);
  }
  if (proc.status !== 0 || errors.length || !contents ||
      (mode==='office-shots' && !contents.includes(motionShots?'Liandan office motion OK:':'Liandan office shots OK:')) ||
      (shotBatch && !contents.includes('Liandan '+shotBatch+' shots OK:')) ||
      (mode==='art-repair' && !contents.includes('Liandan repair shots OK:')) ||
      (mode === 'art-furnace' && (!contents.includes('Liandan furnace shots OK:') || ['original','tripo','tripo-close','tripo-front','tripo-back-high'].some(name=>!existsSync(join(project,'Build/art-furnace',name+'.png'))))) ||
      (checking && !report.trimEnd().endsWith('对拍通过')) ||
      (mode === 'setup-ui' && !contents.includes('Liandan UI setup OK')) ||
      (mode === 'audio-render' && !contents.includes('Liandan audio render OK')) ||
      (mode === 'compile' && !contents.includes('URP 设置完成')) ||
      (mode.startsWith('build-game') && (!contents.includes('Liandan build OK:') || !existsSync(gamePath(mode === 'build-game' ? 'Game' : mode==='build-game-art'?'ArtProbe':'GameIl2cpp')))) ||
      (mode === 'build-probe' && (!existsSync(player) || !contents.includes('IL2CPP 探针构建完成'))))
    throw new Error('执行失败（进程退出码 ' + proc.status + '），请查看 ' + log);
  if(motionShots){
    const {default:sharp}=await import('sharp');
    const folder=join(project,'Build/office-shots/motion');
    for(const scene of ['typing','arrival','furnace','delivery','street','signal','lift','fan']){
      let previous,changedPairs=0;
      for(let frame=0;frame<4;frame++){
        const {data,info}=await sharp(join(folder,`${scene}-${frame}.png`)).removeAlpha().raw().toBuffer({resolveWithObject:true});
        if(info.width!==1280 || info.height!==720 || info.channels!==3)throw Error('办公室动效截图尺寸错误：'+scene);
        if(previous){
          let pixels=0;
          for(let p=0;p<data.length;p+=3){
            if((Math.abs(data[p]-previous[p])>8 || Math.abs(data[p+1]-previous[p+1])>8 ||
                Math.abs(data[p+2]-previous[p+2])>8) && ++pixels>=32)break;
          }
          if(pixels>=32)changedPairs++;
        }
        previous=data;
      }
      if(changedPairs<(scene==='signal'?1:2))throw Error(scene+' 固定镜头只有 '+changedPairs+' 组相邻帧发生可见变化');
      console.log(scene+' 可见变化 '+changedPairs+'/3');
    }
    console.log('办公室动效截图：'+folder);
  }else if(mode==='office-shots'){
    const folder=join(project,'Build/office-shots');
    for(const region of ['sz','bay'])for(let level=1;level<=8;level++){
      const name=region+'-'+level+'.png', png=readFileSync(join(folder,name));
      if(png.length<24 || png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' ||
          png.readUInt32BE(16)!==1280 || png.readUInt32BE(20)!==720)throw Error('办公室截图损坏：'+name);
    }
    console.log(contents.split(/\r?\n/).find(line=>line.startsWith('Liandan office shots OK:')));
  }
  if(shotBatch==='batch6') {
    const {default:sharp}=await import('sharp');
    const folder=join(project,'Build/art-batch6');
    const {props}=JSON.parse(readFileSync(join(project,'Assets/Shell/Resources/PropPolicyBatch6.json'),'utf8'));
    const tiles=await Promise.all(props.map(async ({id},index)=>({input:await sharp(join(folder,id+'.png')).resize(320,240,{fit:'contain'}).png().toBuffer(),left:index%4*320,top:Math.floor(index/4)*240})));
    await sharp({create:{width:1280,height:720,channels:3,background:'#f2f2f2'}}).composite(tiles).jpeg({quality:90}).toFile(join(folder,'contact.jpg'));
  }
  if(shotBatch==='batch7') {
    const {default:sharp}=await import('sharp');
    const folder=join(project,'Build/art-batch7');
    await sharp(join(folder,'comparison.png')).jpeg({quality:92}).toFile(join(folder,'contact.jpg'));
  }
}

try { await run(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
