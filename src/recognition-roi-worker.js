const MIN_REGION_SPAN = 0.01;
const DEFAULT_MAX_EDGE = 2200;

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeRegion(input) {
  const source = input && typeof input === 'object' ? input : {};
  const left = clamp01(source.left);
  const top = clamp01(source.top);
  const right = clamp01(source.right, 1);
  const bottom = clamp01(source.bottom, 1);
  if (right - left < MIN_REGION_SPAN || bottom - top < MIN_REGION_SPAN) {
    throw new Error('ROI 范围过小或无效');
  }
  return { left, top, right, bottom };
}

function cropGeometry(width, height, region) {
  const left = Math.max(0, Math.min(width - 1, Math.floor(region.left * width)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(region.top * height)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil(region.right * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(region.bottom * height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function cropBlob(blob, regionInput, maxEdgeInput) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('ROI 原图不可用');
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    throw new Error('当前浏览器不支持 Worker-only ROI 图像裁剪');
  }

  const region = normalizeRegion(regionInput);
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (!sourceWidth || !sourceHeight) throw new Error('ROI 原图尺寸无效');
    const crop = cropGeometry(sourceWidth, sourceHeight, region);
    const maxEdge = Math.max(320, Math.min(4096, Number(maxEdgeInput) || DEFAULT_MAX_EDGE));
    const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
    const width = Math.max(1, Math.round(crop.width * scale));
    const height = Math.max(1, Math.round(crop.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('ROI Worker 无法建立 2D 画布');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    const output = await canvas.convertToBlob({ type: 'image/png' });
    return {
      blob: output,
      region,
      sourceWidth,
      sourceHeight,
      cropX: crop.x,
      cropY: crop.y,
      cropWidth: crop.width,
      cropHeight: crop.height,
      outputWidth: width,
      outputHeight: height
    };
  } finally {
    bitmap.close?.();
  }
}

self.onmessage = async event => {
  const requestId = String(event.data?.requestId || '');
  try {
    const result = await cropBlob(event.data?.blob, event.data?.region, event.data?.maxEdge);
    self.postMessage({ requestId, ok: true, ...result });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: String(error?.message || error || 'ROI Worker 裁剪失败')
    });
  }
};
