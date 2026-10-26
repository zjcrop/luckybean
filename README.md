# LuckyBean DS

LuckyBean DS 是 LuckyBean 的离线本地版，与线上 LuckyBean Cloud 分开发布。豆卡、库存、冲煮记录、品鉴记录和设置保存在本机。

本地 APK 使用独立 Android 包名 `com.luckybean.ds`，可与 LuckyBean Cloud 并行安装。DS APK 不申请网络权限，云同步、AI 辅助、Grind-PSD 在线更新和 BrewProfiles 实时权威分析不可用；冲煮优化使用明确标注的本地参考模型。

## 可离线使用的主要能力

- 咖啡豆豆卡、库存、分组、历史与回收站
- 图片/文字 RecognitionDocument 识别与 Coffee Foundation canonical 归一化
- 中英日韩及繁体中文咖啡标签匹配
- 强证据多豆识别拆分与逐豆确认；Android 本地 OCR
- 本地参考冲煮方案、冷热冲、实时注水引导与语音执行
- 品鉴记录与本地反馈优化
- 本地优先 IndexedDB、可导入/导出本地备份
- xBloom Studio/J15 设备配方转换、逐段流量/温度编辑与 Android BLE 装载
- Android 本地安装包

Cloud 线上版本继续由 `main` 维护；基础 DS 本地版在 `luckybean-ds` 分支维护，本分支 `LuckyBean-DS-B` 基于 DS 增加 xBloom 设备适配。设备参数与协议边界见 [`docs/XBLOOM_DS_B.md`](docs/XBLOOM_DS_B.md)。
