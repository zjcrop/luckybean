# Core v2 数据迁移政策

## 迁移对象

- IndexedDB `luckybean`
- 旧库 `coffee_cellar_local_mvp_v1`
- stores：`beans`、`brewSessions`、`sensoryRecords`、`inventoryEvents`、`settings`、`customCodes`、`codebookCache`、`syncMetadata`、`shareDrafts`

## 强制流程

1. 读取数据库版本与 store 列表。
2. 将每个 store 按固定数量分块导出。
3. 在 Android 应用私有目录生成只追加原始快照。
4. 每条记录以 `storeName + id` 写入 Room 中间表。
5. 比较源端和目标端记录数量。
6. 计算并记录规范化 JSON 的 SHA-256。
7. 验证通过后写入迁移标记，但保留原始 WebView 数据和快照。
8. 任一环节失败均保留错误报告，并继续使用旧版数据路径，不清库。

## 禁止事项

- `fallbackToDestructiveMigration`
- 迁移异常后删除数据库
- 无备份覆盖云端数据
- 用“最后上传者覆盖整个数据库”解决冲突
- 在未确认敏感字段解密能力前改变密钥记录

## 兼容原则

迁移阶段按原始 JSON 复制加密记录和密钥元数据，不在原生层重新解释密文。Core v2 的隐私封装层从 Room 读取后再执行既有解密逻辑，从而避免转换过程中破坏 AES-GCM envelope。

## 验收输出

迁移报告至少包含：

- 源数据库及版本
- 目标 Schema 版本
- 每个 store 的源/目标记录数
- 每个 store 的内容哈希
- 未映射字段
- 解密失败记录 ID
- 重复 ID
- 迁移开始和结束时间
- 应用和 Core 版本
