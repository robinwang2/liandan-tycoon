import { tr, getLang } from '../i18n/index.js';
// 3A 版城市：办公室坐落在街区中央，四周是按「地区 + 公司等级」生成的街区。
// 楼是真的有窗洞、窗框、阳台、屋顶设备的几何体（不是贴图盒子）；挡在镜头和办公室之间的楼会被「剖」到只剩底层商铺。
import * as THREE from 'three';
import { FARL } from './stage.js';
import { batchGroups } from './kit.js';

const GF = 3.6, FH = 2.8, RW = 7.6, BL = 30, ST = 9, SW = 2.4;                 // 底层层高、标准层高、环路宽、街区边长、街道宽、人行道宽
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hsh = (i, j, s) => { let h = Math.imul((i * 73856093) ^ (j * 19349663) ^ (s * 83492791), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

// 圆角矩形环线上的位置与朝向（给绕着办公室转的车和行人用）：a/b 是 x/z 方向的半宽
const LOOP_C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
export function loopPos(p, a, b, r = 2.2) {
  const len = [2 * (b - r), 2 * (a - r)], q = Math.PI * r / 2, per = 2 * (len[0] + len[1]) + 4 * q;
  p = ((p % per) + per) % per;
  for (let i = 0; i < 4; i++) {
    const f0 = i * Math.PI / 2, s = len[i % 2], pc = LOOP_C[(i + 3) % 4], nc = LOOP_C[i];
    if (p < s) return [pc[0] * (a - r) + r * Math.cos(f0) - Math.sin(f0) * p, pc[1] * (b - r) + r * Math.sin(f0) + Math.cos(f0) * p, -f0];
    p -= s;
    if (p < q) { const f = f0 + p / r; return [nc[0] * (a - r) + r * Math.cos(f), nc[1] * (b - r) + r * Math.sin(f), -f]; }
    p -= q;
  }
  return [a, 0, 0];
}

// 建筑风格：wall 墙色 | wtex/wpat 墙面质感 | bay 开间 | pw 窗间墙宽 | sh 窗下墙高 | fd 窗洞深 | glass 玻璃类型 | fl 层数范围 | lot 一栋楼占多宽 | gap 楼间距
const STY = {
  village: { wall: ['#efe6d4', '#f1d8d0', '#e2e9d6', '#f3f0e8', '#e8dcc6'], wtex: 'plaster', wpat: ['grid', 0.3, 0.15, 0.2, 0.05], bay: 2.3, pw: 0.75, sh: 1.25, fd: 0.2, glass: 'resi', fl: [5, 9], lot: 9.5, gap: 0.9, ac: 0.8, shop: 1, roof: ['water_tank', 'laundry_line', 'sat_dish', 'water_tank'] },
  resi: { wall: ['#e9e4da', '#e6d9cf', '#dde4e8', '#efe9df'], wtex: 'paint', bay: 3.0, pw: 0.9, sh: 1.15, fd: 0.3, glass: 'resi', fl: [12, 24], lot: 14, gap: 4, ac: 0.45, balcony: 1, shop: 1, roof: ['water_tank', 'roof_hvac', 'antenna_mast', 'solar_array'] },
  tower: { wall: ['#c9d2dc', '#b8c4d0', '#d8dde3'], wtex: 'metal', wm: 0.6, bay: 1.7, pw: 0.1, sh: 0.3, fd: 0.14, glass: 'mirror', fl: [14, 30], lot: 26, gap: 0, tier: 1, shop: 1, roof: ['roof_hvac', 'antenna_mast', 'helipad', 'billboard_roof'] },
  darktower: { wall: ['#39414e', '#2f3743', '#454d5a'], wtex: 'metal', wm: 0.5, bay: 1.5, pw: 0.18, sh: 0.22, fd: 0.42, glass: 'mirror', fl: [16, 34], lot: 26, gap: 0, tier: 1, shop: 1, roof: ['roof_hvac', 'antenna_mast', 'helipad', 'sat_dish'] },
  victorian: { wall: ['#f3d6c9', '#cfe3d6', '#f6e7b4', '#d9d4ef', '#f1c9c9', '#cfe0f0'], wtex: 'paint', wpat: ['grid', 99, 0.2, 0.22, 0.03], trim: '#fffaf0', bay: 2.2, pw: 0.5, sh: 0.95, fd: 0.2, glass: 'resi', fl: [1, 2], lot: 8.5, gap: 2.4, gable: 1, yard: 1, roof: [] },
  stucco: { wall: ['#efe3cf', '#f3ead9', '#e7d8c0', '#f0dcc8'], wtex: 'plaster', trim: '#b5583c', bay: 2.8, pw: 0.85, sh: 1.05, fd: 0.28, glass: 'resi', fl: [1, 3], lot: 14, gap: 0.3, shop: 1, roof: ['roof_vent', 'solar_array', 'sat_dish'] },
  brick: { wall: ['#a8573f', '#9a5a43', '#b0694f', '#8d5140'], wtex: 'brick', wpat: ['brick', 0.5, 0.16, 0.36, 0.2], trim: '#e9e2d4', bay: 2.4, pw: 0.7, sh: 1.0, fd: 0.3, glass: 'resi', fl: [2, 5], lot: 13, gap: 0.3, shop: 1, roof: ['water_tower_wood', 'roof_vent', 'sat_dish'] },
  tech: { wall: ['#e6e9ee', '#dfe4ea', '#eef0f2'], wtex: 'metal', wm: 0.3, trim: '#b98a5a', bay: 1.9, pw: 0.12, sh: 0.42, fd: 0.16, glass: 'mirror', fl: [1, 4], lot: 26, gap: 0, yard: 1, roof: ['solar_array', 'roof_hvac', 'solar_array'] },
  // 下面几种是各个落脚点街区专有的：郊区独栋（带车库门）、红砖厂房阁楼（带防火梯）、木瓦合租屋（带门廊）、科技园研发楼、电子市场大楼（外墙挂满招牌）
  suburb: { wall: ['#f1e9d8', '#dfe6e9', '#e8dcc0', '#d9e3d0', '#efe2d6', '#e6d3c3'], wtex: 'paint', wpat: ['grid', 99, 0.2, 0.22, 0.03], trim: '#fffaf0', bay: 2.6, pw: 0.7, sh: 0.95, fd: 0.2, glass: 'resi', fl: [0, 1], lot: 12, gap: 3.4, gable: 1, yard: 1, roof: [], garage: 1 },
  loft: { wall: ['#a35a43', '#8f4f3c', '#b0694f', '#7a4a3c', '#c9bfae'], wtex: 'brick', wpat: ['brick', 0.5, 0.16, 0.36, 0.2], trim: '#2a2f36', bay: 3.2, pw: 0.7, sh: 0.7, fd: 0.32, glass: 'resi', fl: [2, 5], lot: 15, gap: 0.3, shop: 1, roof: ['water_tower_wood', 'roof_vent', 'water_tower_wood', 'sat_dish'], escape: 1 },
  shingle: { wall: ['#6f4f3a', '#7a5a40', '#5f4a3a', '#8a6a4a', '#6d5c4c'], wtex: 'wood', wpat: ['grid', 0.28, 0.17, 0.42, 0.22], trim: '#f3ead6', bay: 2.3, pw: 0.6, sh: 0.95, fd: 0.2, glass: 'resi', fl: [1, 2], lot: 11, gap: 2.4, gable: 1, yard: 1, inset: 0.7, roof: [], porch: 1 },
  scipark: { wall: ['#e9edf1', '#dfe5ea', '#f2f3f4'], wtex: 'metal', wm: 0.25, trim: '#3f78b8', bay: 2.0, pw: 0.14, sh: 0.95, fd: 0.16, glass: 'mirror', fl: [5, 12], lot: 24, gap: 0, yard: 1, roof: ['roof_hvac', 'solar_array', 'antenna_mast', 'roof_hvac'] },
  emall: { wall: ['#f0ede4', '#e6e9ee', '#efe6d6'], wtex: 'paint', wpat: ['grid', 0.6, 0.6, 0.15, 0.03], trim: '#c8402f', bay: 2.6, pw: 0.5, sh: 1.0, fd: 0.2, glass: 'resi', fl: [5, 9], lot: 22, gap: 0.6, shop: 1, roof: ['billboard_roof', 'roof_hvac', 'water_tank', 'billboard_roof'], boards: 1 },
};
// 落脚点的街区（公司还在 1、2 档时）。搬到 3 档以后去了更繁华的地段，各个落脚点就一样了。
//   mix：[一环的楼, 二环的楼]（公司升到 2 档时一环用第二组）| far 远处的楼 | park 小公园的比例 | tree 行道树的密度 | palm 棕榈占几成
//   furn 人行道上的零碎 | parked 路边停的车和数量 | moving 路上跑的车 | peds 行人多少（倍数）| signs 排在前面的店招
const HOOD = {
  garage: {
    mix: [[['suburb', 7], ['victorian', 1]], [['suburb', 4], ['stucco', 2], ['victorian', 2]]], park: 0.2, tree: 0.84, palm: 0.22, peds: 0.5, hedge: 1,
    furn: ['mailbox', 'planter_box', 'fire_hydrant', 'bush', 'mailbox'], parked: [['car_sedan', 'car_suv', 'robotaxi', 'car_pickup', 'car_hatch'], 4], moving: ['car_sedan', 'robotaxi', 'car_suv', 'car_hatch', 'robotaxi', 'car_pickup'],
    signs: ['GARAGE SALE', 'OPEN HOUSE', 'LEMONADE 25¢', 'ANGEL OFFICE HOURS', 'ORGANIC MARKET', 'PILATES', 'JUICE BAR', 'KIDS CODING CAMP', 'ARTISANAL TOAST', 'FARMERS MARKET', 'TERM SHEET TEA', 'DOG SPA'],
  },
  loft: {
    mix: [[['loft', 5], ['brick', 2], ['victorian', 1]], [['loft', 3], ['brick', 2], ['tech', 1], ['tower', 1]]], far: [['tower', 5], ['darktower', 2], ['brick', 2]], park: 0.04, tree: 0.45, palm: 0, peds: 1.2, works: 1,
    furn: ['parking_meter', 'news_rack', 'trash_public', 'kick_scooter', 'fire_hydrant', 'bollard'], parked: [['car_sedan', 'car_hatch', 'robotaxi', 'van_delivery', 'car_suv'], 7], moving: ['bus_city', 'robotaxi', 'car_sedan', 'bus_city', 'car_hatch', 'van_delivery', 'robotaxi', 'car_suv'],
    signs: ['LOFTS FOR LEASE', 'CABLE CAR CAFE', 'FOG CITY BAGELS', 'HACKATHON TONIGHT', 'SOURDOUGH & CODE', 'MISSION BURRITO', 'DIVE BAR', 'CO-LIVING', 'AI MEETUP', 'WAREHOUSE GYM', 'THRIFT', 'PRINT SHOP', 'ESPRESSO', 'TOW AWAY ZONE'],
  },
  house: {
    mix: [[['shingle', 5], ['victorian', 2], ['stucco', 1]], [['shingle', 3], ['stucco', 3], ['brick', 1]]], park: 0.2, tree: 0.86, palm: 0.04, peds: 1.4, campus: 1,
    furn: ['bicycle', 'bulletin_board', 'planter_box', 'trash_public', 'kick_scooter', 'bench'], parked: [['car_hatch', 'car_sedan', 'car_pickup', 'car_hatch'], 5], moving: ['car_hatch', 'bus_city', 'car_sedan', 'robotaxi', 'car_hatch', 'van_delivery'],
    signs: ['USED BOOKS', 'BEAR BITES', 'CO-OP GROCERY', 'TELEGRAPH RECORDS', 'FREE SPEECH CAFE', 'BOBA 50% OFF', 'COPY CENTRAL', 'BIKE KITCHEN', 'TUTORING', 'VEGAN DONUTS', 'ZINE SHOP', 'PIZZA SLICE $3', 'STUDENT HOUSING', 'LATE NIGHT RAMEN'],
  },
  village: {
    mix: [[['village', 6], ['resi', 1]], [['village', 4], ['resi', 2], ['tower', 1]]], park: 0.03, tree: 0.36, palm: 0, peds: 1.4, wires: 1,
    furn: ['e_bike', 'shared_bike', 'plastic_stools', 'trash_public', 'power_box', 'parcels', 'e_bike'], parked: [['car_taxi', 'car_hatch', 'van_delivery'], 4], moving: ['scooter_delivery', 'car_taxi', 'scooter_delivery', 'scooter_delivery', 'bus_city', 'car_hatch', 'scooter_delivery', 'van_delivery'],
    signs: [],
  },
  park: {
    mix: [[['scipark', 5], ['tower', 1], ['resi', 1]], [['scipark', 4], ['tower', 3], ['resi', 1]]], park: 0.2, tree: 0.84, palm: 0, peds: 1,
    furn: ['planter_box', 'bollard', 'shared_bike', 'info_totem', 'bench', 'trash_public'], parked: [['car_sedan', 'car_suv', 'car_taxi', 'car_sedan'], 5], moving: ['car_sedan', 'car_taxi', 'bus_city', 'car_suv', 'bus_city', 'car_sedan', 'scooter_delivery', 'car_taxi'],
    signs: ['孵化器', '创业咖啡', '人才驿站', '路演中心', '知识产权服务', '轻食沙拉', '园区食堂', '打印·图文', '健身房', '共享会议室', '政策服务窗口', '瑞辛咖啡', '猎头事务所', '程序员面馆', '无人超市', '专精特新'],
  },
  stall: {
    mix: [[['emall', 5], ['village', 1], ['resi', 1]], [['emall', 4], ['tower', 2], ['resi', 1]]], park: 0, tree: 0.3, palm: 0, peds: 1.8, tall: 1.35,
    furn: ['parcels', 'e_bike', 'hand_truck', 'power_box', 'shared_bike', 'trash_public', 'standing_banner', 'parcels'], parked: [['van_delivery', 'car_taxi', 'van_delivery', 'car_hatch', 'van_delivery'], 7], moving: ['scooter_delivery', 'van_delivery', 'scooter_delivery', 'car_taxi', 'van_delivery', 'scooter_delivery', 'bus_city', 'scooter_delivery'],
    signs: ['手机配件批发', '显卡回收', '芯片·元器件', '柜台出租', '矿机维修', '一件代发', '数据线 9.9', '无人机', '安防监控', '二手手机', '屏幕总成', '充电宝批发', 'LED 灯带', '开发板', '国际快递', '打样·贴片', '保护壳批发', '对讲机'],
  },
};
// 公司越大，周围的街区越高级：深圳从城中村搬到 CBD，湾区从车库街区搬到科技园
const MIX = {
  sz: [null, [['village', 6], ['resi', 1]], [['village', 4], ['resi', 2], ['tower', 1]], [['resi', 3], ['tower', 3], ['village', 1]], [['tower', 4], ['darktower', 2], ['resi', 2]], [['tower', 3], ['darktower', 4], ['resi', 1]]],
  bay: [null, [['victorian', 6], ['stucco', 1]], [['victorian', 2], ['stucco', 3], ['brick', 2]], [['brick', 3], ['stucco', 2], ['tech', 2]], [['tech', 4], ['brick', 2], ['tower', 1]], [['tech', 3], ['tower', 3], ['brick', 1]]],
};
const FAR = { sz: [['tower', 3], ['darktower', 3], ['resi', 3]], bay: [['tower', 3], ['brick', 2], ['tech', 2], ['stucco', 1]] };
// 办公室背后（back）和左边（left）那两条人行道正对着镜头，街区特有的东西主要摆在这儿。
// 每项：[道具, 位置（占地块半宽的比例，-1~1）, 离马路牙子多远（正数在人行道上，负数摆在路边的停车道里）, 朝向偏转]。quiet：不摆餐车和报亭
const Q = Math.PI / 2;
const HOOD_STREET = {
  garage: { quiet: 1, fence: 1, back: [['mailbox', 0.3, 0.6], ['lemon_tree', 0.6, 1.2], ['mailbox', 0.85, 0.6], ['fire_hydrant', -0.8, 0.5]], left: [['bench', 0.5, 1.0], ['planter_box', -0.15, 0.8], ['mailbox', -0.6, 0.6]] },
  loft: {
    back: [['scaffold', 0.5, 1.75], ['manhole_steam', 0.5, -0.95], ['road_barrier', 0.28, -0.95, Q], ['road_barrier', 0.72, -0.95, Q], ['road_barrier', 0.5, -1.85], ['traffic_cone', 0.3, -1.8], ['traffic_cone', 0.7, -1.8], ['news_rack', -0.72, 0.6], ['news_rack', -0.8, 0.6], ['parking_meter', -0.6, 0.35], ['parking_meter', 0.08, 0.35], ['parking_meter', 0.92, 0.35]],
    left: [['kick_scooter', 0.86, 0.8, Q], ['kick_scooter', 0.78, 0.9, Q], ['trash_public', 0.05, 0.7], ['kick_scooter', -0.5, 0.8, Q], ['fire_hydrant', -0.8, 0.5]],
  },
  house: { back: [['bulletin_board', 0.42, 0.9], ['bike_rack', 0.8, 1.3], ['bicycle', 0.15, 0.8, Q], ['kick_scooter', 0.06, 0.7, Q]], left: [['bicycle', 0.9, 0.8, Q], ['bulletin_board', -0.55, 0.9], ['bicycle', -0.82, 0.8, Q], ['kick_scooter', -0.9, 0.8, Q]] },
  village: {
    back: [['food_cart', 0.56, 1.1], ['plastic_stools', 0.28, 1.2], ['plastic_stools', 0.84, 1.2], ['e_bike', -0.72, 0.8, Q], ['e_bike', -0.8, 0.8, Q], ['e_bike', -0.88, 0.8, Q], ['parcels', 0.06, 0.8]],
    left: [['food_cart', -0.3, 1.1], ['plastic_stools', -0.74, 1.2], ['laundry_line', 0.06, 1.5], ['shared_bike', 0.86, 0.8, Q], ['e_bike', 0.94, 0.8, Q]],
  },
  park: { quiet: 1, back: [['flag_row', 0.62, 1.3], ['info_totem', -0.88, 0.7], ['info_totem', 0.96, 0.7], ['bike_rack', 0.2, 1.3]], left: [['planter_box', 0.5, 0.8], ['planter_box', 0.05, 0.8], ['planter_box', -0.3, 0.8], ['bench', -0.65, 1.0], ['shared_bike', 0.88, 0.8, Q]] },
  stall: {
    back: [['parcels', 0.1, 0.8], ['parcels', 0.22, 1.3], ['hand_truck', 0.33, 0.8], ['standing_banner', 0.48, 1.0], ['parcels', 0.62, 0.9], ['hand_truck', 0.74, 1.2], ['standing_banner', 0.9, 1.0], ['food_cart', -0.78, 1.1]],
    left: [['e_bike', 0.9, 0.8, Q], ['e_bike', 0.82, 0.8, Q], ['e_bike', 0.74, 0.8, Q], ['parcels', 0.12, 0.9], ['scooter_delivery', -0.25, 0.9, Q], ['scooter_delivery', -0.4, 0.9, Q], ['parcels', -0.7, 0.9], ['hand_truck', -0.85, 0.8]],
  },
};
const pick = (mix, r) => { let t = 0; for (const m of mix) t += m[1]; r *= t; for (const m of mix) { if ((r -= m[1]) < 0) return m[0]; } return mix[0][0]; };
const SIGNS = {
  sz: ['隆江猪脚饭', '沙县小吃', '手机维修·贴膜', '肠粉王', '不加班奶茶', '24H 便利店', '湘菜馆', '通宵网吧', '快递驿站', '五金建材', '房产中介', '糖水铺', '深夜烧烤', '打印·复印', '麻辣烫', '码农面馆', '显卡回收', '路演咖啡', '天使轮烧腊', '估值十亿肠粉', '联合办公', '人才公寓', '炼丹炉专卖', '算力充值', '猎头事务所', '彩票', '药店', '螺蛳粉', '潮汕牛肉火锅', '共享充电宝', '洗衣店', '开锁·换锁', '盲盒', '剧本杀', '理发', '水果店'],
  bay: ['CHEPOLE', 'BLUE KETTLE COFFEE', 'BOBA & BYTES', 'SEED ROUND CAFE', 'PIVOT PIZZA', 'UNICORN TACOS', 'SERIES A SUSHI', 'BURN RATE BBQ', 'TERM SHEET TEA', 'GPU PAWN SHOP', 'KOMBUCHA LAB', 'BIKE REPAIR', 'PHO 404', 'RAMEN & RUNWAY', 'DEMO DAY DONUTS', 'HACKER HOSTEL', 'CO-WORKING', 'PITCH DECK PRINT', 'BOOKS', 'LAUNDROMAT', 'THAI', 'VINYL', 'SURF SHOP', 'DELI', 'OPTICIAN', 'YOGA', 'BAGELS', 'PHARMACY', 'ICE CREAM', 'BARBER', 'FLOWERS', 'WINE', 'HARDWARE', 'CLIMBING GYM', 'DOG SPA', 'VC PARTNERS'],
};
const SIGN_COL = [['#c8402f', '#fff6e0'], ['#f2c14e', '#3a2a10'], ['#1f6f8b', '#eaf6ff'], ['#2e7d4f', '#f0ffe8'], ['#1e2233', '#ffd66b'], ['#f7f3ea', '#b0302a'], ['#7b4fd0', '#fff'], ['#e8762c', '#fff8ec'], ['#23395d', '#ffe9a8']];

export function createCity(stage, k, PROPS, artMat) {
  const CM = new THREE.Matrix4();
  let blockedStreetZ = 0, parkedVanX = 0;
  let root = new THREE.Group(), live = null, job = null;                      // live：正在显示的城；job：后台正在搭的城
  let owned = [], bakes = [], blds = [], cars = [], peds = null, night = [], wetMats = [], ticks = [], frameInfo = null, built = '';
  const own = x => { owned.push(x); return x; };
  // still = true：纯静态摆件，不登记动画，会动的零件也一起合批（给中远景和路边停的车用）
  const P = (name, o, still) => { const p = PROPS[name]; if (!p) return null; const g = p.build(k, o || {}); if (g.userData.own) owned.push(...g.userData.own); if (still) g.traverse(x => { x.userData.dynamic = false; }); else if (g.userData.tick) ticks.push(g.userData.tick); return g; };
  const place = (parent, name, x, y, z, ry = 0, o, still) => { const g = P(name, o, still); if (g) { g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); } return g; };
  const addBake = (g, parent = root, o) => { const b = k.bake(g, o); bakes.push(b); parent.add(b); return b; };

  // ── 窗户图集：每扇窗一个像素。一张管白天的窗帘/玻璃颜色，一张管夜里亮不亮、亮什么颜色 ──
  function makeAtlas() {
    const S = 512, alb = new Uint8Array(S * S * 4), lit = new Uint8Array(S * S * 4); let px = 0, py = 0, rowH = 0;
    const tex = d => { const t = own(new THREE.DataTexture(d, S, S, THREE.RGBAFormat)); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; return t; };
    const A = tex(alb), B = tex(lit);
    return {
      A, B,
      alloc(nb, nf, type, seed) {
        nb = Math.min(nb, S - 2); nf = Math.min(nf, S - 2);
        if (px + nb + 1 > S) { px = 0; py += rowH + 1; rowH = 0; }
        if (py + nf + 1 > S) { px = 0; py = 0; rowH = 0; }
        const x0 = px, y0 = py; px += nb + 1; rowH = Math.max(rowH, nf);
        for (let f = 0; f < nf; f++) {
          const floorLit = hsh(seed, f, 31) < 0.55;
          for (let b = 0; b < nb; b++) {
            const i = ((y0 + f) * S + x0 + b) * 4, r = hsh(seed + b * 7, f, 3), r2 = hsh(seed + b, f * 5, 9); let c, e = null;
            if (type === 'mirror') { const v = 0.78 + r * 0.3; c = r2 < 0.12 ? [205, 210, 214] : [86 * v, 118 * v, 158 * v]; if (floorLit ? r2 < 0.82 : r2 < 0.12) e = r < 0.75 ? [228, 238, 255] : [255, 226, 180]; }
            else if (type === 'shop') { c = [70, 86, 104]; if (r2 < 0.92) e = r < 0.7 ? [255, 214, 150] : [255, 240, 214]; }
            else { c = r < 0.3 ? [222, 214, 196] : r < 0.5 ? [196, 204, 212] : r < 0.62 ? [150, 120, 96] : [72, 88, 108]; if (r2 < 0.46) e = r2 < 0.3 ? [255, 206, 140] : r2 < 0.41 ? [232, 240, 255] : [150, 180, 255]; }
            alb[i] = c[0]; alb[i + 1] = c[1]; alb[i + 2] = c[2]; alb[i + 3] = 255;
            const k2 = e ? 0.55 + hsh(seed + b, f, 17) * 0.45 : 0; lit[i] = e ? e[0] * k2 : 0; lit[i + 1] = e ? e[1] * k2 : 0; lit[i + 2] = e ? e[2] * k2 : 0; lit[i + 3] = 255;
          }
        }
        A.needsUpdate = B.needsUpdate = true;
        return { u0: x0 / S, u1: (x0 + nb) / S, v0: y0 / S, v1: (y0 + nf) / S };
      },
    };
  }
  // ── 招牌图集：一张画布上 36 块店招 ──
  function makeSigns(bay, first = []) {                                         // first：这个街区特有的店招，排在前面
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1152; const x = c.getContext('2d'), names = [...first, ...SIGNS[bay ? 'bay' : 'sz']];
    for (let i = 0; i < 36; i++) {
      const cx = (i % 4) * 512, cy = (i / 4 | 0) * 128, [bg, fg] = SIGN_COL[i % SIGN_COL.length], name = tr(names[i % names.length]);
      x.fillStyle = bg; x.fillRect(cx, cy, 512, 128); x.strokeStyle = fg; x.globalAlpha = 0.5; x.lineWidth = 4; x.strokeRect(cx + 9, cy + 9, 494, 110); x.globalAlpha = 1;
      let fs = 78; const font = () => `900 ${fs}px "Microsoft YaHei","PingFang SC","Noto Sans SC",Impact,sans-serif`; x.font = font();
      while (x.measureText(name).width > 450 && fs > 28) { fs -= 4; x.font = font(); }
      x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, cx + 256, cy + 68);
    }
    const t = own(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  const tmpGeo = [];
  function uvPlane(w, h, r) {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(r.u0, r.u1, uv.getX(i)), lerp(r.v0, r.v1, uv.getY(i)));
    tmpGeo.push(g); return g;
  }

  // 行道树：三种树冠 + 一种棕榈，全部实例化
  function treeGeos() {
    const blob = (list, seed) => {
      const parts = list.map(([x, y, z, r], n) => { const g = new THREE.SphereGeometry(r, 9, 6), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const s = 1 + (hsh(i, n, seed) - 0.5) * 0.22; p.setXYZ(i, p.getX(i) * s + x, p.getY(i) * s * 0.86 + y, p.getZ(i) * s + z); } g.computeVertexNormals(); return g; });
      const nv = parts.reduce((s, g) => s + g.attributes.position.count, 0), ni = parts.reduce((s, g) => s + g.index.count, 0), pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint16Array(ni); let v0 = 0, i0 = 0;
      for (const g of parts) { pos.set(g.attributes.position.array, v0 * 3); nor.set(g.attributes.normal.array, v0 * 3); for (let i = 0; i < g.index.count; i++) idx[i0 + i] = g.index.getX(i) + v0; v0 += g.attributes.position.count; i0 += g.index.count; g.dispose(); }
      const m = own(new THREE.BufferGeometry()); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1)); return m;
    };
    return [
      blob([[0, 3.1, 0, 1.25], [0.85, 2.7, 0.2, 0.9], [-0.8, 2.75, -0.25, 0.95], [0.1, 2.6, 0.9, 0.85], [-0.15, 2.65, -0.9, 0.85], [0.2, 3.9, -0.1, 0.8]], 1),
      blob([[0, 3.0, 0, 1.0], [0.1, 3.9, 0.1, 0.85], [-0.1, 4.7, 0, 0.62], [0.55, 2.7, -0.3, 0.7], [-0.5, 2.8, 0.35, 0.7]], 2),
      blob([[0, 2.7, 0, 1.2], [1.1, 2.6, 0.1, 0.95], [-1.1, 2.6, -0.1, 0.95], [0.2, 2.6, 1.05, 0.9], [-0.2, 2.6, -1.05, 0.9], [0, 3.3, 0, 0.9]], 3),
    ];
  }
  function build(o) {
    const key = `${getLang()}|${o.region}|${o.level}|${o.L.W}|${o.detail ?? 1}|${o.level <= 2 ? o.hood || '' : ''}`;
    if (key === (job ? job.key : live?.key)) return;
    if (job) abort();
    root = new THREE.Group(); owned = []; bakes = []; blds = []; cars = []; peds = null; night = []; wetMats = []; ticks = []; frameInfo = null;
    job = { key, gen: gen(o) };
    if (!live) { while (!job.gen.next().done); finish(); }                       // 第一次：同步建完，开场就有城
  }
  function finish() {
    const old = live; live = { key: job.key, root, owned, bakes, blds, cars, peds, night, wetMats, ticks, frameInfo }; job = null;
    stage.scene.add(live.root); if (old) { stage.scene.remove(old.root); release(old); }
  }
  function abort() { for (const g of tmpGeo) g.dispose(); tmpGeo.length = 0; release({ root, owned, bakes }); job = null; }
  function release(s) {
    for (const b of s.bakes) b.userData.dispose?.();
    const dead = new Set(s.owned); for (const x of s.owned) x.dispose?.();
    for (let i = k.nightMats.length - 1; i >= 0; i--) if (dead.has(k.nightMats[i][0])) k.nightMats.splice(i, 1);
    s.root.clear();
  }
  function* gen(o) {
    // 多层楼那几档（5 档以上）沿用最繁华的街区
    const bay = o.region === 'bay', L = o.L, lv = [1, 1, 2, 3, 4, 4, 5, 5, 5][clamp(o.level | 0, 1, 8)], hx = L.W / 2 + 3.4, hz = L.D / 2 + 3.4;
    const det = o.detail ?? 1, RINGS = det >= 2 ? 4 : 3, EX = Math.max(hx, hz) + RW + RINGS * BL + (RINGS - 1) * ST + 30;     // det：画质档给的城市细节
    const HD = lv <= 2 ? HOOD[o.hood] || null : null;                                       // 落脚点的街区：只在 1、2 档时有
    const atlas = makeAtlas(), signTex = makeSigns(bay, HD?.signs);
    const glass = {
      mirror: own(new THREE.MeshStandardMaterial({ map: atlas.A, emissiveMap: atlas.B, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.07, metalness: 0.92, envMapIntensity: 1.25 })),
      resi: own(new THREE.MeshStandardMaterial({ map: atlas.A, emissiveMap: atlas.B, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.16, metalness: 0.4, envMapIntensity: 1.1 })),
    };
    glass.shop = glass.resi;
    const signMat = own(new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.55 }));
    night.push([glass.mirror, 0, 1.5], [glass.resi, 0, 1.7], [signMat, 0.05, 1.35]);
    const asphalt = k.mat('#474c56', { rough: 0.93, tex: 'asphalt' }), walk = k.mat('#b9bcc2', { rough: 0.88, tex: 'concrete', pat: ['tile', 1.2, 0.22, 0.07] }), paint = k.mat('#e9ecef', { rough: 0.7 }), lawn = k.mat(bay ? '#7fb56a' : '#6fb564', { rough: 0.95, tex: 'grass' });
    wetMats = [[asphalt, 0.93, 0.28, new THREE.Color('#474c56'), new THREE.Color('#2a2e36')], [walk, 0.88, 0.45, new THREE.Color('#b9bcc2'), new THREE.Color('#8a8e96')]];
    const roofMat = k.mat('#8e939b', { rough: 0.95, tex: 'asphalt' }), capMat = k.mat('#7d828b', { rough: 0.9, tex: 'concrete' }), acMat = k.mat('#eef0f1', { rough: 0.6, tex: 'plastic' }), acFan = k.mat('#3a3f48', { rough: 0.6 }), railMat = k.mat('#59616d', { rough: 0.5, metal: 0.6 });

    // ── 一段楼体：四面墙，窗间墙 + 窗下墙围出窗洞，玻璃退在后面 ──
    function section(parent, S, w, d, y0, nf, fh, seed, wallMat, D) {
      const shop = D.shop, H = nf * fh;
      [[w, 0, d / 2, 0], [d, w / 2, 0, Math.PI / 2], [w, 0, -d / 2, Math.PI], [d, -w / 2, 0, -Math.PI / 2]].forEach(([len, ox, oz, ry], side) => {
        const f = k.group(parent, ox, y0, oz, ry), bw0 = shop ? Math.max(3.2, S.bay * 1.4) : S.bay, nb = Math.max(1, Math.round(len / bw0)), bw = len / nb, pw = shop ? 0.45 : S.pw, fd = shop ? 0.3 : S.fd;
        k.put(uvPlane(len - 0.04, H, atlas.alloc(nb, nf, shop ? 'shop' : S.glass, seed * 4 + side)), glass[shop ? 'shop' : S.glass], f, 0, H / 2, -fd, { cast: false });
        if (D.lod > 0 || shop) for (let b = 0; b <= nb; b++) k.box(pw, H, fd, wallMat, f, -len / 2 + b * bw, H / 2, -fd / 2);
        else { k.box(S.pw + 0.3, H, fd, wallMat, f, -len / 2, H / 2, -fd / 2); k.box(S.pw + 0.3, H, fd, wallMat, f, len / 2, H / 2, -fd / 2); }
        if (shop) {
          k.box(len + 0.1, 0.38, fd + 0.06, D.trimMat, f, 0, 0.19, -fd / 2); k.box(len + 0.2, 0.86, fd + 0.22, D.trimMat, f, 0, H - 0.43, -fd / 2 + 0.06, D.lod > 1 ? { r: 0.03 } : {});
          for (let b = 0; b < nb; b++) {
            const r = hsh(seed + b, side, 41), x = -len / 2 + (b + 0.5) * bw;
            if (r < 0.78) { const n = (hsh(seed + b, side, 43) * 36) | 0, u0 = (n % 4) / 4, v1 = 1 - (n / 4 | 0) / 9; k.put(uvPlane(Math.min(bw - 0.5, 3.1), 0.7, { u0, u1: u0 + 0.25, v0: v1 - 1 / 9, v1 }), signMat, f, x, H - 0.43, 0.18, { cast: false }); }
            if (D.lod > 1 && r > 0.45) place(f, 'shop_awning', x, H - 0.92, 0.02, 0, { seed: (r * 97) | 0 });
            k.box(1.0, 2.2, 0.06, k.mat('#2b3038', { rough: 0.4, metal: 0.5 }), f, x + bw * 0.28, 1.48, -fd + 0.05, { cast: false });
          }
        } else {
          const stepF = D.lod > 0 ? 1 : 3;
          for (let fl = 0; fl <= nf; fl += stepF) k.box(len, fl === 0 || fl >= nf ? S.sh * 0.6 : S.sh, fd * 0.8, wallMat, f, 0, fl * fh + (fl === 0 ? S.sh * 0.3 : fl >= nf ? -S.sh * 0.3 : 0), -fd * 0.6);
          if (D.lod > 0 && S.balcony && side % 2 === 0) for (let fl = 0; fl < nf; fl++) for (let b = fl % 2; b < nb; b += 2) { const x = -len / 2 + (b + 0.5) * bw; k.box(bw * 0.92, 0.12, 1.0, wallMat, f, x, fl * fh + 0.3, 0.42); k.box(bw * 0.92, 0.85, 0.05, railMat, f, x, fl * fh + 0.8, 0.9); }
          if (D.lod > 0 && S.ac) for (let fl = 0; fl < nf; fl++) for (let b = 0; b < nb; b++) if (hsh(seed + b * 3, fl + side * 11, 51) < S.ac * (D.lod > 1 ? 0.6 : 0.3)) { const x = -len / 2 + (b + 0.5) * bw + bw * 0.22; k.box(0.8, 0.55, 0.34, acMat, f, x, fl * fh + 0.42, 0.2); if (D.lod > 1) k.cyl(0.2, 0.2, 0.02, acFan, f, x, fl * fh + 0.42, 0.38, { rx: Math.PI / 2, cast: false }); }
        }
      });
    }
    function roofStuff(parent, S, w, d, y, seed, lod) {
      k.box(w + 0.1, 0.24, d + 0.1, roofMat, parent, 0, y - 0.02, 0);
      for (const [len, ox, oz, ry] of [[w, 0, d / 2, 0], [d, w / 2, 0, Math.PI / 2], [w, 0, -d / 2, Math.PI], [d, -w / 2, 0, -Math.PI / 2]]) k.box(len + 0.3, 0.7, 0.3, capMat, parent, ox, y + 0.3, oz, { ry });
      if (!S.roof.length) return;
      const n = lod > 1 ? 3 + ((w * d) / 90 | 0) : lod > 0 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const name = S.roof[(hsh(seed, i, 61) * S.roof.length) | 0], pr = PROPS[name]; if (!pr) continue;
        const sx = pr.size[0], sz = pr.size[1]; if (sx > w - 1.4 || sz > d - 1.4) continue;
        const x = (hsh(seed, i, 63) - 0.5) * (w - sx - 1.2), z = (hsh(seed, i, 65) - 0.5) * (d - sz - 1.2);
        place(parent, name, x, y + 0.1, z, ((hsh(seed, i, 67) * 4) | 0) * Math.PI / 2, { seed: seed + i, art: artMat?.(seed + i), brand: o.brand }, true);
      }
    }
    // 一栋楼：返回 { base 底层（永远在）, upper 上面的楼层（挡镜头时收起来）, h 总高 }
    function makeBuilding(sty, x, z, w, d, floors, seed, lod, baseP, upperP) {
      const S = STY[sty], wallC = S.wall[(hsh(seed, 1, 71) * S.wall.length) | 0], wallMat = k.mat(wallC, { rough: S.wm ? 0.35 : 0.85, metal: S.wm || 0, tex: S.wtex, pat: S.wpat });
      const trimMat = k.mat(S.trim || (S.wm ? '#2c323c' : '#6a7078'), { rough: 0.7, tex: 'paint' }), base = k.group(baseP, x, 0, z), upper = k.group(upperP, x, 0, z), D = { lod, trimMat };
      k.box(w + 0.5, 0.34, d + 0.5, capMat, base, 0, 0.17, 0);
      section(base, S, w, d, 0.3, 1, GF - 0.3, seed, wallMat, { ...D, shop: !!S.shop });
      k.box(w + 0.16, 0.2, d + 0.16, capMat, base, 0, GF + 0.02, 0);
      let y = GF, tw = w, td = d, left = floors;
      const tiers = S.tier && floors >= 16 && lod > 0 ? [Math.round(floors * 0.62), floors - Math.round(floors * 0.62)] : [floors];
      tiers.forEach((nf, ti) => {
        if (ti) { tw *= 0.74; td *= 0.74; k.box(tw + 1.2, 0.5, td + 1.2, trimMat, upper, 0, y + 0.1, 0); }
        if (nf > 0) section(upper, S, tw, td, y, nf, FH, seed + ti * 13, wallMat, D);
        y += nf * FH; left -= nf;
      });
      if (S.gable) {
        const rh = 2.6 + hsh(seed, 2, 73) * 1.2, turn = hsh(seed, 3, 75) < 0.4, rw = (turn ? d : w) + 0.7, rd = (turn ? w : d) + 0.7, rc = ['#6f5a55', '#5b6570', '#8a5a48', '#4f5b52'][(hsh(seed, 4, 77) * 4) | 0];
        const r = k.group(upper, 0, y, 0, turn ? Math.PI / 2 : 0);
        k.extrude([[-rw / 2, 0], [rw / 2, 0], [0, rh]], rd, rc, r, 0, 0, -rd / 2, { rough: 0.85, tex: 'asphalt', pat: ['grid', 0.4, 0.3, 0.3, 0.1] });
        k.box(0.6, 1.6, 0.6, k.mat('#9a5a43', { tex: 'brick', pat: ['brick', 0.3, 0.1, 0.35, 0.2] }), r, rw * 0.22, rh * 0.62, rd * 0.2);
        k.box(1.7, 0.9, 0.5, S.trim, base, w * 0.18, 0.75, d / 2 + 0.5, { r: 0.03 }); k.box(1.0, 2.1, 0.08, ['#b0463c', '#3f6f8f', '#3d7a5a', '#d9a13d'][(seed >>> 3) % 4], base, w * 0.18, 1.6, d / 2 + 0.02);
        y += rh;
      } else roofStuff(upper, S, tw, td, y, seed, lod);
      if (tiers.length > 1 && lod > 0) { const m = place(upper, 'antenna_mast', 0, y + 0.3, 0, 0, { seed }, true); if (!m) k.cyl(0.08, 0.08, 6, '#e8eef5', upper, 0, y + 3.3, 0, { cast: false }); y += 4; }
      if (lod > 1 && !bay && S.shop && hsh(seed, 5, 79) < 0.6) place(upper, 'neon_sign', w / 2 + 0.02, GF + 0.6, d / 2 - 0.8, Math.PI / 2, { brand: ['#ff4f8b', '#35d6ff', '#ffd23f', '#7dff8a'][(seed >>> 2) % 4], seed }, true);
      // ── 落脚点街区的楼才有的细节（只给近处的楼做；都做在朝镜头的两面）──
      if (S.garage && lod > 0) {                                                            // 郊区独栋：一扇白色车库门，门前一条车道
        const gx = -w * 0.24;
        k.box(2.6, 2.1, 0.1, '#f7f4ec', base, gx, 1.35, d / 2 + 0.02, { rough: 0.6, tex: 'paint', pat: ['grid', 99, 0.5, 0.25, 0.03] });
        k.box(2.9, 0.06, 2.6, '#cfcbc0', base, gx, 0.27, d / 2 + 1.3, { rough: 0.85, tex: 'concrete', cast: false });
      }
      if (S.porch && lod > 1) {                                                             // 木瓦合租屋：带顶的小门廊
        const px = w * 0.18, pw2 = Math.min(3.2, w * 0.5);
        k.box(pw2, 0.14, 1.5, trimMat, base, px, 2.75, d / 2 + 0.75, { r: 0.02 }); k.box(pw2, 0.12, 1.5, '#8a6a4a', base, px, 0.36, d / 2 + 0.75, { rough: 0.7, tex: 'wood' });
        for (const sx of [-1, 1]) k.box(0.14, 2.4, 0.14, trimMat, base, px + sx * (pw2 / 2 - 0.12), 1.5, d / 2 + 1.38);
      }
      if (S.escape && lod > 0 && floors >= 2 && hsh(seed, 6, 81) < 0.75) {                  // 红砖阁楼：之字形的防火梯
        const ex = (hsh(seed, 7, 83) - 0.5) * Math.max(0, w - 4.6), iron = k.mat('#22262c', { rough: 0.5, metal: 0.6, tex: 'metal' }), n = Math.min(floors, 5), ang = Math.atan2(FH, 1.7);
        for (let f = 0; f < n; f++) {
          const fy = GF + f * FH - 0.15, dir = f % 2 ? 1 : -1;
          k.box(2.4, 0.07, 0.85, iron, upper, ex, fy, d / 2 + 0.45); k.box(2.4, 0.05, 0.04, iron, upper, ex, fy + 0.9, d / 2 + 0.86);
          for (const sx of [-1, 0, 1]) k.box(0.04, 0.9, 0.04, iron, upper, ex + sx * 1.18, fy + 0.45, d / 2 + 0.86);
          if (f < n - 1) k.box(Math.hypot(1.7, FH), 0.06, 0.32, iron, upper, ex, fy + FH / 2, d / 2 + 0.5, { rz: dir * ang });
        }
        k.box(0.3, 1.5, 0.05, iron, upper, ex + 0.95, GF - 0.9, d / 2 + 0.8);
      }
      if (S.boards && lod > 0) {                                                            // 电子市场：外墙挂满招牌，高处一块户外大屏
        const rows = Math.min(3, floors - 1);
        for (const [len, ox2, oz2, ry] of [[w, 0, d / 2, 0], [d, w / 2, 0, Math.PI / 2]]) {
          const f = k.group(upper, ox2, 0, oz2, ry), nb = Math.max(1, Math.floor(len / 5.4)), bw3 = len / nb, sd = ry ? 9 : 0;
          for (let r = 0; r < rows; r++) for (let b = 0; b < nb; b++) {
            if (hsh(seed + b * 5, r + sd, 85) < 0.14) continue;
            const n = (hsh(seed + b * 3, r + sd, 87) * 36) | 0, u0 = (n % 4) / 4, v1 = 1 - (n / 4 | 0) / 9, bx2 = -len / 2 + (b + 0.5) * bw3, by2 = GF + 1.0 + r * 1.75;
            k.box(bw3 - 0.5, 1.5, 0.16, '#2a2f36', f, bx2, by2, 0.12, { metal: 0.4, rough: 0.5 });
            k.put(uvPlane(bw3 - 0.7, 1.3, { u0, u1: u0 + 0.25, v0: v1 - 1 / 9, v1 }), signMat, f, bx2, by2, 0.21, { cast: false });
          }
          const am = lod > 1 && floors >= 6 && hsh(seed, sd + 2, 89) < 0.7 ? artMat?.(seed + sd) : null;
          if (am) { const sw = Math.min(len - 2, 7), sy = GF + rows * 1.75 + 2.6; k.box(sw + 0.3, sw * 0.43 + 0.3, 0.2, '#20242b', f, 0, sy, 0.14, { metal: 0.5, rough: 0.5 }); k.put(uvPlane(sw, sw * 0.43, { u0: 0, u1: 1, v0: 0, v1: 1 }), am, f, 0, sy, 0.25, { cast: false }); }
        }
      }
      return { h: y, x, z, r: Math.hypot(w, d) / 2 };
    }

    // ── 地面与路网 ──
    const ground = k.group();
    k.box(EX * 2 + 500, 0.4, EX * 2 + 500, asphalt, ground, 0, -0.2, 0, { cast: false });
    const bands = h => { const out = [[-h, h, 0]]; let e = h + RW; for (let m = 1; m <= RINGS; m++) { out.push([e, e + BL, m]); out.unshift([-(e + BL), -e, -m]); e += BL + ST; } return out; };
    const X = bands(hx), Z = bands(hz), street = k.group(), far = k.group(), heroes = [], trees = [];
    const safeDir = (x, z) => (x * 0.7071 + z * 0.7071) / (Math.hypot(x, z) || 1) < -0.3;      // 镜头永远转不到的那一侧：高楼只放这边
    const treeP = HD?.tree ?? 0.7, palmP = HD ? HD.palm : bay ? 0.2 : 0, furn = HD?.furn || ['planter_box', 'trash_public', 'bollard', 'power_box'];
    // 大学城的校园：办公室左边隔一条马路就是。朝马路一座校门（两根石柱托着青铜拱），进去是草坪和小路，
    // 路的尽头一座钟楼（石砌的细高塔身，四面钟，铜绿色尖顶）。在办公室的左后方，不挡镜头
    function campus(cx, cz, bw, bd, seed) {
      const PI = Math.PI, stone = k.mat('#e7e0cf', { rough: 0.85, tex: 'stone', pat: ['grid', 1.2, 0.6, 0.12, 0.05] }), slit = k.mat('#59636e', { rough: 0.6, tex: 'stone' }), face = k.mat('#f6f1e2', { rough: 0.5, glow: '#ffe9b0', glowK: 0.04, night: 1.1 }), hand = k.mat('#2a2f36', { rough: 0.5, metal: 0.5 }), path = k.mat('#d9cfb8', { rough: 0.9, tex: 'concrete' });
      const bronze = k.mat('#5f8f7c', { rough: 0.55, metal: 0.5, tex: 'bronze' }), x1 = cx + bw / 2, gx = x1 - SW - 0.7, tx = x1 - 12.5, tz = cz;
      k.box(bw - 2 * SW, 0.12, bd - 2 * SW, lawn, ground, cx, 0.2, cz, { r: 0.05 });
      k.box(bw - 2 * SW, 0.05, 2.2, path, ground, cx, 0.27, cz, { cast: false }); k.box(SW + 0.8, 0.05, 2.2, path, ground, x1 - SW / 2 - 0.3, 0.2, cz, { cast: false });
      // 校门
      const Gt = k.group(street, gx, 0.2, cz);
      for (const sz of [-1, 1]) { k.box(1.0, 4.4, 1.0, stone, Gt, 0, 2.2, sz * 2.3, { r: 0.03 }); k.box(1.25, 0.3, 1.25, stone, Gt, 0, 4.5, sz * 2.3, { r: 0.03 }); k.ball(0.26, face, Gt, 0, 4.95, sz * 2.3); }
      k.torus(2.3, 0.1, bronze, Gt, 0, 4.6, 0, { arc: PI, ry: PI / 2 }); k.torus(1.75, 0.06, bronze, Gt, 0, 4.6, 0, { arc: PI, ry: PI / 2 });
      for (let i = 1; i < 8; i++) { const a = i * PI / 8; k.box(0.05, 0.55, 0.05, bronze, Gt, 0, 4.6 + Math.sin(a) * 2.02, Math.cos(a) * 2.02, { rx: PI / 2 - a }); }
      k.box(0.12, 0.5, 1.7, bronze, Gt, 0, 4.85, 0, { r: 0.02 }); k.box(0.1, 0.1, 4.6, bronze, Gt, 0, 4.6, 0);
      // 钟楼
      const T = k.group(street, tx, 0.2, tz); T.scale.setScalar(0.74);
      k.box(5.6, 1.4, 5.6, stone, T, 0, 0.7, 0, { r: 0.05 }); k.box(4.2, 22, 4.2, stone, T, 0, 12.4, 0); k.box(4.9, 4.2, 4.9, stone, T, 0, 25.5, 0); k.box(5.4, 0.45, 5.4, stone, T, 0, 27.8, 0, { r: 0.04 }); k.box(4.6, 0.4, 4.6, stone, T, 0, 23.3, 0);
      for (let i = 0; i < 4; i++) {
        const f = k.group(T, Math.sin(i * PI / 2) * 2.1, 0, Math.cos(i * PI / 2) * 2.1, i * PI / 2);
        for (const xx of [-1.15, 0, 1.15]) k.box(0.42, 17.5, 0.08, slit, f, xx, 11.4, 0.01, { cast: false });
        for (const xx of [-1.3, 0, 1.3]) k.box(0.7, 1.5, 0.1, slit, f, xx, 24.3, 0.36, { cast: false });                                      // 钟室的拱窗
        k.cyl(1.05, 1.05, 0.1, face, f, 0, 26.3, 0.36, { rx: PI / 2 }); k.box(0.08, 0.85, 0.04, hand, f, 0, 26.65, 0.43, { cast: false }); k.box(0.6, 0.08, 0.04, hand, f, 0.27, 26.3, 0.43, { cast: false });
      }
      k.cone(3.5, 5.6, '#8fa89c', T, 0, 30.8, 0, { seg: 4, ry: PI / 4, rough: 0.6, metal: 0.3, tex: 'bronze' }); k.cyl(0.07, 0.07, 1.8, hand, T, 0, 34.4, 0); k.ball(0.22, '#e2b84a', T, 0, 35.3, 0, { metal: 1, rough: 0.3 });
      for (let i = 0; i < 14; i++) { const px = cx + (hsh(seed, i, 7) - 0.5) * (bw - 9), pz = cz + (i % 2 ? 1 : -1) * (2.4 + hsh(seed, i, 9) * (bd / 2 - SW - 3.2)); if (Math.hypot(px - tx, pz - tz) > 4.2 && px < gx - 2) trees.push([px, pz, 0.9 + hsh(seed, i, 8) * 0.7, hsh(seed, i, 11) * 40]); }
      place(street, 'bench', gx - 3.2, 0.27, cz + 1.9, PI); place(street, 'bench', gx - 3.2, 0.27, cz - 1.9, 0); place(street, PROPS.bulletin_board ? 'bulletin_board' : 'bench', gx - 0.4, 0.27, cz + 4.6, PI / 2, { seed });
    }
    for (const [x0, x1, ci] of X) for (const [z0, z1, cj] of Z) {
      const ring = Math.max(Math.abs(ci), Math.abs(cj)); if (!ring) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bw = x1 - x0, bd = z1 - z0, seed = ((ci + 5) * 131 + (cj + 5) * 17 + lv * 977 + (bay ? 7 : 0)) | 0, r0 = hsh(seed, 0, 1);
      k.box(bw, 0.18, bd, walk, ground, cx, 0.09, cz, { r: 0.06 });
      if (det === 0 && ring >= 3) { yield; continue; }                                    // 手机档：最外圈只铺地，不盖楼
      const lod = ring === 1 ? 2 : ring === 2 ? 1 : 0, safe = safeDir(cx, cz);
      // 行道树、路灯
      if (ring < 3 && (det > 0 || ring === 1)) for (let s = 0; s < 4; s++) {
        const len = s % 2 ? bd : bw, n = Math.max(1, Math.round(len / 8));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n * len - len / 2, px = s === 0 ? cx + t : s === 2 ? cx + t : s === 1 ? x1 - 1.0 : x0 + 1.0, pz = s === 1 ? cz + t : s === 3 ? cz + t : s === 0 ? z1 - 1.0 : z0 + 1.0;
          const r = hsh(seed + s, i, 5);                                                    // 树多不多、棕榈占几成、人行道上摆什么零碎，都看落脚点
          if (r < treeP) { if (ring === 1 && r < treeP * palmP) place(street, 'tree_palm', px, 0.18, pz, r * 40); else trees.push([px, pz, 0.8 + hsh(seed + s, i, 6) * 0.5, r * 40]); }
          else if (ring === 1 && r < treeP + 0.2) place(street, 'street_lamp', px, 0.18, pz, s * Math.PI / 2);
          else if (ring === 1) { const fn = furn[(r * 977 | 0) % furn.length]; place(street, PROPS[fn] ? fn : 'trash_public', px, 0.18, pz, s * Math.PI / 2, { seed: (r * 99) | 0 }); }
        }
      }
      // 大学城：办公室左边那个街区是校园
      if (HD?.campus && ci === -1 && cj === 0) { campus(cx, cz, bw, bd, seed); yield; continue; }
      // 街区内容：小公园，或者一组楼
      if (ring < 3 && r0 < (HD ? HD.park : bay ? 0.14 : 0.08) && (ci !== 0 || cj !== 0)) {
        k.box(bw - 2 * SW, 0.12, bd - 2 * SW, lawn, ground, cx, 0.2, cz, { r: 0.05 });
        for (let i = 0; i < 12; i++) { const px = cx + (hsh(seed, i, 7) - 0.5) * (bw - 9), pz = cz + (hsh(seed, i, 9) - 0.5) * (bd - 9); if (i % 5 === 4) { if (ring === 1) place(street, 'bench', px, 0.24, pz, hsh(seed, i, 11) * 6); } else trees.push([px, pz, 0.9 + hsh(seed, i, 8) * 0.7, hsh(seed, i, 11) * 40]); }
        if (ring === 1) place(street, 'billboard', cx, 0.24, cz, Math.atan2(-cx, -cz), { art: artMat?.(seed), seed });
        yield; continue;
      }
      const mi = lv + (ring === 2 ? 1 : 0), mix = ring >= 3 || (ring === 2 && safe) ? HD?.far || FAR[bay ? 'bay' : 'sz'] : HD && mi <= 2 ? HD.mix[mi - 1] : MIX[bay ? 'bay' : 'sz'][clamp(mi, 1, 5)];
      const sty = pick(mix, hsh(seed, 0, 13)), S = STY[sty], iw = bw - 2 * SW, id = bd - 2 * SW;
      const nx = Math.max(1, Math.round(iw / S.lot)), nz = Math.max(1, Math.round(id / S.lot)), lw = (iw - (nx - 1) * S.gap) / nx, ld = (id - (nz - 1) * S.gap) / nz;
      if (S.yard) k.box(iw, 0.1, id, lawn, ground, cx, 0.2, cz, { r: 0.04 });
      const units = new Map();
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const s2 = seed * 31 + a * 7 + b, bx = cx - iw / 2 + lw / 2 + a * (lw + S.gap), bz = cz - id / 2 + ld / 2 + b * (ld + S.gap), inset = S.yard ? (S.inset ?? 1.6) + hsh(s2, 1, 15) * 1.2 : 0;
        let fl = Math.round(lerp(S.fl[0], S.fl[1], hsh(s2, 2, 17)) * (ring === 3 ? 1.15 : ring > 3 ? 1.3 : 1) * (safe && ring >= 2 ? HD?.tall || 1 : 1));
        if (!safe) fl = Math.min(fl, ring >= 3 ? 9 : ring === 2 ? 16 : 99);
        if (ring >= 3) { makeBuilding(sty, bx, bz, lw - inset * 2, ld - inset * 2, fl, s2, lod, far, far); continue; }
        const uk = ring === 1 ? ((a * 2 / nx) | 0) + ',' + ((b * 2 / nz) | 0) : '0';
        let U = units.get(uk); if (!U) units.set(uk, (U = { base: k.group(), upper: k.group(), pts: [], h: 0 }));
        const B = makeBuilding(sty, bx, bz, lw - inset * 2, ld - inset * 2, fl, s2, lod, U.base, U.upper);
        U.pts.push(B); U.h = Math.max(U.h, B.h);
      }
      for (const U of units.values()) {
        U.x = U.pts.reduce((s, p) => s + p.x, 0) / U.pts.length; U.z = U.pts.reduce((s, p) => s + p.z, 0) / U.pts.length;
        U.r = Math.max(...U.pts.map(p => Math.hypot(p.x - U.x, p.z - U.z) + p.r)); heroes.push(U);
      }
      yield;
    }
    // 车道线、斑马线（实例化）
    const marks = [], M = new THREE.Matrix4(), ax = hx + RW / 2, az = hz + RW / 2;
    const dash = (x, z, alongX) => marks.push(alongX ? M.clone().makeRotationY(Math.PI / 2).setPosition(x, 0.012, z) : M.clone().makeTranslation(x, 0.012, z));
    for (const sg of [-1, 1]) {
      for (let t = -EX + 20; t <= EX - 20; t += 4.2) { if (Math.abs(t) < az - 7 || Math.abs(t) > az + 4.5) dash(sg * ax, t, false); if (Math.abs(t) < ax - 7 || Math.abs(t) > ax + 4.5) dash(t, sg * az, true); }
      for (const m of [1, 2]) { const ox = hx + RW + m * BL + (m - 1) * ST + ST / 2, oz = hz + RW + m * BL + (m - 1) * ST + ST / 2; for (let t = -EX + 20; t <= EX - 20; t += 4.2) { dash(sg * ox, t, false); dash(t, sg * oz, true); } }
    }
    const dashI = new THREE.InstancedMesh(k.geo('dash3a', () => new THREE.BoxGeometry(0.16, 0.02, 1.8)), paint, marks.length); marks.forEach((m, n) => dashI.setMatrixAt(n, m)); dashI.receiveShadow = true; root.add(dashI);
    const zeb = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let q = -3.1; q <= 3.11; q += 0.775) {                // 四个路口，每个路口两道斑马线
      zeb.push(M.clone().makeTranslation(sx * ax + q, 0.012, sz * (hz - 1.2))); zeb.push(M.clone().makeRotationY(Math.PI / 2).setPosition(sx * (hx - 1.2), 0.012, sz * az + q));
    }
    const zebI = new THREE.InstancedMesh(k.geo('zebra3a', () => new THREE.BoxGeometry(0.42, 0.02, 2.2)), paint, zeb.length); zeb.forEach((m, n) => zebI.setMatrixAt(n, m)); zebI.receiveShadow = true; root.add(zebI);
    // 路口设施、公交站、小吃摊/餐车、路边停的车
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(street, 'traffic_light', sx * (hx + RW + 0.9), 0.18, sz * (hz + RW + 0.9), sx > 0 ? (sz > 0 ? Math.PI : -Math.PI / 2) : (sz > 0 ? Math.PI / 2 : 0));
    const hood = HD ? o.hood : '', HS = HOOD_STREET[hood] || {}, resv = [];                 // resv：路边被占掉的一段（施工围挡），不停车
    place(street, 'bus_stop', -hx * 0.3, 0.18, -(hz + RW + 1.3), 0, { art: artMat?.(3), brand: o.brand });
    if (!HS.quiet) place(street, bay ? 'food_truck' : 'food_cart', hx + RW - 1.6, bay ? 0 : 0.0, hz * 0.2, bay ? 0 : Math.PI / 2, { seed: 2 });
    place(street, 'bike_rack', hx + RW + 1.3, 0.18, -hz * 0.4, Math.PI / 2, { seed: lv });
    if (!HS.quiet) place(street, 'kiosk', -(hx + RW + 1.4), 0.18, hz * 0.5, Math.PI / 2, { seed: lv });
    // 办公室背后和左边那两条人行道正对着镜头：落脚点街区特有的东西摆在这儿
    for (const [side, list] of [[2, HS.back], [3, HS.left]]) for (const [name, t, off, r = 0] of list || []) {
      const n = PROPS[name] ? name : null; if (!n) continue;
      const a = t * (side === 2 ? hx : hz), dd = (side === 2 ? hz : hx) + RW + off, y = off > 0 ? 0.18 : 0, sd = (t * 50 + off * 7) | 0;
      if (side === 2) place(street, n, a, y, -dd, r, { seed: sd, brand: o.brand, art: artMat?.(sd + 5) }); else place(street, n, -dd, y, a, Math.PI / 2 + r, { seed: sd, brand: o.brand, art: artMat?.(sd + 5) });
      if (off < 0) resv.push([side, a]);
    }
    if (HS.fence && PROPS.picket_fence) for (let z = -hz + 1; z <= hz - 0.9; z += 2) place(street, 'picket_fence', -(hx + RW + 2.3), 0.18, z, Math.PI / 2, {}, true);   // 郊区：左边人家的白栅栏
    if (HD?.wires && PROPS.utility_pole) {                                                 // 城中村：电线杆和头顶的线（只拉在办公室背后，不挡镜头）
      const wire = k.mat('#20242b', { rough: 0.7, tex: 'rubber' }), P2 = [[-(hx + RW + 1.1), hz * 0.7], [-(hx + RW + 1.1), -hz * 0.95], [-hx * 0.75, -(hz + RW + 1.1)], [hx * 0.85, -(hz + RW + 1.1)]];
      P2.forEach(([x, z], i) => place(street, 'utility_pole', x, 0.18, z, i < 2 ? 0 : Math.PI / 2, { seed: i }, true));
      for (let i = 0; i < 3; i++) for (const dy of [0, -0.4, -0.75]) { const a = P2[i], b = P2[i + 1]; k.tube([[a[0], 6.9 + dy, a[1]], [(a[0] + b[0]) / 2, 6.0 + dy, (a[1] + b[1]) / 2], [b[0], 6.9 + dy, b[1]]], 0.025, wire, street, 0, 0, 0, { cast: false }); }
    }
    const carNames = (HD?.parked[0] || (bay ? ['car_sedan', 'car_suv', 'car_pickup', 'robotaxi', 'car_hatch'] : ['car_sedan', 'car_suv', 'car_taxi', 'car_hatch', 'van_delivery'])).filter(n => PROPS[n]), carCol = ['#e5484d', '#f4f4f2', '#2b2f38', '#3f7fd6', '#c9ced6', '#f2c14e', '#2f8f6b', '#8a8f98'];
    if (!carNames.length) carNames.push('car');
    for (let i = 0; i < (det === 0 ? 3 : HD?.parked[1] || 6); i++) {                      // 路边停车
      const s = i % 4, t = (hsh(i, lv, 21) - 0.5) * 2 * (s % 2 ? hz : hx) * 0.8, off = RW - 0.85;
      if (resv.some(([rs, a]) => rs === s && Math.abs(t - a) < 3.4)) continue;
      place(street, carNames[i % carNames.length], s === 0 ? t : s === 2 ? t : s === 1 ? hx + off : -(hx + off), 0, s === 1 ? t : s === 3 ? t : s === 0 ? hz + off : -(hz + off), s % 2 ? (s === 1 ? Math.PI : 0) : (s === 0 ? Math.PI / 2 : -Math.PI / 2), { brand: carCol[(i * 3) % 8], seed: i }, true);
    }
    // ── 远景：水面、山、地标 ──
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 900), own(new THREE.MeshStandardMaterial({ color: bay ? 0x2f6288 : 0x3b6f84, roughness: 0.08, metalness: 0.55, envMapIntensity: 1.4 })));
    owned.push(sea.geometry); sea.rotation.x = -Math.PI / 2; sea.position.set(-EX - 380, 0.05, -EX - 380); sea.rotation.z = Math.PI / 4; sea.receiveShadow = false; root.add(sea);
    const hill = k.mat(bay ? '#8a9a6a' : '#5f8a66', { rough: 1, tex: 'foliage' });
    for (let i = 0; i < 9; i++) { const a = Math.PI * 1.25 + (i - 4) * 0.21, r = EX + 330 + hsh(i, 3, 23) * 160; k.ball(1, hill, far, Math.sin(a) * r, -8, Math.cos(a) * r, { sx: 120 + hsh(i, 4, 25) * 110, sy: 34 + hsh(i, 5, 27) * 46, sz: 90 + hsh(i, 6, 29) * 60, cast: false }); }
    const lm = k.group(far, -(EX + 120), 0, -(EX + 120), Math.PI / 4);
    if (bay) {                                                                              // 湾区：一座红色悬索桥
      const red = k.mat('#c5402f', { rough: 0.55, tex: 'paint' });
      k.box(260, 1.6, 7, red, lm, 0, 22, 0, { cast: false });
      for (const x of [-62, 62]) { for (const z of [3.4, -3.4]) k.box(3.4, 78, 3.4, red, lm, x, 39, z, { cast: false, r: 0.3 }); for (const y of [30, 50, 70]) k.box(3, 2.4, 9, red, lm, x, y, 0, { cast: false }); }
      for (let x = -124; x <= 124; x += 4) { const d = Math.min(1, Math.min(Math.abs(x - 62), Math.abs(x + 62)) / 62), hh = 1 + 52 * (1 - d) ** 2; k.box(0.3, hh, 0.3, red, lm, x, 22.8 + hh / 2, 3.4, { cast: false }); k.box(0.3, hh, 0.3, red, lm, x, 22.8 + hh / 2, -3.4, { cast: false }); }
    } else {                                                                                // 深圳：三座超高层
      for (const [x, hh, w2, c] of [[0, 190, 22, '#8fb0cf'], [46, 130, 20, '#7f9dbd'], [-40, 104, 24, '#9bb7d2']]) {
        const m = own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.1, metalness: 0.9, envMapIntensity: 1.3 }));
        k.box(w2, hh, w2, m, lm, x, hh / 2, 0, { cast: false }); k.cone(w2 * 0.62, hh * 0.22, m, lm, x, hh * 1.11, 0, { seg: 4, ry: Math.PI / 4, cast: false }); k.cyl(0.4, 0.4, 26, '#e8eef5', lm, x, hh * 1.22 + 13, 0, { cast: false });
      }
    }
    const tg = treeGeos(), trunkG = k.geo('ctrunk3a', () => new THREE.CylinderGeometry(0.11, 0.2, 2.3, 8)), leafC = bay ? ['#6faa5c', '#86b86a', '#5f9a58', '#9cbf6e'] : ['#4f9a57', '#5fae62', '#458a52', '#6cb86a'], cc = new THREE.Color(), TM = new THREE.Matrix4(), TQ = new THREE.Quaternion(), TS = new THREE.Vector3(), TP = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const trunkI = new THREE.InstancedMesh(trunkG, k.mat('#7a5a3e', { rough: 0.9, tex: 'wood' }), trees.length); trunkI.castShadow = trunkI.receiveShadow = true; root.add(trunkI);
    const leafM = k.mat('#ffffff', { rough: 0.92, tex: 'foliage' }), by = [[], [], []];
    trees.forEach((t, n) => { by[n % 3].push(t); TM.compose(TP.set(t[0], 0.18 + 1.15 * t[2], t[1]), TQ.setFromAxisAngle(UP, t[3]), TS.set(t[2], t[2], t[2])); trunkI.setMatrixAt(n, TM); });
    by.forEach((list, v) => {
      const im = new THREE.InstancedMesh(tg[v], leafM, list.length); im.castShadow = im.receiveShadow = true;
      list.forEach((t, n) => { TM.compose(TP.set(t[0], 0.18, t[1]), TQ.setFromAxisAngle(UP, t[3]), TS.set(t[2], t[2], t[2])); im.setMatrixAt(n, TM); im.setColorAt(n, cc.set(leafC[(t[3] * 7 | 0) % 4])); });
      root.add(im);
    });
    yield; addBake(ground, root, { cast: false }); yield; addBake(street); yield; addBake(far, root, { cast: false }).traverse(x => x.layers.set(FARL)); sea.layers.set(FARL); yield;
    const allBases = k.group(); for (const B of heroes) allBases.add(B.base); addBake(allBases); yield;
    const uppers = []; for (const B of heroes) { uppers.push(k.bake(B.upper)); yield; }
    const UB = batchGroups(uppers); root.add(UB.group); bakes.push(UB.group);
    heroes.forEach((B, i) => blds.push({ refs: UB.refs[i], x: B.x, z: B.z, r: B.r, h: B.h, s: 1, shown: -1 }));
    for (const g of tmpGeo) g.dispose(); tmpGeo.length = 0;

    // ── 车流：绕着办公室的环路 + 外面的直街 ──
    const mkCar = (name, color, seed) => { const g = P(name, { brand: color, seed }); if (!g) return null; const wheels = g.userData.wheels || [], b = k.bake(g); bakes.push(b); root.add(b); return { o: b, wheels, halfLength: PROPS[name].size[1] / 2 }; };
    const moving = (HD?.moving || (bay ? ['car_sedan', 'robotaxi', 'car_suv', 'car_hatch', 'bus_city', 'car_pickup', 'robotaxi', 'van_delivery'] : ['car_taxi', 'scooter_delivery', 'car_sedan', 'scooter_delivery', 'bus_city', 'car_suv', 'van_delivery', 'car_taxi'])).slice();
    if (det === 0) moving.length = 4;                                                       // 手机档：只留环路上的四辆车
    if (det >= 2) moving.push(...moving.slice(0, 6));                                     // 极致档：车多一些
    moving.forEach((n, i) => {
      const c = mkCar(PROPS[n] ? n : 'car', carCol[(i * 5 + 1) % 8], i); if (!c) return;
      if (i < 4) { const dir = i % 2 ? 1 : -1, off = dir > 0 ? -1.5 : 1.3; cars.push({ ...c, loop: true, a: ax + off, b: az + off, p: i * 37, v: dir * (5.2 + (i % 3) * 0.6) }); }
      else { const m = 1 + (i % 2), alongX = i % 4 < 2, sg = i % 3 ? 1 : -1, base = (alongX ? hz : hx) + RW + m * BL + (m - 1) * ST + ST / 2; cars.push({ ...c, alongX, sg, lane: (i % 2 ? 1 : -1) * base + (alongX ? sg : -sg) * 2.0, E: EX - 14, p: -EX + i * 53 % (2 * EX), v: 7 + (i % 3) * 1.4 }); }
    });
    // 行人：沿着环路外侧的人行道溜达
    const N = Math.round((det === 0 ? 10 : det >= 2 ? 40 : 22) * (HD?.peds || 1)), body = new THREE.InstancedMesh(k.geo('pedB', () => new THREE.CapsuleGeometry(0.17, 0.52, 4, 10)), k.mat('#ffffff', { rough: 0.8 }), N), head = new THREE.InstancedMesh(k.geo('pedH', () => new THREE.SphereGeometry(0.19, 12, 9)), k.mat('#ffffff', { rough: 0.6 }), N);
    const shirts = ['#e5484d', '#3f7fd6', '#f2c14e', '#2f8f6b', '#f4f4f2', '#2b2f38', '#8b5cf6', '#ff8a4c'], skins = ['#f3c9a3', '#e0ac7e', '#c68a5e', '#8d5a3c', '#f6d7b8'], col = new THREE.Color();
    for (let i = 0; i < N; i++) { body.setColorAt(i, col.set(shirts[i % 8])); head.setColorAt(i, col.set(skins[i % 5])); }
    body.castShadow = head.castShadow = true; root.add(body, head);
    peds = { body, head, N, a: hx + RW + 1.2, b: hz + RW + 1.2, M: new THREE.Matrix4() };
    frameInfo = { lotR: Math.hypot(hx, hz) };
  }

  const off = stage.onFrame((dt, t, env) => {
    if (job && live) { const t0 = performance.now(); while (performance.now() - t0 < 9) { if (job.gen.next().done) { finish(); break; } } }
    if (!live?.frameInfo) return;
    const { ticks, night, wetMats, blds, cars, peds, frameInfo } = live;
    for (const f of ticks) f(t, dt);
    for (const m of night) m[0].emissiveIntensity = lerp(m[1], m[2], env.night);
    for (const [m, r0, r1, c0, c1] of wetMats) { m.roughness = lerp(r0, r1, env.wet); m.color.copy(c0).lerp(c1, env.wet); }
    // 剖切：从镜头看过去，会挡住办公室的楼只留底层
    const az = stage.st.azNow ?? stage.st.az, cx = Math.sin(az), cz = Math.cos(az), tan = Math.tan(stage.st.el), kf = 1 - Math.exp(-dt * 7), wide = stage.st.mode === 'title' ? 2.4 : 1;
    for (const b of blds) {
      const along = b.x * cx + b.z * cz, lat = Math.abs(b.x * cz - b.z * cx), allow = Math.max(0, along - b.r - frameInfo.lotR * 0.55) * tan;
      const cut = along > 0 && lat < (frameInfo.lotR + b.r + 4) * wide && b.h > allow + 2;
      b.s = lerp(b.s, cut ? 0 : 1, kf);
      const q = b.s < 0.02 ? 0 : b.s > 0.995 ? 1 : b.s;
      if (q !== b.shown) { b.shown = q; CM.makeScale(1, Math.max(q, 0.001), 1).setPosition(0, GF * (1 - q), 0); for (const [bm, id] of b.refs) { bm.setMatrixAt(id, CM); bm.setVisibleAt(id, q > 0); } }
    }
    for (const c of cars) {
      let ry, distance = c.v * dt;
      if (c.loop) {
        const side = Math.sign(blockedStreetZ);
        if (side) {
          const [currentX, currentZ] = loopPos(c.p, c.a, c.b), [nextX, nextZ] = loopPos(c.p + distance, c.a, c.b);
          const waitGap = 4, vanEnvelope = 3.6, stopOffset = c.halfLength + vanEnvelope + waitGap;
          let gap = -1;
          if (side * (nextZ - currentZ) > 0) gap = Math.abs(blockedStreetZ) - side * currentZ - stopOffset;
          else if (side * currentZ >= c.b - 0.01) gap = Math.sign(nextX - currentX) * (parkedVanX - currentX) - stopOffset;
          if (gap >= 0) distance = Math.sign(distance) * Math.min(gap, Math.abs(distance) * clamp(gap / 2.5, 0, 1));
        }
        c.p += distance; const [x, z, r] = loopPos(c.p, c.a, c.b);
        const clearance = Math.max(0, Math.abs(blockedStreetZ) + 2.05 - c.b);
        const detour = side * clearance * clamp((side * z - c.b + 5) / 2, 0, 1);
        c.offsetZ = lerp(c.offsetZ || 0, detour, 1 - Math.exp(-dt * 10));
        c.o.position.set(x, 0, z + c.offsetZ); ry = c.v > 0 ? r : r + Math.PI;
      } else { c.p += distance * c.sg; if (Math.abs(c.p) > c.E) c.p = -c.sg * c.E; c.o.position.set(c.alongX ? c.p : c.lane, 0, c.alongX ? c.lane : c.p); ry = c.alongX ? c.sg * Math.PI / 2 : c.sg > 0 ? 0 : Math.PI; }
      c.o.rotation.y = ry; for (const w of c.wheels) w.rotation.x += Math.abs(distance) / 0.3;
    }
    if (peds) {
      const { body, head, N, a, b, M } = peds;
      for (let i = 0; i < N; i++) {
        const dir = i % 2 ? 1 : -1, sp = 0.9 + (i % 5) * 0.12, [x, z] = loopPos(i * 23.7 + t * sp * dir, a + (i % 3) * 0.5, b + (i % 3) * 0.5, 1.2), y = 0.18 + Math.abs(Math.sin(t * 6 * sp + i)) * 0.05;
        M.makeTranslation(x, y + 0.45, z); body.setMatrixAt(i, M); M.makeTranslation(x, y + 1.0, z); head.setMatrixAt(i, M);
      }
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
    }
  });
  function dispose() { if (job) abort(); if (live) { stage.scene.remove(live.root); release(live); live = null; } }
  return { build, dispose, destroy() { off(); dispose(); }, get root() { return live?.root; }, get busy() { return !!job; },
    setBlock(streetZ, vanX) { blockedStreetZ = streetZ; parkedVanX = vanX; }, clearBlock() { blockedStreetZ = 0; } };
}
