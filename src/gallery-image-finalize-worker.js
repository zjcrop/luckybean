const HEADER_PROBE_BYTES = 1024 * 1024;
const DEFAULT_OUTPUT_MAX_EDGE = 2200;
const DEFAULT_DECODE_MAX_EDGE = 3000;
const DEFAULT_QUALITY = 0.92;
const JPEG_SOF_MARKERS = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);

function clamp01(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function normalizeRegion(input) {
  const source = input && typeof input === 'object' ? input : {};
  const left = clamp01(source.left);
  const top = clamp01(source.top);
  const right = clamp01(source.right, 1);
  const bottom = clamp01(source.bottom, 1);
  if (right - left < 0.01 || bottom - top < 0.01) throw new Error('裁切范围过小或无效');
  return { left, top, right, bottom };
}

function bounded(width, height, maxEdge) {
  const scale = Math.min(1, Number(maxEdge) / Math.max(1, width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = [137,80,78,71,13,10,26,10];
  if (!signature.every((value,index) => bytes[index] === value)) return null;
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height, format:'png' } : null;
}

function jpegDimensions(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height, format:'jpeg' } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0,4) !== 'RIFF' || ascii(8,4) !== 'WEBP') return null;
  if (ascii(12,4) === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height, format:'webp' } : null;
  }
  return null;
}

async function encodedDimensions(blob) {
  try {
    const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, HEADER_PROBE_BYTES)).arrayBuffer());
    return jpegDimensions(bytes) || pngDimensions(bytes) || webpDimensions(bytes);
  } catch {
    return null;
  }
}

function decodeEdgeForRegion(region, outputMaxEdge, decodeMaxEdge) {
  const span = Math.max(0.01, Math.max(region.right - region.left, region.bottom - region.top));
  return Math.max(outputMaxEdge, Math.min(decodeMaxEdge, Math.ceil(outputMaxEdge / span)));
}

async function decodeBoundedBitmap(blob, region, outputMaxEdge, decodeMaxEdge) {
  if (typeof createImageBitmap !== 'function') throw new Error('Worker 不支持图片解码');
  const dimensions = await encodedDimensions(blob);
  const targetEdge = decodeEdgeForRegion(region, outputMaxEdge, decodeMaxEdge);
  if (dimensions && Math.max(dimensions.width, dimensions.height) > targetEdge) {
    const target = bounded(dimensions.width, dimensions.height, targetEdge);
    try {
      return await createImageBitmap(blob, {
        imageOrientation:'from-image',
        resizeWidth:target.width,
        resizeHeight:target.height,
        resizeQuality:'high'
      });
    } catch (error) {
      throw new Error(`无法安全缩放原始照片：${error?.message || 'resize decode failed'}`);
    }
  }
  if (!dimensions) {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation:'from-image',
        resizeWidth:targetEdge,
        resizeQuality:'high'
      });
      if (Math.max(bitmap.width, bitmap.height) > decodeMaxEdge * 1.25) {
        bitmap.close?.();
        throw new Error('浏览器未执行受限解码');
      }
      return bitmap;
    } catch (error) {
      throw new Error(`无法以低内存方式解码该图片：${error?.message || error}`);
    }
  }
  return createImageBitmap(blob, { imageOrientation:'from-image' });
}

function makeCanvas(width, height) {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  return canvas;
}

function releaseCanvas(canvas) {
  if (!canvas) return;
  try { canvas.width = 1; canvas.height = 1; } catch {}
}

