# LuckyBean Core v2 发布检查表

本清单适用于 Web/PWA、Android Alpha/Beta/Stable。任何必检项失败时不得合并 `main`、部署 Web 或创建正式 Release。

## 1. 版本与基线

- [ ] 当前提交位于受保护的重构/发布分支。
- [ ] `main` 已建立可恢复标签或备份分支。
- [ ] Android App、Web App、Core、Data Schema、Sync Protocol、Codebook 版本分别记录。
- [ ] 发布说明列出数据库、备份格式和同步协议是否发生变化。

## 2. 数据安全

- [ ] 不存在 `fallbackToDestructiveMigration` 或等价清库回退。
- [ ] 旧 IndexedDB 数据先写不可变 JSONL 快照。
- [ ] 每个 store 的记录数量和 SHA-256 校验通过。
- [ ] 迁移失败会保留旧数据并进入兼容模式。
- [ ] `.luckybean` 导出包含 manifest、数据库 JSONL、附件和 checksums。
- [ ] 恢复前完整校验 ZIP 路径、大小、记录数和 SHA-256。
- [ ] 冲突记录被保留，不静默覆盖更高 revision 的本地数据。
- [ ] 迁移和恢复报告可在应用私有目录检索。

## 3. 核心离线闭环

在飞行模式、无登录、无缓存云凭据下验证：

- [ ] 应用启动。
- [ ] 新增、修改、搜索、筛选和归档豆卡。
- [ ] 库存事件与剩余克重计算。
- [ ] 生成冲煮方案和分段推荐。
- [ ] 冲煮计时、暂停、继续和结束。
- [ ] 保存冲煮记录并扣减库存。
- [ ] 保存品鉴记录。
- [ ] 查看历史和复刻。
- [ ] Android 本地 OCR。
- [ ] Android 本地二维码生成和扫描。
- [ ] CSV 导出。
- [ ] `.luckybean` 导出和恢复。

## 4. 平台一致性

- [ ] Core v2 不加载 `v095–v099` 补丁链。
- [ ] Core v2 不加载 CDN 或远程运行时脚本。
- [ ] Web 使用 IndexedDB；Android 使用 Room；上层业务接口一致。
- [ ] Android 主入口固定为 GeckoView + `core-v2/index.html`。
- [ ] 原生消息仅接受受信任扩展、顶层 frame 和 `core-v2/` 来源。
- [ ] 外部网页在系统浏览器打开，不能访问 Native Bridge。
- [ ] 黄金输入在 Web 和 Android 产生相同业务输出或规定误差内输出。

## 5. 云端边界

- [ ] 本地保存先于同步入队。
- [ ] 断网、超时或服务器错误不回滚本地保存。
- [ ] 仅已被服务器明确确认的 eventId 可从 outbox 移除。
- [ ] 云端接口只接受 HTTPS 和 JSON。
- [ ] 远程脚本不能注入 Core v2 容器。
- [ ] 未配置云适配器时 WorkManager 不消费或删除 outbox。

## 6. 自动化门槛

- [ ] Core v2 Node 测试通过。
- [ ] Core v2 JavaScript 静态检查通过。
- [ ] JSON Schema 可解析。
- [ ] 遗留测试相对冻结基线无新增失败。
- [ ] Chromium 浏览器冒烟测试通过。
- [ ] PWA 断网重载测试通过。
- [ ] Android Debug APK 构建通过。
- [ ] Android Alpha/Release 构建通过。
- [ ] Room Schema 已导出并纳入版本控制。
- [ ] APK 中包含固定 GeckoView、本地 OCR 和二维码依赖。

## 7. 设备矩阵

至少覆盖：

- [ ] Android 8 / API 26。
- [ ] Android 10–12。
- [ ] Android 13–16。
- [ ] Pixel 或接近原生系统设备。
- [ ] 至少两种国产系统。
- [ ] 低内存设备。
- [ ] 小屏、2K 屏和系统大字体。
- [ ] 权限拒绝、仅本次允许、权限撤销。
- [ ] 进程被杀、后台恢复、低存储。

## 8. 发布

- [ ] Draft PR 中所有门槛转绿。
- [ ] 发布包版本号与 Git 标签一致。
- [ ] 生产签名来源明确；Alpha 调试签名不得标为正式版。
- [ ] Web Core v2 与 APK 内核心资源来自同一提交。
- [ ] 发布说明包含已知限制和回滚方法。
- [ ] Release 附带 APK、校验值、迁移说明和变更记录。
