const fs = require('fs')

const files = [
  'node_modules/@tarojs/webpack5-runner/dist/utils/logHelper.js',
]

for (const rel of files) {
  const file = `${process.cwd()}\\${rel}`
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  console.log(`## ${rel}`)
  for (const [idx, line] of lines.entries()) {
    if (line.includes('lodash/fp')) {
      console.log(`${idx + 1}: ${line}`)
    }
  }
}
