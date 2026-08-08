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
  const rows = await Promise.all(PORTABLE_STORES.map(name => all(name).catch(() => [])));
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
