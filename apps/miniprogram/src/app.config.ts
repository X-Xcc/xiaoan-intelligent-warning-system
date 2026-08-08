export default defineAppConfig({
  pages: ['pages/index/index', 'pages/main/main', 'pages/detail/detail'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#0b8f7d',
    navigationBarTitleText: '今日江滩',
    navigationBarTextStyle: 'white'
  },
  permission: {
    'scope.userLocation': {
      desc: '用于在地图上展示当前位置和附近服务点'
    }
  },
  requiredPrivateInfos: ['getLocation'],
  lazyCodeLoading: 'requiredComponents'
})
