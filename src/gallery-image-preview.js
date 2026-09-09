const HEADER_PROBE_BYTES = 1024 * 1024;
const JPEG_SOF_MARKERS = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);

function bounded(width, height, maxEdge) {
  const scale = Math.min(1, Number(maxEdge || 900) / Math.max(1, width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function parsePng(bytes) {
  if (bytes.length < 24) return null;
  const signature = [137,80,78,71,13,10,26,10];
  if (!signature.every((value,index) => bytes[index] === value)) return null;
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height, format:'png', orientation:1 } : null;
}

function parseWebp(bytes) {
  if (bytes.length < 30) return null;
  const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0,4) !== 'RIFF' || ascii(8,4) !== 'WEBP') return null;
  if (ascii(12,4) === 'VP8X') {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return width > 0 && height > 0 ? { width, height, format:'webp', orientation:1 } : null;
  }
  return null;
}

function parseExifSegment(bytes, segmentDataStart, segmentDataLength) {
  const end = Math.min(bytes.length, segmentDataStart + segmentDataLength);
  if (segmentDataLength < 14 || segmentDataStart + 14 > end) return null;
  if (String.fromCharCode(...bytes.subarray(segmentDataStart, segmentDataStart + 6)) !== 'Exif\0\0') return null;
  const tiff = segmentDataStart + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => offset + 2 <= end ? view.getUint16(offset, little) : 0;
  const u32 = offset => offset + 4 <= end ? view.getUint32(offset, little) : 0;
  if (u16(tiff + 2) !== 42) return null;
  const ifd0 = tiff + u32(tiff + 4);
  if (ifd0 + 2 > end) return null;
  const count0 = u16(ifd0);
  let orientation = 1;
  for (let index = 0; index < count0; index += 1) {
    const entry = ifd0 + 2 + index * 12;
    if (entry + 12 > end) break;
    if (u16(entry) === 0x0112) {
      const candidate = u16(entry + 8);
      if (candidate >= 1 && candidate <= 8) orientation = candidate;
      break;
    }
  }
  const nextIfdOffsetPos = ifd0 + 2 + count0 * 12;
  if (nextIfdOffsetPos + 4 > end) return { orientation, thumbnail:null };
  const ifd1Offset = u32(nextIfdOffsetPos);
  if (!ifd1Offset) return { orientation, thumbnail:null };
  const ifd1 = tiff + ifd1Offset;
  if (ifd1 + 2 > end) return { orientation, thumbnail:null };
  const count1 = u16(ifd1);
  let thumbnailOffset = 0;
  let thumbnailLength = 0;
  for (let index = 0; index < count1; index += 1) {
    const entry = ifd1 + 2 + index * 12;
    if (entry + 12 > end) break;
    const tag = u16(entry);
    if (tag === 0x0201) thumbnailOffset = u32(entry + 8);
    if (tag === 0x0202) thumbnailLength = u32(entry + 8);
  }
  if (!thumbnailOffset || thumbnailLength < 64) return { orientation, thumbnail:null };
  return {
    orientation,
    thumbnail:{ absoluteOffset:tiff + thumbnailOffset, length:thumbnailLength }
  };
}

function parseJpeg(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation = 1;
  let thumbnail = null;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2) break;
    const segmentDataStart = offset + 2;
    const segmentDataLength = segmentLength - 2;
    if (segmentDataStart + segmentDataLength > bytes.length) break;
    if (marker === 0xe1) {
      const exif = parseExifSegment(bytes, segmentDataStart, segmentDataLength);
      if (exif) {
        orientation = exif.orientation || orientation;
        thumbnail = exif.thumbnail || thumbnail;
      }
    }
    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
      height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      width = (bytes[offset + 5] << 8) | bytes[offset + 6];
    }
    if (marker === 0xda) break;
    offset += segmentLength;
  }
  return width > 0 && height > 0 ? { width, height, format:'jpeg', orientation, thumbnail } : null;
}

