import { createAudio } from '/src/audio/audio.js';
import table from '/src/data/tables/audio.json' with { type: 'json' };
import scenarios from '/scenarios.json' with { type: 'json' };

// 使用真实的 Chrome 节点，只替换驱动时钟。每次暂停到渲染量子边界，
// 让 onended 也随音频时间回收声部，避免提前排完整首曲子挤占节点预算。
async function render(kind, id) {
  const rate = 48000, frames = rate * (kind === 'sfx' ? 3 : 16);
  const ctx = new OfflineAudioContext(2, frames, rate);
  const sinks=new WeakMap(), endings=new Map();
  // Chrome 将同一节点的多个输入放在散列表里。固定两两相加的次序，
  // 避免进程地址影响浮点加法的末位。所有 DSP 仍由浏览器节点执行。
  function node(factory,...args) {
    const source=ctx[factory](...args);
    source.connect=function(destination) {
      const sum=ctx.createGain(), prev=sinks.get(destination);
      if (prev) { prev.disconnect(destination); prev.connect(sum); }
      AudioNode.prototype.connect.call(source,sum);
      sum.connect(destination); sinks.set(destination,sum);
      return destination;
    };
    if (typeof source.stop==='function') {
      let ended=null;
      Object.defineProperty(source,'onended',{get:()=>ended,set:fn=>{ended=fn;}});
      const stop=source.stop.bind(source);
      source.stop=(at=0)=>{ stop(at); endings.set(source,at); };
    }
    return source;
  }
  let tick;
  window.setInterval = fn => { tick = fn; return 1; };
  window.AudioContext = function () {
    return new Proxy(ctx, { get(target, key) {
      if (key === 'state') return 'running';
      if (key === 'close') return () => Promise.resolve();
      if (['createGain','createOscillator','createBufferSource','createBiquadFilter','createConvolver','createDynamicsCompressor'].includes(key))
        return (...args)=>node(key,...args);
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  };
  const synth = createAudio();
  if (kind !== 'scenario') synth.setVolume({ amb: 0 });
  if (kind === 'music') synth.setMusic(id);
  function apply(n) {
    for (const op of scenarios[id] || []) if (op.tick === n) {
      if (op.scene) synth.setScene(op.scene);
      if (op.flavor) synth.setFlavor(op.flavor);
      if (op.music) synth.setMusic(op.music);
      if (op.volume) synth.setVolume(op.volume);
      if (op.muted != null) synth.setMuted(op.muted);
    }
  }
  apply(0);
  synth.unlock();
  const advance = n => {
    // 原生 onended 经过浏览器任务队列。固定在相同的暂停点回收节点。
    for (const [source,end] of endings) if (end<=ctx.currentTime) {
      endings.delete(source); source.onended?.();
    }
    if (n) apply(n);
    if (kind === 'sfx' && n === 4) synth.sfx(id);
    tick();
  };
  advance(0);
  let paused = ctx.suspend(Math.ceil(0.1 * rate / 128) * 128 / rate);
  const rendered = ctx.startRendering();
  for (let n = 1; n * 4800 < frames; n++) {
    await paused;
    advance(n);
    if ((n + 1) * 4800 < frames) paused = ctx.suspend(Math.ceil((n + 1) * 4800 / 128) * 128 / rate);
    await ctx.resume();
  }
  const audio = await rendered;
  synth.dispose();
  const wav = new ArrayBuffer(44 + frames * 8), view = new DataView(wav);
  const str = (off, s) => new Uint8Array(wav, off, s.length).set(new TextEncoder().encode(s));
  const u32 = (off, v) => view.setUint32(off, v, true), u16 = (off, v) => view.setUint16(off, v, true);
  str(0,'RIFF'); u32(4,wav.byteLength-8); str(8,'WAVEfmt '); u32(16,16);
  u16(20,3); u16(22,2); u32(24,rate); u32(28,rate*8); u16(32,8); u16(34,32); str(36,'data'); u32(40,frames*8);
  const left = audio.getChannelData(0), right = audio.getChannelData(1), samples = new Float32Array(wav,44);
  for (let i=0;i<frames;i++) { samples[2*i]=left[i]; samples[2*i+1]=right[i]; }
  const response = await fetch('/'+(kind==='scenario'?id:kind+'-'+id), { method:'POST', body:wav });
  if (!response.ok) throw Error('写入失败 '+id);
}
try {
  for (const {id} of table.SFX) await render('sfx',id);
  for (const id of Object.keys(table.MOODS)) await render('music',id);
  for (const id of Object.keys(scenarios)) await render('scenario',id);
} catch (error) { await fetch('/error', { method:'POST', body:String(error.stack || error) }); }
