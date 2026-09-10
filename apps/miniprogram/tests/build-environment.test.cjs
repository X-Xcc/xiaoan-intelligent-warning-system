const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { buildSync } = require('esbuild')

const bundle = buildSync({
  entryPoints: [path.resolve(__dirname, '../config/index.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  packages: 'external', logLevel: 'silent',
}).outputFiles[0].text

for (const environment of ['development', 'production']) {
  test(`${environment} build keeps webpack mode and staff-login flag consistent`, async () => {
    const previous = { NODE_ENV: process.env.NODE_ENV, TARO_APP_ENABLE_DEV_LOGIN: process.env.TARO_APP_ENABLE_DEV_LOGIN,
      TARO_APP_API_BASE_URL: process.env.TARO_APP_API_BASE_URL }
    process.env.NODE_ENV = environment
    process.env.TARO_APP_ENABLE_DEV_LOGIN = 'true'
    process.env.TARO_APP_API_BASE_URL = 'https://api.example.com/api'
    try {
      const module = { exports: {} }
      new Function('require', 'module', 'exports', bundle)((id) => {
        if (id === '@tarojs/cli') return { defineConfig: (factory) => factory }
        if (id === 'tsconfig-paths-webpack-plugin') return class {}
        if (id === 'sass') return { compileString: () => ({ css: '.toolchain .check {}' }) }
        if (id === 'node:net') return require(id)
        throw new Error(`Unexpected import: ${id}`)
      }, module, module.exports)
      const config = await module.exports.default((_, base) => base)
      assert.equal(config.defineConstants['process.env.TARO_APP_ENABLE_DEV_LOGIN'], JSON.stringify(String(environment === 'development')))
      for (const target of ['mini', 'h5']) {
        let mode = 'production'
        let nodeEnv = 'production'
        const chain = {
          mode(value) { mode = value; return this },
          optimization: { nodeEnv(value) { nodeEnv = value; return this } },
          resolve: { plugin: () => ({ use() {} }) },
        }
        config[target].webpackChain(chain)
        assert.equal(mode, environment, `${target} webpack mode`)
        if (target === 'h5') assert.equal(nodeEnv, environment, 'h5 runtime environment')
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
}
