import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import * as sass from 'sass'
import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig<'webpack5'>(async (merge) => {
  if (!String(sass.compileString('.toolchain { .check { color: red; } }').css).includes('.toolchain .check')) {
    throw new Error('The installed Sass package is not compiling SCSS. Reinstall the mini-program Sass dependency.')
  }
  const isH5 = process.env.TARO_ENV === 'h5'
  const buildMode = process.env.NODE_ENV === 'development' ? 'development' : 'production'
  const outputRoot = isH5 ? 'dist-h5' : process.env.TARO_ENV === 'alipay' ? 'dist-alipay' : 'dist'
  const apiBaseUrl = isH5 ? (process.env.TARO_APP_H5_API_BASE_URL || '/api')
    : (process.env.TARO_APP_API_BASE_URL || 'http://120.26.137.173/api')
  const enableDevLogin = process.env.NODE_ENV === 'development' && process.env.TARO_APP_ENABLE_DEV_LOGIN !== 'false'
    ? 'true' : 'false'

  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'xiaoan-warning-system-miniprogram',
    date: '2026-08-02',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot,
    plugins: ['@tarojs/plugin-generator'],
    defineConstants: {
      'process.env.TARO_APP_API_BASE_URL': JSON.stringify(apiBaseUrl),
      'process.env.TARO_APP_ENABLE_DEV_LOGIN': JSON.stringify(enableDevLogin)
    },
    copy: {
      patterns: [],
      options: {}
    },
    framework: 'react',
    compiler: { type: 'webpack5', prebundle: { enable: false } },
    cache: {
      enable: true
    },
    mini: {
      sassLoaderOption: { implementation: sass, sourceMap: true },
      postcss: {
        pxtransform: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        // Taro otherwise treats non-watch development builds as production.
        chain.mode(buildMode)
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    h5: {
      sassLoaderOption: { implementation: sass, sourceMap: true },
      publicPath: '/',
      staticDirectory: 'static',
      devServer: {
        host: '127.0.0.1',
        port: Number(process.env.MINIPROGRAM_H5_PORT || 54232),
        client: { overlay: { errors: true, warnings: false } },
        proxy: {
          '/api': {
            target: process.env.MINIPROGRAM_API_PROXY || 'http://127.0.0.1:8010',
            changeOrigin: true,
            ws: true
          }
        }
      },
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: { baseFontSize: 20, minRootSize: 20, maxRootSize: 20 }
        },
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.mode(buildMode)
        chain.optimization.nodeEnv(buildMode)
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    rn: {
      appName: 'YanhuoShaobing',
      postcss: {
        cssModules: {
          enable: false
        }
      }
    }
  }

  return merge({}, baseConfig, process.env.NODE_ENV === 'development' ? devConfig : prodConfig)
})
