// 3A 版舞台：渲染器 + HDR 后期（环境光遮蔽 / 景深 / 泛光 / 调色）+ 天空昼夜天气 + 电影镜头。
// 城市、办公室、人物都往这个舞台上摆；它只管「怎么拍」。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const FX = 1;                                                           // 特效图层：精灵、光晕、粒子放这层，不参与环境光遮蔽
export const FARL = 2;                                                         // 远景图层：远处的楼、山、海，不进遮蔽和景深的深度图（省一遍绘制）

// 画质档位：dpr 像素比上限 | msaa 抗锯齿采样 | shadow 阴影贴图 | ao 环境光遮蔽采样 | dof 景深步长（越小越细）| city 城市细节
export const QUALITY = {
  min: { name: '极简', dpr: 1, px: 0.55e6, msaa: 0, shadow: 0, ao: 0, aoRes: 0.5, dof: 0, bloom: 0.6 },
  low: { name: '流畅', dpr: 1, px: 1.0e6, msaa: 0, shadow: 2048, ao: 0, aoRes: 0.5, dof: 0, bloom: 0.8 },
  med: { name: '均衡', dpr: 1, px: 1.5e6, msaa: 2, shadow: 2048, ao: 8, aoRes: 0.5, dof: 7, bloom: 1 },
  high: { name: '高', dpr: 1.5, px: 2.1e6, msaa: 2, shadow: 4096, ao: 12, aoRes: 0.5, dof: 5, bloom: 1 },
  ultra: { name: '电影', dpr: 2, px: 4.0e6, msaa: 4, shadow: 4096, ao: 16, aoRes: 1, dof: 2.6, bloom: 1 },
};

