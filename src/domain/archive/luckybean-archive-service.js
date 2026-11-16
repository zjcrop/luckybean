import { all, replaceStores } from '../../db.js';
import { APP_VERSION, SCHEMA_VERSION } from '../../utils.js';
import {
  LUCKYBEAN_ARCHIVE_MIME,
  PORTABLE_STORES,
  archiveCounts,
  buildLuckyBeanArchive,
  parseLuckyBeanArchive
} from './luckybean-archive-codec.js';

export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export async function createPortableArchive() {
  const rows = await Promise.all(PORTABLE_STORES.map(name => all(name)));
  if (rows.flat().some(row => row?.storageError || row?.value?.identity?.decryptionError)) throw new Error('存在无法解密的记录，停止导出以防数据遗漏');
  const stores = Object.fromEntries(PORTABLE_STORES.map((name, index) => [name, rows[index]]));
  const archive = await buildLuckyBeanArchive({ stores, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION });
  return {
    archive,
    counts: archiveCounts(stores),
    mime: LUCKYBEAN_ARCHIVE_MIME
  };
}

export async function restorePortableArchive(value) {
  const archive = await parseLuckyBeanArchive(value, { currentSchemaVersion: SCHEMA_VERSION });
  await replaceStores(archive.stores);
  return {
    counts: archiveCounts(archive.stores),
    migratedFrom: archive.migratedFrom || '',
    sourceVersion: archive.appVersion || ''
  };
}

export async function inspectPortableArchive(value) {
  const archive = await parseLuckyBeanArchive(value, { currentSchemaVersion: SCHEMA_VERSION });
  return {
    counts: archiveCounts(archive.stores),
    migratedFrom: archive.migratedFrom || '',
    sourceVersion: archive.appVersion || '',
    createdAt: archive.createdAt || ''
  };
}
