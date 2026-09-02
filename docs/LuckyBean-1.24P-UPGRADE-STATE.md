# LuckyBean 1.24P 升级状态

日期：2026-09-02  
唯一开发主线：`main`  
目标版本：`1.24P`

## 状态定义

本文件只记录已经进入 GitHub `main` 的真实改动，不把计划项记为完成。

当前已进入 1.24P 开发批次，但应用对外版本标识仍暂时保持 1.24B。原因是现有 Pages、正式签名 APK 与发布门禁仍硬编码 1.24B；在这些门禁完成迁移并通过同一 SHA 的自动化验证前，不提前宣称 1.24P 已发布。

## 已实际落地

1. 修复统一风味向量层：新增 `normalizeFlavorVector()`，缺失维度保留为 `null`，避免把“无证据”误写成中性 50/100。
2. 新增 `src/contracts/brew-contract-adapter.js`，把现有权威方案无损映射为 `brew-plan/1.0`，同时保留原方案对象。
3. `BrewCalculationCoordinator` 升级为 `brew-calculation-coordinator/1.1`，权威计算返回值会实际附加：
   - `contracts.brewPlan`
   - `contracts.brewResult`
4. Switch/浸泡、冰冲、手冲的基础冲煮类型语义进入统一方案契约；不以新契约覆盖旧数据。
5. 新增 `test/v124p-brew-contract-integration.test.js`，验证旧方案保留、浸泡语义转换、未知风味维度处理及权威运行路径接入。
6. PWA Service Worker 已将新增运行模块纳入预缓存，避免在线可用、离线因新模块未缓存而失败。

## 尚未完成，因此不得标记为 1.24P 发布完成

- 将本地 fallback 直接计算路径也统一附加同一契约，并验证与权威路径一致。
- 让 3D、反馈优化、历史记录逐步改为消费统一 `BrewResult`，而不是仅依赖旧字段。
- 把 Web/PWA/Android 对外版本号、缓存代号统一升级到 1.24P。
- 迁移 `deploy-main.yml`、`build-main.yml` 及 1.24B 发布回归门禁到 1.24P。
- 通过同一 main SHA 的完整 GitHub Actions、Pages 实机网页检查及正式签名 APK 构建后，才允许宣布 1.24P 已发布。
