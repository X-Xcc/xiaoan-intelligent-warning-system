const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const archive = fs.readFileSync(path.resolve('.codex/tmp/esbuild-0.21.5.tgz'));
const tar = zlib.gunzipSync(archive);

for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  if (header.every((byte) => byte === 0)) break;
  const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
  const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
  const size = parseInt(sizeText || '0', 8);
  const dataStart = offset + 512;
  const dataEnd = dataStart + size;
  if (name === 'package/lib/main.js' || name === 'package/lib/main.d.ts') {
    const destination = path.resolve('node_modules/esbuild/lib', path.basename(name));
    fs.writeFileSync(destination, tar.subarray(dataStart, dataEnd));
    console.log(`restored ${destination}`);
  }
  offset = dataStart + Math.ceil(size / 512) * 512;
}
