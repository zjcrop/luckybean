# LuckyBean Core v2

LuckyBean Core v2 是本地优先重构线。Android 是主要产品，Web/PWA 是长期辅助产品；两端使用同一套 Core 页面、业务逻辑、数据 Schema、编码表和测试输入，但采用不同的平台存储与设备能力适配器。

> 当前状态：`2.0.0-alpha.1` 重构分支。未通过全部发布门槛前不得替换稳定版。

## 目录

- `core-v2/`：干净的核心 UI 和 PWA 入口，不加载历史版本补丁链。
- `src/core-v2/`：数据契约、库存、备份、同步、云端和平台适配。
- `schemas/v3/`：正式数据、备份和同步 JSON Schema。
- `android/`：GeckoView、Room、CameraX、OCR、二维码、文件和 WorkManager。
- `tests/core-v2-*`：核心契约、黄金输入、同步和结构防回退测试。
- `docs/core-v2/`：架构、迁移、运营和发布规范。

## 本地运行 Web Core

必须通过 HTTP 服务器运行，不能使用 `file://`：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

打开：

```text
http://127.0.0.1:4173/core-v2/
```

核心 Web 数据保存在 IndexedDB。首次在线加载并激活 Service Worker 后，核心页面支持断网重载。

## Android 构建

Android 构建要求：

- JDK 17
- Gradle 8.11.1
- Android API 36 编译平台
- Android 最低 API 26

```bash
gradle -p android assembleDebug
```

Android APK 包含：

- 固定 GeckoView；
- `core-v2/` 页面与业务资源；
- Room / SQLite；
- CameraX；
- 随 APK 打包的中英文 OCR；
- 随 APK 打包的二维码扫描与生成；
- `.luckybean` 归档备份；
- WorkManager 同步队列。

## 数据迁移

旧 APK 的数据位于 Chromium WebView 的 `https://app.luckybean.local/` IndexedDB，GeckoView 无法直接读取。首次启动由受限隐藏 WebView 完成迁移：

1. 读取旧数据库；
2. 按 store 和记录 ID 排序；
3. 分块写入 Room 暂存表；
4. 写不可变 JSONL 快照；
5. 校验记录数与 SHA-256；
6. 在事务中提升为正式记录；
7. 标记迁移完成；
8. 失败时保留旧数据并进入兼容模式。

不存在迁移失败后清库的路径。

## 本地核心范围

- 豆卡新增、修改、搜索、筛选和归档；
- 库存事件与剩余量；
- 冲煮方案、分段推荐和计时；
- 品鉴、历史和复刻；
- Android 本地 OCR；
- Android 本地二维码生成与扫描；
- CSV；
- `.luckybean` 备份与恢复；
- 运行诊断。

账号、云同步、在线分享、AI、高级 OCR、社区和地图属于在线扩展，断网不得阻止本地核心。

## 测试

```bash
node --test tests/core-v2-*.test.mjs
npm run check
```

浏览器冒烟由 `.github/workflows/core-v2-browser.yml` 执行，验证：

- 创建豆卡；
- IndexedDB 持久化；
- 本地生成冲煮方案；
- Service Worker 断网重载；
- 不加载历史补丁脚本和远程运行时脚本。

完整旧测试套件使用冻结基线差分：已有历史失败会记录，但任何新增失败都会阻断发布。

## 强制规则

- 禁止新增版本号补丁脚本；
- 禁止远程 JavaScript 注入 Core v2；
- 禁止云端失败回滚本地保存；
- 禁止服务器未确认时删除 outbox；
- 禁止迁移失败后清库；
- 禁止在 CI 未全部通过时合并 `main`；
- Alpha 测试签名不得描述为正式生产签名。
