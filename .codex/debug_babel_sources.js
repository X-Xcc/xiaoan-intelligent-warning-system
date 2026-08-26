const fs = require('fs');
const path = require('path');
const babel = require('../node_modules/@babel/core');

const root = path.resolve('apps/miniprogram/src');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
walk(root);
files.push(path.resolve('node_modules/@tarojs/webpack5-runner/dist/template/custom-wrapper.js'));

for (const file of files) {
  try {
    babel.transformFileSync(file, { cwd: path.resolve('apps/miniprogram') });
    console.log(`ok ${path.relative(process.cwd(), file)}`);
  } catch (error) {
    console.error(`FAIL ${path.relative(process.cwd(), file)}`);
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}
