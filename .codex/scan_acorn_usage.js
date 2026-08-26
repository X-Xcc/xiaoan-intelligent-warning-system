const fs = require('fs')
const path = require('path')

const roots = [
  path.join(process.cwd(), 'node_modules', '@tarojs'),
]

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.ts') && !entry.name.endsWith('.cjs')) continue
    const text = fs.readFileSync(full, 'utf8')
    if (text.includes('acorn')) {
      out.push(full)
    }
  }
}

const hits = []
for (const root of roots) walk(root, hits)
for (const file of hits) console.log(file)
