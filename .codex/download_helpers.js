const fs = require('fs');
const path = require('path');

const url = 'https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.7.tgz';
const output = path.resolve('.codex/tmp/helpers-7.29.7.tgz');

fetch(url)
  .then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(output, buffer);
    console.log(`downloaded ${buffer.length} bytes to ${output}`);
  })
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
