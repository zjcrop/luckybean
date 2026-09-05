# LuckyBean 1.24P — 当前开发状态

当前发布候选：`1.24P-main.3`  
语义版本：`1.24.17`  
Android：`versionCode 102419` / `versionName 1.24P`  
本地数据 Schema：`v10`

> 本文件记录当前发布候选。正式 `main` 仍以最后通过全部同 SHA 门禁并合并的提交为准；任何开发分支状态不得冒充已发布状态。

## 1.24P-main.3 发布候选范围

- 本地优先数据架构：新增可重建的 `beanSummaries` 轻量目录；豆卡 canonical 数据不重写；冲煮、品鉴和库存记录按 `beanId` 索引按需读取。
- 首屏性能：首屏不再阻塞完整 Coffee Foundation codebook；使用轻量显示索引；OCR、地图、选择等重模块按功能加载。
- 识别预热：桌面浏览器在进入拍袋流程时预热 PP-OCR；低内存/WebKit 只预热同源运行时，实际识别时再分配模型；Android 保持 Native OCR 优先。
- Recognition：保持 Coffee Foundation / RecognitionDocument 权威边界；复杂多豆文本在强证据成立时拆为独立 RecognitionDocument，并逐豆确认；弱证据和同豆多视图禁止误拆。
- AI 辅助：低置信度/未解析字段可调用服务端 `recognition-ai-v1`；智谱结果固定为 advisory candidate，不得覆盖 Foundation canonical facts；AI 超时或不可用不得阻断本地识别和豆卡录入。
- iOS/Safari：支持 Supabase 邮箱验证回调 token 消费；localStorage 受限时使用非破坏性的临时会话；WebKit OCR 使用受限 direct-WASM/no-SIMD 兼容路径。
- 同步：登录成功与云同步解耦，云同步等待 `local-app-ready`；继续兼容 `luckybean-sync-v2`，不批量重编码旧云 payload。
- 数据安全：Supabase 已建立迁移前 SHA-256 影子快照和 UPDATE/DELETE 前置归档；v9→v10 有 canonical 不变性回归。
- 发布身份统一：`release.json`、PWA/Web 缓存、Android versionCode 与 Schema 同步到 main.3 候选。

## 发布门禁

候选只有同时满足以下条件才允许合并 `main`：

1. 依赖审计、JavaScript 语法、密钥泄漏扫描通过。
2. 静态架构与迁移测试通过。
3. 实时 BrewIon Coffee Foundation 契约通过。
4. 实时 BrewProfiles 契约通过。
5. 实时 `recognition-ai-v1` advisory 契约通过。
6. Chromium startup/smoke/core/visual 回归通过。
7. WebKit 登录/OCR 回归通过。
8. Android 编译、Native/Web 契约、Android 10 启动与 APK 打包通过。
9. 合并后的同 SHA `main` 再次通过发布门禁后，才部署网页和签名 Release。

## 历史说明

1.23D、1.23E、1.24B 和 1.24P-main.1/main.2 均为历史检查点。旧版本的详细修改记录保留在 Git 历史、Release 和 `docs/` 中，不再作为当前开发状态的权威入口。
