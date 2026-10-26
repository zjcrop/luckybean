import { all, replaceStores } from '../../db.js';
import { APP_VERSION, SCHEMA_VERSION } from '../../utils.js';
import { exportBeanThumbnails, replaceBeanThumbnails } from '../beans/bean-thumbnail-storage.js';
import {
  LUCKYBEAN_ARCHIVE_MIME,
  PORTABLE_STORES,
  archiveCounts,
  buildLuckyBeanArchive,
  parseLuckyBeanArchive
} from './luckybean-archive-codec.js';

export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export async function createPortableArchive() {
  const [rows, assets] = await Promise.all([
    Promise.all(PORTABLE_STORES.map(name => all(name).catch(() => []))),
    exportBeanThumbnails().catch(error => { throw new Error(`读取本机豆袋缩略图失败：${error.message}`); })
  ]);
  const stores = Object.fromEntries(PORTABLE_STORES.map((name, index) => [name, rows[index]]));
  const archive = await buildLuckyBeanArchive({ stores, assets, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION });
  return {
    archive,
    counts: archiveCounts(stores, assets),
    mime: LUCKYBEAN_ARCHIVE_MIME
  };
}

export async function restorePortableArchive(value) {
  const archive = await parseLuckyBeanArchive(value, { currentSchemaVersion: SCHEMA_VERSION });
  const previousThumbnails = await exportBeanThumbnails();
  await replaceBeanThumbnails(archive.assets || []);
  try {
    await replaceStores(archive.stores);
  } catch (error) {
    try {
      await replaceBeanThumbnails(previousThumbnails);
    } catch (rollbackError) {
      throw new Error(`数据恢复失败，且本机缩略图回滚未完成：${rollbackError.message}`);
    }
    throw error;
  }
  return {
    counts: archiveCounts(archive.stores, archive.assets || []),
    migratedFrom: archive.migratedFrom || '',
    sourceVersion: archive.appVersion || ''
  };
}

export async function inspectPortableArchive(value) {
  const archive = await parseLuckyBeanArchive(value, { currentSchemaVersion: SCHEMA_VERSION });
  return {
    counts: archiveCounts(archive.stores, archive.assets || []),
    migratedFrom: archive.migratedFrom || '',
    sourceVersion: archive.appVersion || '',
    createdAt: archive.createdAt || ''
  };
}
