const path = require('path')
const babel = require('../node_modules/@babel/core')

const cwd = path.join(__dirname, '..', 'apps', 'miniprogram')

try {
  const result = babel.transformFileSync(path.join(cwd, 'src', 'app.config.ts'), {
    cwd,
    filename: path.join(cwd, 'src', 'app.config.ts'),
  })
  console.log(result && result.code ? 'ok' : 'no code')
} catch (e) {
  console.error(e && e.stack ? e.stack : e)
  process.exit(1)
}
