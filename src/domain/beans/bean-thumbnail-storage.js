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
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('本机照片删除失败'));
    transaction.onabort = () => reject(transaction.error || new Error('本机照片删除已取消'));
  });
}
