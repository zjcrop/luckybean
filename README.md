# LuckyBean DS（离线版）

## Android APK 下载

| 版本 | 用途 | 正式签名 APK | 校验 |
| --- | --- | --- | --- |
| LuckyBean（无后缀） | 在线版 | [下载 APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23/LuckyBean-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23/SHA256SUMS.txt) |
| LuckyBean DS | 离线版 | [下载 DS APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-ds/LuckyBean-DS-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-ds/SHA256SUMS.txt) |
| LuckyBean DS_B | 蓝牙版 | [下载 DS_B APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.24-dsb/LuckyBean-DS-B-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.24-dsb/SHA256SUMS.txt) |

本轮更新包含水质、实测萃取核算、计时播报与 OCR JSON 模型加载修复。可直接下载安装或转发发布。

在线版可与 DS 或 DS_B 并行安装。DS 与 DS_B 沿用既有的同一 Android 包名，彼此安装会覆盖，不能并行安装；切换前请先导出本地备份。DS_B 的仓库分支、历史文件名沿用 `DS-B` 拼写，指同一蓝牙版本。

OCR 下载接管修复详见 [更新说明](docs/OCR_MODEL_TRANSPORT_20261116.md)。

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
- Android 本地安装包

Cloud 线上版本继续由 `main` 维护；DS 本地版在 `luckybean-ds` 分支维护。
