const MIN_REGION_SPAN = 0.01;
const DEFAULT_MAX_EDGE = 2200;
const HEADER_PROBE_BYTES = 1024 * 1024;
const ROI_DECODE_MAX_EDGE = 3000;

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

function isFullFrame(region) {
  return region.left <= 0.0001 && region.top <= 0.0001 &&
    region.right >= 0.9999 && region.bottom >= 0.9999;
}

function cropGeometry(width, height, region) {
  const left = Math.max(0, Math.min(width - 1, Math.floor(region.left * width)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(region.top * height)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil(region.right * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(region.bottom * height)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height, format: 'png' } : null;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function jpegDimensions(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height, format: 'jpeg' } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;
  if (ascii(12, 4) === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height, format: 'webp' } : null;
  }
  return null;
}

async function encodedDimensions(blob) {
  try {
    const probe = new Uint8Array(await blob.slice(0, Math.min(blob.size, HEADER_PROBE_BYTES)).arrayBuffer());
    return pngDimensions(probe) || jpegDimensions(probe) || webpDimensions(probe);
  } catch {
    return null;
  }
}

function boundedSize(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale
  };
}

function roiDecodeEdge(region, requestedMaxEdge) {
  if (isFullFrame(region)) return requestedMaxEdge;
  const span = Math.max(MIN_REGION_SPAN, Math.max(region.right - region.left, region.bottom - region.top));
  // Preserve more detail for a small crop while still putting a hard ceiling on
  // the full decoded raster. A quarter-frame region therefore receives materially
  // more pixels than it did in whole-page OCR without ever allocating a 12/48 MP
  // RGBA bitmap.
  return Math.max(
    requestedMaxEdge,
    Math.min(ROI_DECODE_MAX_EDGE, Math.ceil(requestedMaxEdge / span))
  );
}

async function decodeBitmap(blob, region, maxEdge) {
  const dimensions = await encodedDimensions(blob);
  const decodeMaxEdge = roiDecodeEdge(region, maxEdge);
  if (dimensions && Math.max(dimensions.width, dimensions.height) > decodeMaxEdge) {
    const target = boundedSize(dimensions.width, dimensions.height, decodeMaxEdge);
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high'
      });
      return {
        bitmap,
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        decodePreScaled: true,
        decodeMaxEdge,
        encodedFormat: dimensions.format
      };
    } catch {
      // Older engines may reject resize hints. Stay in the ROI Worker and retain
      // compatibility; never move decoding onto the UI thread.
    }
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return {
    bitmap,
    originalWidth: dimensions?.width || bitmap.width,
    originalHeight: dimensions?.height || bitmap.height,
    decodePreScaled: false,
    decodeMaxEdge,
    encodedFormat: dimensions?.format || ''
  };
}

async function cropBlob(blob, regionInput, maxEdgeInput) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('ROI 原图不可用');
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    throw new Error('当前浏览器不支持 Worker-only ROI 图像裁剪');
  }

  const region = normalizeRegion(regionInput);
  const maxEdge = Math.max(320, Math.min(4096, Number(maxEdgeInput) || DEFAULT_MAX_EDGE));
  const decoded = await decodeBitmap(blob, region, maxEdge);
  const bitmap = decoded.bitmap;
  try {
    const bitmapWidth = bitmap.width;
    const bitmapHeight = bitmap.height;
    if (!bitmapWidth || !bitmapHeight) throw new Error('ROI 原图尺寸无效');
    const crop = cropGeometry(bitmapWidth, bitmapHeight, region);
    const output = boundedSize(crop.width, crop.height, maxEdge);
    const width = output.width;
    const height = output.height;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('ROI Worker 无法建立 2D 画布');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    const resultBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    return {
      blob: resultBlob,
      region,
      sourceWidth: decoded.originalWidth,
      sourceHeight: decoded.originalHeight,
      cropX: crop.x,
      cropY: crop.y,
      cropWidth: crop.width,
      cropHeight: crop.height,
      outputWidth: width,
      outputHeight: height,
      decodePreScaled: decoded.decodePreScaled,
      decodeMaxEdge: decoded.decodeMaxEdge,
      encodedFormat: decoded.encodedFormat
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