const QUAD_VS = /* glsl */`varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 景深：按深度算弥散圆，黄金角螺旋采样；焦点落在办公室上，远处的楼和眼前的楼都会虚掉（微缩景观的关键）
const DOF_FS = /* glsl */`
uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 uPx; uniform vec4 uDof; uniform vec2 uNF; uniform float uStep; varying vec2 vUv;
float dist(vec2 uv) { float d = texture2D(tDepth, uv).x; return -(uNF.x * uNF.y) / ((uNF.y - uNF.x) * d - uNF.y); }
float coc(float d) { return clamp((abs(d - uDof.x) - uDof.y) * uDof.z / d, 0.0, uDof.w); }
void main() {
  float cd = dist(vUv), cs = coc(cd);
  vec3 col = texture2D(tDiffuse, vUv).rgb; float tot = 1.0, rad = uStep;
  for (float a = 0.0; rad < uDof.w; a += 2.39996323) {
    vec2 tc = vUv + vec2(cos(a), sin(a)) * uPx * rad;
    float sd = dist(tc), ss = coc(sd);
    if (sd > cd) ss = clamp(ss, 0.0, cs * 2.0);
    col += mix(col / tot, texture2D(tDiffuse, tc).rgb, smoothstep(rad - 0.5, rad + 0.5, ss)); tot += 1.0;
    rad += uStep / rad;
  }
  gl_FragColor = vec4(col / tot, 1.0);
}`;
// 收尾：色调映射 + 调色（分离色调、饱和度、对比度）+ 暗角 + 胶片颗粒 + 极轻微的镜头色散
const GRADE_FS = /* glsl */`
uniform sampler2D tDiffuse; uniform float uExposure; uniform vec4 uGrade; uniform vec3 uShadow; uniform vec3 uHigh; uniform float uTime; uniform float uCA; uniform float uAlert;
vec3 rrtOdt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c) {                                                            // ACES 电影色调映射（Stephen Hill 拟合）
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  return clamp(O * rrtOdt(I * (c * uExposure / 0.6)), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 d = vUv - 0.5; float r2 = dot(d, d);
  vec3 c = vec3(texture2D(tDiffuse, vUv + d * r2 * uCA).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * r2 * uCA).b);
  c = toSRGB(aces(max(c, 0.0)));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.x);                                               // 饱和度
  c = (c - 0.5) * uGrade.y + 0.5;                                              // 对比度
  c += uShadow * (1.0 - smoothstep(0.0, 0.55, l)) + uHigh * smoothstep(0.45, 1.0, l);   // 暗部偏冷、亮部偏暖
  c = mix(c, vec3(l) * vec3(1.12, 0.84, 0.82), uAlert);                        // 现金告急：画面发灰发红
  c *= 1.0 - uGrade.z * smoothstep(0.1, 0.62, r2 * 1.7);                       // 暗角
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrade.w;         // 颗粒（顺便消除色带）
  gl_FragColor = vec4(c, 1.0);
}`;
const SKY_VS = /* glsl */`varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
uniform vec3 uSun; uniform vec3 uMoon; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunCol; uniform float uNight; uniform float uCloud; uniform float uTime;
varying vec3 vDir;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir); float y = max(d.y, 0.0);
  vec3 col = mix(uHor, uZen, pow(y, 0.5));
  float sd = max(dot(d, uSun), 0.0), md = max(dot(d, uMoon), 0.0);
  col += uSunCol * (pow(sd, 1400.0) * 40.0 + pow(sd, 60.0) * 0.6 + pow(sd, 6.0) * 0.22) * (1.0 - uNight);
  col += vec3(0.75, 0.82, 1.0) * (pow(md, 2600.0) * 9.0 + pow(md, 40.0) * 0.08) * uNight;
  vec2 sp = d.xz / (d.y + 0.22);
  float st = step(0.9965, h21(floor(sp * 90.0))) * uNight * smoothstep(0.02, 0.3, d.y);                // 星星
  col += vec3(st) * (0.6 + 0.4 * sin(uTime * 2.0 + sp.x * 40.0));
  float c = fbm(sp * 1.1 + uTime * 0.006) * 0.75 + fbm(sp * 3.1 - uTime * 0.004) * 0.25;
  c = smoothstep(1.0 - uCloud, 1.22 - uCloud, c + 0.35) * smoothstep(-0.02, 0.14, d.y);
  vec3 cc = mix(uHor, vec3(1.0), 0.55) * mix(1.0, 0.12, uNight) * mix(1.0, 0.62, clamp(uCloud - 0.55, 0.0, 0.4) * 2.5) + uSunCol * pow(sd, 5.0) * 0.6 * (1.0 - uNight);
  col = mix(col, cc, c * 0.9);
  col = mix(col, uHor * 0.85, smoothstep(0.0, -0.3, d.y));                                             // 地平线以下：一片雾色
  gl_FragColor = vec4(col, 1.0);
}`;

// 天色关键帧：[太阳高度角(度), 天顶, 地平线, 日光颜色, 日光强度, 环境光强度, 曝光]
const SKYKEYS = [
  [-20, '#03050c', '#0c1226', '#8fa6ff', 0.0, 2.6, 1.55],
  [-7, '#0b1434', '#2a2752', '#8fa6ff', 0.0, 2.2, 1.45],
  [-1, '#1f3672', '#e8794e', '#ff7a3c', 0.5, 1.0, 1.2],
  [5, '#3565b4', '#ffc48c', '#ffb070', 2.4, 0.66, 1.2],
  [16, '#3d80d6', '#d6e8f8', '#ffe6c4', 3.3, 0.56, 1.16],
  [45, '#2f76d8', '#c2def6', '#fff4e2', 3.7, 0.52, 1.14],
  [90, '#2c70d4', '#bcd9f4', '#fff8ec', 3.8, 0.52, 1.14],
].map(k => [k[0], new THREE.Color(k[1]), new THREE.Color(k[2]), new THREE.Color(k[3]), k[4], k[5], k[6]]);
const WEATHER = { clear: [0.3, 0, 0, 1], cloudy: [0.62, 0, 0, 0.8], overcast: [0.95, 0, 0.1, 0.45], rain: [1.0, 1, 1, 0.34], fog: [0.75, 0, 0.25, 0.55] };   // [云量, 雨, 地面湿度, 直射光系数]

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; renderer.info.autoReset = false;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(22, 1, 20, 2400);
  cam.layers.enableAll();
  const st = {
    w: 1, h: 1, pr: 1, t: 0, q: 'high', qAuto: true, mode: 'title', frame: { W: 16, D: 11.5, H: 3.6 }, insets: { left: 0, right: 0, top: 0, bottom: 0 },
    az: Math.PI / 4, azUser: 0, zoom: 1, el: 0.6, fov: 22, upp: 0, snap: true, shake: 0, alert: 0, alertT: 0,
    tod: 10, todFrom: 10, todTo: 10, lapse: 0, lapseDur: 0, weather: 'clear', wx: [0.3, 0, 0, 1], dist: 200,
  };
  const GPU = (() => {
    const g = renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info'), raw = String((ext && g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || g.getParameter(g.RENDERER) || '');
    const soft = /SwiftShader|llvmpipe|Microsoft Basic|software/i.test(raw);
    const name = soft ? '软件渲染（没用上显卡）' : raw.replace(/^ANGLE \([^,]*,\s*/, '').replace(/^ANGLE Metal Renderer:\s*/i, '').replace(/\s*\(0x[0-9a-f]+\)/i, '').replace(/\s+(Direct3D|OpenGL|Vulkan|Metal).*$/i, '').replace(/,.*$/, '').trim() || raw || '未知显卡';
    const igpu = soft || (/Intel|Radeon\(TM\)|Radeon Graphics|Radeon Vega|Vega \d|UHD|Iris|Mali|Adreno|PowerVR/i.test(raw) && !/RTX|GTX|Quadro|Radeon RX|Radeon Pro|Arc\(TM\) [AB]\d|Arc [AB]\d/i.test(raw));
    return { name, raw, igpu, soft };
  })();
  let saved = false;
  try { const s = JSON.parse(localStorage.getItem('ldt_gfx_v2') || 'null'); if (s && QUALITY[s.q] && s.gpu === GPU.name) { st.q = s.q; st.qAuto = !!s.auto; saved = true; } } catch { /* 读不到就用默认档 */ }
  if (!saved && GPU.igpu) st.q = GPU.soft ? 'min' : 'low';

  // ── 天空、日月、环境光 ──
  const U = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(-0.4, 0.75, -0.5).normalize() }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uNight: { value: 0 }, uCloud: { value: 0.3 }, uTime: { value: 0 } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat); dome.scale.setScalar(1800); dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);
  const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(dome.geometry, skyMat));
  let envRT = null, envTod = -99, envWx = '', envAt = -9;
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(0xcfe6f7, 300, 900);
  const env = { night: 0, tod: 10, sunDir: new THREE.Vector3(0, 1, 0), sunI: 3, wet: 0, rain: 0, cloud: 0.3, hor: new THREE.Color(), zen: new THREE.Color(), lapse: false };
  const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();
  const nightMats = [];                                                       // [材质, 白天强度, 夜晚强度]，由工具箱登记
  function skyUpdate(dt, force) {
    // 时间：平时不动；翻月时快进一整天
    if (st.lapse > 0) { st.lapse = Math.max(0, st.lapse - dt); const u = 1 - st.lapse / st.lapseDur, e = u * u * (3 - 2 * u); st.tod = (st.todFrom + (st.todTo - st.todFrom) * e) % 24; }
    env.lapse = st.lapse > 0;
    const W = WEATHER[st.weather] || WEATHER.clear, kw = force ? 1 : 1 - Math.exp(-dt * 0.9);
    for (let i = 0; i < 4; i++) st.wx[i] = lerp(st.wx[i], W[i], kw);
    // 艺术化的太阳轨迹：早上从右前方照过来，傍晚落到左后方（逆光金边）
    const f = (st.tod - 6) / 12.5, day = f >= 0 && f <= 1, az = lerp(1.3, -1.45, clamp(f, 0, 1)), elev = day ? Math.pow(Math.sin(Math.PI * f), 0.8) * 64 : -Math.min(30, (f < 0 ? -f : f - 1) * 12.5 * 9);
    const er = Math.max(elev, 2) * Math.PI / 180;
    env.sunDir.set(Math.sin(az) * Math.cos(er), Math.sin(er), Math.cos(az) * Math.cos(er));
    let i = 0; while (i < SKYKEYS.length - 2 && elev > SKYKEYS[i + 1][0]) i++;
    const A = SKYKEYS[i], B = SKYKEYS[i + 1], u = smooth(A[0], B[0], elev), n = smooth(3, -7, elev), ov = clamp((st.wx[0] - 0.55) / 0.45, 0, 1);
    cA.copy(A[1]).lerp(B[1], u); cB.copy(A[2]).lerp(B[2], u); cC.copy(A[3]).lerp(B[3], u);
    const grey = cC.set(0x8d99a8).multiplyScalar(lerp(1, 0.07, n));                                    // 阴雨天：天色发灰
    cA.lerp(grey, ov * 0.85); cB.lerp(grey, ov * 0.7); cC.copy(A[3]).lerp(B[3], u);
    env.night = n; env.tod = st.tod; env.sunI = lerp(A[4], B[4], u) * st.wx[3]; env.wet = st.wx[2]; env.rain = st.wx[1]; env.cloud = st.wx[0]; env.zen.copy(cA); env.hor.copy(cB);
    U.uSun.value.copy(env.sunDir); U.uZen.value.copy(cA); U.uHor.value.copy(cB); U.uSunCol.value.copy(cC); U.uNight.value = n; U.uCloud.value = st.wx[0]; U.uTime.value = st.t;
    // 白天是太阳，入夜后同一盏灯改当月亮（切换发生在亮度为零的那一刻，看不出来）
    const moon = n > 0.6, dir = moon ? U.uMoon.value : env.sunDir;
    sun.color.copy(moon ? cC.set(0x9db6ff) : cC); sun.intensity = moon ? 0.55 * smooth(0.6, 1, n) : env.sunI * (1 - smooth(0.25, 0.6, n));
    const e = Math.max(st.frame.W, st.frame.D) * 0.75 + 30, sc = sun.shadow.camera;
    sun.position.copy(dir).multiplyScalar(260); sun.target.position.set(0, 0, 0);
    if (sc.right !== e) { sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix(); }
    scene.environmentIntensity = lerp(A[5], B[5], u) * lerp(1, 1.25, ov);
    renderer.toneMappingExposure = lerp(A[6], B[6], u);
    scene.fog.color.copy(cB).lerp(cA, 0.25);
    for (const m of nightMats) m[0].emissiveIntensity = lerp(m[1], m[2], n);
    // 环境反射贴图：天色变了才重烤，翻月快进时每隔几帧烤一次
    if (force || ((Math.abs(st.tod - envTod) > (st.lapse > 0 ? 0.5 : 0.12) || st.weather !== envWx) && st.t - envAt > 0.12)) {
      const rt = pm.fromScene(envScene, 0, 0.1, 10); scene.environment = rt.texture; envRT?.dispose(); envRT = rt; envTod = st.tod; envWx = st.weather; envAt = st.t;
    }
  }

  // ── 后期管线 ──
  let composer = null, gtao = null, bloom = null, dof = null, grade = null;
  const fnPass = fn => { const p = new Pass(); p.needsSwap = false; p.render = fn; return p; };
  const rawPass = (fs, uniforms) => new ShaderPass(new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, ...uniforms }, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false }));
  function buildPipeline() {
    const Q = QUALITY[st.q];
    composer?.dispose(); gtao?.dispose?.(); bloom?.dispose?.();
    st.pr = Math.max(0.5, Math.min(globalThis.devicePixelRatio || 1, Q.dpr, Math.sqrt(Q.px / (st.w * st.h))));
    renderer.setPixelRatio(st.pr); renderer.setSize(st.w, st.h, false);
    const W = Math.max(2, Math.round(st.w * st.pr)), H = Math.max(2, Math.round(st.h * st.pr));
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Q.msaa }));
    composer.addPass(new RenderPass(scene, cam));
    gtao = null; dof = null;
    if (Q.ao) {
      gtao = new GTAOPass(scene, cam, W, H);
      gtao.updateGtaoMaterial({ radius: 1.5, distanceExponent: 1.4, thickness: 1.4, distanceFallOff: 1, scale: 1.25, samples: Q.ao, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.4, rings: 2, samples: 12 });
      gtao.blendIntensity = 0.9;
      composer.addPass(fnPass(() => cam.layers.set(0))); composer.addPass(gtao); composer.addPass(fnPass(() => cam.layers.enableAll()));
      if (Q.aoRes < 1) gtao.setSize(Math.round(W * Q.aoRes), Math.round(H * Q.aoRes));
      if (Q.dof) { dof = rawPass(DOF_FS, { tDepth: { value: gtao.depthTexture }, uPx: { value: new THREE.Vector2(1 / W, 1 / H) }, uDof: { value: new THREE.Vector4(200, 16, 60, 14) }, uNF: { value: new THREE.Vector2(20, 2400) }, uStep: { value: Q.dof } }); composer.addPass(dof); }
    }
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.7, 1.0); composer.addPass(bloom);
    grade = rawPass(GRADE_FS, { uExposure: { value: 1 }, uGrade: { value: new THREE.Vector4(1.1, 1.06, 0.34, 0.035) }, uShadow: { value: new THREE.Vector3(-0.012, 0.0, 0.02) }, uHigh: { value: new THREE.Vector3(0.02, 0.008, -0.02) }, uTime: { value: 0 }, uCA: { value: 0.012 }, uAlert: { value: 0 } });
    composer.addPass(grade);
    sun.castShadow = Q.shadow > 0; if (Q.shadow) sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null;
    st.snap = true;
  }
  function setQuality(q, auto = false) { if (!QUALITY[q]) return; st.q = q; st.qAuto = auto; warm = 0; slow = 0; try { localStorage.setItem('ldt_gfx_v2', JSON.stringify({ q, auto, gpu: GPU.name })); } catch { /* 存不了就算了 */ } buildPipeline(); }

  // ── 镜头：长焦俯拍。play 是经营视角，title 压低机位露出天际线，wizard 介于两者之间 ──
  const MODES = { play: { el: 0.6, fov: 22, zoom: 1, orbit: 0.012 }, title: { el: 0.34, fov: 28, zoom: 0.76, orbit: 0.4 }, wizard: { el: 0.5, fov: 24, zoom: 0.92, orbit: 0.3 }, end: { el: 0.45, fov: 24, zoom: 0.8, orbit: 0.35 } };
  const tgt = new THREE.Vector3();
  function camUpdate(dt) {
    const M = MODES[st.mode] || MODES.play, L = st.frame, i = st.insets, fw = Math.max(160, st.w - i.left - i.right), fh = Math.max(160, st.h - i.top - i.bottom);
    const k = st.snap ? 1 : 1 - Math.exp(-dt * 2.6);
    st.el = lerp(st.el, M.el, k); st.fov = lerp(st.fov, M.fov, k);
    const diag = Math.hypot(L.W + 6, L.D + 6), ph = diag * Math.sin(st.el) + (L.H + 3.4) * Math.cos(st.el);
    const upp = Math.max(diag / fw, ph / fh) / 0.9 / (st.zoom * M.zoom);          // 每像素多少米
    st.upp = st.snap || !st.upp ? upp : lerp(st.upp, upp, 1 - Math.exp(-dt * 5)); st.snap = false;
    const az = st.az + st.azUser + Math.sin(st.t * (M.orbit > 0.1 ? 0.07 : 0.25)) * M.orbit;
    st.azNow = az; st.dist = st.upp * st.h / (2 * Math.tan(st.fov * Math.PI / 360));
    const sh = st.shake > 0 ? st.shake * 0.5 : 0; st.shake = Math.max(0, st.shake - dt * 1.6);
    tgt.set(0, L.H * 0.3 + (st.mode === 'title' ? 5 : 0), 0);
    cam.position.set(tgt.x + Math.sin(az) * Math.cos(st.el) * st.dist + (Math.random() - 0.5) * sh, tgt.y + Math.sin(st.el) * st.dist + (Math.random() - 0.5) * sh, tgt.z + Math.cos(az) * Math.cos(st.el) * st.dist);
    cam.lookAt(tgt); cam.fov = st.fov; cam.aspect = st.w / st.h; cam.near = Math.max(8, st.dist * 0.2); cam.far = 2400;
    cam.setViewOffset(st.w, st.h, -(i.left - i.right) / 2, -(i.top - i.bottom) / 2, st.w, st.h); cam.updateProjectionMatrix();
    dome.position.copy(cam.position);
    scene.fog.near = st.dist + lerp(60, 10, st.wx[2] > 0.2 && st.weather === 'fog' ? 1 : 0); scene.fog.far = st.dist + lerp(620, 230, clamp(st.wx[0] - 0.5, 0, 0.5) * 2);
  }
  let drag = null;
  const el = renderer.domElement;
  const onDown = e => { drag = { x: e.clientX, az: st.azUser }; el.setPointerCapture?.(e.pointerId); };
  const onMove = e => { if (drag) st.azUser = clamp(drag.az - (e.clientX - drag.x) * 0.005, -1.25, 1.25); };
  const onUp = () => { drag = null; };
  const onWheel = e => { e.preventDefault(); st.zoom = clamp(st.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 2.2); };
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('wheel', onWheel, { passive: false });
  function resize() { st.w = Math.max(1, container.clientWidth); st.h = Math.max(1, container.clientHeight); buildPipeline(); }
  const ro = new ResizeObserver(() => { if (container.clientWidth !== st.w || container.clientHeight !== st.h) resize(); }); ro.observe(container); resize();

  // ── 每帧 ──
  const subs = []; let raf = 0, last = performance.now(), dead = false, ms = 16, slow = 0, frames = 0, query = null, fast = 16, warm = 0;
  const stats = { fps: 60, ms: 16, cpu: 0, gpu: 0, calls: 0, tris: 0 };
  const gl = renderer.getContext(), tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  function frame(now) {
    if (dead) return; raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    tick(now);
  }
  function tick(now) {
    const raw = (now - last) / 1000, dt = Math.max(0, Math.min(0.05, raw)), c0 = performance.now(); last = now; st.t += dt; frames++;
    let timing = null;
    if (tq) {
      if (query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) stats.gpu = lerp(stats.gpu, gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6, 0.2); gl.deleteQuery(query); query = null; }
      if (!query) { timing = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, timing); }
    }
    skyUpdate(dt, false); camUpdate(dt);
    for (const f of subs) f(dt, st.t, env);
    st.alert = damp(st.alert, st.alertT, 2, dt);
    const n = env.night, Q = QUALITY[st.q];
    bloom.strength = lerp(0.32, 0.6, n) * Q.bloom; bloom.threshold = lerp(1.0, 0.92, n); bloom.radius = 0.72;
    if (dof) { const r = Math.hypot(st.frame.W, st.frame.D) * 0.5 + 5, px = st.h * st.pr / 1080; dof.uniforms.uDof.value.set(st.dist, r, (st.mode === 'title' ? 34 : 62) * px, (st.mode === 'title' ? 9 : 13) * px); dof.uniforms.uNF.value.set(cam.near, cam.far); }
    const g = grade.uniforms; g.uExposure.value = renderer.toneMappingExposure; g.uTime.value = st.t; g.uAlert.value = st.alert * 0.4;
    g.uGrade.value.set(lerp(1.1, 1.16, n), lerp(1.06, 1.1, n), lerp(0.34, 0.46, n), 0.035);
    renderer.info.reset(); composer.render(dt);
    if (timing) { gl.endQuery(tq.TIME_ELAPSED_EXT); query = timing; }
    stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles;
    ms = lerp(ms, raw * 1000, 0.05); stats.ms = ms; stats.fps = 1000 / ms; stats.cpu = lerp(stats.cpu, performance.now() - c0, 0.1);
    // 自动降档：连续两秒明显掉帧就降一档（只在自动模式下）
    const real = Math.min(Math.max(raw, 0), 0.5); warm += real; fast = lerp(fast, raw * 1000, 0.25);
    if (st.qAuto && warm > 3) {
      const lag = tq && stats.gpu > 0 ? stats.gpu > 18 || stats.cpu > 24 : fast > 45;
      slow = lag ? slow + real : Math.max(0, slow - real);
      if (slow > 1.2) { const order = ['ultra', 'high', 'med', 'low', 'min'], j = order.indexOf(st.q); if (j >= 0 && j < order.length - 1) setQuality(order[j + 1], true); slow = 0; warm = 0; }
    }
  }
  raf = requestAnimationFrame(frame);

  const hashT = (t, s) => { let h = Math.imul((t * 73856093) ^ (s * 19349663), 2654435761); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  return {
    THREE, renderer, scene, cam, env, st, stats, nightMats, hashT,
    onFrame(f) { subs.push(f); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; },
    fx(o) { o.traverse(x => x.layers.set(FX)); return o; },
    setFrame(L) { if (L.W !== st.frame.W || L.D !== st.frame.D || L.H !== st.frame.H) { st.frame = { W: L.W, D: L.D, H: L.H }; } },
    setMode(m) { if (MODES[m] && m !== st.mode) { st.mode = m; } },
    snap() { st.snap = true; },
    setInsets(i) { const n = { left: i.left || 0, right: i.right || 0, top: i.top || 0, bottom: i.bottom || 0 }, o = st.insets; if (n.left !== o.left || n.right !== o.right || n.top !== o.top || n.bottom !== o.bottom) st.insets = n; },
    // 设定时间（小时）。lapse 给秒数就播一段延时摄影：从现在快进一整天再停到目标时间
    setTime(h, lapse = 0, full = true) { h = ((h % 24) + 24) % 24; if (lapse > 0) { st.todFrom = st.tod; const d = (h - st.tod + 24) % 24; st.todTo = st.tod + d + (full && d < 12 ? 24 : 0); st.lapse = st.lapseDur = lapse; } else if (st.lapse <= 0) st.tod = h; else st.todTo = st.todFrom + ((h - st.todFrom + 24) % 24) + 24; },
    setWeather(w) { if (WEATHER[w]) st.weather = w; },
    setAlert(on) { st.alertT = on ? 1 : 0; },
    shake(a) { st.shake = Math.max(st.shake, a); },
    setQuality, quality: () => ({ q: st.q, auto: st.qAuto, gpu: GPU.name, igpu: GPU.igpu }),
    refreshSky() { skyUpdate(0, true); },
    // 调试用：页面在后台时 requestAnimationFrame 不跑，可以手动推一帧
    debug: { get composer() { return composer; }, get gtao() { return gtao; }, get dof() { return dof; }, get bloom() { return bloom; }, sun, step(dt = 1 / 60) { tick(last + dt * 1000); } },
    dispose() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('wheel', onWheel);
      composer?.dispose(); gtao?.dispose?.(); bloom?.dispose?.(); envRT?.dispose(); pm.dispose(); dome.geometry.dispose(); skyMat.dispose(); sun.shadow.map?.dispose(); renderer.dispose(); el.remove();
    },
  };
}
