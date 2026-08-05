# LuckyBean Core v2 架构

## 目标

Core v2 将现有补丁式单页应用重构为“共享 Web 核心 + 平台适配器 + 可选云端扩展”。Web/PWA 与 Android 共用业务模型、数据 Schema、编码表和黄金测试；Android 使用固定 GeckoView、本地 Room、应用私有附件目录及原生设备服务。

## 不可破坏原则

1. Room 和 IndexedDB 都只能通过 StoragePort 访问。
2. 本地数据库是核心功能的事实来源；网络失败不能导致本地保存失败。
3. 旧 IndexedDB 在迁移成功、记录计数和哈希验证完成前不得清除。
4. 迁移失败不得调用 destructive migration 或清空数据库。
5. Android 主 GeckoSession 只加载 APK 内置的受信任 WebExtension 页面。
6. 云端页面不获得 Native Bridge、Room 或本地附件权限。
7. 冲煮、轨迹、品鉴、库存、QR 和编码逻辑必须由纯模块实现，不依赖 DOM、Room、IndexedDB 或 Android API。

## 运行结构

```text
Web/PWA
  UI -> Core v2 -> WebPlatformAdapter -> IndexedDB / Browser APIs

Android
  UI -> Core v2 -> AndroidPlatformAdapter -> Gecko native messaging
                                      -> Room / Files / OCR / Share / WorkManager
```

## Android 迁移门

旧 Alpha 使用 Android System WebView，数据保存在其 IndexedDB 中。GeckoView 无法直接读取 Chromium WebView 的站点存储，因此首次升级必须执行：

```text
受限隐藏 WebView
  -> 加载 APK 内 android-migrate.html
  -> 读取 luckybean IndexedDB
  -> 分表、分块写入 Room
  -> 同时保存不可变原始 JSONL 快照
  -> 校验记录数
  -> 写入迁移完成标记
  -> 销毁 WebView
  -> 启动 GeckoView
```

迁移 WebView 禁止外部导航，只在迁移期间暴露单用途 JavascriptInterface，完成后立即移除和销毁。

## 核心离线域

- 豆卡与豆藏检索
- 库存事件和剩余克重
- 冲煮方案、分段、轨迹和计时
- 品鉴、历史与复刻
- 器具和本地设置
- QR 生成与扫描
- 基础本地 OCR
- `.luckybean` 备份、恢复和 CSV 导出

## 在线扩展域

- 登录和账号
- 多设备同步和云备份
- 在线分享
- AI 解释和高级 OCR
- 社区、在线地图和在线资料库
- 编码表在线更新

在线扩展只能通过明确 API 返回 JSON，不得动态注入可调用 Native Bridge 的远程脚本。

## 版本边界

- App Version：界面和平台外壳版本
- Core Version：业务逻辑版本
- Schema Version：本地/备份数据结构版本
- Sync Protocol：同步事件格式版本
- Codebook Version：编码表版本

这些版本独立演进，发布记录必须同时列出。
