# LuckyBean 1.24P 升级状态

日期：2026-09-02  
唯一开发主线：`main`  
发布版本：`1.24P`  
发布修订：`1.24P-main.1`

## 状态定义

本文件只记录已经进入 GitHub `main` 并经过实际自动化验证的改动，不把计划项记为完成。

**当前状态：1.24P 已完成开发、主线验证、GitHub Pages 发布和正式签名 APK 发布。**

最终是否属于有效发布，不以本文件文字为依据，而以 `pages-status/status/1.24P.json` 与 `release-status/status/1.24P.json` 的同 SHA 验证收据为准。

## 已实际落地

1. **统一冲煮契约**
   - `brew-plan/1.0` 已进入实际计算链路，并保留旧方案原始对象以保证兼容。
   - `BrewResult 1.1` 已成为统一结果层；缺失风味证据保留为 `null`，不再伪造中性值。
   - 风味维度已覆盖 3D、历史比较和匹配链路所需轴，并保留兼容别名。

2. **权威计算与本地回退**
   - `BrewCalculationCoordinator` 已接入统一 `brewPlan/BrewResult`。
   - BrewProfiles 权威路径与 local-reference 路径均输出统一契约。
   - local-reference 明确标记高不确定性，不冒充专业 BrewProfiles 空间模拟结果。

3. **3D、历史与反馈链路**
   - 3D 渲染优先消费 `BrewResult.physical.spatial`。
   - 历史记录与历史对比优先消费持久化的 `BrewResult.flavor`。
   - 品鉴优化保存 BrewResult 作为模型基线和审计证据，但不把模型预测当作用户真实感官评价。

4. **识别链路**
   - 正式流程统一为“识别 → 固定格式确认 → 豆卡”。
   - 产季字段、多语言名称、日期归属审查和识别 provenance 已纳入当前主线。
   - 歧义庄园/处理站自动解析保护已接入，原始 OCR 文本不会为了匹配而被静默改写。
   - PP-OCR 运行时和模型资产改为构建阶段同源准备，生产运行不依赖 jsDelivr 或外部模型站点。

5. **版本与发布元数据**
   - 根目录 `release.json` 为当前版本元数据源：Web/PWA/Android 均使用 1.24P 身份。
   - Android `versionName/versionCode` 从发布元数据读取；WebView UA 跟随 `BuildConfig.VERSION_NAME`。
   - Service Worker、PWA、Web 页面和 Android 发布包版本身份已统一。

6. **发布门禁**
   - `test-main` 实际覆盖：依赖审计、JavaScript 语法、敏感信息扫描、static、live BrewProfiles、browser smoke、Core、Visual、Android Debug。
   - Pages 仅允许通过同 SHA 主测试的源码部署，并在部署后验证版本身份、浏览器启动和运行时模块加载，再写入 `pages-status` 收据。
   - 正式 APK 仅允许通过同 SHA Pages 与主测试门禁后构建；发布前验证包名、versionCode/versionName、内嵌 Web 源码一致性及官方签名证书，再写入 `release-status` 收据。
   - 已修复 Pages 冷启动运行时验证竞态及无效 workflow 误取消有效 signed-release 的并发问题。

7. **仓库清理**
   - 历史/废弃开发 PR 已关闭。
   - 不再使用的开发、修复、验证和临时分支已删除。
   - 正常仓库仅保留：`main`、`ci-status`、`pages-status`、`release-status`。

## 1.24P 发布验收标准

以下条件必须同时成立，才视为有效 1.24P 发布：

- `main` 的完整主测试为 success；
- Pages 收据 `verified=true`、`browser_smoke=true`、`same_sha_main_tests=true`；
- release 收据 `published=true`、`release_target_verified=true`、`certificate_verified=true`；
- Pages、GitHub Release、正式 APK 与主测试均指向同一 `source_sha`；
- GitHub Release tag 为 `v1.24P-main.1`，并包含正式 APK、Web ZIP、构建 provenance 与 SHA-256 校验文件。

发布 SHA、APK SHA-256、Web ZIP SHA-256 和证书 SHA-256 不在本文手工重复维护，统一读取状态分支中的机器生成收据，避免文档与实际发布再次发生漂移。
