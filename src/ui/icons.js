// Original 24 × 24 line drawings. Insertion order follows docs/codex-icons.md.
// Geometry stays inside the two-pixel safe area, including the 1.75px stroke.
export const ICONS = {
  // Top bar and metrics.
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10V14M18 10V14"/>',
  valuation: '<path d="M4 4V20H20M7 15L11 11L14 13L20 6M15 6H20V11"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20V18C3 14 15 14 15 18V20M16 5C20 5 20 11 16 11M18 15C20 15 21 17 21 20"/>',
  trophy: '<path d="M7 4H17V9C17 16 7 16 7 9ZM7 6H3V8C3 11 5 12 8 12M17 6H21V8C21 11 19 12 16 12M12 14V20M8 20H16"/>',
  pie: '<path d="M10 3C6 3 3 7 3 12C3 17 7 21 12 21C17 21 21 18 21 14H10ZM14 3V10H21C20 6 18 4 14 3Z"/>',
  calendar: '<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 3V8M16 3V8M4 11H20M8 15H10M14 15H16M8 18H10"/>',
  next: '<path d="M6 4L16 12L6 20ZM20 5V19"/>',
  ap: '<path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5ZM13 7L9 12H14L11 17"/>',
  flame: '<path d="M13 3C14 8 19 9 19 14C19 18 16 21 12 21C8 21 5 18 5 14C5 11 7 9 8 8C8 11 10 12 11 11C13 9 11 6 13 3Z"/><path d="M12 15C10 17 10 18 12 19"/>',
  star: '<path d="M12 3L14.8 8.8L21 9.7L16.5 14.1L17.6 20.5L12 17.5L6.4 20.5L7.5 14.1L3 9.7L9.2 8.8Z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 10H8.5M15.5 10H16M8 15Q12 19 16 15"/>',
  bank: '<path d="M3 8L12 3L21 8ZM5 11V17M12 11V17M19 11V17M4 20H20"/>',
  bubble: '<circle cx="9" cy="14" r="6"/><circle cx="17.5" cy="6.5" r="3.5"/><circle cx="19" cy="18" r="2"/>',
  bomb: '<circle cx="10.5" cy="14" r="6.5"/><path d="M14 8L16 6L18 8L16 10M17 7Q21 6 19 3M14 3L15 4M21 11H20"/>',

  // Right tabs.
  board: '<path d="M3 20V12H9V6H15V14H21V20ZM9 12V20M15 14V20M11 3H13"/>',
  pin: '<path d="M8 3H16L15 9L18 13V15H6V13L9 9ZM12 15V21"/>',
  team: '<circle cx="12" cy="6" r="3"/><path d="M7 15V13C7 10 17 10 17 13V15M4 10C3 10 3 14 5 14M20 10C21 10 21 14 19 14M3 21V19C3 16 9 16 9 19V21M15 21V19C15 16 21 16 21 19V21"/>',
  safe: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="13" cy="12" r="4"/><path d="M13 8V10M13 14V16M9 12H11M15 12H17M6 8V16"/>',
  cards: '<path d="M6 17H5Q3 17 3 15V5Q3 3 5 3H15Q17 3 17 5V6"/><rect x="7" y="7" width="14" height="14" rx="2"/><path d="M14 10L17 14L14 18L11 14Z"/>',
  ledger: '<path d="M5 3H19V21L15.5 19L12 21L8.5 19L5 21ZM8 7H16M8 11H16M8 15H12"/>',
  news: '<path d="M17 7H21V18Q21 20 19 20H5Q3 20 3 18V4H17V17M17 20V17"/><rect x="6" y="7" width="7" height="5" rx="1"/><path d="M6 16H13"/>',

  // Left tabs.
  flask: '<path d="M8 3H16M10 3V9L4 18Q3 21 6 21H18Q21 21 20 18L14 9V3M7 14H17"/><circle cx="11" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  people: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20V17C3 13 13 13 13 17V20M16 15C19 14 21 16 21 18V20"/>',
  coins: '<path d="M3 7C3 3 16 3 16 7C16 11 3 11 3 7ZM3 7V12C3 15 10 16 13 14M3 12V17C3 20 10 21 13 19M16 7V10"/><path d="M14 14C14 11 21 11 21 14C21 17 14 17 14 14ZM14 14V19C14 21 21 21 21 19V14"/>',
  megaphone: '<path d="M4 9H9L18 5V19L9 15H4ZM9 9V15L11 21H7L5 15M21 10V14"/>',
  gear: '<path d="M10 3H14L14.5 6L16.5 7L19 5.5L21 9L18.5 11V13L21 15L19 18.5L16.5 17L14.5 18L14 21H10L9.5 18L7.5 17L5 18.5L3 15L5.5 13V11L3 9L5 5.5L7.5 7L9.5 6Z"/><circle cx="12" cy="12" r="3"/>',

  // Actions.
  code: '<path d="M8 6L3 12L8 18M16 6L21 12L16 18M14 4L10 20"/>',
  rocket: '<path d="M8 15C8 9 13 4 21 3C20 11 15 16 9 16ZM9 9H5L3 14H8M15 15V19L10 21V16M6 18L3 21"/><circle cx="16" cy="8" r="2"/>',
  furnace: '<path d="M12 3C9 4 15 4 12 5"/><path d="M7 9Q12 5 17 9Z"/><path d="M6 11H18L17 16Q16 18 12 18Q8 18 7 16ZM6 11H3V14L7 15M18 11H21V14L17 15"/><path d="M8 18L7 21M12 18V21M16 18L17 21"/><path d="M12 12.5L10.5 15.5H13.5Z"/>',
  swap: '<path d="M3 8H20M16 4L20 8L16 12M21 16H4M8 12L4 16L8 20"/>',
  puzzle: '<path d="M3 8H8V6C8 2 14 2 14 6V8H20V13H18C14 13 14 19 18 19H20V21H3V16H5C9 16 9 10 5 10H3Z"/>',
  paper: '<path d="M5 3H14L19 8V21H5ZM14 3V8H19M8 12H16M8 16H13"/>',
  search_user: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="8" r="2"/><path d="M6 14C6 10 14 10 14 14M15 15L21 21"/>',
  party: '<path d="M3 21L7 9L15 17ZM5 15L9 19M11 10L13 7L12 4M15 13L18 11L21 12M8 5V3M17 4L18 5M20 7H21"/>',
  cake: '<path d="M4 12Q4 10 6 10H18Q20 10 20 12V20H4ZM4 14Q6 17 8 14Q10 17 12 14Q14 17 16 14Q18 17 20 14M8 10V7M16 10V7"/><path d="M8 3L7 5H9ZM16 3L15 5H17Z" fill="currentColor" stroke="none"/>',
  building: '<path d="M5 21V3H16V9H20V21ZM16 9V21M9 7H12M9 11H12M9 15H12M9 21V18H12V21"/>',
  handshake: '<path d="M3 8L6 5L10 7M21 8L18 5H14L9 10L12 13L15 10L21 16L17 20L13 20L3 11ZM5 13L8 10M16 17L19 19M13 19L15 21"/>',
  mic: '<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11V12C5 21 19 21 19 12V11M12 19V21M9 21H15M11 7H13"/>',
  bell: '<path d="M12 3V5M5 17L7 14V10C7 3 17 3 17 10V14L19 17ZM10 20Q12 22 14 20"/>',
  book: '<path d="M12 6C9 4 6 4 3 5V19C6 18 9 18 12 20C15 18 18 18 21 19V5C18 4 15 4 12 6ZM12 6V20M6 9L9 10M15 10L18 9"/>',
  gift: '<path d="M4 12H20V21H4ZM3 8H21V12H3ZM12 8V21"/><path d="M12 8C4 8 4 3 7 3C10 3 12 6 12 8C20 8 20 3 17 3C14 3 12 6 12 8Z"/>',
  capitol: '<path d="M6 10C6 3 18 3 18 10ZM12 3V5M3 13H21M5 13V18M10 13V18M14 13V18M19 13V18M3 21H21"/>',
  megaphone_loud: '<path d="M3 9H7L15 5V18L7 14H3ZM7 9V14L9 21H6L4 14M19 9L21 7M18 13H21M18 17L20 19"/>',
  ad: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 18L6 21M16 18L18 21M6 14L8.5 8L11 14M7 12H10M14 8H15C19 8 19 14 15 14H14Z"/>',
  heart: '<path d="M12 20L5 13C0 8 6 1 12 7C18 1 24 8 19 13Z"/>',
  ghost: '<path d="M5 21V10C5 1 19 1 19 10V21L15.5 18L12 21L8.5 18ZM9 10V12M15 10V12"/>',
  mask: '<path d="M3 6C8 9 16 9 21 6V11C21 16 17 19 12 21C7 19 3 16 3 11ZM7 11L10 12M14 12L17 11M9 16Q12 14 15 16"/>',
  washer: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M4 8H20M7 5.5H8M16 5.5H17M8 14Q10 12 12 14Q14 16 16 14"/>',
  shovel: '<path d="M14 3H21V7L18 10L14 6ZM17 9L9 17M7 13L12 18L9 21H3V15Z"/>',
  hand: '<path d="M3 14H7L11 11H15Q18 11 18 14H12M17 14L19 11Q21 10 21 13L19 18L12 21L7 18H3ZM7 14V18M11 7V3M15 7L17 4"/>',
  broom: '<path d="M20 3L12 11M10 9L15 14L11 21H3V17ZM6 20L10 15M10 21L13 17"/>',

  // Hardware and system controls.
  gpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 3V6M15 3V6M9 18V21M15 18V21M3 9H6M3 15H6M18 9H21M18 15H21"/>',
  server: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9H20M4 15H20M8 6H8.5M8 12H8.5M8 18H8.5M13 6H16M13 12H16M13 18H16"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7C8 2 16 2 16 7V10M12 14V17"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7C8 2 16 2 16 7M12 14V17"/>',
  warning: '<path d="M12 3L21 20H3ZM12 9V13"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  check: '<path d="M4 12L9 17L20 6"/>',
  x: '<path d="M5 5L19 19M19 5L5 19"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M10 11H12V17H14"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 6H20M4 12H20M4 18H20"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M6 4L20 12L6 20Z"/>',
  volume: '<path d="M3 9H7L12 5V19L7 15H3ZM16 9Q19 12 16 15M18 5Q24 12 18 19"/>',
  mute: '<path d="M3 9H7L12 5V19L7 15H3ZM16 9L21 15M21 9L16 15"/>',
  settings: '<path d="M3 7H7M11 7H21M3 17H13M17 17H21"/><rect x="7" y="4" width="4" height="6" rx="1"/><rect x="13" y="14" width="4" height="6" rx="1"/>',
  save: '<path d="M3 3H17L21 7V21H3ZM7 3V9H16V3M7 21V14H17V21M13 5V7"/>',
  home: '<path d="M3 11L12 3L21 11M5 10V21H19V10M10 21V15H14V21"/>',
  arrow_left: '<path d="M20 12H4L11 5M4 12L11 19"/>',
  arrow_right: '<path d="M4 12H20L13 5M20 12L13 19"/>',
  chevron_down: '<path d="M5 9L12 16L19 9"/>',
  plus: '<path d="M4 12H20M12 4V20"/>',
  minus: '<path d="M4 12H20"/>',
  skull: '<path d="M8 21V17C1 14 3 3 12 3C21 3 23 14 16 17V21ZM11 18V21M13 18V21"/><circle cx="8.5" cy="11" r="2"/><circle cx="15.5" cy="11" r="2"/><path d="M12 14L11 16H13Z" fill="currentColor" stroke="none"/>',
  grad: '<path d="M3 8L12 4L21 8L12 12ZM6 10V17Q12 21 18 17V10M21 8V16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6V12L16 15"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M12 3C6 8 6 16 12 21C18 16 18 8 12 3ZM3 12H21"/>',
  shield: '<path d="M12 3L20 6V12C20 16 16 19 12 21C8 19 4 16 4 12V6ZM8 11L11 14L16 9"/>',
  bolt: '<path d="M14 3L4 14H11L10 21L20 10H13Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7H7.1M17 7H17.1M12 12H12.1M7 17H7.1M17 17H17.1"/>',
  sparkles: '<path d="M10 5L12 10L17 12L12 14L10 19L8 14L3 12L8 10ZM18 3V7M16 5H20M19 17V21M17 19H21"/>',
  eye: '<path d="M3 12C7 4 17 4 21 12C17 20 7 20 3 12Z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M3 8H7L9 4H15L17 8H21V20H3Z"/><circle cx="12" cy="13" r="4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3V5M12 19V21M3 12H5M19 12H21M5.5 5.5L7 7M17 17L18.5 18.5M5.5 18.5L7 17M17 7L18.5 5.5"/>',
  moon: '<path d="M10 3C1 5 1 18 10 20.5C15 21 20 18 21 14C14 17 7 10 10 3Z"/>',
  rain: '<path d="M6 14C2 14 2 8 6 8C7 2 16 2 17 8C22 8 22 14 18 14ZM7 17L5 20M13 17L11 20M19 17L17 20"/>',
  music: '<path d="M9 17V5L20 3V15M9 9L20 7"/><path d="M9 17C9 13 3 15 3 18C3 22 9 21 9 17ZM20 15C20 11 14 13 14 16C14 20 20 19 20 15Z"/>',
};

export function icon(name, size = 18, cls = '') {
  const body = Object.prototype.hasOwnProperty.call(ICONS, name)
    ? ICONS[name]
    : '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>';
  const dimension = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 18;
  const className = String(cls).replace(/[&"<>']/g, char => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;',
  })[char]);
  return `<svg class="ic ${className}" width="${dimension}" height="${dimension}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
