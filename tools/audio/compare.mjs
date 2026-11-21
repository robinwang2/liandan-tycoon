import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../../',import.meta.url));
const [jsDir = join(root,'unity/Game/Logs/audio-js'), csDir = join(root,'unity/Game/Logs/audio-cs')] = process.argv.slice(2);
for (const dir of [jsDir,csDir]) if (existsSync(join(dir,'.incomplete')))
  throw Error('这组渲染尚未完成，请重新渲染后再比较：'+dir);
const table = JSON.parse(await readFile(join(root,'src/data/tables/audio.json')));
const scenarios = JSON.parse(await readFile(join(root,'tools/audio/scenarios.json')));
const ids = [...table.SFX.map(x=>'sfx-'+x.id), ...Object.keys(table.MOODS).map(x=>'music-'+x), ...Object.keys(scenarios)];
const rate = 48000, size = 4096, hop = size / 2;
const centers = Array.from({length:32}, (_,i)=>1000*2**((i-17)/3));
const bandIndex = Array.from({length:size/2+1}, (_,i)=>Math.round(3*Math.log2(i*rate/size/1000))+17);
const window = Float64Array.from({length:size}, (_,i)=>.5-.5*Math.cos(2*Math.PI*i/size));
const cos = Float64Array.from({length:hop}, (_,i)=>Math.cos(-Math.PI*i/hop));
const sin = Float64Array.from({length:hop}, (_,i)=>Math.sin(-Math.PI*i/hop));
const db = ratio => 20*Math.log10(Math.max(1e-15,ratio));
const round = n => Number(n.toFixed(6));

