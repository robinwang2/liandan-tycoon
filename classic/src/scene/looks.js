// 小人的长相：由 id 稳定生成。3D 沙盘里的小人和界面上的 2D 头像共用这一套，所以两边长得一样。
export const SKINS = ['#f7d6b8', '#efc49c', '#dba878', '#bb8257', '#8e5b3d'];
export const HAIRS = ['#1f1a17', '#3b2a20', '#5a3b22', '#7a5a35', '#a9a39b', '#c8553d', '#2d3a5a'];
export const HAIR_STYLES = ['short', 'side', 'bun', 'long', 'spiky', 'bob', 'buzz'];
// 各岗位的衣服：主色 + 点缀色
export const ROLE_OUTFIT = { res: '#f4f4f8', eng: '#3d8bff', ops: '#ff9736', biz: '#2f3a55', legal: '#8a93a6' };
export const ROLE_TRIM = { res: '#8e6bff', eng: '#2a5fb8', ops: '#d9701a', biz: '#c9a24a', legal: '#d1495b' };
export const FOUNDER_OUTFITS = { turtleneck: '#1d2026', hoodie: '#8b929c', plaid: '#c8402f', suit: '#27324d' };

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function lookOf(id, role = 'eng') {
  const h = hash(String(id)), pick = (n, shift) => (h >>> shift) % n;
  return {
    role, skin: SKINS[pick(5, 0)], hair: HAIRS[pick(7, 3)], style: HAIR_STYLES[pick(7, 7)],
    glasses: pick(10, 11) < 3, headphones: role === 'eng' && pick(10, 15) < 4,
    outfit: ROLE_OUTFIT[role] || ROLE_OUTFIT.eng, trim: ROLE_TRIM[role] || ROLE_TRIM.eng,
  };
}
