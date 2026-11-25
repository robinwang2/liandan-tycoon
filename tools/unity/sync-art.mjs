// 使用网页自己的绘图函数生成 Unity 可直接读取的 PNG；以美术表中的实际引用为准。
import sharp from 'sharp';
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_COLORS, LOGOS, logoSVG } from '../../src/ui/logos.js';
import { icon } from '../../src/ui/icons.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const dest=resolve(process.argv[2]??join(root,'unity/Game/Assets/StreamingAssets/shell-art'));
await mkdir(dest,{recursive:true});
const expected=new Set();
async function save(name,bytes){expected.add(name); const path=join(dest,name);let old;try{old=await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;}if(!old?.equals(bytes))await writeFile(path,bytes);}
async function svg(name,data){await save(name+'.png',await sharp(Buffer.from(data)).png().toBuffer());}
const art=JSON.parse(await readFile(join(root,'src/data/tables/art.json'),'utf8'));
for(const row of art.ART.filter(row=>row.uses>0))await save('art-'+row.id+'.jpg',await sharp(join(root,row.file)).jpeg({quality:90}).toBuffer());
const manifest={colors:BRAND_COLORS};
const colors=[...BRAND_COLORS];for(const region of ['cn','us'])colors.push(JSON.parse(await readFile(join(root,`src/data/tables/ideology_${region}.json`),'utf8')).VER.brand);
for(const [region,marks] of Object.entries(LOGOS)){manifest[region]=marks.map(({id,name})=>({id,name}));for(const {id} of marks)for(const color of colors)await svg(`logo-${id}-${color.slice(1)}`,logoSVG(id,color,64));}
// 员工和创始人头像由 Unity 的 Avatar.cs 按 uid 现场画，不再出图；旧的 avatar-/founder- 图片由下方清理删掉。
const ui=await readFile(join(root,'src/ui/ui.js'),'utf8');
for(const key of ['longhair','streamer']){const source=ui.match(new RegExp('const '+key.toUpperCase()+" = [`'](<svg[^\\n]+?</svg>)[`'];"));if(!source)throw Error('未找到剧情头像：'+key);await svg('portrait-'+key,source[1]);}
for(const key of ['settings','building','board','pin','team','safe','cards','ledger','news','flask','people','coins','megaphone','gear','flag'])await svg('icon-'+key,icon(key,48).replaceAll('currentColor','#e7e9ef'));
await save('brand.json',Buffer.from(JSON.stringify(manifest)));
for(const name of await readdir(dest))if(/^(art-|logo-|avatar-|founder-|icon-).+\.(jpg|png)$/.test(name)&&!expected.has(name))await unlink(join(dest,name));
console.log(`已同步 ${expected.size} 个界面资源`);
