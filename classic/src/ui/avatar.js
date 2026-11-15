// 员工的 2D 头像：和 3D 沙盘里的小人用同一套长相规则（looks.js），所以头像和小人是同一个人。
import { lookOf } from '../scene/looks.js';

const HAIR_BACK = {
  long: 'M14 30Q13 9 32 9Q51 9 50 30L51 50Q45 48 44 36L20 36Q19 48 13 50Z',
  bob: 'M14 30Q13 9 32 9Q51 9 50 30L50 40Q46 42 44 37L44 26L20 26L20 37Q18 42 14 40Z',
};
const HAIR_TOP = {
  short: 'M17 27Q16 12 32 12Q48 12 47 27Q44 19 32 19Q20 19 17 27Z',
  side: 'M17 28Q15 11 32 11Q49 11 47 28Q46 21 40 19Q30 25 18 23Z',
  bun: 'M17 27Q16 12 32 12Q48 12 47 27Q44 19 32 19Q20 19 17 27Z',
  long: 'M17 27Q16 12 32 12Q48 12 47 27Q44 19 32 19Q20 19 17 27Z',
  spiky: 'M17 27L19 13L24 18L28 8L33 17L38 8L42 18L46 13L47 27Q40 19 32 19Q24 19 17 27Z',
  bob: 'M18 25Q24 15 32 16Q40 15 46 25Q40 20 32 21Q24 20 18 25Z',
  buzz: 'M18 25Q17 13 32 13Q47 13 46 25Q40 18 32 18Q24 18 18 25Z',
};
function tint(hex, t) {                       // 往白色方向调亮
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * t));
  return `rgb(${c.join(',')})`;
}

export function avatarSVG(id, role, size = 40) {
  const k = lookOf(id, role), uid = 'av' + String(id).replace(/\W/g, '');
  const body = role === 'res' ? `<path d="M25 46L32 57L39 46" fill="none" stroke="${k.trim}" stroke-width="3.2" stroke-linejoin="round"/>`
    : role === 'eng' ? `<path d="M23 47Q32 56 41 47" fill="none" stroke="${k.trim}" stroke-width="3.2" stroke-linecap="round"/>`
      : role === 'ops' ? `<circle cx="32" cy="57" r="4" fill="${k.trim}"/>`
        : `<path d="M26 46L32 55L38 46Z" fill="#fff"/><path d="M30.6 50h2.8l1.8 14h-6.4z" fill="${k.trim}"/>`;
  return `<svg class="ava" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="${uid}"><rect width="64" height="64" rx="16"/></clipPath></defs>
<g clip-path="url(#${uid})"><rect width="64" height="64" fill="${tint(k.trim, 0.76)}"/>
${HAIR_BACK[k.style] ? `<path d="${HAIR_BACK[k.style]}" fill="${k.hair}"/>` : ''}
<path d="M9 66Q9 45 32 45Q55 45 55 66Z" fill="${k.outfit}" stroke="#1e2233" stroke-width="1.6"/>${body}
<rect x="27" y="37" width="10" height="10" rx="4" fill="${k.skin}"/><circle cx="32" cy="28" r="15" fill="${k.skin}" stroke="#1e2233" stroke-width="1.6"/>
${k.style === 'bun' ? `<circle cx="32" cy="9" r="5.2" fill="${k.hair}"/>` : ''}<path d="${HAIR_TOP[k.style]}" fill="${k.hair}"/>
<circle cx="22.5" cy="33.5" r="2.7" fill="#f0a3a0" opacity=".75"/><circle cx="41.5" cy="33.5" r="2.7" fill="#f0a3a0" opacity=".75"/>
<circle cx="26.5" cy="29.5" r="1.9" fill="#22252d"/><circle cx="37.5" cy="29.5" r="1.9" fill="#22252d"/><path d="M28.5 35.5Q32 38.5 35.5 35.5" fill="none" stroke="#7a3b2e" stroke-width="1.7" stroke-linecap="round"/>
${k.glasses ? '<g fill="none" stroke="#22252d" stroke-width="1.8"><circle cx="26.5" cy="29.5" r="4.7"/><circle cx="37.5" cy="29.5" r="4.7"/><path d="M31.2 29.5h1.6"/></g>' : ''}
${k.headphones ? '<path d="M16 30Q16 9 32 9Q48 9 48 30" fill="none" stroke="#22252d" stroke-width="3"/><rect x="13" y="25" width="6" height="11" rx="3" fill="#e5484d"/><rect x="45" y="25" width="6" height="11" rx="3" fill="#e5484d"/>' : ''}
</g></svg>`;
}
