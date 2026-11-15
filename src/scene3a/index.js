// 3A 版场景入口：舞台（渲染/天空/镜头）+ 城市 + 办公室 + 天气。
// 对外接口和经典版 createOffice 一样（sync / play / setInsets / dispose），另外多了画质、时间、天气、性能统计。
import * as THREE from 'three';
import { createStage, FX, QUALITY } from './stage.js';
import { makeKit } from './kit.js';
import { createCity } from './city.js';
import { createRoom } from './office.js';
import { PROPS } from './props.js';
import { ART } from '../ui/art.js';

const hash01 = n => { let h = Math.imul(n ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
// 一天里的几个时段（小时）。每个月轮到哪个由月份决定；开了 996 就是深夜
const HOURS = [9.3, 11.6, 14.4, 16.6, 17.9, 10.4, 15.5];
const todOf = v => (v.night ? 21.3 + hash01(v.t | 0) * 1.5 : HOURS[Math.floor(hash01((v.t | 0) * 31 + 7) * HOURS.length)]);
// 天气：湾区多雾，深圳夏天多雨
function weatherOf(region, t) {
  const m = (((t | 0) - 1) % 12 + 12) % 12, r = hash01((t | 0) * 7919 + (region === 'bay' ? 17 : 3));
  if (t <= 2) return 'clear';
  if (region === 'bay') return r < 0.52 ? 'clear' : r < 0.7 ? 'cloudy' : r < 0.86 ? 'fog' : r < 0.95 ? 'rain' : 'overcast';
  const wet = m >= 4 && m <= 8;
  return r < (wet ? 0.34 : 0.58) ? 'clear' : r < (wet ? 0.52 : 0.8) ? 'cloudy' : r < (wet ? 0.86 : 0.9) ? 'rain' : 'overcast';
}

// 广告牌、海报：用游戏里的事件插画（宽幅原图给广告牌，竖版海报裁中间一块）
const POSTER_KEYS = ['launch', 'robots', 'awakening', 'datacenter', 'leaderboard', 'furnace', 'pitch', 'party', 'press', 'market', 'bubble', 'lab', 'seminar', 'bay', 'urban_village', 'bell'];
function makeArt(k) {
  const keys = POSTER_KEYS.filter(x => ART[x]), imgs = new Map(), texs = new Map(), mats = new Map();
  if (!keys.length) keys.push(...Object.keys(ART));
  const tex = (key, tall) => {
    const id = key + (tall ? ':t' : ':w'); let t = texs.get(id); if (t) return t;
    t = new THREE.Texture(); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (tall) { t.repeat.set(0.31, 1); t.offset.set(0.345, 0); }
    texs.set(id, t);
    let im = imgs.get(key); if (!im) { im = new Image(); im.decoding = 'async'; im.src = ART[key]; imgs.set(key, im); }
    (im.complete && im.naturalWidth ? Promise.resolve() : im.decode()).then(() => { t.image = im; t.needsUpdate = true; }).catch(() => { /* 图没加载出来就算了 */ });
    return t;
  };
  const mat = (seed, tall) => {
    if (!keys.length) return null;
    const key = keys[((seed | 0) % keys.length + keys.length) % keys.length], id = key + (tall ? ':t' : ':w'); let m = mats.get(id);
    if (!m) {
      const t = tex(key, tall);
      m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: tall ? 0.03 : 0.1, roughness: tall ? 0.45 : 0.6 });
      mats.set(id, m); k.nightMats.push([m, tall ? 0.03 : 0.1, tall ? 0.18 : 1.15]);
    }
    return m;
  };
  return { wide: s => mat(s, false), tall: s => mat(s, true), mat: s => mat(s, true), dispose() { for (const t of texs.values()) t.dispose(); for (const m of mats.values()) m.dispose(); } };
}

