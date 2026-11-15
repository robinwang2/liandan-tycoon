import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Usage: node tools/art-pack.mjs [furnace congress ...]
// No arguments packs every art-src/*.png. The contact sheet includes all WebPs.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'art-src');
const outputDir = join(root, 'src', 'assets', 'art');
const contactPath = join(root, 'docs', 'art-contact.jpg');
const width = 1024;
const height = 432;
const maxBytes = 120_000;
const columns = 6;
const thumbWidth = 256;
const thumbHeight = 108;
const labelHeight = 28;
const cellHeight = thumbHeight + labelHeight;

function escapeXml(value) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[char]);
}

async function main() {
  const sources = (await readdir(sourceDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.png'))
    .map(entry => entry.name.slice(0, -4)).sort();
  const requested = [...new Set(process.argv.slice(2))];
  const keys = requested.length ? requested : sources;
  if (!keys.length) throw new Error('No PNG originals found in art-src.');
  for (const key of keys) {
    if (!sources.includes(key)) throw new Error(`Missing original: art-src/${key}.png`);
  }
  await mkdir(outputDir, { recursive: true });
  for (const key of keys) {
    // Sharp cover + centre crops to the exact 1024:432 (about 2.37:1) ratio.
    const pipeline = sharp(join(sourceDir, `${key}.png`)).rotate()
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#101c29' }).toColourspace('srgb');
    let quality = 80;
    let encoded;
    for (; quality >= 40; quality -= 2) {
      encoded = await pipeline.clone().webp({ quality, effort: 6 }).toBuffer();
      if (encoded.length <= maxBytes) break;
    }
    if (encoded.length > maxBytes) {
      throw new Error(`${key}: cannot meet 120 KB limit at quality 40 or higher.`);
    }
    await writeFile(join(outputDir, `${key}.webp`), encoded);
    console.log(`${key}: ${width}x${height}, ${(encoded.length / 1000).toFixed(1)} KB, quality ${quality}`);
  }

  const products = (await readdir(outputDir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.webp'))
    .map(entry => entry.name).sort();
  const overlays = [];
  for (const [index, filename] of products.entries()) {
    const left = (index % columns) * thumbWidth;
    const top = Math.floor(index / columns) * cellHeight;
    const thumbnail = await sharp(join(outputDir, filename))
      .resize(thumbWidth, thumbHeight, { fit: 'cover', position: 'centre' })
      .png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${thumbWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101c29"/><text x="128" y="19" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#e9e5d8">${escapeXml(filename.slice(0, -5))}</text></svg>`);
    overlays.push({ input: thumbnail, left, top });
    overlays.push({ input: label, left, top: top + thumbHeight });
  }
  await mkdir(dirname(contactPath), { recursive: true });
  await sharp({ create: {
    width: columns * thumbWidth,
    height: Math.ceil(products.length / columns) * cellHeight,
    channels: 3, background: '#101c29',
  } }).composite(overlays).jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toFile(contactPath);
  console.log(`Contact sheet: docs/art-contact.jpg (${products.length} images, ${columns} columns)`);
}

main().catch(error => {
  console.error(`Art pack failed: ${error.message}`);
  process.exitCode = 1;
});