export async function readGalleryImageHeader(blob) {
  if (!(blob instanceof Blob) || !blob.size) return null;
  try {
    const bytes = new Uint8Array(await blob.slice(0, Math.min(blob.size, HEADER_PROBE_BYTES)).arrayBuffer());
    const parsed = parseJpeg(bytes) || parsePng(bytes) || parseWebp(bytes);
    if (!parsed) return null;
    if (parsed.format === 'jpeg' && parsed.thumbnail) {
      const start = parsed.thumbnail.absoluteOffset;
      const end = start + parsed.thumbnail.length;
      if (start >= 0 && end <= blob.size) parsed.thumbnailBlob = blob.slice(start, end, 'image/jpeg');
    }
    return parsed;
  } catch {
    return null;
  }
}

function orientedDimensions(width, height, orientation) {
  return orientation >= 5 && orientation <= 8 ? { width:height, height:width } : { width, height };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 1;
  canvas.height = 1;
}

async function orientThumbnail(bitmap, orientation, maxEdge) {
  const oriented = orientedDimensions(bitmap.width, bitmap.height, orientation);
  const target = bounded(oriented.width, oriented.height, maxEdge);
  const canvas = makeCanvas(target.width, target.height);
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('无法建立缩略图画布');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const sx = canvas.width / oriented.width;
  const sy = canvas.height / oriented.height;
  ctx.save();
  ctx.scale(sx, sy);
  switch (orientation) {
    case 2: ctx.translate(bitmap.width, 0); ctx.scale(-1, 1); break;
    case 3: ctx.translate(bitmap.width, bitmap.height); ctx.rotate(Math.PI); break;
    case 4: ctx.translate(0, bitmap.height); ctx.scale(1, -1); break;
    case 5: ctx.rotate(Math.PI / 2); ctx.scale(1, -1); break;
    case 6: ctx.translate(bitmap.height, 0); ctx.rotate(Math.PI / 2); break;
    case 7: ctx.translate(bitmap.height, bitmap.width); ctx.rotate(Math.PI / 2); ctx.scale(-1, 1); break;
    case 8: ctx.translate(0, bitmap.width); ctx.rotate(-Math.PI / 2); break;
    default: break;
  }
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
  const result = await createImageBitmap(canvas);
  releaseCanvas(canvas);
  return result;
}

export async function createLowMemoryGalleryPreview(blob, maxEdge = 900) {
  if (typeof createImageBitmap !== 'function') throw new Error('当前浏览器不支持低内存图片预览');
  const header = await readGalleryImageHeader(blob);
  if (header?.thumbnailBlob) {
    const thumbnail = await createImageBitmap(header.thumbnailBlob);
    try {
      const bitmap = await orientThumbnail(thumbnail, header.orientation || 1, maxEdge);
      return { bitmap, header, source:'embedded-thumbnail' };
    } finally {
      thumbnail.close?.();
    }
  }

  if (header?.width && header?.height) {
    const oriented = orientedDimensions(header.width, header.height, header.orientation || 1);
    const target = bounded(oriented.width, oriented.height, maxEdge);
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation:'from-image',
        resizeWidth:target.width,
        resizeHeight:target.height,
        resizeQuality:'high'
      });
      return { bitmap, header, source:'decoder-thumbnail' };
    } catch (error) {
      if (Math.max(header.width, header.height) > maxEdge) {
        throw new Error(`当前浏览器无法安全生成低分辨率预览：${error?.message || 'resize decode failed'}`);
      }
    }
  }

  try {
    const bitmap = await createImageBitmap(blob, {
      imageOrientation:'from-image',
      resizeWidth:maxEdge,
      resizeQuality:'high'
    });
    if (Math.max(bitmap.width, bitmap.height) > maxEdge * 1.25) {
      bitmap.close?.();
      throw new Error('浏览器未执行低分辨率解码');
    }
    return { bitmap, header, source:'bounded-fallback' };
  } catch (error) {
    throw new Error(`无法以低内存方式预览该图片：${error?.message || error}`);
  }
}
