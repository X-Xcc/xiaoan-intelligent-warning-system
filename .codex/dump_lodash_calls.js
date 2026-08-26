const fs = require('fs')

const files = [
  'node_modules/@tarojs/helper/dist/esbuild/index.js',
  'node_modules/@tarojs/helper/dist/esbuild/swc-plugin.js',
  'node_modules/@tarojs/helper/dist/utils.js',
  'node_modules/@tarojs/plugin-framework-react/dist/index.js',
  'node_modules/@tarojs/service/dist/Kernel.js',
  'node_modules/@tarojs/service/dist/platform-plugin-base/web.js',
  'node_modules/@tarojs/service/dist/utils/index.js',
  'node_modules/@tarojs/webpack5-prebundle/dist/prebundle/bundle.js',
  'node_modules/@tarojs/webpack5-prebundle/dist/webpack/TaroModuleFederationPlugin.js',
  'node_modules/@tarojs/webpack5-runner/dist/index.mini.js',
  'node_modules/@tarojs/webpack5-runner/dist/plugins/H5Plugin.js',
  'node_modules/@tarojs/webpack5-runner/dist/plugins/TaroNormalModule.js',
  'node_modules/@tarojs/webpack5-runner/dist/prerender/prerender.js',
  'node_modules/@tarojs/webpack5-runner/dist/utils/app.js',
  'node_modules/@tarojs/webpack5-runner/dist/utils/logHelper.js',
  'node_modules/@tarojs/webpack5-runner/dist/webpack/HarmonyWebpackModule.js',
  'node_modules/@tarojs/webpack5-runner/dist/webpack/MiniWebpackModule.js',
]

for (const rel of files) {
  const file = `${process.cwd()}\\${rel}`
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const matches = lines
    .map((line, idx) => ({ line, idx: idx + 1 }))
    .filter(({ line }) => line.includes('lodash'))
    .map(({ line, idx }) => `${idx}: ${line}`)
  if (matches.length) {
    console.log(`## ${rel}`)
    for (const line of matches) console.log(line)
  }
}