function fft(a,b) {
  for (let i=1,j=0;i<size;i++) {
    let bit=hop;
    for (; j&bit;bit>>=1) j^=bit;
    j^=bit;
    if (i<j) { [a[i],a[j]]=[a[j],a[i]]; [b[i],b[j]]=[b[j],b[i]]; }
  }
  for (let len=2;len<=size;len*=2) {
    const half=len/2, stride=size/len;
    for (let start=0;start<size;start+=len) for (let k=0;k<half;k++) {
      const i=start+k,j=i+half,c=cos[k*stride],s=sin[k*stride];
      const vr=a[j]*c-b[j]*s, vi=a[j]*s+b[j]*c;
      a[j]=a[i]-vr; b[j]=b[i]-vi; a[i]+=vr; b[i]+=vi;
    }
  }
}
async function wav(dir,id) {
  const b=await readFile(join(dir,id+'.wav'));
  if (b.toString('ascii',0,4)!=='RIFF' || b.toString('ascii',8,12)!=='WAVE' || b.readUInt32LE(4)+8!==b.length) throw Error('WAV 文件不完整');
  let data,format;
  for (let p=12;p+8<=b.length;) {
    const tag=b.toString('ascii',p,p+4), n=b.readUInt32LE(p+4); p+=8;
    if (p+n>b.length) throw Error('WAV 块长度越界');
    if (tag==='fmt ') format=[b.readUInt16LE(p),b.readUInt16LE(p+2),b.readUInt32LE(p+4),b.readUInt16LE(p+14)].join('/');
    if (tag==='data') data=b.subarray(p,p+n);
    p+=n+(n%2);
  }
  if (format!=='3/2/48000/32' || !data || data.length%8) throw Error('要求 48 kHz 双声道 float32 WAV');
  return new Float32Array(data.buffer.slice(data.byteOffset,data.byteOffset+data.length));
}
function analyse(samples) {
  const frames=samples.length/2, bands=centers.map(()=>0), env=[];
  let peak=0,total=0,chunk=0;
  for (let i=0;i<frames;i++) {
    const l=samples[2*i], r=samples[2*i+1];
    const power=(l*l+r*r)/2; chunk+=power; total+=power; peak=Math.max(peak,Math.abs(l),Math.abs(r));
    if (i%480===479 || i===frames-1) { env.push(Math.sqrt(chunk/(i%480+1))); chunk=0; }
  }
  if (!(peak>0 && Number.isFinite(total))) throw Error('静音或非有限采样');
  let first=0,last=frames-1;
  const active=i=>Math.max(Math.abs(samples[2*i]),Math.abs(samples[2*i+1]))>peak*1e-4;
  while (!active(first)) first++;
  while (!active(last)) last--;
  const a=new Float64Array(size), b=new Float64Array(size);
  let moment=0,energy=0;
  for (let off=-hop;off<frames;off+=hop) for (let ch=0;ch<2;ch++) {
    if (off+size<first || off>last+size) continue;
    for (let i=0;i<size;i++) a[i]=(samples[2*(off+i)+ch]??0)*window[i];
    b.fill(0); fft(a,b);
    for (let i=1;i<=hop;i++) {
      const power=a[i]*a[i]+b[i]*b[i], band=bandIndex[i]; energy+=power; moment+=power*i*rate/size;
      if (band>=0 && band<bands.length) bands[band]+=power;
    }
  }
  return {seconds:frames/rate, onset:first/rate, activeSeconds:(last-first+1)/rate, peak,
    rms:Math.sqrt(total/frames), centroidHz:moment/energy, env,bands};
}
function compare(x,y,id) {
  const a=analyse(x), b=analyse(y);
  if (x.length!==y.length || a.seconds!==(id.startsWith('sfx-')?3:16)) throw Error('时长不符 '+a.seconds+' / '+b.seconds);
  const mean=arr=>arr.reduce((s,v)=>s+v,0)/arr.length, ma=mean(a.env),mb=mean(b.env);
  let xx=0,yy=0,xy=0,err=0,norm=0,sampleErr=0,maxError=0;
  let jsSide=0,csSide=0,sideProduct=0;
  a.env.forEach((v,i)=>{
    const w=b.env[i]; xx+=(v-ma)**2; yy+=(w-mb)**2; xy+=(v-ma)*(w-mb); err+=(v-w)**2; norm+=v*v;
  });
  for (let i=0;i<x.length;i++) { const d=x[i]-y[i]; sampleErr+=d*d; maxError=Math.max(maxError,Math.abs(d)); }
  // 差声道由立体声混响产生，可以单独检出湿声丢失和左右声道接反。
  for (let i=0;i<x.length;i+=2) {
    const left=x[i]-x[i+1], right=y[i]-y[i+1];
    jsSide+=left*left; csSide+=right*right; sideProduct+=left*right;
  }
  const bands=[], floor=Math.max(...a.bands)*1e-4;
  for (let i=0;i<centers.length;i++) {
    if (Math.max(a.bands[i],b.bands[i])<floor) continue;
    bands.push({hz:round(centers[i]),deltaDb:round(10*Math.log10(Math.max(b.bands[i],1e-30)/Math.max(a.bands[i],1e-30)))});
  }
  const metrics={ peakDb:db(b.peak/a.peak),rmsDb:db(b.rms/a.rms),envCorr:xy/Math.sqrt(xx*yy),envError:Math.sqrt(err/norm),
    centroidRelative:(b.centroidHz-a.centroidHz)/a.centroidHz,maxBandDb:Math.max(...bands.map(x=>Math.abs(x.deltaDb))),
    onsetDelta:b.onset-a.onset,activeDelta:b.activeSeconds-a.activeSeconds,sampleRmse:Math.sqrt(sampleErr/x.length),sampleMaxError:maxError };
  const reasons=[];
  for (const [key,limit] of Object.entries({peakDb:1,rmsDb:1,envError:.15,centroidRelative:.1,maxBandDb:3,onsetDelta:.003,activeDelta:.015}))
    if (!(Math.abs(metrics[key])<=limit)) reasons.push(key);
  if (!(metrics.envCorr>=.95)) reasons.push('envCorr');
  if (jsSide>0) {
    metrics.sideDb=db(Math.sqrt(csSide/jsSide));
    metrics.sideCorr=csSide>0?sideProduct/Math.sqrt(jsSide*csSide):0;
    if (!(Math.abs(metrics.sideDb)<=1 && metrics.sideCorr>=.95)) reasons.push('stereo');
  } else if (csSide>0) reasons.push('stereo');
  function summary({env,bands,...values}) { return values; }
  return {id,pass:!reasons.length,reasons,js:summary(a),cs:summary(b),...metrics,bands};
}
const results=[];
for (const id of ids) {
  try { const [x,y]=await Promise.all([wav(jsDir,id),wav(csDir,id)]); results.push(compare(x,y,id)); }
  catch(error) { results.push({id,pass:false,error:error.message}); }
}
console.table(results.map(r=>({id:r.id,通过:r.pass?'是':'否',峰值dB:r.peakDb?.toFixed(2),包络相关:r.envCorr?.toFixed(4),
  包络误差:r.envError?.toFixed(3),最大频带dB:r.maxBandDb?.toFixed(2),原因:r.error??r.reasons.join(',')})));
const report=join(csDir,'compare.json');
await writeFile(report,JSON.stringify(results,null,2)+'\n');
console.log(results.filter(r=>r.pass).length+'/'+ids.length,report);
if (results.some(r=>!r.pass)) process.exitCode=1;
