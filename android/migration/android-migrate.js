const DATABASE_NAME = 'luckybean';
const STORE_NAMES = [
  'beans',
  'brewSessions',
  'sensoryRecords',
  'inventoryEvents',
  'settings',
  'customCodes',
  'codebookCache',
  'syncMetadata',
  'shareDrafts'
];
const CHUNK_SIZE = 50;

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
    result[key] = canonicalize(item);
  }
  return result;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, item => item.toString(16).padStart(2, '0')).join('');
}

function parseBridge(value, operation) {
  const parsed = JSON.parse(String(value || '{}'));
  if (!parsed.ok) {
    const error = new Error(parsed.message || `${operation} 失败`);
    error.code = parsed.code || 'MIGRATION_BRIDGE_FAILED';
    throw error;
  }
  return parsed.value;
}

async function databaseExists(name) {
  if (typeof indexedDB.databases !== 'function') return null;
  const databases = await indexedDB.databases();
  return databases.some(item => item.name === name);
}

async function openExistingDatabase(name) {
  const exists = await databaseExists(name);
  if (exists === false) return null;
  return new Promise((resolve, reject) => {
    let created = false;
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      created = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        resolve(null);
      } else {
        resolve(request.result);
      }
    };
    request.onerror = () => {
      if (created || request.error?.name === 'AbortError') resolve(null);
      else reject(request.error || new Error('旧数据库打开失败'));
    };
    request.onblocked = () => reject(new Error('旧数据库被其他页面占用'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 读取失败'));
  });
}

async function readStore(db, name) {
  if (!db || !db.objectStoreNames.contains(name)) return [];
  const transaction = db.transaction(name, 'readonly');
  const store = transaction.objectStore(name);
  const [keys, values] = await Promise.all([
    requestResult(store.getAllKeys()),
    requestResult(store.getAll())
  ]);
  const records = values.map((value, index) => ({
    id: String(value?.id ?? value?.code ?? keys[index] ?? `__index_${index}`),
    value
  }));
  records.sort((left, right) => left.id.localeCompare(right.id));
  return records;
}

async function migrate() {
  if (!globalThis.LuckyBeanMigration) throw new Error('迁移桥不可用');
  const db = await openExistingDatabase(DATABASE_NAME);
  const migrationId = `webview-v1-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const sourceVersion = db?.version || 0;

  parseBridge(globalThis.LuckyBeanMigration.begin(JSON.stringify({
    migrationId,
    sourceDatabase: DATABASE_NAME,
    sourceVersion,
    startedAt
  })), '迁移初始化');

  const report = {
    migrationId,
    sourceDatabase: DATABASE_NAME,
    sourceVersion,
    targetSchemaVersion: 3,
    startedAt,
    stores: {}
  };

  try {
    for (const storeName of STORE_NAMES) {
      const records = await readStore(db, storeName);
      const values = records.map(record => record.value);
      report.stores[storeName] = {
        count: records.length,
        hash: await sha256(canonicalJson(values))
      };

      for (let offset = 0; offset < records.length; offset += CHUNK_SIZE) {
        const chunk = records.slice(offset, offset + CHUNK_SIZE);
        parseBridge(globalThis.LuckyBeanMigration.writeChunk(
          migrationId,
          storeName,
          JSON.stringify(chunk)
        ), `迁移 ${storeName}`);
      }
    }
    db?.close();
    parseBridge(globalThis.LuckyBeanMigration.finish(migrationId, JSON.stringify(report)), '迁移校验');
  } catch (error) {
    db?.close();
    globalThis.LuckyBeanMigration.fail(error.code || 'WEBVIEW_MIGRATION_FAILED', error.message || String(error));
    throw error;
  }
}

migrate().catch(error => {
  console.error('LuckyBean legacy migration failed', error);
});
