const fs = require('fs')
const path = require('path')

const root = process.cwd()
const officialLib = path.join(root, '.codex', 'tmp', 'babel-types-7.28.5', 'package', 'lib')
const targets = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (path.basename(full) === 'types' && fs.existsSync(path.join(full, 'lib'))) {
        targets.push(full)
      }
      walk(full)
    }
  }
}

walk(path.join(root, 'node_modules', '@babel'))

for (const dir of targets) {
  const libDir = path.join(dir, 'lib')
  const pairs = [
    ['builders/generated/index.js', 'builders/generated/index.js'],
    ['builders/generated/lowercase.js', 'builders/generated/lowercase.js'],
    ['builders/generated/uppercase.js', 'builders/generated/uppercase.js'],
    ['validators/generated/index.js', 'validators/generated/index.js'],
  ]
  for (const [srcRel, destRel] of pairs) {
    const src = path.join(officialLib, srcRel)
    const dest = path.join(libDir, destRel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
  console.log(dir)
}
