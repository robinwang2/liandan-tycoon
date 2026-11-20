// 全部声音现场合成；节点预算包含总线、效果器和已经排进前瞻窗口的声部。
// 默认音量和配乐的七种情绪在 tables/音频.xlsx 里（改表 → npm run tables）；合成的配方在下面的代码里
import A from '../data/tables/audio.json' with { type: 'json' };
const VOLUMES = A.VOLUMES;
const MOODS = A.MOODS;
const NAMES = new Set('click hover tab open close choose turn coin spend good bad stamp card hire fire levelup release confetti alarm boom cameo toast notify lift ding error type rain_start burn freeze bloom'.split(' '));
const clamp = (x, lo, hi, fallback) => typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : fallback;
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

export function createAudio() {
  let ctx, timer, master, buses, noise, reverb, currentMusic;
  let disposed = false, unlocked = false, muted = false, warned = false, hidden = false;
  let mood = 'off', volume = { ...VOLUMES }, seed = 0x6d2b79f5, flavor = '';   // flavor：意识形态换了界面以后，配乐跟着换音色
  let scene = { mode: 'title', region: 'bay', night: 0, staff: 0, heat: 0, racks: 0, rain: 0, alert: false, month: 0 };
  let nextAmbient = 0, nextMod = 0;
  const nodes = new Set(), voices = new Set(), generations = new Set(), layers = {};
  const pending = [], events = [], lastSfx = new Map(), targets = new WeakMap();
  // 固定种子让相同操作可复现；随机序列持续推进，不在换和弦时重新开始。
  function random() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  }
  const range = (a, b) => a + random() * (b - a);
  function warn(error) {
    if (!warned) { warned = true; try { console.warn('[audio] 已安全忽略音频错误', error); } catch {} }
  }
  function safe(fn) { return (...args) => { try { return fn(...args); } catch (error) { warn(error); } }; }
  function node(n) { nodes.add(n); return n; }
  function drop(n) { if (!nodes.delete(n)) return; try { n.disconnect(); } catch (e) { warn(e); } }
  function smooth(param, value, seconds = .8) {
    if (targets.get(param) === value) return;
    targets.set(param, value);
    param.setTargetAtTime(value, ctx.currentTime, seconds);
  }
  function output() { if (master) smooth(master.gain, muted || hidden ? 0 : volume.master, .15); }
  function releaseVoice(v) {
    if (!voices.delete(v)) return;
    for (const n of v.nodes) drop(n);
    if (v.owner) { v.owner.voices.delete(v); retire(v.owner); }
  }
  function retire(g) {
    if (g !== currentMusic && !g.voices.size) { drop(g.bus); generations.delete(g); }
  }
  // 每个短音独立包络；共享滤波器和增益在最后一个声源结束后回收。
  function voice({ at = ctx.currentTime, dur = .15, freq = 440, end, gain = .1, wave = 'sine',
    noiseKind, cutoff = 2200, filter = 'lowpass', attack = .008, owner, bus = buses.sfx, detune = 0, chord }) {
    const frequencies = chord || [freq];
    const count = frequencies.length + 2;
    if (disposed || nodes.size + count > 60) return;
    const v = { nodes: [], sources: [], owner, end: at + dur + .025 };
    voices.add(v); if (owner) owner.voices.add(v);
    try {
      const tone = node(ctx.createBiquadFilter()); v.nodes.push(tone);
      const amp = node(ctx.createGain()); v.nodes.push(amp);
      tone.type = filter; tone.frequency.setValueAtTime(cutoff, at); tone.Q.value = .65;
      tone.connect(amp); amp.connect(bus);
      const peak = Math.max(.00001, gain / Math.sqrt(frequencies.length));
      amp.gain.setValueAtTime(0, at);
      amp.gain.linearRampToValueAtTime(peak, at + Math.min(attack, dur * .3));
      amp.gain.exponentialRampToValueAtTime(.00001, at + dur);
      let remaining = frequencies.length;
      for (const f of frequencies) {
        const s = node(noiseKind ? ctx.createBufferSource() : ctx.createOscillator());
        v.nodes.push(s); v.sources.push(s);
        if (noiseKind) { s.buffer = noise[noiseKind]; s.loop = true; }
        else {
          s.type = wave; s.frequency.setValueAtTime(f, at); s.detune.value = detune;
          if (end) s.frequency.exponentialRampToValueAtTime(end, at + dur * .85);
        }
        s.connect(tone);
        s.onended = safe(() => { drop(s); if (--remaining === 0) releaseVoice(v); });
        if (noiseKind) s.start(at, range(0, 1.8)); else s.start(at);
        s.stop(at + dur + .025);
      }
    } catch (e) {
      for (const s of v.sources) { try { s.stop(); } catch {} }
      releaseVoice(v); warn(e);
    }
  }
  function enqueue(delay, fn) {
    if (events.length < 96) events.push({ at: ctx.currentTime + delay, fn });
  }
  function play(name, opts = {}) {
    if (!NAMES.has(name) || hidden || muted || !unlocked) return;
    const now = ctx.currentTime;
    if (now - (lastSfx.get(name) ?? -Infinity) < (name === 'hover' ? .08 : .035)) return;
    lastSfx.set(name, now);
    const strength = clamp(opts?.gain, 0, 2, 1), ratio = 2 ** (clamp(opts?.pitch, -36, 36, 0) / 12);
    if (!strength) return;
    const tone = (delay, freq, dur, gain, extra = {}) => enqueue(delay, at => voice({ at, freq: freq * ratio,
      dur, gain: gain * strength, ...extra, ...(extra.end ? { end: extra.end * ratio } : {}) }));
    const dust = (delay, dur, gain, cutoff, filter = 'bandpass') => tone(delay, 1, dur, gain, { noiseKind: 'pink', cutoff: cutoff * ratio, filter });
    const notes = (values, step, dur = .3, gain = .09) => values.forEach((f, i) => tone(i * step, f, dur, gain, { wave: 'triangle', cutoff: 2200 }));
    // 木质按钮是低通三角波；纸张类以短带通粉噪为主体。
    switch (name) {
      case 'click': tone(0, 650, .012, .1, { wave: 'triangle', cutoff: 1500, end: 320 }); break;
      case 'hover': tone(0, 1200, .012, .022, { cutoff: 1800 }); break;
      case 'tab': dust(0, .13, .09, 1500); break;
      case 'open': tone(0, 145, .32, .14, { end: 100 }); dust(.06, .3, .065, 1000); tone(.08, 300, .3, .025, { end: 600 }); break;
      case 'close': dust(0, .14, .06, 900); tone(.025, 260, .16, .1, { end: 120 }); break;
      case 'choose': notes([330, 495], .095, .24); break;
      case 'turn': dust(0, .5, .11, 850); tone(.1, 240, .4, .035, { end: 650 }); tone(.53, 800, .04, .09, { wave: 'triangle' }); break;
      // 硬币与磬使用不完全整数的泛音，避免电子游戏方波提示感。
      case 'coin': [1320, 2083, 2870].forEach((f, i) => tone(i * .028, f, .42 - i * .08, .065 / (i + 1), { cutoff: 3600 })); break;
      case 'spend': notes([980, 735, 490], .065, .22, .06); break;
      case 'good': notes([392, 494, 587], .11); break;
      case 'bad': tone(0, 260, .28, .1, { cutoff: 600, detune: -9 }); tone(.13, 195, .3, .1, { cutoff: 550, detune: 7 }); break;
      case 'stamp': tone(0, 100, .23, .22, { end: 48 }); dust(0, .13, .16, 350); break;
      case 'card': dust(0, .22, .1, 2200); tone(.14, 1500, .3, .04); break;
      case 'hire': notes([330, 440, 550], .09, .25, .07); break;
      case 'fire': notes([330, 220], .09, .22, .065); dust(.1, .24, .08, 1400); break;
      case 'levelup': [220, 277, 330, 440].forEach((f, i) => tone(i * .2, f, i === 3 ? .58 : .28, .11, { wave: 'triangle', cutoff: 1600, attack: .045 })); break;
      case 'release':
        [220, 330, 440].forEach((f, i) => tone(i * .18, f, .7, .075, { end: f * 2, attack: .18 }));
        [660, 1327, 1840].forEach((f, i) => tone(.9, f, .58, .13 / (i + 1), { cutoff: 3000 })); break;
      case 'confetti': tone(0, 350, .07, .14, { end: 100 }); for (let i = 0; i < 7; i++) tone(.06 + i * .055, range(1500, 3000), .09, .025); break;
      case 'alarm': [0, .65].forEach(d => tone(d, 330, .5, .095, { end: 280, attack: .08, wave: 'triangle', cutoff: 950 })); break;
      case 'boom': tone(0, 75, .9, .24, { end: 28 }); dust(0, 1.05, .21, 650, 'lowpass'); dust(.14, .65, .07, 2100); break;
      case 'cameo': tone(0, 450, .33, .09, { end: 950 }); tone(.28, 180, .42, .12, { wave: 'triangle', end: 65 }); break;
      case 'toast': tone(0, 660, .16, .035); break;
      case 'notify': notes([784, 1175], .075, .22, .045); break;                // 顶部冒出新的行动提示：轻轻两声
      case 'lift': dust(0, .75, .08, 520, 'lowpass'); tone(0, 150, .8, .03, { end: 260, attack: .12 }); tone(.05, 420, .55, .012, { end: 700, attack: .2 }); break;   // 电梯启动：低沉的呼呼声，往上走音调高一点
      case 'ding': tone(0, 1318, 1.1, .075, { cutoff: 4200 }); tone(0, 2637, .55, .018, { cutoff: 5200 }); tone(.002, 1975, .8, .02, { cutoff: 4800 }); break;   // 到站：「叮」
      case 'error': [0, .11].forEach(d => tone(d, 160, .075, .09, { cutoff: 450 })); break;
      case 'type': { let delay = 0; for (let i = 0, n = 5 + Math.floor(random() * 4); i < n; i++) { tone(delay, range(430, 740), .018, .045, { wave: 'triangle', cutoff: 1500 }); delay += range(.035, .105); } break; }
      case 'rain_start': dust(0, 1.8, .065, 180, 'lowpass'); break;
      // 换界面的过场：烧起来 / 冻上 / 长出来
      case 'burn': tone(0, 95, .7, .2, { end: 38 }); dust(0, 2.0, .15, 520, 'lowpass'); dust(.2, 1.6, .06, 1400); for (let i = 0; i < 12; i++) dust(range(.05, 1.8), .03, .07, range(2500, 5000), 'highpass'); break;
      case 'freeze': tone(0, 2600, 1.1, .045, { end: 520, wave: 'square', cutoff: 3200 }); dust(0, 1.3, .07, 5200, 'highpass'); for (let i = 0; i < 6; i++) tone(.12 + i * .11, range(1400, 2800), .05, .03, { wave: 'square', cutoff: 4000 }); break;
      case 'bloom': [523, 587, 659, 784, 880, 1047].forEach((f, i) => tone(i * .16, f, .7, .045, { wave: 'triangle', cutoff: 2600, attack: .03 })); dust(0, 1.8, .035, 900); break;
    }
  }
  function makeNoise() {
    noise = {};
    for (const kind of ['white', 'pink']) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = b.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < data.length; i++) {
        const w = random() * 2 - 1;
        b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913;
        data[i] = kind === 'white' ? w : (b0 + b1 + b2 + w * .1848) * .18;
      }
      // 缓冲末端接回开头，循环不会产生宽带接缝脉冲。
      const fade = Math.min(512, data.length / 4);
      for (let i = 0; i < fade; i++) { const a = i / fade; data[data.length - fade + i] = data[data.length - fade + i] * (1 - a) + data[0] * a; }
      data[data.length - 1] = data[0];
      noise[kind] = b;
    }
  }
  function layer(name, kind, cutoff, type = 'lowpass', frequency = 60) {
    const source = node(kind === 'osc' ? ctx.createOscillator() : ctx.createBufferSource());
    const filter = node(ctx.createBiquadFilter()), amp = node(ctx.createGain());
    if (kind === 'osc') { source.type = 'sine'; source.frequency.value = frequency; }
    else { source.buffer = noise[kind]; source.loop = true; }
    filter.type = type; filter.frequency.value = cutoff; filter.Q.value = .6; amp.gain.value = 0;
    source.connect(filter); filter.connect(amp); amp.connect(buses.amb);
    source.onended = safe(() => { drop(source); drop(filter); drop(amp); });
    layers[name] = { source, filter, amp };
    if (kind === 'osc') source.start(); else source.start(ctx.currentTime, range(0, 1.8));
  }
  function ambience() {
    const s = scene, night = s.night, activity = s.mode === 'play' ? 1 : .35;
    // 城市远噪、低语、炉火、机柜、雨、虫鸣及危机脉动各有独立小音量。
    const levels = { city: .025 * (1 - night * .6), office: .024 * Math.sqrt(s.staff / 60) * activity,
      fire: .047 * s.heat * activity, fan: .023 * s.racks / 12 * activity,
      rain: .065 * s.rain, insects: .011 * Math.max(night, s.region === 'sz' && s.month >= 4 && s.month <= 8 ? .85 : 0),
      alert: s.alert ? .025 * activity : 0 };
    for (const [key, value] of Object.entries(levels)) smooth(layers[key].amp.gain, value, 1);
    smooth(layers.city.filter.frequency, 950 - night * 650, 1.2);
    smooth(layers.fire.filter.frequency, 250 + s.heat * 650, 1);
  }
  function ambientEvent(at) {
    const s = scene, bus = buses.amb;
    const t = (freq, dur, gain, extra = {}) => voice({ at, freq, dur, gain, bus, ...extra });
    const chance = random();
    if (chance < .3 && s.staff && s.mode === 'play') {
      for (let i = 0; i < 2 + Math.floor(s.staff / 20); i++) enqueue(i * range(.06, .18), when => voice({ at: when, freq: range(400, 800), dur: .018, gain: .018, wave: 'triangle', bus }));
    } else if (chance < .58 && s.night < .6) {
      // 海鸥用下滑双音；深圳日鸟更短、更轻。
      t(s.region === 'bay' ? 1100 : 1700, .3, .016, { end: s.region === 'bay' ? 650 : 2000, cutoff: 2400 });
    } else if (s.region === 'bay') {
      if (chance < .8) t(92, 2.3, .024, { chord: [92, 138], attack: .6, cutoff: 450 });
      else t(1200, .8, .018, { cutoff: 1800 });
    } else if (chance < .8) {
      t(420, .23, .02, { chord: [420, 530], wave: 'triangle', cutoff: 1000 });
    } else if (s.night < .5) t(1, .55, .027, { noiseKind: 'pink', cutoff: 400 });
    nextAmbient = at + range(4, 15) / (1 + s.staff / 60);
  }
  function changeMusic() {
    if (!ctx) return;
    const now = ctx.currentTime;
    // 新旧音乐总线同时存在 2.6 秒，旧声部淡出后才停止。
    for (const g of generations) {
      if (g.until !== Infinity) continue;
      g.bus.gain.cancelScheduledValues(now);
      const value = Math.min(1, Math.max(0, (now - g.born) / 2.6));
      g.bus.gain.setValueAtTime(value, now); g.bus.gain.linearRampToValueAtTime(0, now + 2.6);
      g.until = now + 2.6;
      for (const v of g.voices) for (const source of v.sources) source.stop(Math.min(v.end || Infinity, g.until));
    }
    currentMusic = undefined;
    for (const g of [...generations]) retire(g);
    if (mood === 'off' || hidden) return;
    // 高频切换时保留预算，待旧声部结束后再创建新总线。
    if (nodes.size > 48) return;
    const bus = node(ctx.createGain()); bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(1, now + 2.6);
    bus.connect(buses.music); bus.connect(reverb);
    currentMusic = { bus, voices: new Set(), config: MOODS[mood], born: now, until: Infinity, next: now + .02, beat: 0, chord: 0, note: 0 };
    generations.add(currentMusic);
  }
  function musicStep(g, at) {
    const c = g.config, beat = 60 / c.bpm, minor = !['title', 'triumph'].includes(mood);
    const make = options => voice({ at, bus: g.bus, owner: g, cutoff: c.bright, ...options });
    // 主旋律的音色跟着意识形态走：苏联风是铜管味的锯齿波，社区合作社风是短促的拨弦，冷色科技风是方波合成器
    const lead = flavor === 'soviet' ? { wave: 'sawtooth', cutoff: Math.min(c.bright, 1400) } : flavor === 'cold' ? { wave: 'square', cutoff: Math.max(c.bright, 2400) } : { wave: 'triangle' };
    if (mood === 'crisis') return crisisStep(g, at, beat, make, lead);
    if (g.beat % 8 === 0) {
      g.chord = c.chords[Math.floor(random() * c.chords.length)];
      const root = c.root + g.chord;
      // 三正弦铺底留出大量中频空间，长起音和长尾避免和弦边界突兀。
      make({ chord: [root, root + (minor ? 3 : 4), root + (mood === 'crisis' ? 6 : 7)].map(hz), dur: beat * 9, attack: 1.6, gain: .075 });
      make({ freq: hz(root - 12), dur: beat * 6, attack: .15, gain: mood === 'tense' ? .085 : .05, cutoff: 400 });
    }
    if (random() < c.density) {
      const index = mood === 'triumph' ? g.note++ % 5 : mood === 'defeat' ? 4 - g.note++ % 5 : Math.floor(random() * 5);
      make({ freq: hz(c.root + 12 + c.scale[index]), dur: flavor === 'rose' ? range(.3, .6) : range(.65, 1.5), gain: range(.025, .055), ...lead });
    }
    if ((mood === 'focus' && g.beat % 2 === 0) || mood === 'crisis') {
      make({ freq: mood === 'crisis' ? 48 : 70, dur: .2, gain: .035, cutoff: 280 });
      if (mood === 'crisis') make({ at: at + .19, freq: 44, dur: .16, gain: .022, cutoff: 250 });
    }
    // 专注时的节奏型也带上意识形态的味道：军鼓、拨弦沙锤、电子踩镲
    if (mood === 'focus' && flavor === 'soviet' && g.beat % 4 === 2) make({ freq: 1, dur: .1, gain: .045, noiseKind: 'white', filter: 'bandpass', cutoff: 1800 });
    if (mood === 'focus' && flavor === 'rose' && g.beat % 2 === 1) make({ freq: 1, dur: .06, gain: .03, noiseKind: 'pink', filter: 'bandpass', cutoff: 3200 });
    if (mood === 'focus' && flavor === 'cold') make({ at: at + beat / 2, freq: 1, dur: .02, gain: .025, noiseKind: 'white', filter: 'highpass', cutoff: 9000 });
    g.beat++; g.next = at + beat * range(.97, 1.03);
  }
  // 危机：快拍子、减三和弦铺底、心跳一样的八分音符低音、秒针一样的滴答，每四小节一声拉长的上行警报。拍子不抖，越听越催
  function crisisStep(g, at, beat, make, lead) {
    const c = g.config, b = g.beat % 16;
    if (g.beat % 8 === 0) {
      g.chord = c.chords[Math.floor(g.beat / 8) % c.chords.length];
      const r = c.root + g.chord;
      make({ chord: [r, r + 3, r + 6].map(hz), dur: beat * 8, attack: .9, gain: .07, cutoff: 900 });
    }
    const root = c.root + g.chord - 12;
    make({ freq: hz(root), dur: .17, gain: .075, attack: .005, cutoff: 320, wave: 'triangle' });
    make({ at: at + beat / 2, freq: hz(root + (b % 4 === 3 ? 13 : 12)), dur: .15, gain: .05, attack: .005, cutoff: 360, wave: 'triangle' });
    make({ at: at + beat / 2, freq: 1, dur: .03, gain: .05, noiseKind: 'white', filter: 'highpass', cutoff: 6500 });
    if (b % 4 === 0) make({ freq: 62, end: 38, dur: .3, gain: .16, cutoff: 200 });
    if (flavor === 'soviet' && b % 4 === 2) make({ freq: 1, dur: .12, gain: .07, noiseKind: 'white', filter: 'bandpass', cutoff: 1800 });     // 军鼓：像急行军
    if (flavor === 'cold') make({ at: at + beat / 4, freq: 1, dur: .02, gain: .03, noiseKind: 'white', filter: 'highpass', cutoff: 9000 });  // 十六分踩镲：像机器在报错
    if (flavor === 'rose' && b % 2 === 1) make({ freq: 1, dur: .07, gain: .035, noiseKind: 'pink', filter: 'bandpass', cutoff: 3000 });     // 沙锤
    if (b === 12) make({ freq: hz(c.root + 24), end: hz(c.root + 31), dur: beat * 3, attack: beat * 1.5, gain: .03, ...lead, cutoff: 1800 });
    if (random() < c.density) make({ freq: hz(c.root + 12 + c.scale[Math.floor(random() * c.scale.length)]), dur: range(.35, .6), gain: range(.03, .05), ...lead });
    g.beat++; g.next = at + beat;
  }
  function tick() {
    if (disposed || !ctx || ctx.state !== 'running' || hidden) return;
    const now = ctx.currentTime;
    for (const g of [...generations]) if (g.until <= now) retire(g);
    if (!currentMusic && mood !== 'off') changeMusic();
    if (currentMusic) {
      if (currentMusic.next < now) currentMusic.next = now + .01;
      if (currentMusic.next < now + .15) musicStep(currentMusic, currentMusic.next);
    }
    if (now >= nextMod) {
      // 慢速随机调制模拟听不清的人声与火焰；城市层不承担节拍。
      smooth(layers.office.filter.frequency, range(250, 750), .8);
      smooth(layers.fire.amp.gain, .047 * scene.heat * (scene.mode === 'play' ? 1 : .35) * range(.7, 1), .8);
      smooth(layers.insects.filter.frequency, range(2800, 3900), 1);
      const summer = scene.region === 'sz' && scene.month >= 4 && scene.month <= 8;
      smooth(layers.insects.amp.gain, .011 * Math.max(scene.night, summer ? .85 : 0) * range(.45, 1), .7);
      smooth(layers.alert.amp.gain, scene.alert ? .012 * (1 + Math.sin(now * 3)) : 0, .5);
      nextMod = now + .65;
    }
    if (now >= nextAmbient) ambientEvent(now + .02);
    for (let i = events.length - 1; i >= 0; i--) if (events[i].at < now + .15) {
      const e = events.splice(i, 1)[0]; if (e.at >= now - .2) e.fn(Math.max(now + .002, e.at));
    }
  }
  function visibility() {
    if (disposed) return;
    hidden = Boolean(globalThis.document?.hidden); output();
    if (hidden) { events.length = 0; changeMusic(); }
    else if (ctx) { nextAmbient = ctx.currentTime + range(2, 6); nextMod = ctx.currentTime; changeMusic(); }
  }
  const onVisibility = safe(visibility);
  function shutdown() {
    disposed = true; unlocked = false;
    if (timer !== undefined) globalThis.clearInterval(timer);
    timer = undefined;
    globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
    pending.length = events.length = 0;
    for (const n of [...nodes]) {
      if (typeof n.stop === 'function') { try { n.stop(); } catch {} n.onended = null; }
      drop(n);
    }
    voices.clear(); generations.clear(); currentMusic = undefined;
    if (ctx) { try { Promise.resolve(ctx.close()).catch(warn); } catch (e) { warn(e); } }
    ctx = undefined; noise = undefined; buses = undefined; master = undefined; reverb = undefined;
    for (const key of Object.keys(layers)) delete layers[key];
  }
  function unlock() {
    if (disposed) return;
    try {
      if (!ctx) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) return;
        ctx = new Context(); hidden = Boolean(globalThis.document?.hidden);
        master = node(ctx.createGain()); master.gain.value = 0;
        const limiter = node(ctx.createDynamicsCompressor());
        limiter.threshold.value = -8; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = .003; limiter.release.value = .18;
        master.connect(limiter); limiter.connect(ctx.destination);
        buses = {};
        for (const key of ['music', 'sfx', 'amb']) { buses[key] = node(ctx.createGain()); buses[key].gain.value = volume[key]; buses[key].connect(master); }
        makeNoise();
        // 程序生成短立体声混响，湿声回音乐总线，音乐音量和淡出始终一致。
        reverb = node(ctx.createConvolver()); const wet = node(ctx.createGain()); wet.gain.value = .16;
        const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.65), ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const data = impulse.getChannelData(ch); for (let i = 0; i < data.length; i++) data[i] = (random() * 2 - 1) * Math.exp(-6 * i / data.length) * .25; }
        reverb.buffer = impulse; reverb.connect(wet); wet.connect(buses.music);
        layer('city', 'pink', 950); layer('office', 'pink', 500, 'bandpass'); layer('fire', 'pink', 350, 'bandpass');
        layer('fan', 'pink', 160); layer('rain', 'white', 2600); layer('insects', 'white', 3400, 'bandpass'); layer('alert', 'osc', 160, 'lowpass', 48);
        globalThis.document?.addEventListener?.('visibilitychange', onVisibility);
        timer = globalThis.setInterval(safe(tick), 100);
        ambience(); nextAmbient = ctx.currentTime + range(3, 8); changeMusic();
      }
      const ready = safe(() => {
        if (disposed || !ctx) return;
        unlocked = ctx.state === 'running'; output();
        if (unlocked) { for (const [name, opts] of pending.splice(0)) play(name, opts); }
      });
      if (ctx.state === 'suspended') Promise.resolve(ctx.resume()).then(ready).catch(warn);
      else ready();
    } catch (e) { warn(e); shutdown(); }
  }
  return {
    unlock: safe(unlock),
    sfx: safe((name, opts) => {
      if (disposed || !NAMES.has(name)) return;
      if (!unlocked) { if (pending.length < 16) pending.push([name, { gain: opts?.gain, pitch: opts?.pitch }]); }
      else play(name, opts);
    }),
    setScene: safe(state => {
      if (disposed || !state || typeof state !== 'object') return;
      for (const [key, max] of Object.entries({ night: 1, staff: 60, heat: 1, racks: 12, rain: 1, month: 11 })) {
        if (key in state) scene[key] = clamp(state[key], 0, max, scene[key]);
      }
      if (['title', 'play', 'end'].includes(state.mode)) scene.mode = state.mode;
      if (['bay', 'sz'].includes(state.region)) scene.region = state.region;
      if ('alert' in state) scene.alert = Boolean(state.alert);
      if (ctx) ambience();
    }),
    setFlavor: safe(value => { if (!disposed) flavor = ['soviet', 'rose', 'cold'].includes(value) ? value : ''; }),
    setMusic: safe(value => { if (!disposed && (value === 'off' || Object.hasOwn(MOODS, value)) && mood !== value) { mood = value; changeMusic(); } }),
    setVolume: safe(values => {
      if (disposed || !values || typeof values !== 'object') return;
      for (const key of Object.keys(volume)) if (key in values) volume[key] = clamp(values[key], 0, 1, volume[key]);
      if (ctx) { for (const key of ['music', 'sfx', 'amb']) smooth(buses[key].gain, volume[key], .12); output(); }
    }),
    setMuted: safe(flag => { if (!disposed) { muted = Boolean(flag); output(); } }),
    getState: safe(() => ({ unlocked, muted, volume: { ...volume }, mood, nodes: nodes.size })),
    dispose: safe(() => { if (!disposed) shutdown(); }),
  };
}