// 雨：一大把细线段，在顶点着色器里下落（不占 CPU）
function makeRain(stage) {
  const N = 2600, pos = new Float32Array(N * 6), end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 110, y = Math.random() * 44, z = (Math.random() - 0.5) * 110; pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uCol: { value: new THREE.Color(0.75, 0.8, 0.9) } },
    vertexShader: `attribute float aEnd; uniform float uTime; uniform float uAmt; varying float vA;
      void main() { vec3 p = position; float y = mod(p.y - uTime * 24.0, 44.0); p.y = y - aEnd * 0.85; p.x += aEnd * 0.1;
        vA = (1.0 - aEnd * 0.8) * uAmt * smoothstep(44.0, 38.0, y) * step(fract(position.x * 7.31 + position.z * 3.17), uAmt * 1.2);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol, vA * 0.42); }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const lines = new THREE.LineSegments(g, mat); lines.frustumCulled = false; lines.layers.set(FX); lines.renderOrder = 5; stage.scene.add(lines);
  const off = stage.onFrame((dt, t, env) => { mat.uniforms.uTime.value = t; mat.uniforms.uAmt.value = env.rain; lines.visible = env.rain > 0.02; mat.uniforms.uCol.value.setRGB(0.75, 0.8, 0.9).multiplyScalar(1 - env.night * 0.55); });
  return { dispose() { off(); stage.scene.remove(lines); g.dispose(); mat.dispose(); } };
}

export function createOffice(container) {
  const stage = createStage(container), k = makeKit();
  const art = makeArt(k);
  stage.onFrame((dt, t, env) => { for (const m of k.nightMats) m[0].emissiveIntensity = m[1] + (m[2] - m[1]) * env.night; });   // 天黑以后：灯、屏幕、招牌、车灯亮起来
  const city = createCity(stage, k, PROPS, art.wide), room = createRoom(stage, k, PROPS, art), rain = makeRain(stage);
  let v = { mode: '' }, lastT = null, lastNight = null, titleDrift = false;
  stage.onFrame((dt, t, env) => { if (titleDrift && !env.lapse) stage.setTime(env.tod + dt * 0.11); });   // 标题页：时间缓缓流动，看一轮日落和夜景

  function sync(view) {
    const prev = v; v = { ...prev, ...view };
    const r = room.sync(view);
    if (r.rebuilt) { stage.setFrame(r.L); city.build({ region: v.region, level: v.level, L: r.L, brand: v.brand }); if (!r.up) stage.snap(); }
    const mode = v.mode === 'title' ? (v.wizard ? 'wizard' : 'title') : v.mode === 'end' ? 'end' : 'play';
    if (mode !== prev.camMode) { stage.setMode(mode); v.camMode = mode; }
    // 时间和天气
    if (mode === 'title') {
      if (prev.camMode !== 'title') { stage.setTime(16.4, prev.camMode ? 1.6 : 0, false); stage.setWeather('clear'); }
      titleDrift = true; lastT = null;
    } else if (mode === 'wizard') {
      titleDrift = false; if (prev.camMode !== 'wizard') { stage.setTime(10.2, 1.2, false); stage.setWeather('clear'); }
      lastT = null;
    } else {
      titleDrift = false;
      const t = v.t | 0, night = !!v.night;
      if (t !== lastT) { stage.setTime(todOf(v), lastT == null ? 0 : 2.8, lastT != null); stage.setWeather(weatherOf(v.region, t)); }
      else if (night !== lastNight) stage.setTime(todOf(v), 1.6, false);
      lastT = t; lastNight = night;
    }
    stage.setAlert(!!v.alert && mode === 'play');
  }
  return {
    sync,
    play(name, data) { room.play(name, data); },
    setInsets(i) { stage.setInsets(i); },
    // 画质：low / med / high / ultra；auto = 卡顿时自动降档
    setQuality(q, auto) { stage.setQuality(q, auto); },
    quality() { return { ...stage.quality(), levels: Object.entries(QUALITY).map(([id, q]) => ({ id, name: q.name })) }; },
    stats: stage.stats,
    env: stage.env,
    get busy() { return city.busy; },
    debug: { stage, city, room, k },
    dispose() { rain.dispose(); city.destroy(); room.dispose(); art.dispose(); k.dispose(); stage.dispose(); },
  };
}
