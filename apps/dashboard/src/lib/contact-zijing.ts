import basemap from '../../public/contact-review-assets/zijing-basemap.json';

export const zijingBasemap = {
  ...basemap,
  assetPath: '/contact-review-assets/zijing-basemap.webp',
};

function imagePoint(longitude: number, latitude: number): readonly [number, number] {
  const scale = 2 ** basemap.zoom;
  const tileX = (longitude + 180) / 360 * scale;
  const tileY = (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * scale;
  return [
    (tileX - basemap.startX) * 256 / basemap.width * 100,
    (tileY - basemap.startY) * 256 / basemap.height * 100,
  ];
}

export const zijingOutline = basemap.placeOutline.map(([longitude, latitude]) => imagePoint(longitude, latitude));

export type NightMarketScene = {
  camera: string;
  title: string;
  occurredAt: string;
  assetPath: string;
  thumbnailPath: string;
  kind: 'night-market-demo-not-zijing-capture';
};

// Existing demo frames, not a geographic camera survey or photographs of Zijing.
const scenes = [
  ['02', '东门主通道', '20:06:18'],
  ['03', '中心广场', '20:07:18'],
  ['04', '餐饮南区', '20:08:18'],
  ['05', '餐饮北区', '20:09:18'],
  ['08', '舞台前场', '20:12:18'],
] as const;
const coordinates = [
  [115.82850, 28.73760], [115.82865, 28.73695], [115.82880, 28.73630],
  [115.82900, 28.73565], [115.82913, 28.73490],
] as const;
const photoPositions = [[17, 18], [83, 30], [17, 50], [83, 73], [17, 82]] as const;

export const zijingDemoStops = coordinates.map(([longitude, latitude], index) => {
  const [camera, title, time] = scenes[index];
  const scene: NightMarketScene = {
    camera: `CAM-${camera}`,
    title,
    occurredAt: `2026-09-05 ${time}`,
    assetPath: `/night-market-cam-${camera}.png`,
    thumbnailPath: `/contact-review-assets/zijing-demo-cam-${camera}.thumb.webp`,
    kind: 'night-market-demo-not-zijing-capture',
  };
  return { anchor: imagePoint(longitude, latitude), photo: photoPositions[index], scene };
});
