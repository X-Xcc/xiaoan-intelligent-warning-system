import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Fictional, never-geocoded streets. Geometry and seed are copied from drawCity()
// in .superpowers/brainstorm/contact-map-20260914/content/map-directions.html (B).
// Only the WebP is an app asset; the SVG exists in memory during generation.
// Reproduce with the same sharp/libvips versions and installed CJK fonts.
// Example: node tools/generate_contact_case_basemap.mjs --sharp-module <sharp-directory>
// A normally resolvable sharp installation or SHARP_MODULE also works.
const require = createRequire(import.meta.url);
const defaultOutput = fileURLToPath(new URL(
  '../apps/dashboard/public/contact-review-assets/night-market-case-basemap.webp',
  import.meta.url,
));
const fontFamily = 'Microsoft YaHei, Noto Sans CJK SC, WenQuanYi Zen Hei, sans-serif';

const roads = [
  { p: [[-40, 154], [229, 187], [434, 188], [790, 110], [1240, 157]], w: 27, major: true, name: '\u7d2b\u8346\u5927\u9053', x: 581, y: 147, a: -0.21 },
  { p: [[104, -40], [187, 182], [243, 402], [352, 822]], w: 25, major: true, name: '\u6ee8\u6cb3\u8def', x: 259, y: 466, a: 1.32 },
  { p: [[-20, 694], [328, 667], [720, 666], [1230, 683]], w: 30, major: true, name: '\u5357\u73af\u8def', x: 589, y: 670, a: 0 },
  { p: [[998, -40], [1004, 299], [943, 527], [1117, 825]], w: 29, major: true, name: '\u5b66\u9662\u8def', x: 974, y: 405, a: -1.3 },
  { p: [[333, -20], [359, 110], [386, 204], [451, 410], [526, 671], [558, 820]], w: 16 },
  { p: [[739, -20], [774, 161], [841, 373], [898, 542], [932, 671], [954, 820]], w: 17, name: '\u5546\u8d38\u4e1c\u8857', x: 850, y: 348, a: 1.27 },
  { p: [[-20, 406], [241, 402], [451, 410], [664, 359], [841, 373], [1240, 393]], w: 18, name: '\u591c\u5e02\u5357\u8857', x: 363, y: 411, a: 0 },
  { p: [[286, 42], [637, 28], [998, 55], [1240, 74]], w: 13 },
  { p: [[115, 281], [381, 279], [600, 238], [822, 275], [1210, 287]], w: 12 },
  { p: [[334, 591], [604, 545], [733, 527], [894, 543], [1190, 570]], w: 14, name: '\u540e\u8857', x: 597, y: 550, a: -0.16 },
  { p: [[631, -20], [677, 133], [712, 251]], w: 10 },
  { p: [[1096, 172], [1092, 385], [1131, 583], [1132, 683]], w: 10 },
  { p: [[607, 667], [599, 777]], w: 12 },
];

// Neutral physical pavement, not the colored/dashed case route. Keep these
// centerlines exact so the parent's five points and eleven route vertices align.
const walkways = [
  [[440, 230], [525, 215], [560, 250]],
  [[560, 250], [550, 340], [640, 365], [680, 350]],
  [[680, 350], [695, 438], [720, 505]],
  [[720, 505], [795, 535], [830, 590], [890, 595]],
];

const format = value => Number(value.toFixed(4));
const points = vertices => vertices.map(vertex => vertex.map(format).join(',')).join(' ');
const degrees = radians => format(radians * 180 / Math.PI);

