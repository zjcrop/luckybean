# LuckyBean Core v2：Schema 10 原生存储迁移

状态：实施中，PR #135 草稿；尚未达到合并、发布或关闭 Issue #22 的门槛。

- 基线：`ee6488e4d2dc28d640a4cb1d3887430381687fcf`
- 当前验证 head：`cf9ccdf7dcd6773a12ca8097f2f5e8064795e8f6`
- [主测试与浏览器工作流](https://github.com/zjcrop/luckybean/actions/runs/38109628735)通过；[API 29 Android 集成工作流](https://github.com/zjcrop/luckybean/actions/runs/38109628622)通过。

## 当前事实

- Web 与已发布 Android 版使用 schema 10 IndexedDB；Android 容器仍是 WebView。
- 已有本地优先领域模块、schema 9→10 投影迁移、加密品鉴记录和同步 outbox，不在本迁移中重做。
- 旧提案的 schema 3 已过时；唯一迁移源是 schema 10。
- Room/IndexedDB 代码仅在 PR #135 分支，尚未进入 main 或发布版。

## PR #135 已实现并通过 CI

- Room v1 记录模型、复合索引、异步仓库及 WebView 原生桥接；Gradle 配置 Room schema 导出。
- schema 10 IndexedDB 各 store 的原始数据快照、分块导入、逐 store 记录数与 SHA-256 校验；所有 store 验证通过后才写入 Room active 标记。
- 保留未知字段、sensoryRecords 密文、设备密钥、syncOutbox、historyRevisions 与 recycleBin；不解密迁移记录。
- 兼容业务代码现有的 IndexedDB 事务调用，并将一次事务中的变化作为单个 Room 事务提交。
- 回滚时串行化 Room 操作，将业务记录完整写回 IndexedDB，并排除 Room 专用 active 标记；浏览器 fixture 覆盖全表回滚比对。
- 浏览器迁移/回滚用例、Android Room repository 仪器测试和 API 29 启动冒烟通过。

## 尚未完成的交付与发布阻断

- Android 仍是 WebView；GeckoView 及其 Native bridge 未实现。
- 文件、相机、OCR、计时、后台任务仍未迁移到平台抽象；独立豆卡缩略图 IndexedDB 也未迁入 Room。
- 当前分支的 Android 启动脚本会自动触发 Room 迁移；尚无迁移确认、进度、取消和应用内回滚入口。该行为仅留在草稿分支，补齐显式用户流程前不得合并或发布。
- API 29 自动冒烟尚未在飞行模式下跑完整冲煮及本地历史功能，也没有证明这条流程不访问 Supabase。
- 没有真实设备上的既有 schema 10 历史数据升级、重启、逐表校验和回滚演练。
- Room schema 导出已配置，但 Room 版本化 schema 文件仍需纳入并审核。

## 目标边界

- Web 继续使用 IndexedDB；Android 最终使用 GeckoView 与 Room。
- 业务模块只依赖异步 Store/Platform contracts，不依赖 Room、浏览器内核或 Supabase 实现细节。
- 既有用户必须能明确选择迁移，迁移时看到进度；旧 IndexedDB 与快照保留，失败或回滚不能丢数据。
- 禁止 destructive migration，未知字段和敏感记录必须原样保留。

## 验收门槛

1. Web IndexedDB 与 Room 对同一 Golden fixture 的 CRUD、复合索引、批量写入、事务原子性、密文和 outbox 行为一致。
2. 人为中断每个导入阶段后可安全重试；回滚后的 IndexedDB 与 Room 当前业务数据逐 store 一致。
3. Android API 29 飞行模式下启动、读写豆卡、完成冲煮并生成本地历史；确认流程不访问 Supabase。
4. 至少一台已有 schema 10 用户数据的实体设备完成迁移、校验、重启与回滚。
5. 通过以上自动及人工门槛后，才能请求合并与发布，并更新 #22 的完成批次。

任一人工验收不可由模拟器或 CI 代替；全部门槛通过前，保持 #22 open，不切换发布默认后端，也不删除旧数据库。
