import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig<'webpack5'>(async (merge) => {
  const outputRoot = process.env.TARO_ENV === 'alipay' ? 'dist-alipay' : 'dist'
  const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || 'http://120.26.137.173/api'
  const enableDevLogin = process.env.TARO_APP_ENABLE_DEV_LOGIN || (process.env.NODE_ENV !== 'production' ? 'true' : 'false')

  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'yanhuo-shaobing-miniprogram',
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
    compiler: 'webpack5',
    cache: {
      enable: true
    },
    mini: {
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
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
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
