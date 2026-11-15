// 意识形态换界面的过场动画。
// 做法：换主题之前把旧界面原样复制一份盖在最上面，真界面立刻换成新主题；
// 每一帧在一张低分辨率画布上画「旧界面还剩哪些地方」，当遮罩贴到复制品上，旧界面就一块块被挖掉、露出底下的新界面。
// 火焰、扫描线、藤蔓这些特效画在再上面一层画布上。动画结束后两层都拿掉。
//   burn  共产：从屏幕中间烧开，烧穿的地方露出新界面，边缘是火舌、焦痕和往上飘的火星
//   frost 资本：一道冷色扫描线从上往下扫，扫过的地方变冷、变「科技」，边缘有数据错位的碎块
//   bloom 民社：藤蔓和玫瑰从中间长出来，一路盖过旧界面
const TAU = Math.PI * 2;
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

let running = null;
export const themeFxRunning = () => !!running;

export function playThemeFx(kind, ui) {
  const make = FX[kind];
  if (!make || !ui) return false;
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;   // 不想看动效的人：直接换
  running?.stop();
  const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 1.5);
  // 旧界面的复制品（同样的 id 才能吃到同一套样式；它不接收点击，几秒后就拿掉）
  const old = ui.cloneNode(true);
  old.classList.add('fx-old'); old.setAttribute('aria-hidden', 'true');
  for (const el of old.querySelectorAll('[data-a]')) el.removeAttribute('data-a');
  ui.after(old);
  const cv = document.createElement('canvas');
  cv.className = 'fx-canvas'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  document.body.append(cv);
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const mk = document.createElement('canvas');
  mk.width = Math.max(32, Math.ceil(W / 8)); mk.height = Math.max(18, Math.ceil(H / 8));
  const m = mk.getContext('2d'), sx = mk.width / W, sy = mk.height / H;
  for (const k of ['maskSize', 'webkitMaskSize']) old.style[k] = '100% 100%';
  for (const k of ['maskRepeat', 'webkitMaskRepeat']) old.style[k] = 'no-repeat';
  const fx = make({ W, H, ctx, m, mw: mk.width, mh: mk.height, sx, sy });
  const t0 = performance.now();
  let raf = 0, alive = true;
  const stop = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); old.remove(); cv.remove(); running = null; };
  const frame = now => {
    if (!alive) return;
    const done = fx.draw((now - t0) / 1000);
    const url = `url(${mk.toDataURL()})`;
    old.style.maskImage = url; old.style.webkitMaskImage = url;
    if (done) stop(); else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  setTimeout(stop, (fx.total + 2) * 1000);                                  // 页面藏起来时 rAF 不跑：兜底清理
  running = { stop };
  return true;
}

// 遮罩画布：先整张涂满（旧界面全在），再用 destination-out 把「已经换成新界面」的地方挖掉
function maskStart(m, mw, mh) {
  m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, mw, mh);
  m.fillStyle = '#000'; m.fillRect(0, 0, mw, mh);
  m.globalCompositeOperation = 'destination-out'; m.fillStyle = '#000';
}

