import assert from 'node:assert/strict';
import { createAudio } from '../src/audio/audio.js';

// 可控时钟和最小 WebAudio 实现：真实触发 onended，独立统计连接与存活节点。
const intervals = new Map(), listeners = new Set(), contexts = [];
let nextTimer = 0, callbacks = 0, warnings = 0;
class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  record(method, value, time, extra) {
    assert.ok(Number.isFinite(value), `${method}: 非有限参数`);
    assert.ok(Number.isFinite(time) && time >= 0, `${method}: 非法时间`);
    this.events.push({ method, value, time, extra }); this.value = value; return this;
  }
  setValueAtTime(v, t) { return this.record('set', v, t); }
  linearRampToValueAtTime(v, t) { return this.record('linear', v, t); }
  exponentialRampToValueAtTime(v, t) { assert.ok(v > 0); return this.record('exp', v, t); }
  setTargetAtTime(v, t, c) { assert.ok(c > 0); return this.record('target', v, t, c); }
  cancelScheduledValues(t) { this.events = this.events.filter(e => e.time < t); return this; }
  cancelAndHoldAtTime(t) { return this.cancelScheduledValues(t); }
  setValueCurveAtTime(v, t, d) { assert.ok(d > 0); return this.record('curve', v[0], t, d); }
}
class Node {
  constructor(ctx, kind, source = false) {
    this.ctx = ctx; this.kind = kind; this.source = source; this.connections = new Set(); this.connectedEver = new Set();
    this.gain = new Param(1); this.frequency = new Param(440); this.detune = new Param(); this.Q = new Param(1);
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release', 'playbackRate']) this[key] = new Param(1);
    ctx.all.add(this); ctx.live.add(this); ctx.created++;
    ctx.peak = Math.max(ctx.peak, ctx.live.size);
  }
  connect(other) { assert.ok(other); this.connections.add(other); this.connectedEver.add(other); return other; }
  disconnect() {
    this.connections.clear();
    if (this.ctx.live.delete(this)) this.ctx.released++;
  }
  start(time = 0) {
    assert.ok(this.source && !this.started); assert.ok(Number.isFinite(time) && time >= 0);
    if (this.kind === 'buffer') assert.ok(this.buffer);
    this.started = true; this.startAt = time;
  }
  stop(time = 0) { assert.ok(this.source && this.started); assert.ok(Number.isFinite(time) && time >= 0); this.stopAt = time; }
}
class FakeAudioContext {
  static initialState = 'running';
  static rejectResume = false;
  constructor() {
    this.currentTime = 0; this.sampleRate = 8000; this.state = FakeAudioContext.initialState;
    this.destination = {}; this.all = new Set(); this.live = new Set();
    this.created = this.released = this.peak = this.resumeCalls = 0; this.buffers = [];
    contexts.push(this);
  }
  createGain() { return new Node(this, 'gain'); }
  createBiquadFilter() { return new Node(this, 'filter'); }
  createDynamicsCompressor() { return new Node(this, 'compressor'); }
  createConvolver() { return new Node(this, 'convolver'); }
  createOscillator() { return new Node(this, 'oscillator', true); }
  createBufferSource() { return new Node(this, 'buffer', true); }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    const buffer = { numberOfChannels: channels, length, sampleRate: rate, getChannelData: ch => data[ch] };
    this.buffers.push(buffer); return buffer;
  }
  resume() { this.resumeCalls++; if (FakeAudioContext.rejectResume) return Promise.reject(new Error('模拟恢复失败')); this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  advance(dt) {
    if (this.state === 'running') this.currentTime += dt;
    for (const n of this.all) if (n.source && n.started && !n.ended && n.stopAt <= this.currentTime) {
      n.ended = true; if (n.onended) n.onended();
    }
  }
}
const names = 'click hover tab open close choose turn coin spend good bad stamp card hire fire levelup release confetti alarm boom cameo toast error type rain_start'.split(' ');
const moods = ['off', 'title', 'calm', 'focus', 'tense', 'crisis', 'triumph', 'defeat'];
const saved = new Map(['AudioContext', 'webkitAudioContext', 'document', 'setInterval', 'clearInterval'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const originalWarn = console.warn;
function install(key, value) { Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
function advance(ctx, seconds, audio) {
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    ctx.advance(.1);
    for (const fn of [...intervals.values()]) { callbacks++; fn(); }
    if (audio) {
      assert.equal(audio.getState().nodes, ctx.live.size, '引擎与独立节点统计不一致');
      assert.ok(ctx.live.size <= 60, `超出节点预算: ${ctx.live.size}`);
    }
  }
}
function visible(hidden) { globalThis.document.hidden = hidden; for (const fn of listeners) fn(); }
function preflight(audio) {
  assert.equal(audio.getState().unlocked, false);
  audio.sfx('click'); audio.setScene({ mode: 'play', staff: 12 }); audio.setMusic('calm');
  audio.setVolume({ music: .2 }); audio.setMuted(true); audio.setMuted(false);
  assert.deepEqual(audio.getState().volume, { master: .7, music: .2, sfx: .6, amb: .45 });
  assert.equal(audio.getState().nodes, 0);
}
try {
  install('setInterval', (fn, ms) => { assert.equal(ms, 100); intervals.set(++nextTimer, fn); return nextTimer; });
  install('clearInterval', id => intervals.delete(id));
  install('document', { hidden: false, addEventListener: (name, fn) => { assert.equal(name, 'visibilitychange'); listeners.add(fn); }, removeEventListener: (_name, fn) => listeners.delete(fn) });
  install('AudioContext', undefined); install('webkitAudioContext', undefined);
  console.warn = () => warnings++;
  const absent = createAudio(); preflight(absent); absent.unlock(); absent.dispose(); absent.unlock();
  assert.equal(absent.getState().nodes, 0); assert.equal(intervals.size, 0);
  install('AudioContext', FakeAudioContext);
  const early = createAudio(); preflight(early); early.dispose(); early.unlock();
  assert.equal(contexts.length, 0, '解锁前 dispose 后不得创建上下文');
  const audio = createAudio(); preflight(audio); audio.unlock(); audio.unlock();
  const ctx = contexts.at(-1);
  assert.equal(contexts.length, 1); assert.equal(intervals.size, 1); assert.equal(listeners.size, 1);
  assert.equal(audio.getState().unlocked, true);
  const gains = [...ctx.all].filter(n => n.kind === 'gain');
  const [master, musicBus, sfxBus, ambBus] = gains;
  const limiter = [...ctx.all].find(n => n.kind === 'compressor');
  assert.ok([musicBus, sfxBus, ambBus].every(bus => bus.connections.has(master)), '总线必须汇入 master');
  assert.ok(master.connections.has(limiter) && limiter.connections.has(ctx.destination), '主输出必须经过限幅器');
  const initialMusic = [...ctx.all].find(n => n.kind === 'gain' && n.connections.has(musicBus) && n !== gains[4]);
  assert.ok(initialMusic.gain.events.some(e => e.method === 'linear' && e.value === 1 && e.time === 2.6), '音乐必须淡入');
  assert.deepEqual(ctx.buffers.slice(0, 2).map(b => b.length), [16000, 16000]);
  advance(ctx, 2, audio);
  const afterUnknown = ctx.created; audio.sfx('not-a-sound'); audio.setMusic('invalid');
  assert.equal(ctx.created, afterUnknown); assert.equal(audio.getState().mood, 'calm');
  audio.setMusic('off'); advance(ctx, 12, audio);
  const sfxStats = {};
  for (const name of names) {
    const oldNodes = new Set(ctx.all);
    audio.sfx(name, { gain: .8, pitch: 2 }); advance(ctx, 2.5, audio);
    const generated = [...ctx.all].filter(n => !oldNodes.has(n) && n.source &&
      [...n.connectedEver].some(filter => [...filter.connectedEver].some(amp => amp.connectedEver.has(sfxBus))));
    assert.ok(generated.length > 0, `${name} 未合成任何声源`);
    assert.ok(generated.every(n => n.ended && !ctx.live.has(n)), `${name} 存在未回收声源`);
    if (name === 'click') assert.ok(generated.every(n => n.stopAt - n.startAt <= .04), 'click 超过 40 毫秒');
    if (name === 'type') assert.ok(generated.length >= 5 && generated.length <= 8, '键盘声必须为 5 至 8 下');
    const effectNodes = new Set(generated);
    for (const source of generated) for (const filter of source.connectedEver) {
      effectNodes.add(filter); for (const amp of filter.connectedEver) effectNodes.add(amp);
    }
    sfxStats[name] = effectNodes.size;
  }
  const samples = [], start = ctx.currentTime;
  // 120 秒每 100 毫秒刷新场景，覆盖全部音乐状态、城市、季节、密度和静音。
  for (let step = 0; step < 1200; step++) {
    if (step % 150 === 0) audio.setMusic(moods[Math.floor(step / 150)]);
    audio.setScene({ mode: step < 80 ? 'title' : step > 1100 ? 'end' : 'play', region: step % 200 < 100 ? 'bay' : 'sz',
      night: (step % 100) / 99, staff: step % 61, heat: (step % 70) / 69, racks: step % 13,
      rain: (step % 90) / 89, alert: step % 160 > 100, month: Math.floor(step / 100) });
    if (step % 23 === 0) audio.sfx(names[Math.floor(step / 23) % names.length]);
    if (step === 400) { audio.setMuted(true); assert.equal(master.gain.events.at(-1).value, 0); }
    if (step === 410) audio.setMuted(false);
    if (step === 500) {
      visible(true); assert.equal(master.gain.events.at(-1).value, 0); const created = ctx.created; advance(ctx, 3, audio);
      assert.equal(ctx.created, created, '隐藏页面仍在创建声音'); visible(false);
    }
    advance(ctx, .1, audio);
    if (step % 100 === 99) samples.push(ctx.live.size);
  }
  audio.setMusic('off'); audio.setScene({ staff: 0, heat: 0, rain: 0, racks: 0, alert: false });
  advance(ctx, 15, audio);
  // 多次拥挤事件和音乐切换后都回到相同固定底噪节点数，不能逐轮积累。
  const baselines = [];
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 20; i++) {
      audio.setMusic(moods[1 + i % 7]);
      for (const name of names) audio.sfx(name, { gain: 2, pitch: i - 10 });
      advance(ctx, .1, audio);
    }
    audio.setMusic('off'); visible(true); advance(ctx, 15, audio); baselines.push(ctx.live.size); visible(false);
  }
  assert.ok(baselines.every(n => n === 28), `基线增长: ${baselines}`);
  assert.ok(ctx.peak <= 60);
  audio.setVolume({ master: NaN, sfx: 9, amb: -1 });
  assert.deepEqual(audio.getState().volume, { master: .7, music: .2, sfx: 1, amb: 0 });
  const detached = audio.getState(); detached.volume.master = 0; assert.equal(audio.getState().volume.master, .7);
  assert.equal(warnings, 0, '正常路径出现内部错误');
  const created = ctx.created, scheduled = callbacks;
  audio.dispose(); audio.dispose();
  for (const name of names) audio.sfx(name);
  audio.unlock(); audio.setScene({ staff: 60 }); audio.setMusic('title'); audio.setVolume({ master: 1 }); audio.setMuted(false);
  advance(ctx, 20, audio);
  assert.equal(ctx.created, created); assert.equal(callbacks, scheduled); assert.equal(intervals.size, 0); assert.equal(listeners.size, 0);
  assert.equal(ctx.live.size, 0); assert.equal(ctx.created, ctx.released);
  assert.ok([...ctx.all].every(n => !n.connections.size));
  // 挂起恢复、恢复拒绝和初始化异常均不能传到游戏。
  FakeAudioContext.initialState = 'suspended';
  const suspended = createAudio(); suspended.unlock(); await Promise.resolve(); await Promise.resolve();
  assert.equal(suspended.getState().unlocked, true); suspended.dispose();
  FakeAudioContext.rejectResume = true;
  const denied = createAudio(); denied.unlock(); denied.unlock();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(denied.getState().unlocked, false); assert.equal(warnings, 1); denied.dispose();
  install('AudioContext', class extends FakeAudioContext { createBiquadFilter() { throw new Error('模拟初始化失败'); } });
  const broken = createAudio(); broken.unlock(); broken.unlock(); broken.dispose();
  assert.equal(warnings, 2); assert.equal(broken.getState().nodes, 0);
  assert.equal(intervals.size, 0); assert.equal(listeners.size, 0);
  assert.ok(contexts.every(c => c.live.size === 0));
  FakeAudioContext.initialState = 'running'; FakeAudioContext.rejectResume = false;
  install('AudioContext', undefined); install('webkitAudioContext', FakeAudioContext); install('document', undefined);
  const fallback = createAudio(); fallback.unlock(); assert.equal(fallback.getState().unlocked, true); fallback.dispose();
  assert.equal(contexts.at(-1).live.size, 0); assert.equal(intervals.size, 0);
  console.log('AUDIO OK');
  console.log(JSON.stringify({ sfx: sfxStats, simulatedSceneSeconds: 120, totalMainSeconds: +(ctx.currentTime - start).toFixed(1),
    created: ctx.created, released: ctx.released, peakNodes: ctx.peak, samples, quietBaselines: baselines,
    finalNodes: ctx.live.size, schedulerCallbacks: callbacks, timersAfterDispose: intervals.size, expectedFaultWarnings: warnings }, null, 2));
} finally {
  console.warn = originalWarn;
  for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
