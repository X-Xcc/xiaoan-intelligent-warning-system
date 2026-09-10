import basemap from '../../public/contact-review-assets/taohua-basemap.json';

export const taohuaBasemap = {
  ...basemap,
  assetPath: '/contact-review-assets/taohua-basemap.webp',
};

// Web Mercator image coordinates; the footprint is OSM data, camera stops are illustrative.
export function taohuaImagePoint(longitude: number, latitude: number): readonly [number, number] {
  const scale = 2 ** basemap.zoom;
  const tileX = (longitude + 180) / 360 * scale;
  const tileY = (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * scale;
  return [
    (tileX - basemap.startX) * 256 / basemap.width * 100,
    (tileY - basemap.startY) * 256 / basemap.height * 100,
  ];
}

export const taohuaOutline = basemap.placeOutline.map(([longitude, latitude]) => taohuaImagePoint(longitude, latitude));

const demoCoordinates = [
  [115.87486, 28.65343], [115.87514, 28.65342], [115.87543, 28.65344],
  [115.87550, 28.65362], [115.87543, 28.65377],
] as const;
const photoPositions = [[12, 23], [24, 83], [58, 83], [81, 46], [58, 17]] as const;
export const taohuaDemoStops = demoCoordinates.map(([longitude, latitude], index) => ({
  anchor: taohuaImagePoint(longitude, latitude),
  photo: photoPositions[index],
}));
