const fs = require('fs')
const path = require('path')

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (path.basename(full) === 'types' && fs.existsSync(path.join(full, 'lib'))) {
        console.log(full)
      }
      walk(full)
    }
  }
}

walk(path.join(process.cwd(), 'node_modules', '@babel'))
