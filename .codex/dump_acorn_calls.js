const fs = require('fs')
const files = [
  'node_modules/@tarojs/plugin-framework-react/dist/index.js',
  'node_modules/@tarojs/webpack5-runner/dist/plugins/TaroComponentsExportsPlugin.js',
  'node_modules/@tarojs/webpack5-runner/dist/plugins/TaroNormalModulesPlugin.js',
]
for (const rel of files) {
  const file = `${process.cwd()}\\${rel}`
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  console.log(`## ${rel}`)
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('acorn')) {
      console.log(`${i + 1}: ${lines[i]}`)
    }
  }
}
