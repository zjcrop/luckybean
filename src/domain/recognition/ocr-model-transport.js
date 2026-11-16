// Only JSON crosses HTTP. The SDK receives ephemeral in-memory archives.
export async function withOcrModelAssets(assetUrl, create, transport = globalThis) {
  const urls = [];
  try {
    const results = await Promise.allSettled(['det', 'rec'].map(async role => {
      const response = await transport.fetch(assetUrl(`models/PP-OCRv5_mobile_${role}.json`), {
        signal: AbortSignal.timeout(60000), headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`OCR 模型加载失败：HTTP ${response.status}`);
      const data = await response.json();
      if (data.format !== 'luckybean-ocr-model/1' || data.role !== role ||
          !Number.isSafeInteger(data.byteLength) || data.byteLength < 1000000 || data.byteLength > 30000000 ||
          typeof data.base64 !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256 || '') ||
          data.base64.length !== 4 * Math.ceil(data.byteLength / 3)) {
        throw new Error('OCR 模型数据格式错误');
      }
      const decoded = transport.atob(data.base64);
      const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
      if (bytes.byteLength !== data.byteLength) throw new Error('OCR 模型长度校验失败');
      const digest = await transport.crypto.subtle.digest('SHA-256', bytes);
      const sha = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      if (sha !== data.sha256) throw new Error('OCR 模型完整性校验失败');
      const url = transport.URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      urls.push(url);
      return { url };
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    return await create({ detection: results[0].value, recognition: results[1].value });
  } finally {
    for (const url of urls) transport.URL.revokeObjectURL(url);
  }
}
