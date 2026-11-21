import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const table=JSON.parse(readFileSync(new URL('../../src/data/tables/audio.json',import.meta.url)));
const catalog={sfx:table.SFX.map(row=>row.id),mood:Object.keys(table.MOODS),scene:['title','play','end'],
  region:['bay','sz'],flavor:['default','soviet','rose','cold'],crisis:['0','1','2'],layer:['city','office','fire','fan','rain','insects','alert']};

function check(dir, allowFixture) {
  const meta=JSON.parse(readFileSync(join(dir,'mix.json'))), wav=readFileSync(join(dir,'mix.wav'));
  const {rate,frames,events,coverage,blends,mode,source}=meta;
  const test=mode==='audiotest';
  if(!["audiotest","autoplay"].includes(mode) || !['pcm-callback','software-clock',...(allowFixture?['cli-fixture']:[])].includes(source))throw Error('无法识别播放器录音来源');
  if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,16)!=='WAVEfmt '||wav.readUInt32LE(16)!==16||wav.readUInt16LE(20)!==3||wav.readUInt16LE(22)!==2||wav.readUInt32LE(24)!==rate||wav.readUInt16LE(34)!==32||wav.toString('ascii',36,40)!=='data'||wav.readUInt32LE(40)!==frames*8||wav.readUInt32LE(4)!==wav.length-8||wav.length!==44+frames*8||rate<8000)throw Error('浮点双声道 WAV 与采样时间线不一致');
  if(frames!==(test?meta.elapsedFrames:Math.min(meta.elapsedFrames,rate*60)) || frames<rate/4 || meta.overflow)throw Error('录音中断、溢出或长度不符');
  const pcm=new Float32Array(wav.buffer,wav.byteOffset+44,frames*2);
  const issues=[];
  function expect(ok,message){if(!ok)issues.push(message);}
  function rms(start,end){let sum=0; const a=Math.max(0,Math.round(start)),b=Math.min(frames,Math.round(end));
    for(let i=a*2;i<b*2;i++)sum+=pcm[i]**2;
    return b>a?Math.sqrt(sum/(2*(b-a))):NaN;
  }
  let peak=0,clips=0; const energy=[0,0];
  const bin=Math.max(1,Math.round(rate*.005)), length=Math.ceil(frames/bin);
  const power=[new Float64Array(length),new Float64Array(length)];
  for(let f=0;f<frames;f++)for(let c=0;c<2;c++){
    const v=pcm[f*2+c]; if(!Number.isFinite(v))throw Error(`第 ${f} 帧有非有限样本`);
    peak=Math.max(peak,Math.abs(v)); if(Math.abs(v)>=1)clips++; energy[c]+=v*v;
    if(f>0)power[c][Math.floor(f/bin)]+=(v-pcm[(f-1)*2+c])**2;
  }
  const channelRms=energy.map(x=>Math.sqrt(x/frames));
  expect(channelRms.every(x=>x>1e-5),'有声段缺失或单声道静音'); expect(clips===0,'存在满刻度样本');
  console.log(`${dir}  ${mode} / ${source}  ${(frames/rate).toFixed(2)} 秒  峰值 ${peak.toFixed(5)}  左右 RMS ${channelRms.map(x=>x.toFixed(6))}  削波 ${clips}/${pcm.length} (${(100*clips/pcm.length).toFixed(7)}%)`);
  for(const [kind,list] of Object.entries(catalog)){
    const got=coverage[kind]; if(!Array.isArray(got))throw Error('缺少覆盖字段 '+kind);
    const missing=list.filter(x=>!got.includes(x));
    console.log(`  ${kind} ${got.length}/${list.length}  未触发 ${missing.join(', ')||'无'}`);
    expect(!got.some(x=>!list.includes(x)) && (got.length>0 || !test && !['sfx','mood'].includes(kind)),'覆盖记录异常 '+kind);
    if(test)expect(missing.length===0,'巡检覆盖不全 '+kind);
  }
  const sorted=events.filter(([f])=>f>=0&&f<frames).sort((a,b)=>a[0]-b[0]);
  const byKind=k=>sorted.filter(e=>e[1]===k), steps=byKind('step'), transitions=byKind('transition');
  const onsets=byKind('sfx').map(e=>e[0]+Math.round(.006*rate));
  const edges=sorted.filter(e=>['transition','bar','loop'].includes(e[1]));
  // 对每个声道独立找跳变，以两侧 5 ms 的差分底噪为参照，另设绝对满刻度上限。
  let hits=0, onset=0, ignored=0; const examples=[];
  for(let f=1;f<frames;f++){
    while(onset<onsets.length && onsets[onset]<f-rate*.004)onset++;
    const atAttack=onset<onsets.length && onsets[onset]<=f+rate*.002;
    for(let c=0;c<2;c++){
      const diff=Math.abs(pcm[f*2+c]-pcm[(f-1)*2+c]); if(diff<.035)continue;
      const k=Math.floor(f/bin), local=Math.sqrt(((power[c][Math.max(0,k-1)]+power[c][Math.min(k+1,length-1)])/(2*bin)));
      if(diff<.25 && diff<12*local)continue;
      if(atAttack){ignored++;continue;}
      hits++;
      if(examples.length<8){const edge=edges.find(e=>Math.abs(e[0]-f)<rate*.05); examples.push(`${(f/rate).toFixed(4)}s/${c?'R':'L'} Δ${diff.toFixed(3)}${edge?' '+edge[1]+' '+edge[2]:''}`);}
    }
  }
  console.log(`  异常跳变 ${hits}，起音窗内 ${ignored}，标记的小节 ${byKind('bar').length}、循环 ${byKind('loop').length}、换曲 ${transitions.length}`);
  expect(!hits,'异常跳变 '+examples.join('，'));
  if(test){
    const keys=['master','music','sfx','amb','mute'];
    const names=[...catalog.sfx.map(id=>'sfx/'+id),...catalog.mood.map(id=>'music/'+id),...catalog.layer.map(id=>'layer/'+id),...keys.flatMap(k=>['before','zero','restore'].map(p=>`volume/${k}/${p}`))];
    if(JSON.stringify(steps.map(e=>e[2]))!==JSON.stringify(names))throw Error('巡检分段不全或顺序错误');
    for(let i=0;i<steps.length;i++){
      const [f,,name]=steps[i], end=steps[i+1]?.[0]??frames;
      const [kind,id]=name.split('/');
      const seconds={sfx:2.35,music:5.2,layer:3.2,volume:3.3}[kind];
      expect(end-f>=Math.floor(seconds*rate)-1,'录音片段截短 '+name);
      if(kind==='sfx'||kind==='music')expect(byKind(kind==='music'?'mood':'sfx').some(e=>e[0]>=f&&e[0]<end&&e[2]===id) && rms(f,end)>1e-5,'缺少实际声部或录音无声 '+name);
      if(kind==='layer')expect(byKind('layer').some(e=>e[0]>=f&&e[0]<end&&e[2]===id) && rms(f+rate,end)>1e-5,'缺少环境层实测信号 '+id);
    }
    for(const flavor of catalog.flavor)expect(byKind('musicFlavor').some(e=>e[2]===flavor),'缺少已发声的配乐风味 '+flavor);
    for(const key of keys){
      const values=['before','zero','restore'].map(phase=>{
        const f=steps.find(e=>e[2]===`volume/${key}/${phase}`)[0]; return rms(f+1.8*rate,f+3.2*rate);
      });
      const [before,zero,after]=values; console.log(`  ${key} 单路 RMS（开启 / 归零 / 恢复） ${values.map(n=>n.toExponential(3)).join(' / ')}`);
      expect(Math.min(before,after)>1e-4 && zero<1e-5 && zero<.001*Math.min(before,after),'音量归零或恢复失败 '+key);
    }
  }
  let verified=0, partial=0, previousChange=-Infinity;
  for(const [at,,pair] of transitions){
    // 压缩器有 6 ms 前视延时。比较边界两侧 20 ms RMS，并检查整个交叠期间的掉音。
    const center=at+.006*rate, w=.020*rate, a=rms(center-w,center), b=rms(center,center+w);
    if(center+w<=frames && center>w)expect(Math.abs(a-b)<.018+.8*Math.max(a,b),'换曲边界 RMS 突变 '+pair);
    // 试玩允许连续换页打断淡化，或者在 60 秒录音边界截断。只检验完整且已稳定的换曲。
    const interrupted=transitions.filter(e=>e[0]>=at && e[0]<at+rate*2.6).length>1;
    const settled=at-previousChange>=rate*2.6 && at>=rate*2.6; previousChange=at;
    if(!test && (!settled || interrupted || at+rate*2.6>frames)){partial++;continue;}
    const rows=blends.filter(e=>e[0]>at&&e[0]<=at+rate*2.6);
    const overlap=rows.filter(([,old,next])=>old>1e-5&&next>1e-5);
    const shape=rows.every(([f,old,next,outGain,inGain])=>{
      const t=(f-at)/(rate*2.6);
      return (old<1e-5 || Math.abs(outGain-(1-t))<.023) && (next<1e-5 || Math.abs(inGain-t)<.023);
    });
    const live=overlap.every(([f])=>rms(f-w+.006*rate,f+.006*rate)>1e-6);
    if(!test && !rows.some(e=>e[1]>1e-5)){partial++;continue;}
    const ok=rows.length>=125 && overlap.length>=5 && shape && (!test || live);
    if(ok)verified++; expect(ok,`换曲交叠失败 ${pair}（${overlap.length} 个双声部窗口）`);
  }
  if(test){const wanted=catalog.mood.slice(1).map((id,i)=>catalog.mood[i]+'>'+id);
    expect(wanted.every(pair=>transitions.some(e=>e[2]===pair)) && verified>=wanted.length,'七种情绪之间的六次交叉淡化缺少实测证据');
    console.log(`  已验证交叉淡化 ${verified} 次`);
  }
  if(!test)console.log(`  完整交叉淡化 ${verified} 次；中断、截短或无旧声部 ${partial} 次`);
  if(issues.length)throw Error(issues.join('\n'));
  console.log('通过');
}
try { const args=process.argv.slice(2),fixture=args.includes('--fixture'),dirs=args.filter(x=>x!=='--fixture');
  if(!dirs.length)throw Error('用法：node tools/audio/check-output.mjs <录音目录> [其他目录]');
  for(const dir of dirs){try{check(dir,fixture);}catch(err){console.error(`${dir} 不通过：${err.message}`);process.exitCode=1;}}
} catch(err){console.error(err.message);process.exitCode=1;}
