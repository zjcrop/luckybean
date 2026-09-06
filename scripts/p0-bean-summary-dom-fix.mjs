import fs from 'node:fs';

const path = 'src/app.js';
let source = fs.readFileSync(path, 'utf8');
const before = `    await ensureBeanConsumptionData().catch(error => console.warn('今日咖啡摄入摘要后台加载失败', error));
    if (state.page === 'beans' && state.data.inventoryReady) renderBeans();`;
const after = `    await ensureBeanConsumptionData().catch(error => console.warn('今日咖啡摄入摘要后台加载失败', error));
    const consumptionSummary = document.querySelector('.bean-consumption-summary');
    if (state.page === 'beans' && state.data.inventoryReady && consumptionSummary) {
      consumptionSummary.outerHTML = beanConsumptionSummaryHtml();
    }`;
if (!source.includes(before)) throw new Error('idle bean summary render marker missing');
source = source.replace(before, after);
fs.writeFileSync(path, source);
