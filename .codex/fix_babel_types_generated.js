const fs = require('fs')
const path = require('path')

const root = process.cwd()
const officialLib = path.join(root, '.codex', 'tmp', 'babel-types-7.28.5', 'package', 'lib')

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      visit(full)
      walk(full, visit)
    }
  }
}

const babelRoot = path.join(root, 'node_modules', '@babel')

if (fs.existsSync(babelRoot)) {
  walk(babelRoot, (dir) => {
    if (path.basename(dir) !== 'types') return
    const libDir = path.join(dir, 'lib')
    if (!fs.existsSync(libDir)) return
    copyFile(path.join(officialLib, 'builders', 'generated', 'index.js'), path.join(libDir, 'builders', 'generated', 'index.js'))
    copyFile(path.join(officialLib, 'builders', 'generated', 'lowercase.js'), path.join(libDir, 'builders', 'generated', 'lowercase.js'))
    copyFile(path.join(officialLib, 'builders', 'generated', 'uppercase.js'), path.join(libDir, 'builders', 'generated', 'uppercase.js'))
    copyFile(path.join(officialLib, 'validators', 'generated', 'index.js'), path.join(libDir, 'validators', 'generated', 'index.js'))
  })
}
