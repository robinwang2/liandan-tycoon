import { tr } from '../i18n/index.js';
// Original, hand-drawn 64-unit silhouettes. No fonts, external assets or DOM.
export const BRAND_COLORS = ['#ff6b4a', '#3478db', '#168577', '#8555c6', '#d74482', '#bd841d', '#53677f', '#76952d'];

const safeColor = color => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color) ? color : BRAND_COLORS[0];
const darken = color => {
  const hex = color.length === 4 ? [...color.slice(1)].map(c => c + c).join('') : color.slice(1);
  return '#' + hex.match(/../g).map(c => Math.round(parseInt(c, 16) * .48).toString(16).padStart(2, '0')).join('');
};
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const ring = (count, draw, offset = 0) => Array.from({ length: count }, (_, i) => `<g transform="rotate(${offset + i * 360 / count} 32 32)">${draw(i)}</g>`).join('');
const dot = (x, y, r, color) => path(`M${x-r} ${y}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`, color);
const mark = (id, name, desc, artwork) => ({ id, get name() { return tr(name); }, get desc() { return tr(desc); }, draw(color) {
  const c = safeColor(color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${tr(name)}">${artwork(c, darken(c))}</svg>`;
} });

export const LOGOS = {
  sz: [
    mark('whale', '鲸鱼', '深度思考，偶尔搁浅', (c, d) =>
      path('M6 34C6 23 15 17 27 19C38 20 40 30 46 32C50 29 48 21 46 17C52 16 56 20 56 24C58 20 61 19 62 20C62 31 57 40 47 44C32 53 6 51 6 34Z', c) +
      path('M12 39C23 47 40 44 46 39C35 42 24 40 20 36Z', '#fff') +
      path('M29 35C31 41 35 44 40 43C40 37 36 34 29 35Z', d) + dot(17, 30, 2.4, d)),
    mark('panda', '熊猫', '靠脸融资，靠竹续命', (c, d) =>
      path('M11 24C1 18 5 6 14 7C19 7 23 10 24 14H40C43 6 54 4 58 12C61 18 57 24 53 25C60 46 47 57 32 57C14 57 3 44 11 24Z', c) +
      path('M15 29C15 18 24 15 32 16C43 15 50 23 50 34C50 46 41 51 32 51C21 51 14 43 15 29Z', '#fff') +
      path('M19 28C23 23 30 26 28 32C26 39 19 40 17 35C16 33 17 30 19 28ZM45 28C49 32 48 37 44 38C39 39 35 30 38 27C40 25 43 26 45 28Z', d) +
      path('M27 41Q32 38 37 41Q36 46 32 47Q28 46 27 41Z', c)),
    mark('shiba', '柴犬', '忠于愿景，服从饭点', (c, d) =>
      path('M11 30L12 8Q12 5 16 8L27 19Q33 17 39 19L49 8Q52 5 53 9L55 32C57 47 44 56 32 57C19 55 7 46 11 30Z', c) +
      path('M16 14L23 23L16 25ZM48 14L42 23L49 25Z', d) +
      path('M13 35Q21 34 26 40Q32 34 38 40Q44 34 53 35C51 46 41 52 32 52C22 51 15 45 13 35Z', '#fff') +
      path('M27 38Q32 35 37 38L33 43Q32 44 31 43Z', d) + dot(23, 30, 2, d) + dot(42, 30, 2, d)),
    mark('cat', '橘猫', '九条命，八轮融资', (c, d) =>
      path('M20 9Q20 6 23 9L30 16Q34 14 38 16L45 9Q48 6 48 11V25Q48 33 41 36L44 47H49Q55 47 55 41C55 37 61 37 61 42C61 52 55 57 45 57H20C10 57 6 50 8 42C10 35 16 31 23 31C18 26 18 20 20 9Z', c) +
      path('M25 27Q34 31 43 27Q41 35 34 36Q27 34 25 27Z', '#fff') +
      path('M18 43Q16 51 26 51H40', 'none', `stroke="${d}" stroke-width="4" stroke-linecap="round"`) +
      path('M30 17L31 22M37 17L36 22', 'none', `stroke="${d}" stroke-width="3" stroke-linecap="round"`)),
    mark('goose', '大鹅', '对外开源，对内开咬', (c, d) =>
      path('M7 38C14 44 28 40 30 29L31 17C31 10 35 6 42 6C49 6 53 10 52 16L49 23L44 22L44 34C44 48 35 56 23 55C13 54 7 47 7 38Z', c) +
      path('M50 14L61 18Q62 20 59 21L49 22Z', d) +
      path('M16 44Q29 48 35 37Q30 50 21 50Z', '#fff') + dot(44, 14, 2, d)),
    mark('ox', '牛', '牛马精神，股东回报', (c, d) =>
      path('M20 24C10 26 4 20 5 8C9 15 14 17 20 15Q32 10 44 15C50 17 55 15 59 8C60 20 54 26 44 24L46 40C47 51 39 57 32 57C23 57 16 50 18 40Z', c) +
      path('M20 38Q32 32 44 38L45 43Q45 51 32 52Q19 51 19 43Z', d) +
      path('M22 27L28 30M42 27L36 30', 'none', 'stroke="#fff" stroke-width="3.5" stroke-linecap="round"') + dot(27, 43, 2, '#fff') + dot(37, 43, 2, '#fff')),
    mark('dragon', '龙', '算力腾云，营收驾雾', (c, d) =>
      path('M15 13L26 17L33 8L35 18L45 16L42 22L56 26Q59 27 57 31L52 39L39 34C29 31 22 35 23 42C24 49 36 49 38 42C39 38 43 37 47 40C52 48 42 57 30 57C15 57 7 48 10 37C12 29 20 25 29 26L23 22Z', c) +
      path('M39 25L46 27L41 30Z', '#fff') +
      path('M12 38L5 35L10 45L5 47L15 51C11 47 10 43 12 38Z', d) +
      path('M50 33L54 34L52 37Z', d)),
    mark('capybara', '水豚', '情绪稳定，融资无望', (c, d) =>
      path('M9 47L9 30C9 21 14 17 21 16C20 9 28 7 31 13L33 17L46 18C54 18 58 23 58 31L58 43Q58 49 51 49H35L30 56H15Q9 56 9 47Z', c) +
      path('M36 35H57V43Q57 48 50 48H36Q31 44 36 35Z', d) +
      path('M26 27H33', 'none', `stroke="${d}" stroke-width="3.5" stroke-linecap="round"`) + dot(51, 39, 1.8, '#fff') +
      path('M17 48V53M24 48V53', 'none', `stroke="${d}" stroke-width="3" stroke-linecap="round"`)),
  ],
  bay: [
    // 湾区 AI 公司的 Logo 都是「一个圆，稍微变个形」——网友统称菊花。这里是同一类型的原创图形，不临摹任何现实商标
    mark('orb_burst', '星芒', '思想的火花。网友：菊花', c =>
      ring(10, i => path(i % 2 ? 'M29.2 24.5L32 12L34.8 24.5Z' : 'M28.4 23.5L32 3L35.6 23.5Z', c)) + dot(32, 32, 4.8, c)),
    mark('orb_knot', '结环', '环环相扣，谁也别想走', c =>
      ring(3, () => path('M32 8.5a12.5 12.5 0 1 0 .01 0Z', 'none', `stroke="${c}" stroke-width="5.4"`))),
    mark('orb_star', '四芒星', '全行业都在用的那颗星', (c, d) =>
      path('M28 12C30 26 37 33 51 35C37 37 30 44 28 58C26 44 19 37 5 35C19 33 26 26 28 12Z', c) + path('M49 4C50 11 53 14 60 15C53 16 50 19 49 26C48 19 45 16 38 15C45 14 48 11 49 4Z', d)),
    mark('orb_slash', '斜环', '一刀两断，据说很酷', (c, d) =>
      path('M32 11a21 21 0 1 0 .01 0Z', 'none', `stroke="${c}" stroke-width="6.5" stroke-dasharray="52 14" stroke-dashoffset="-58"`) +
      path('M10 58L54 6', 'none', `stroke="${d}" stroke-width="6.5" stroke-linecap="round"`)),
    mark('orb_rings', '同心环', '以用户为中心，画了三圈', (c, d) =>
      path('M32 6a26 26 0 1 0 .01 0Z', 'none', `stroke="${c}" stroke-width="5"`) + path('M32 17a15 15 0 1 0 .01 0Z', 'none', `stroke="${c}" stroke-width="5"`) + dot(37, 27, 5.5, d)),
    mark('orb_aperture', '光圈', '聚焦未来，暂不对焦', (c, d) =>
      ring(7, () => path('M18 9Q27 3 37 6L44 24L32 21Z', c) + path('M37 6L44 24L39 23L33 7Z', d))),
    mark('orb_spiral', '旋涡', '愿景在转，收入没转', c =>
      ring(5, () => path('M30 27C20 22 18 10 30 5C16 4 7 18 14 30C18 36 23 37 27 35C24 32 26 28 30 27Z', c))),
    mark('orb_dots', '点阵环', '看着像加载中，确实也是', c =>
      ring(12, i => dot(32, 8.5, 2 + i * 0.3, c))),
  ],
};

// 旧版本的 Logo id 对应到新的
const ALIAS = { daisy_classic: 'orb_burst', daisy_spiral: 'orb_spiral', daisy_six: 'orb_knot', daisy_pixel: 'orb_dots', daisy_origami: 'orb_star', daisy_minimal: 'orb_slash', daisy_aperture: 'orb_aperture', daisy_ink: 'orb_rings' };
export function findLogo(id) { return [...LOGOS.sz, ...LOGOS.bay].find(logo => logo.id === (ALIAS[id] || id)); }

// Unknown IDs deliberately fall back to the first mark, including old saves.
export function logoSVG(id, color, size = 48) {
  const dimension = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 48;
  return (findLogo(id) || LOGOS.sz[0]).draw(color).replace('width="64" height="64"', `width="${dimension}" height="${dimension}"`);
}

export function logoDataURL(id, color) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(logoSVG(id, color, 256));
}
