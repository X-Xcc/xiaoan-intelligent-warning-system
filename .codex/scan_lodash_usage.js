const fs = require('fs')
const path = require('path')

const root = path.join(process.cwd(), 'node_modules', '@tarojs')
const hits = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.ts')) continue
    const content = fs.readFileSync(full, 'utf8')
    if (content.includes('lodash')) {
      hits.push(full)
    }
  }
}

walk(root)
for (const file of hits) console.log(file)
