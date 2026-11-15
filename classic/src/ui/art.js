// 事件背景图库：src/assets/art/*.webp，打包时会被内联进单文件
const files = import.meta.glob('../assets/art/*.webp', { eager: true, query: '?url', import: 'default' });
export const ART = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.match(/([\w-]+)\.webp$/)[1], url]));
export const artURL = key => ART[key] || ART.boardroom || Object.values(ART)[0] || '';

// 结局画面用的图
export const ENDING_ART = {
  ipo: 'bell', agi_good: 'awakening', agi_bad: 'awakening', acquired: 'handshake', sellout: 'headhunt', giant: 'launch', unicorn: 'pitch',
  small: 'party', zombie: 'office_night', bankrupt: 'crash', jail: 'police', ousted: 'boardroom', banned: 'ministry',
};
