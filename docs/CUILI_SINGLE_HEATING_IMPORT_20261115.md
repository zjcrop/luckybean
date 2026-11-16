# 萃离单次加热记录：本地消费者增量

核验日期：2026-11-15。本轮在本机隔离工作树 `LuckyBean/tds-voice-dsb` 与 `LuckyBean/tds-voice-cloud` 验证；未修改原工作树的既有 Java 删除项，也未改动发布副本或远端部署。

## 使用

在小酌的“自定义水型”对话框展开“导入萃离水样与单次加热记录”，选择萃离导出的 JSON 或粘贴内容，检查后点击“确定”。导入作为本机附加记录，不自动把萃离的豆型 ID 映射成 LuckyBean 水型，也不替换名称、参考 TDS 和风味倾向。当前选择为“自定义”时，该记录的用水提醒会附加到实际渲染的 `plan.warnings`；改为纯水或其他水型时移除这些本地提醒。

支持 `water.concentrationBasis = pre-heating-calculated`、`heatingAssessment.scenario = single-heating` 及 `history.heatingCycles = 1`。严格检查数值类型、非负浓度、体积、热史范围、账本一致性与自动调整边界。缺失的数值仍是未知；加热前配方计算值不会写成热后实测。

## 计算边界

- 离子及热史原记录保存在 `localStorage['luckybean.cuili-water.local-record']`，不放进 `app.settings` 或 `customProfile`。选用自定义水时，明确的加热前离子通过 `input.water.ionsMgL` 及 `concentrationBasis=pre-heating-calculated` 用于水质诊断；完整热史对象不进入请求。
- `BrewCalculationCoordinator.calculate` 通过单独的 `localWaterRecord` 参数接收本地记录，完成原计算及合同适配后只追加显示提醒；权威分段、温度、时间、指纹不变。
- 本地 `computeFallbackPlan(input, {localWaterRecord})` 使用同样的提示投影，不改变本地计算输入或输入哈希。
- 只记录单次加热，不新增保温、复烧或固定热损失计算。不根据加热最高温直接替换注水温度；仅在记录最高温低于现有方案注水目标时提醒核对。
- `ionicAccountingComplete=false` 会保留并提示账本不完整，不静默丢掉未知载体的边界。
- 保存、移除或更换记录会刷新已有方案的本地提示，旧沉积提醒不会残留。温度、时间与分段仍保持原样。

“水与本杯实测”面板独立记录实际水TDS、实际投粉量、咖啡液折光TDS和杯中饮料产出。未测留空，实际零值不会回退成参考85mg/L；参考水型TDS不作为本杯实测。15g投粉、210g产出及1.35%咖啡液TDS核算为18.90%表观回收率，未盲扣原水EC换算ppm，也不使用注水量冒充产出。切换豆子（含其他豆卡入口）或水型会清空本杯实测。非法输入会清除旧结果并给出明确提示。

## 验证

```
node --test test/cuili-water-record.test.js test/brew-calculation-coordinator.test.js test/brew-authoritative-plan.test.js test/v124p-brew-contract-integration.test.js
node scripts/verify-cuili-water-dialog.mjs
node --test test/water-extraction-panel.test.js
node scripts/verify-water-extraction-form.mjs
```

测试使用萃离真实浏览器下载生成的 `test/fixtures/cuili-water-record.single-heating.json`：单次加热100°C、蒸发5%、可见沉积。浏览器测试在隔离页面中运行真实 `openCustomWaterDialog` 与真实 `planHtml` 函数，验证文件/粘贴导入、确认保存、无效内容反馈、已有方案即时显示/移除提示，以及阶段和指纹不变。浏览器测试替换了认证和完整应用存储适配器，未冒充生产认证全流程测试。报告为 `test-results/cuili-water-dialog.json`。

本轮水表单浏览器脚本运行真实的 `renderBrew`、输入绑定、`buildBrewInput`、`generatePlan`、协调器和 `planHtml`；权威传输、认证与无关器具/存储适配器使用替身，不能据此声称生产后端已部署。报告为 `test-results/water-extraction-form.json`。

最初原文件备份在 `D:\ChatGPT\output\萃离研究\2026-11-15\LuckyBean-thermal-backup`，含原始 SHA-256。原source工作树在改动前已存在的四个 Android Java 删除保持不动。
