const path = require('path')
const babel = require('../node_modules/@babel/core')

process.chdir(path.join(__dirname, '..', 'apps', 'miniprogram'))

try {
  const result = babel.transformFileSync(path.join(__dirname, '..', 'apps', 'miniprogram', 'src', 'app.config.ts'), {
    presets: [require('../node_modules/babel-preset-taro')],
    filename: path.join(__dirname, '..', 'apps', 'miniprogram', 'src', 'app.config.ts'),
    babelrc: false,
    configFile: false,
  })
  console.log(result && result.code ? 'ok' : 'no code')
} catch (e) {
  console.error(e && e.stack ? e.stack : e)
  process.exit(1)
}