const FX = {
  // ── 共产：从中间烧开 ──
  burn({ W, H, ctx, m, mw, mh, sx, sy }) {
    const cx = W / 2, cy = H * 0.47, maxR = Math.hypot(W, H) * 0.58, D = 2.7, N = 180;
    const ph = Array.from({ length: 6 }, () => Math.random() * TAU);
    const wob = (a, t) => 0.1 * Math.sin(3 * a + ph[0] + t * 1.7) + 0.06 * Math.sin(7 * a + ph[1] - t * 2.9) + 0.035 * Math.sin(13 * a + ph[2] + t * 4.3) + 0.02 * Math.sin(29 * a + ph[3] - t * 6);
    const sparks = [];
    let last = 0;
    const contour = (R, t, off = 0) => { const p = []; for (let i = 0; i <= N; i++) { const a = i / N * TAU, r = R * (1 + wob(a, t)) + off; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, a]); } return p; };
    const line = (c, p, kx = 1, ky = 1) => { c.beginPath(); p.forEach(([x, y], i) => (i ? c.lineTo(x * kx, y * ky) : c.moveTo(x * kx, y * ky))); c.closePath(); };
    return {
      total: D + 0.7,
      draw(t) {
        const dt = Math.min(0.05, t - last); last = t;
        const k = Math.min(1, t / D), R = Math.max(2, maxR * (k < 1 ? k ** 1.6 : 1) * 1.04);
        const edge = contour(R, t);
        maskStart(m, mw, mh);
        m.filter = 'blur(1px)'; line(m, edge, sx, sy); m.fill(); m.filter = 'none';
        ctx.clearRect(0, 0, W, H);
        const fade = t > D ? Math.max(0, 1 - (t - D) / 0.7) : 1;
        ctx.globalAlpha = fade;
        // 焦痕：火线外面一圈还没烧穿、但已经烤黑的旧界面
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineJoin = 'round';
        line(ctx, contour(R, t, 16)); ctx.lineWidth = 30; ctx.strokeStyle = 'rgba(28, 12, 4, .62)'; ctx.filter = 'blur(6px)'; ctx.stroke(); ctx.filter = 'none';
        // 火线：外层橙色辉光 + 中间亮黄 + 白热的芯
        ctx.globalCompositeOperation = 'lighter';
        line(ctx, edge); ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(255, 96, 16, .5)'; ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 26; ctx.stroke();
        ctx.shadowBlur = 0; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255, 190, 70, .9)'; ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 248, 220, .95)'; ctx.stroke();
        // 火舌：沿着火线往外窜
        ctx.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
          const p = edge[(Math.random() * N) | 0], a = p[2] + (Math.random() - 0.5) * 0.5, len = 10 + Math.random() * 34;
          ctx.strokeStyle = `rgba(255, ${120 + (Math.random() * 100) | 0}, 30, ${0.25 + Math.random() * 0.4})`; ctx.lineWidth = 2 + Math.random() * 4;
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(p[0] + Math.cos(a) * len * 0.6 + (Math.random() - 0.5) * 10, p[1] + Math.sin(a) * len * 0.6 - len * 0.3, p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len - len * 0.5); ctx.stroke();
        }
        // 火星：从火线上迸出来，往外、往上飘，越飘越暗
        if (k < 1) for (let i = 0; i < 9; i++) { const p = edge[(Math.random() * N) | 0], sp = 40 + Math.random() * 120; sparks.push({ x: p[0], y: p[1], vx: Math.cos(p[2]) * sp, vy: Math.sin(p[2]) * sp - 60, life: 1, r: 1 + Math.random() * 2.2 }); }
        for (const s of sparks) {
          s.x += s.vx * dt; s.y += s.vy * dt; s.vy -= 90 * dt; s.life -= dt * 0.9;
          if (s.life <= 0) continue;
          ctx.fillStyle = `rgba(255, ${170 + (s.life * 80) | 0}, 80, ${s.life})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
        }
        for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        return t > D + 0.7;
      },
    };
  },

  // ── 资本：一道冷色扫描线从上往下扫 ──
  frost({ W, H, ctx, m, mw, mh, sx, sy }) {
    const D = 1.9, rows = Array.from({ length: mw }, () => 0);
    return {
      total: D + 0.5,
      draw(t) {
        const k = Math.min(1, t / D), y = -60 + (H + 120) * easeInOut(k);
        // 遮罩：扫过的地方挖掉；边缘按列抖动，像数据还没对齐
        maskStart(m, mw, mh);
        for (let x = 0; x < mw; x += 2) {
          if (Math.random() < 0.25) rows[x] = (Math.random() - 0.35) * 5;
          m.fillRect(x, 0, 2, Math.max(0, y * sy + rows[x]));
        }
        ctx.clearRect(0, 0, W, H);
        const fade = t > D ? Math.max(0, 1 - (t - D) / 0.5) : 1;
        ctx.globalAlpha = fade;
        // 扫过的地方：一闪而过的冷色网格
        const gh = 260, g = ctx.createLinearGradient(0, y - gh, 0, y);
        g.addColorStop(0, 'rgba(90, 209, 255, 0)'); g.addColorStop(1, 'rgba(90, 209, 255, .32)');
        ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.beginPath();
        for (let gx = 0; gx <= W; gx += 24) { ctx.moveTo(gx + 0.5, Math.max(0, y - gh)); ctx.lineTo(gx + 0.5, y); }
        for (let gy = Math.floor((y - gh) / 24) * 24; gy < y; gy += 24) { ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5); }
        ctx.stroke();
        // 扫描线：青色辉光 + 白色的芯
        ctx.globalCompositeOperation = 'lighter';
        const b = ctx.createLinearGradient(0, y - 46, 0, y + 6);
        b.addColorStop(0, 'rgba(90, 209, 255, 0)'); b.addColorStop(0.75, 'rgba(110, 215, 255, .45)'); b.addColorStop(1, 'rgba(235, 250, 255, .95)');
        ctx.fillStyle = b; ctx.fillRect(0, y - 46, W, 52);
        ctx.fillStyle = 'rgba(255, 255, 255, .9)'; ctx.fillRect(0, y - 1, W, 2);
        // 错位的数据碎块
        for (let i = 0; i < 18; i++) {
          const gy = y + (Math.random() - 0.75) * 90, gx = Math.random() * W, gw = 16 + Math.random() * 220, ghh = 2 + Math.random() * 7;
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(110, 215, 255, .32)' : 'rgba(255, 255, 255, .22)'; ctx.fillRect(gx, gy, gw, ghh);
        }
        // 往下滚的数字（只是亮点，没有字）
        ctx.fillStyle = 'rgba(160, 230, 255, .5)';
        for (let i = 0; i < 40; i++) ctx.fillRect((Math.random() * W / 12 | 0) * 12, y - Math.random() * 120, 3, 6);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        return t > D + 0.5;
      },
    };
  },

  // ── 民社：藤蔓和玫瑰从中间长出来 ──
  bloom({ W, H, ctx, m, mw, mh, sx, sy }) {
    const cx = W / 2, cy = H * 0.5, D = 3.1, maxR = Math.hypot(W, H) * 0.56, vines = [];
    // 先把整棵「藤」长好（每个点记住它在第几秒长出来），播放时按时间画出来
    const grow = (x, y, a, t, depth, steps) => {
      const v = { pts: [[x, y, t]], depth, rose: depth === 0 || Math.random() < 0.55 };
      let ang = a;
      for (let i = 0; i < steps; i++) {
        ang += (Math.random() - 0.5) * 0.42 + Math.sin(i * 0.37 + depth) * 0.05;
        const st = 13 + Math.random() * 7;
        x += Math.cos(ang) * st; y += Math.sin(ang) * st; t += 0.02 + Math.random() * 0.012;
        v.pts.push([x, y, t]);
        if (depth < 2 && i > 3 && Math.random() < 0.11) grow(x, y, ang + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.7), t, depth + 1, Math.floor((steps - i) * 0.55));
      }
      vines.push(v);
    };
    const steps = Math.ceil(maxR / 16) + 4;
    for (let i = 0; i < 12; i++) grow(cx, cy, i / 10 * TAU + Math.random() * 0.4, 0.15 + Math.random() * 0.15, 0, steps);
    const leafEvery = 3;
    return {
      total: D + 0.8,
      draw(t) {
        // 遮罩：中心慢慢扩开的一圈 + 藤蔓长过的地方各自往外扩，最后整屏盖满
        maskStart(m, mw, mh);
        const R = Math.max(0, (t - 0.2) / D) ** 1.5 * maxR * 1.05;
        m.beginPath(); m.arc(cx * sx, cy * sy, R * sx, 0, TAU); m.fill();
        for (const v of vines) for (let i = 0; i < v.pts.length; i += 2) {
          const [x, y, pt] = v.pts[i];
          if (pt > t) break;
          const r = Math.min(120, (t - pt) * 150) * sx;
          m.beginPath(); m.arc(x * sx, y * sy, r, 0, TAU); m.fill();
        }
        ctx.clearRect(0, 0, W, H);
        const fade = t > D ? Math.max(0, 1 - (t - D) / 0.8) : 1;
        ctx.globalAlpha = fade;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // 藤：每根分三段一笔画完，越往外越细；带一点绿色的光，暗色界面上也看得清
        ctx.shadowColor = 'rgba(120, 220, 140, .45)'; ctx.shadowBlur = 8;
        const grown = vines.map(v => { let n = 0; while (n < v.pts.length && v.pts[n][2] <= t) n++; return n; });
        vines.forEach((v, vi) => {
          const n = grown[vi], L = v.pts.length;
          if (n < 2) return;
          ctx.strokeStyle = v.depth ? '#3f8f5a' : '#2f7a52';
          for (let c = 0; c < 3; c++) {
            const a = Math.floor(c * L / 3), b = Math.min(n, Math.floor((c + 1) * L / 3) + 1);
            if (b - a < 2) continue;
            ctx.lineWidth = Math.max(1.6, (v.depth ? 4 : 7.5) * (1 - c * 0.3));
            ctx.beginPath(); ctx.moveTo(v.pts[a][0], v.pts[a][1]);
            for (let i = a + 1; i < b; i++) ctx.lineTo(v.pts[i][0], v.pts[i][1]);
            ctx.stroke();
          }
        });
        // 叶子：长出来以后再慢慢展开（不带光，省点力气）
        ctx.shadowBlur = 0;
        vines.forEach((v, vi) => {
          for (let i = leafEvery; i < grown[vi]; i += leafEvery) {
            const [x, y, pt] = v.pts[i], [px, py] = v.pts[i - 1], a = Math.atan2(y - py, x - px) + (i % (leafEvery * 2) ? 1 : -1) * 1.1, s = Math.min(1, (t - pt) * 3);
            ctx.fillStyle = i % 3 ? '#4fa868' : '#3f8f5a';
            ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 8 * s, y + Math.sin(a) * 8 * s, 11 * s, 4.8 * s, a, 0, TAU); ctx.fill();
          }
        });
        // 玫瑰：藤长到头以后开花，外圈、内圈两层花瓣
        ctx.shadowColor = 'rgba(255, 80, 110, .5)'; ctx.shadowBlur = 8;
        for (const v of vines) {
          const tip = v.pts[v.pts.length - 1];
          if (!v.rose || tip[2] >= t) continue;
          const s = Math.min(1, (t - tip[2]) * 2.2), r = (v.depth ? 10 : 15) * s;
          for (const [k, col] of [[1, '#e0435e'], [0.62, '#c22d4a']]) {
            ctx.fillStyle = col;
            for (let p = 0; p < 5; p++) { const a = p / 5 * TAU + tip[2] * 3 + k; ctx.beginPath(); ctx.arc(tip[0] + Math.cos(a) * r * 0.55 * k, tip[1] + Math.sin(a) * r * 0.55 * k, r * 0.6 * k, 0, TAU); ctx.fill(); }
          }
          ctx.fillStyle = '#7d1a2e'; ctx.beginPath(); ctx.arc(tip[0], tip[1], r * 0.26, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        return t > D + 0.8;
      },
    };
  },
};
