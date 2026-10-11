# LuckyBean Core v2：schema 10、Room 与 GeckoView

状态：PR #135 实施中；新引擎自动验收正在运行，实体设备验收尚未提供。main 和已发布版本仍未切换。

基线：`ee6488e4d2dc28d640a4cb1d3887430381687fcf`。实施分支：`refactor/core-v2-schema10-room`。旧提案的 schema 3 已过时，当前唯一迁移源是 schema 10；现有领域模块、加密品鉴及同步规则继续复用。

## 实现

- Room v1 版本化记录模型、复合索引、异步仓库；保留未知字段、密文、设备密钥、historyRevisions、recycleBin 和 outbox。
- 全库原始快照，按 UTF-8 大小分块导入；快照和目标逐表验证记录数与 SHA-256。迁移期间源数据变化时中止，全部一致后才启用 Room。
- 显式确认、进度、取消和回滚入口；不在启动时自动迁移。旧历史整理阶段完成后才开放取消；取消或失败继续使用原始 IndexedDB。
- 回滚串行化并原子写回业务 store，再复核数量与 SHA-256；不把 Room active 标记复制到 IndexedDB。
- GeckoView 内置扩展加载 APK 中的相同业务资产；WebExtension 消息桥复用 Room、系统文件选择与导出、中英文 ML Kit OCR、冲煮前台服务、屏幕常亮及返回键。
- WebView 保留为升级迁移宿主。只有 Room 及照片/偏好准备完成后才能显式切换 GeckoView；初始化失败提供切回入口。
- 独立豆卡缩略图库迁入 Room 的本机 store，保留原始照片库和快照，数量/SHA-256 校验；跨引擎编辑不会被旧照片覆盖。回滚时先切回 WebView，再恢复照片和业务库。
- 本地偏好只在引擎切换时恢复一次，避免重启覆盖新偏好或恢复已退出的登录状态。
- 异步 Store/Platform 类型契约及 Web/Android 共用 Golden fixture；检查全表未知字段、密文、索引顺序、事务、离线历史、库存扣减、outbox 和幂等提交。
- Android API 29 飞行模式仪器测试使用 Gecko 的实际 JS→Room 桥和已保存方案完成冲煮；新增 APK 资产一致性门禁。测试业务脚本仅放在 debug assets。

## 发布边界

Web 继续使用 IndexedDB。Android 先保留 WebView 升级入口，由用户确认迁移后切换 GeckoView/Room。不能 destructive migration，也不删除旧库。照片是本机资产，不进入云端同步。

专业方案仍调用 BrewProfiles 在线接口；离线验收执行已保存的分析/方案快照，不用本地参考计算替代专业输出。schema、二维码和档案兼容规则保持当前基线。

构建使用 GeckoView 稳定版 `157.0.20261005135250`、AGP `9.1.1`、Gradle `9.3.1` 和 Android SDK `37.0`。只提高 compile SDK；设备行为的 target SDK 与最低安装版本没有在本次工具链升级中提高。

## 验收门槛

1. 同一 Golden fixture 在 Web 和 Android 的数据与业务结果一致；浏览器、Node、OCR、Android 构建及仪器测试通过。
2. 取消、验证失败、并发源数据变化均能停止切换；回滚保留当前业务记录、照片和 outbox。
3. Room 导出 schema 文件纳入版本控制并审核；APK 中 Gecko 与 WebView 业务资产一致。
4. 至少一台有既有 schema 10 数据的实体 Android 设备完成覆盖升级、迁移、照片/原生接口验收、重启和回滚，见 [设备验收表](CORE_V2_DEVICE_ACCEPTANCE.md)。
5. 所有门槛通过后按主线保护规则合并、发布和关闭 #22。

模拟器不能替代实体设备历史数据验收；未取得实际结果时，保持 Issue open 和 PR draft。
