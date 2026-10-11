import { loadBeanGroupMode } from './domain/beans/bean-group-settings.js';

if (!globalThis.__LuckyBeanV099iMigrationsLoaded) {
  globalThis.__LuckyBeanV099iMigrationsLoaded = true;
  loadBeanGroupMode().catch(error => console.warn('分组设置迁移失败', error));
}
