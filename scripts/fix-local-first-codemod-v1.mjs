import fs from 'node:fs';

const file = 'scripts/apply-local-first-v2.mjs';
let source = fs.readFileSync(file, 'utf8');
const oldBlock = "const oldInitCodebook = `  const loaded = await loadCodebook();\\n  state.codebook = loaded.data; state.codebookMeta = loaded.meta; state.codebookIndex = makeIndex(loaded.data);\\n  if (await handleSharedHash()) return;\\n  await refreshData();\\n  await migrateLegacyFlavorCodes();\\n  bindGlobalEvents();\\n  await cleanupExpiredBeanRecycle().catch(() => {});\\n  enterApp();`;";
const newBlock = "const oldInitCodebook = `  const loaded = await loadCodebook(); state.codebook=loaded.data;state.codebookMeta=loaded.meta;state.codebookIndex=makeIndex(loaded.data);\\n  if (await handleSharedHash()) return;\\n  await refreshData(); await migrateLegacyFlavorCodes(); bindGlobalEvents();\\n  await cleanupExpiredBeanRecycle().catch(error => console.warn('回收站过期清理失败', error));\\n  enterApp();`;";
if (!source.includes(oldBlock)) throw new Error('Expected init codemod definition not found');
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source);
console.log('Aligned init transform with current main');
