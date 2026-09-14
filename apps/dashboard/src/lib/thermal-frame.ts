export type ThermalMetrics = {
  averageTemperature: number;
  peakTemperature: number;
  edgeDensity: number;
  complexity: number;
  brightAreaPercent: number;
};

const thermalColors = new Uint8ClampedArray(256 * 3);
for (let i = 0; i < 256; i += 1) {
  const value = i / 255;
  const offset = i * 3;
  if (value < 0.25) {
    thermalColors[offset + 1] = value * 4 * 255;
    thermalColors[offset + 2] = 255;
  } else if (value < 0.5) {
    thermalColors[offset + 1] = 255;
    thermalColors[offset + 2] = (0.5 - value) * 4 * 255;
  } else if (value < 0.75) {
    thermalColors[offset] = (value - 0.5) * 4 * 255;
    thermalColors[offset + 1] = 255;
  } else {
    thermalColors[offset] = 255;
    thermalColors[offset + 1] = (1 - value) * 4 * 255;
  }
}

export function processThermalFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  edges = true,
): { pixels: Uint8ClampedArray; metrics: ThermalMetrics } {
  const pixelCount = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || !Number.isSafeInteger(pixelCount * 4)) {
    throw new RangeError('Thermal frame dimensions must be positive safe integers with a safe RGBA size.');
  }
  if (rgba.length !== pixelCount * 4) {
    throw new RangeError('Thermal frame RGBA length must equal width * height * 4.');
  }
  const pixels = new Uint8ClampedArray(rgba);
  const grayscale = new Float64Array(pixelCount);
  let totalGray = 0;
  let maxGray = 0;
  let brightCount = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const gray = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
    grayscale[offset / 4] = gray;
    totalGray += gray;
    maxGray = Math.max(maxGray, gray);
    if (gray > 210) brightCount += 1;
    const color = Math.round(gray) * 3;
    pixels[offset] = thermalColors[color];
    pixels[offset + 1] = thermalColors[color + 1];
    pixels[offset + 2] = thermalColors[color + 2];
  }

  let edgeCount = 0;
  let totalEdgeMagnitude = 0;
  // Border pixels have no complete Sobel kernel, but still count toward edge density.
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const top = index - width;
      const bottom = index + width;
      const gx = grayscale[top + 1] - grayscale[top - 1]
        + 2 * (grayscale[index + 1] - grayscale[index - 1])
        + grayscale[bottom + 1] - grayscale[bottom - 1];
      const gy = grayscale[bottom - 1] - grayscale[top - 1]
        + 2 * (grayscale[bottom] - grayscale[top])
        + grayscale[bottom + 1] - grayscale[top + 1];
      const magnitude = Math.hypot(gx, gy);
      if (magnitude > 32) {
        edgeCount += 1;
        totalEdgeMagnitude += magnitude;
        if (edges) {
          const offset = index * 4;
          pixels[offset] = magnitude > 95 ? 80 : 0;
          pixels[offset + 1] = magnitude > 95 ? 255 : 230 + grayscale[index] * 0.1;
          pixels[offset + 2] = 255;
        }
      }
    }
  }
  const edgeDensity = edgeCount / pixelCount * 100;
  const averageEdgeMagnitude = edgeCount > 0 ? totalEdgeMagnitude / edgeCount : 0;

  return {
    pixels,
    metrics: {
      averageTemperature: 15 + totalGray / pixelCount / 255 * 35,
      peakTemperature: 15 + maxGray / 255 * 40,
      edgeDensity,
      complexity: Math.max(0, Math.min(1, edgeDensity / 100 * 0.8 + averageEdgeMagnitude / 255 * 0.2)),
      brightAreaPercent: brightCount / pixelCount * 100,
    },
  };
}
