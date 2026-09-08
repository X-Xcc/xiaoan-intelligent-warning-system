const defineAppConfig = (config: any) => config

export default defineAppConfig({
  pages: ['pages/index/index', 'pages/main/main', 'pages/detail/detail'],
  window: {
    backgroundTextStyle: 'dark',
    navigationBarBackgroundColor: '#cbe5ff',
    navigationBarTitleText: '小安智能预警系统',
    navigationBarTextStyle: 'black',
  },
  permission: {
    'scope.userLocation': {
      desc: '用于在地图上展示当前位置和附近联动点',
    },
  },
  requiredPrivateInfos: ['getLocation'],
})
