type NightMarketScene = { name: string; area: string; assetPath?: string };

// Match the camera numbers and locations burned into the existing generated stills.
// Slot 01 is reserved for a real device and has no substitute scene.
export const nightMarketScenes: NightMarketScene[] = [
  { name: '机械狗巡检视角', area: '东门主通道 · 低位巡检' },
  { name: '东门主通道', area: '东门入口', assetPath: '/night-market-cam-02.png' },
  { name: '中心广场', area: '中心活动区', assetPath: '/night-market-cam-03.png' },
  { name: '餐饮南区', area: '南侧美食街', assetPath: '/night-market-cam-04.png' },
  { name: '餐饮北区', area: '北侧美食街', assetPath: '/night-market-cam-05.png' },
  { name: '停车场入口', area: '外围交通区', assetPath: '/night-market-cam-06.png' },
  { name: '停车场出口', area: '外围交通区', assetPath: '/night-market-cam-07.png' },
  { name: '舞台前场', area: '演艺活动区', assetPath: '/night-market-cam-08.png' },
  { name: '舞台后场', area: '演艺活动区', assetPath: '/night-market-cam-09.png' },
  { name: '治安岗亭', area: '综合服务区', assetPath: '/night-market-cam-10.png' },
  { name: '河堤步道', area: '滨水休闲区', assetPath: '/night-market-cam-11.png' },
  { name: '便民服务点', area: '综合服务区', assetPath: '/night-market-cam-12.png' },
  { name: '东侧巷道', area: '东侧商铺区', assetPath: '/night-market-cam-13.png' },
  { name: '西侧巷道', area: '西侧商铺区', assetPath: '/night-market-cam-14.png' },
  { name: '后勤通道', area: '后勤保障区', assetPath: '/night-market-cam-15.png' },
  { name: '河景高位点', area: '滨水观景区', assetPath: '/night-market-cam-16.png' },
];
