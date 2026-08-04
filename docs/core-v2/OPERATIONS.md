# LuckyBean Core v2 运营与维护规范

## 1. 产品线

### Android 主线

承担完整离线闭环、主数据库、相机、OCR、二维码、文件、备份和后台同步队列。

- UI：随 APK 打包的 `core-v2/` 页面。
- 固定内核：GeckoView。
- 主数据库：Room / SQLite。
- 附件：应用私有文件目录。
- 在线功能：可选 JSON API。

### Web/PWA 辅线

承担无安装访问、桌面使用、应急入口和轻量分享。

- UI 与业务：同一 `core-v2/` 构建资源。
- 主数据库：IndexedDB。
- 离线：同源 Service Worker。
- Classic 页面：只作为旧功能和云端扩展兼容入口。

## 2. 版本管理

以下版本独立递增：

- Android App Version
- Web App Version
- Core Version
- Data Schema Version
- Sync Protocol Version
- Codebook Version
- Backup Format Version

数据或同步协议发生不兼容变化时，不得只提升页面版本。

## 3. 开发规则

1. 新核心功能只能进入 `core-v2/`、`src/core-v2/` 或明确的平台适配层。
2. 禁止新建按版本号命名的补丁脚本。
3. 禁止在多个脚本中重复绑定同一 UI 事件。
4. 业务模块不得直接调用 Room、IndexedDB、Android API 或 DOM 存储。
5. 纯业务规则必须有固定输入、输出和测试。
6. 新字段先更新 Schema 和迁移，再更新 UI。
7. 云端功能必须在断网时安全降级。
8. 任何清除数据操作必须需要显式确认令牌和可恢复备份。

## 4. 数据写入

核心写入顺序：

1. 写入本地主数据库；
2. 返回本地成功；
3. 写入 `syncOutbox`；
4. 网络可用时由前台或 WorkManager 尝试同步；
5. 服务器明确确认 eventId 后才允许移除对应 outbox 事件。

冲煮、品鉴和库存采用追加记录。豆卡允许 revision 更新。删除使用 tombstone。

## 5. 数据迁移

- 每次迁移前创建原始快照。
- 先进入暂存表，禁止直接覆盖正式记录。
- 按 store 记录数量和 SHA-256 校验。
- 校验全部通过后在单一事务中提升。
- 失败时保留原数据库、暂存表和报告。
- 禁止迁移失败后清空或重建数据库。

## 6. 备份与恢复

`.luckybean` 是正式可携带格式。

必须包含：

- `manifest.json`
- `database/*.jsonl`
- `attachments/**`
- `checksums.json`

恢复采用合并语义：

- 无本地记录：插入；
- 内容哈希相同：跳过；
- revision 更高：高 revision 胜出；
- revision 相同：比较 `updatedAt`；
- 冲突双方写入冲突记录；
- 附件同名不同哈希时保留冲突副本。

## 7. 编码表

编码表更新必须具备：

- 唯一版本号；
- JSON Schema；
- 编码唯一性校验；
- 国家—产区—实体关系校验；
- 内置后备版本；
- 候选写入、校验、原子激活；
- 更新失败回滚到活动版本。

## 8. 云端扩展

Core v2 只允许 HTTPS JSON API。

禁止：

- 动态执行远程 JavaScript；
- 在受信任 GeckoView 容器打开任意网页；
- 将云端状态作为本地保存前置条件；
- 服务器未确认时删除 outbox；
- 整库最后写入者覆盖。

Classic/Cloud 页面必须与 Native Bridge 隔离，优先在系统浏览器打开。

## 9. 故障处理

### 启动失败

1. 读取本地诊断；
2. 检查迁移状态；
3. 不清库；
4. 允许进入 Classic 兼容模式；
5. 导出 `.luckybean` 或迁移快照。

### 同步失败

1. 保持 outbox；
2. 记录错误和重试时间；
3. 指数退避；
4. 用户仍可继续离线使用；
5. 禁止自动登出或阻断保存。

### 备份恢复失败

1. 保留导入源文件；
2. 保留解压目录和报告；
3. 不修改正式记录；
4. 返回具体条目、记录数或哈希错误。

## 10. 发布渠道

- `dev`：开发构建，不面向用户。
- `alpha`：内部和小范围验证，可使用测试签名但必须明确标识。
- `beta`：完成数据与离线验证，使用受控签名。
- `stable`：全部发布门槛和设备矩阵通过。

任何渠道都必须保留可回滚提交和数据恢复路径。
