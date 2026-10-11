# LuckyBean Core v2：Schema 10 原生存储迁移

状态：实施中；不代表已通过 Android 真机或数据迁移验收。

## 当前事实

- Web 与 Android 当前都运行 schema 10 的 IndexedDB；Android UI 容器是 WebView。
- 领域模块、schema 9→10 投影迁移、数据安全、同步 outbox 已有实现，不能作为 Core v2 未完成项重复实现。
- Room、GeckoView 以及 IndexedDB→Room 的在线迁移尚未接入。
- 当前基线：`ee6488e4d2dc28d640a4cb1d3887430381687fcf`。

## 目标边界

- Web 继续使用 IndexedDB。
- Android 新安装使用 GeckoView 与 Room；原有 WebView 用户通过显式、可回滚迁移转入 Room。
- 同步、识别、文件、计时等业务模块只依赖异步存储/平台契约，不依赖 Room、GeckoView 或 Supabase 实现细节。
- schema 10 是唯一迁移源；不再引入旧提案的 schema 3。
- 迁移期间保留旧 IndexedDB，不删库、不做 destructive migration；有快照、逐 store 计数与摘要校验，失败自动回到旧引擎/旧存储。

## 交付批次

1. 冻结现有 IndexedDB v10 存储契约及黄金 fixture；明确主键、二级索引、敏感字段原样搬运规则。
2. 落地异步 Store/Platform contracts，Web IndexedDB 实现作为基准，Node/浏览器黄金测试保持一致。
3. 建立 Room v1 记录模型与 schema export；加入可测试的事务、索引、备份和恢复接口。
4. 实现可中断、可重试的 v10→Room 影子导入：生成本地快照，分块导入，验证 store、记录数和 SHA-256；只有验证成功才切换。
5. GeckoView 通过单一 Native bridge 接入 Room、文件/相机/OCR/计时；逐项替换并保留 WebView 回退。
6. CI 运行 Web/Node/Android 编译、模拟器离线启动、迁移与回滚测试；人工 Android 设备验收通过后才能合并与发布。

## 数据与回滚约束

- 搬运 canonical 行的原始 JSON，不重新序列化业务字段、不重算 ID、不丢弃未知字段；派生 beanSummaries 可以重建。
- 包括 sensoryRecords 的密文、syncMetadata 中的设备密钥、syncOutbox、historyRevisions 和 recycleBin。不得将敏感记录解密后写进迁移日志。
- 迁移快照与原 IndexedDB 在切换后都保留；Room 写入失败不能吞掉业务变更，也不能标记 outbox 已同步。
- 迁移只能在后台异步执行，UI 继续显示进度；取消、进程终止、空间不足和校验失败都必须可恢复。
- Android 单元/模拟器不能替代真实设备的飞行模式、现有用户历史数据和升级覆盖测试。

## 验收门槛

- Web IndexedDB 与 Room 对同一 Golden fixture 的 CRUD、复合索引、批量写入、事务恢复、敏感记录字节和 outbox 行为一致。
- 人为中断每个导入阶段后，重启可以安全重试；回滚后 IndexedDB 摘要与迁移前完全一致。
- Android API 29 模拟器飞行模式下启动、读写豆卡、完成冲煮并生成本地历史；关闭联网不应访问 Supabase。
- 至少一台已有 LuckyBean schema 10 历史数据的实体 Android 设备完成升级迁移、校验、重启、回滚演练。
- 以上自动与人工门槛未全部通过前，不关闭 #22，不切换发布版默认引擎，不删除旧数据库。