function affineFromTriangles(source, dest) {
  const [s0,s1,s2] = source;
  const [d0,d1,d2] = dest;
  const den = s0.x*(s1.y-s2.y) + s1.x*(s2.y-s0.y) + s2.x*(s0.y-s1.y);
  if (Math.abs(den) < 1e-8) return null;
  const a = (d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/den;
  const c = (d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/den;
  const e = (d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/den;
  const b = (d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/den;
  const d = (d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/den;
  const f = (d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/den;
  return { a,b,c,d,e,f };
}

function drawTriangle(ctx, bitmap, source, dest) {
  const matrix = affineFromTriangles(source, dest);
  if (!matrix) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dest[0].x, dest[0].y);
  ctx.lineTo(dest[1].x, dest[1].y);
  ctx.lineTo(dest[2].x, dest[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
}

function bilinearQuad(quad, u, v) {
  const [tl,tr,br,bl] = quad;
  return {
    x:(1-u)*(1-v)*tl.x + u*(1-v)*tr.x + u*v*br.x + (1-u)*v*bl.x,
    y:(1-u)*(1-v)*tl.y + u*(1-v)*tr.y + u*v*br.y + (1-u)*v*bl.y
  };
}

function perspectiveCanvas(bitmap, quadNormalized, outputMaxEdge) {
  const quad = quadNormalized.map(point => ({ x:clamp01(point.x)*bitmap.width, y:clamp01(point.y)*bitmap.height }));
  const top = Math.hypot(quad[1].x-quad[0].x, quad[1].y-quad[0].y);
  const bottom = Math.hypot(quad[2].x-quad[3].x, quad[2].y-quad[3].y);
  const left = Math.hypot(quad[3].x-quad[0].x, quad[3].y-quad[0].y);
  const right = Math.hypot(quad[2].x-quad[1].x, quad[2].y-quad[1].y);
  const size = bounded(Math.max(top,bottom), Math.max(left,right), outputMaxEdge);
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('Worker 无法建立透视画布');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  const grid = 12;
  for (let gy=0; gy<grid; gy+=1) {
    for (let gx=0; gx<grid; gx+=1) {
      const u0=gx/grid,u1=(gx+1)/grid,v0=gy/grid,v1=(gy+1)/grid;
      const s00=bilinearQuad(quad,u0,v0),s10=bilinearQuad(quad,u1,v0),s11=bilinearQuad(quad,u1,v1),s01=bilinearQuad(quad,u0,v1);
      const d00={x:u0*canvas.width,y:v0*canvas.height},d10={x:u1*canvas.width,y:v0*canvas.height},d11={x:u1*canvas.width,y:v1*canvas.height},d01={x:u0*canvas.width,y:v1*canvas.height};
      drawTriangle(ctx,bitmap,[s00,s10,s11],[d00,d10,d11]);
      drawTriangle(ctx,bitmap,[s00,s11,s01],[d00,d11,d01]);
    }
  }
  return canvas;
}

function cropCanvas(bitmap, region, outputMaxEdge) {
  const left = Math.floor(region.left * bitmap.width);
  const top = Math.floor(region.top * bitmap.height);
  const right = Math.max(left + 1, Math.ceil(region.right * bitmap.width));
  const bottom = Math.max(top + 1, Math.ceil(region.bottom * bitmap.height));
  const sourceWidth = right - left;
  const sourceHeight = bottom - top;
  const size = bounded(sourceWidth, sourceHeight, outputMaxEdge);
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('Worker 无法建立裁切画布');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap, left, top, sourceWidth, sourceHeight, 0,0,canvas.width,canvas.height);
  return canvas;
}

function rotateCanvas(source, degrees) {
  const normalized = ((Number(degrees || 0) % 360) + 360) % 360;
  if (Math.abs(normalized) < 0.01) return source;
  const rad = Number(degrees) * Math.PI / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const width = Math.ceil(source.width*cos + source.height*sin);
  const height = Math.ceil(source.width*sin + source.height*cos);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('Worker 无法建立旋转画布');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,width,height);
  ctx.translate(width/2,height/2);
  ctx.rotate(rad);
  ctx.drawImage(source,-source.width/2,-source.height/2);
  return canvas;
}

async function finalize(blob, options = {}) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error('原始图片不可用');
  if (typeof OffscreenCanvas !== 'function') throw new Error('当前浏览器不支持 Worker 图像加工');
  const region = normalizeRegion(options.region);
  const outputMaxEdge = Math.max(640, Math.min(2600, Number(options.outputMaxEdge) || DEFAULT_OUTPUT_MAX_EDGE));
  const decodeMaxEdge = Math.max(outputMaxEdge, Math.min(3600, Number(options.decodeMaxEdge) || DEFAULT_DECODE_MAX_EDGE));
  const quality = Math.max(0.82, Math.min(0.96, Number(options.quality) || DEFAULT_QUALITY));
  const bitmap = await decodeBoundedBitmap(blob, region, outputMaxEdge, decodeMaxEdge);
  let base = null;
  let rotated = null;
  let output = null;
  try {
    base = Array.isArray(options.perspectiveQuad) && options.perspectiveQuad.length === 4
      ? perspectiveCanvas(bitmap, options.perspectiveQuad, outputMaxEdge)
      : cropCanvas(bitmap, region, outputMaxEdge);
    rotated = rotateCanvas(base, Number(options.quarterTurns || 0) * 90 + Number(options.deskewDegrees || 0));
    output = rotated;
    if (Math.max(rotated.width, rotated.height) > outputMaxEdge) {
      const size = bounded(rotated.width, rotated.height, outputMaxEdge);
      const scaled = makeCanvas(size.width, size.height);
      const ctx = scaled.getContext('2d', { alpha:false });
      if (!ctx) throw new Error('Worker 无法建立输出画布');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,scaled.width,scaled.height);
      ctx.drawImage(rotated,0,0,scaled.width,scaled.height);
      output = scaled;
    }
    const resultBlob = await output.convertToBlob({ type:'image/jpeg', quality });
    return {
      blob:resultBlob,
      width:output.width,
      height:output.height,
      region,
      outputMaxEdge,
      decodeMaxEdge,
      quality
    };
  } finally {
    bitmap.close?.();
    if (base && base !== output) releaseCanvas(base);
    if (rotated && rotated !== base && rotated !== output) releaseCanvas(rotated);
    releaseCanvas(output);
  }
}

self.onmessage = async event => {
  const requestId = String(event.data?.requestId || '');
  try {
    const result = await finalize(event.data?.blob, event.data?.options || {});
    self.postMessage({ requestId, ok:true, ...result });
  } catch (error) {
    self.postMessage({ requestId, ok:false, error:String(error?.message || error || '图片处理失败') });
  }
};
