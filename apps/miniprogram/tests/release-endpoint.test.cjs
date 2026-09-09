const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { buildSync } = require('esbuild')

const bundle = buildSync({
  entryPoints: [path.resolve(__dirname, '../config/index.ts')],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  packages: 'external', logLevel: 'silent',
}).outputFiles[0].text

async function configure(values) {
  const keys = ['NODE_ENV', 'TARO_ENV', 'TARO_APP_API_BASE_URL', 'TARO_APP_H5_API_BASE_URL']
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
  try {
    const module = { exports: {} }
    new Function('require', 'module', 'exports', bundle)((id) => {
      if (id === '@tarojs/cli') return { defineConfig: (factory) => factory }
      if (id === 'tsconfig-paths-webpack-plugin') return class {}
      if (id === 'sass') return { compileString: () => ({ css: '.toolchain .check {}' }) }
      return require(id)
    }, module, module.exports)
    return await module.exports.default((_, base) => base)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

for (const value of [
  undefined, '', 'http://120.26.137.173/api', 'http://127.0.0.1:8010/api',
  'https://127.0.0.1/api', 'https://localhost/api', 'https://[::1]/api',
  'https://tank-patent-shower-avoid.trycloudflare.com/api',
  'https://user:password@api.example.com/api', 'https://api.example.com/api?token=secret',
  'https://api.example.com/api#fragment', '/api', 'https://api.example.com/not-an-api',
]) {
  test(`experience build rejects unusable endpoint: ${value?.replace(/password|secret/g, 'REDACTED') ?? 'missing'}`, async () => {
    await assert.rejects(configure({
      NODE_ENV: 'production', TARO_ENV: 'weapp', TARO_APP_API_BASE_URL: value,
    }), /TARO_APP_API_BASE_URL/)
  })
}

test('experience build preserves a configured HTTPS API prefix and disables development login', async () => {
  const config = await configure({
    NODE_ENV: 'production', TARO_ENV: 'weapp',
    TARO_APP_API_BASE_URL: 'https://api.example.com/public-security/api/',
  })
  assert.equal(JSON.parse(config.defineConstants['process.env.TARO_APP_API_BASE_URL']), 'https://api.example.com/public-security/api')
  assert.equal(JSON.parse(config.defineConstants['process.env.TARO_APP_ENABLE_DEV_LOGIN']), 'false')
})

test('development falls back only to the local backend, never an obsolete public host', async () => {
  const config = await configure({ NODE_ENV: 'development', TARO_ENV: 'weapp' })
  assert.equal(JSON.parse(config.defineConstants['process.env.TARO_APP_API_BASE_URL']), 'http://127.0.0.1:8010/api')
})

test('H5 keeps its same-origin API in production', async () => {
  const config = await configure({ NODE_ENV: 'production', TARO_ENV: 'h5' })
  assert.equal(JSON.parse(config.defineConstants['process.env.TARO_APP_API_BASE_URL']), '/api')
})
