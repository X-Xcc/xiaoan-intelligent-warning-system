const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const archive = fs.readFileSync(path.resolve('.codex/tmp/helpers-7.29.7.tgz'));
const tar = zlib.gunzipSync(archive);
const targetDir = path.resolve('.codex/tmp/helpers-7.29.7/package/lib');
fs.mkdirSync(targetDir, { recursive: true });

for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;
  const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
  const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
  const size = parseInt(sizeText || '0', 8);
  const dataStart = offset + 512;
  const dataEnd = dataStart + size;
  if (name === 'package/lib/helpers-generated.js' || name === 'package/lib/helpers-generated.js.map') {
    const output = path.join(targetDir, path.basename(name));
    fs.writeFileSync(output, tar.subarray(dataStart, dataEnd));
    console.log(`extracted ${output}`);
  }
  offset = dataStart + Math.ceil(size / 512) * 512;
}

const source = path.resolve('.codex/tmp/helpers-7.29.7/package/lib/helpers-generated.js');
const destination = path.resolve('node_modules/@babel/helpers/lib/helpers-generated.js');
fs.copyFileSync(source, destination);
const mapSource = path.resolve('.codex/tmp/helpers-7.29.7/package/lib/helpers-generated.js.map');
if (fs.existsSync(mapSource)) fs.copyFileSync(mapSource, path.resolve('node_modules/@babel/helpers/lib/helpers-generated.js.map'));
console.log(`restored ${destination}`);
