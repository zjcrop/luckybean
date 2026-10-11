const DATABASE_NAME = 'luckybean-local-assets';
const DATABASE_VERSION = 1;
const STORE_NAME = 'beanThumbnails';
let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('当前浏览器不支持本机照片存储'));
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本机照片存储打开失败'));
    request.onblocked = () => reject(new Error('本机照片存储正在被其他页面占用'));
  });
  return databasePromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这张图片')); };
    image.src = url;
  });
}

export async function prepareBeanThumbnail(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 24 * 1024 * 1024) throw new Error('图片超过24MB，请先缩小后再选择');
  let image;
  try { image = globalThis.createImageBitmap ? await createImageBitmap(file) : await loadImage(file); }
  catch { image = await loadImage(file); }
  const width = Number(image.width || image.naturalWidth || 0);
  const height = Number(image.height || image.naturalHeight || 0);
  if (!width || !height) throw new Error('图片尺寸无效');
  const side = Math.min(width, height);
  const x = Math.floor((width - side) / 2);
  const y = Math.floor((height - side) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d', { alpha:false });
  if (!context) throw new Error('当前设备无法处理图片');
  context.drawImage(image, x, y, side, side, 0, 0, 256, 256);
  image.close?.();
  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function saveBeanThumbnail(beanId, dataUrl) {
  const id = String(beanId || '').trim();
  if (!id || !/^data:image\/jpeg;base64,/.test(String(dataUrl || ''))) throw new Error('豆袋缩略图数据无效');
  const native = await nativeThumbnailStore();
  if (native) { await native.put('beanThumbnails', { id, dataUrl }); return; }
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(dataUrl, id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('本机照片保存失败'));
    transaction.onabort = () => reject(transaction.error || new Error('本机照片保存已取消'));
  });
}

export async function getBeanThumbnail(beanId) {
  const id = String(beanId || '').trim();
  if (!id) return '';
  const native = await nativeThumbnailStore();
  if (native) return (await native.get('beanThumbnails', id))?.dataUrl || '';
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : '');
    request.onerror = () => reject(request.error || new Error('本机照片读取失败'));
  });
}

export async function deleteBeanThumbnail(beanId) {
  const id = String(beanId || '').trim();
  if (!id) return;
  const native = await nativeThumbnailStore();
  if (native) { await native.remove('beanThumbnails', id); return; }
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('本机照片删除失败'));
    transaction.onabort = () => reject(transaction.error || new Error('本机照片删除已取消'));
  });
}

async function nativeThumbnailStore() {
  const native = globalThis.__LUCKYBEAN_ANDROID__ && globalThis.LuckyBeanRoomStore;
  if (!native) return null;
  const status = await native.get('platformPreferences', 'engineMigration');
  return status?.ready ? native : null;
}

async function thumbnailRows(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const keys = store.getAllKeys();
    const values = store.getAll();
    transaction.oncomplete = () => {
      try {
        resolve(keys.result.map((id, index) => {
          if (typeof id !== 'string' || typeof values.result[index] !== 'string') throw new Error('照片库包含不支持的记录，请保留原始库');
          return { id, dataUrl: values.result[index] };
        }));
      } catch (error) { reject(error); }
    };
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('照片库读取失败'));
  });
}

async function thumbnailDigest(rows) {
  const canonical = rows.map(row => JSON.stringify([row.id, row.dataUrl])).sort().join('\n');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function migrateBeanThumbnailsToRoom() {
  const native = globalThis.LuckyBeanRoomStore;
  if (!native) throw new Error('原生照片存储接口不可用');
  const rows = await thumbnailRows(await openDatabase());
  const sha256 = await thumbnailDigest(rows);
  await native.put('migrationSnapshots', { id: 'beanThumbnails:manifest', count: rows.length, sha256 });
  await native.clear('beanThumbnails');
  for (const row of rows) {
    await native.put('migrationSnapshots', { id: `beanThumbnails:${row.id}`, value: row });
    await native.put('beanThumbnails', row);
  }
  const stored = await native.all('beanThumbnails');
  if (stored.length !== rows.length || await thumbnailDigest(stored) !== sha256) throw new Error('照片迁移校验失败，原始照片库保留');
  const current = await thumbnailRows(await openDatabase());
  if (current.length !== rows.length || await thumbnailDigest(current) !== sha256) throw new Error('迁移期间照片已变化，请重试');
  return { count: rows.length, sha256 };
}

export async function restoreBeanThumbnailsToIndexedDb() {
  if (globalThis.__LUCKYBEAN_ENGINE__ === 'gecko') throw new Error('请先切回 WebView 再恢复照片');
  const native = await nativeThumbnailStore();
  if (!native) return;
  const rows = await native.all('beanThumbnails');
  const expected = await thumbnailDigest(rows);
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    for (const row of rows) store.put(row.dataUrl, row.id);
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('照片回滚失败'));
  });
  const restored = await thumbnailRows(db);
  if (restored.length !== rows.length || await thumbnailDigest(restored) !== expected) throw new Error('照片回滚校验失败');
  await native.remove('platformPreferences', 'engineMigration');
}
