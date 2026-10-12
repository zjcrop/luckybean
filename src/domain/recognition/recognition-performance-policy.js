export const OCR_PERFORMANCE_POLICY = 'recognition-performance/1.0';

export function runtimeAcceleration({ webkit = false, lowMemory = false, isolated = false, sharedMemory = false, cores = 1, gpu = false } = {}) {
  const threads = !webkit && !lowMemory && isolated && sharedMemory
    ? Math.min(4, Math.max(1, Math.floor(Number(cores || 1) / 2))) : 1;
  const backend = gpu && !webkit && !lowMemory ? 'webgpu' : 'wasm';
  return Object.freeze({ backend, numThreads:backend === 'webgpu' ? 1 : threads });
}

export function detectionLimit(image, maximum, { detail = false, recovery = false } = {}) {
  if (recovery) return Math.min(maximum, 1280);
  const edge = Math.max(Number(image?.processedWidth || image?.width || 0), Number(image?.processedHeight || image?.height || 0));
  // Unknown geometry remains precision-first. Only the detector is resized; the
  // recognition model still receives crops from the same original input Blob.
  return !detail && edge > 1600 ? Math.min(maximum, 1600) : maximum;
}

function stats(items) {
  const values = (items || []).filter(item => String(item?.text || '').trim());
  return { values, chars:values.reduce((n,item) => n + String(item.text).replace(/\s/g,'').length, 0),
    average:values.length ? values.reduce((n,item) => n + Number(item.score || 0), 0) / values.length : 0 };
}

export function needsDetectionDetail(items, image, limit, maximum) {
  if (limit >= maximum) return false;
  const s = stats(items);
  if (!s.values.length || s.average < 0.9 || s.values.some(item => Number(item.score || 0) < 0.72)) return true;
  const edge = Math.max(Number(image?.processedWidth || image?.width || 0), Number(image?.processedHeight || image?.height || 0));
  return s.values.some(item => {
    const points = item.poly || [];
    if (points.length < 2 || !edge) return true;
    const ys = points.map(point => Number(point[1]));
    return (Math.max(...ys) - Math.min(...ys)) * limit / edge < 24;
  });
}

export function preferDetailedRecognition(first, detail) {
  const base = stats(first?.[0]?.items), next = stats(detail?.[0]?.items);
  return next.values.length && next.chars >= base.chars - 3 && next.average >= base.average - 0.05 ? detail : first;
}
