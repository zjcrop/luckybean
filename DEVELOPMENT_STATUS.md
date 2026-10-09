# LuckyBean 1.24P — 当前开发状态

当前发布候选：`1.24P-main.9`
语义版本：`1.24.21`
Android：`versionCode 102425` / `versionName 1.24P`
本地数据 Schema：`v10`

> 本文件记录当前发布候选。正式 `main` 仍以最后通过全部同 SHA 门禁并合并的提交为准；任何开发分支状态不得冒充已发布状态。

## 1.24P-main.9 发布候选范围

- 本地优先数据架构：新增可重建的 `beanSummaries` 轻量目录；豆卡 canonical 数据不重写；冲煮、品鉴和库存记录按 `beanId` 索引按需读取。
- 首屏性能：首屏不再阻塞完整 Coffee Foundation codebook；使用轻量显示索引；OCR、地图、选择等重模块按功能加载。
- 识别预热：桌面浏览器在进入拍袋流程时预热 PP-OCR；低内存/WebKit 只预热同源运行时，实际识别时再分配模型；Android 保持 Native OCR 优先。
- Recognition：保持 Coffee Foundation / RecognitionDocument 权威边界；复杂多豆文本在强证据成立时拆为独立 RecognitionDocument，并逐豆确认；弱证据和同豆多视图禁止误拆。
- AI 辅助：低置信度/未解析字段可调用服务端 `recognition-ai-v1`；智谱结果固定为 advisory candidate，不得覆盖 Foundation canonical facts；AI 超时或不可用不得阻断本地识别和豆卡录入。
- iOS/Safari：支持 Supabase 邮箱验证回调 token 消费；localStorage 受限时使用非破坏性的临时会话；WebKit OCR 使用受限 direct-WASM/no-SIMD 兼容路径。
- 同步：登录成功与云同步解耦，云同步等待 `local-app-ready`；继续兼容 `luckybean-sync-v2`，不批量重编码旧云 payload。
- 数据安全：Supabase 已建立迁移前 SHA-256 影子快照和 UPDATE/DELETE 前置归档；v9→v10 有 canonical 不变性回归。
- 发布身份统一：`release.json`、PWA/Web 缓存、Android versionCode 与 Schema 同步到 main.9 候选。

## 本次收尾范围

- 豆卡展示、缩略图与原生计时统一入口，移除重复实现；修复图片懒加载死锁、自定义14g输入和重新打开、切换计时段的时长显示、原生暂停方向及滴滤结束。
- 保留余量当次建议：28g→14g+14g，27g→15g+12g，低于20g一次用完；不改写用户长期粉量偏好。
- 移除6个一次性补丁工作流和旧重复发布入口；下游仅响应main。清理支持squash合并、精确SHA删除、旧候选归档，并保护未合并工作。
- 详细问题、29个历史分支SHA与处置见[收尾盘点](docs/CLOSEOUT_20261007.md)。候选状态不等同于已发布状态。

## 2026-10-09 OCR 与发布恢复修复

- PP-OCRv5 预测超时后最多使用同一模型的无 SIMD Worker 重试一次；再次失败停止当前任务，保留原图并提供重试入口。
- 相册预处理失败保留原文件供重试，错误提示不作为 OCR 证据；关闭拍袋后返回的旧预处理任务不能覆盖新页面。明确的凈重/凈含量标签可归一到净含量，同时保留原文。
- Service Worker 在异步缓存之前复制响应并保留缓存任务，缓存写入失败不阻断原始响应；照片预览释放前先移除图片引用。
- 主线测试、Pages 和签名发布串行执行；下游核对同 SHA 成功测试与未过期产物，签名发布再次核对 Pages 回执。已有 Release 标签不得迁移到另一提交。
- BrewProfiles 保留全部在线断言，每次请求连同响应体限时 20 秒、最多两次；单套限时 5 分钟，总门禁 15 分钟。日志记录请求序号、状态和耗时，不记录凭据。
- 核心浏览器回归与其他浏览器门禁使用同一确定性静态服务器，仍保留原有界面断言。Pages 构建、部署和线上验证分别限时 20、10、15 分钟。
- 旧未合并分支继续保留，清理仅在签名发布成功后按精确分支头与合并证据执行。本节说明候选机制，不声明 PR、部署或用户照片验收已完成。

## 发布门禁

候选只有同时满足以下条件才允许合并 `main`：

1. 依赖审计、JavaScript 语法、密钥泄漏扫描通过。
2. 静态架构与迁移测试通过。
3. 实时 BrewIon Coffee Foundation 契约通过。
4. 实时 BrewProfiles 契约通过。
5. 本地 AI advisory/结构恢复契约通过；自动门禁禁止调用收费推理接口。
6. Chromium startup/smoke/core/visual 回归通过。
7. WebKit 登录/OCR 回归通过。
8. Android 编译、Native/Web 契约、Android 10 启动与 APK 打包通过。
9. 合并后的同 SHA `main` 再次通过发布门禁后，才部署网页和签名 Release。

## 历史说明

1.23D、1.23E、1.24B 和 1.24P-main.1/main.2 均为历史检查点。旧版本的详细修改记录保留在 Git 历史、Release 和 `docs/` 中，不再作为当前开发状态的权威入口。