export function buildBasemapSvg() {
  let seed = 213;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1560" viewBox="0 0 1200 780">',
    '<title>Fictional night-market district basemap</title>',
    '<desc>Approved B composition. Not actual geography. No case route, camera markers or role labels.</desc>',
  ];
  const rect = (x, y, width, height, fill, stroke, strokeWidth = 0.7) => {
    svg.push(`<rect x="${format(x)}" y="${format(y)}" width="${format(width)}" height="${format(height)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : ''}/>`);
  };
  const line = (vertices, width, color, dash = '') => {
    svg.push(`<polyline points="${points(vertices)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
  };
  const polygon = (vertices, color) => {
    svg.push(`<polygon points="${points(vertices)}" fill="${color}"/>`);
  };
  const label = (text, x, y, size = 13, color = '#768079', angle = 0) => {
    svg.push(`<text transform="translate(${x} ${y}) rotate(${degrees(angle)})" font-family="${fontFamily}" font-size="${size}" text-anchor="middle" fill="${color}" stroke="#f8faf7" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${text}</text>`);
  };

  rect(0, 0, 1200, 780, '#edf0ee');
  // Preserve the prototype's random calls, parcel positions, and roof footprints.
  for (let y = -25; y < 850; y += 100) {
    for (let x = -30; x < 1300; x += 130) {
      svg.push(`<g transform="translate(${format(x + random() * 10)} ${format(y + random() * 10)}) rotate(${degrees(-0.12)})">`);
      rect(0, 0, 119, 88, '#e3e8e1');
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const bx = 6 + col * 37;
          const by = 7 + row * 39;
          const w = 23 + random() * 8;
          const h = 19 + random() * 9;
          rect(bx + 2, by + 3, w, h, '#cbd2d2');
          rect(bx, by, w, h, ['#dde1df', '#dadfdd', '#e6e2dd'][Math.floor(random() * 3)], '#c7cecb');
          // Small roof details enrich the raster without changing its topology.
          rect(bx + 3, by + 3, w - 6, h - 6, 'none', '#d0d6d2', 0.45);
          rect(bx + w - 9, by + 4, 4, 3, '#c6ceca');
          if (col === 1) rect(bx + 1, by + h + 4, w - 2, 4, '#bdcdb9');
        }
      }
      svg.push('</g>');
    }
  }

  const river = [[-20, -10], [37, 116], [88, 240], [70, 388], [134, 537], [228, 670], [245, 810]];
  line(river, 110, '#cbdcc8');
  line(river, 78, '#a9d2dd');
  line(river, 4, '#b8dce4');
  polygon([[285, 450], [413, 425], [475, 537], [399, 650], [283, 607]], '#cadfc9');
  polygon([[890, 15], [973, 23], [968, 117], [882, 133]], '#c7ddc8');
  for (let i = 0; i < 38; i++) {
    const x = 290 + random() * 125;
    const y = 463 + random() * 125;
    const radius = 4 + random() * 5;
    svg.push(`<circle cx="${format(x)}" cy="${format(y)}" r="${format(radius)}" fill="#b4d0b2"/>`);
  }

  roads.forEach(road => {
    line(road.p, road.w + 3, '#cbd0cd');
    line(road.p, road.w, road.major ? '#fbfaf0' : '#ffffff');
  });
  roads.filter(road => road.major).forEach(road => line(road.p, 1.2, '#e8d899', '9 11'));
  polygon([[399, 207], [740, 135], [818, 384], [647, 480], [532, 415]], '#e8e7df');
  line([[433, 213], [526, 196], [555, 242], [540, 349], [647, 375], [680, 350], [701, 444]], 22, '#f5f3e8');

  const stallRows = [
    [469, 253, 12, -0.18], [589, 170, 14, -0.2], [580, 278, 11, 0.19],
    [597, 407, 10, -0.24], [715, 274, 12, -0.2],
  ];
  for (const [x, y, count, angle] of stallRows) {
    svg.push(`<g transform="translate(${x} ${y}) rotate(${degrees(angle)})">`);
    for (let i = 0; i < count; i++) {
      rect(i * 11, 0, 9, 20, i % 3 === 0 ? '#c8dad4' : '#d9d6c9', '#bdc5bd', 0.8);
      rect(i * 11 + 1, 2, 7, 3, i % 3 === 0 ? '#b8cdc5' : '#cac6b5');
      line([[i * 11 + 4.5, 6], [i * 11 + 4.5, 18]], 0.5, '#ebece5');
    }
    svg.push('</g>');
  }
  polygon([[620, 257], [670, 247], [689, 292], [635, 313]], '#dbdbd1');
  polygon([[750, 436], [808, 417], [839, 477], [778, 499]], '#d1d9da');
  polygon([[824, 553], [902, 564], [923, 622], [847, 631]], '#e5e6df');
  for (let i = 0; i < 7; i++) {
    rect(837 + i * 9, 567, 8, 16, 'none', '#c3ccc9', 1);
    rect(839 + i * 9, 569, 4, 10, i % 2 ? '#b7c6cf' : '#c4cbd0');
  }

  // Paint open pavement above parcels/stalls/parking: the original canvas painted
  // parking over the last segment. No case-area or camera overlays are baked in.
  walkways.forEach(vertices => line(vertices, 14, '#d4d6ce'));
  walkways.forEach(vertices => line(vertices, 11, '#fffdf8'));

  roads.filter(road => road.name).forEach(road => label(road.name, road.x, road.y, 13, '#798078', road.a));
  label('\u6cbf\u6cb3\u6b65\u9053', 124, 389, 12, '#648d91', 1.18);
  label('\u6ee8\u6cb3\u7eff\u5730', 352, 540, 14, '#789c70');
  label('\u7d2b\u8346\u793e\u533a', 442, 90, 15);
  label('\u5b66\u9662\u751f\u6d3b\u533a', 1080, 220, 15);
  label('\u5546\u4e1a\u7efc\u5408\u4f53', 1069, 477, 14);
  label('\u591c\u5e02\u6b65\u884c\u8857', 650, 227, 16, '#8e8d7c', -0.19);
  label('\u9910\u996e\u5357\u533a', 592, 450, 13, '#9a8972');
  label('\u5546\u4f4f\u697c', 673, 734, 14);
  label('\u5317\u95e8', 533, 182, 11);
  label('\u821e\u53f0\u524d\u573a', 765, 473, 12);
  label('\u516c\u5171\u505c\u8f66\u573a', 873, 644, 12, '#6785a1');
  label('P', 868, 615, 18, '#6b94b0');
  label('\u516c\u4ea4\u7ad9', 734, 687, 11, '#7698ac');
  svg.push('</svg>');
  return svg.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      'sharp-module': { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('Usage: node tools/generate_contact_case_basemap.mjs [--sharp-module <path>] [--output <file.webp>]');
    console.log('Default: 2400x1560 WebP; logical canvas 1200x780. Requires sharp and an installed CJK font.');
    return;
  }
  const moduleName = values['sharp-module'] || process.env.SHARP_MODULE || 'sharp';
  let sharp;
  try {
    sharp = require(moduleName.startsWith('.') ? path.resolve(moduleName) : moduleName);
  } catch (error) {
    throw new Error(`Cannot load sharp (${moduleName}). Pass --sharp-module <path> or set SHARP_MODULE. ${error.message}`);
  }
  const output = values.output ? path.resolve(values.output) : defaultOutput;
  if (path.extname(output).toLowerCase() !== '.webp') throw new Error('--output must end in .webp');
  const bytes = await sharp(Buffer.from(buildBasemapSvg()))
    .removeAlpha()
    .webp({ quality: 98, effort: 6, smartSubsample: true })
    .toBuffer();
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== 2400 || metadata.height !== 1560 || metadata.format !== 'webp') {
    throw new Error('Unexpected raster dimensions or format');
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, bytes);
  console.log(JSON.stringify({
    output, width: metadata.width, height: metadata.height, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sharp: sharp.versions.sharp, vips: sharp.versions.vips, fontFamily,
  }, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`Basemap generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
