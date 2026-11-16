# LuckyBean DS_B（蓝牙版）

## Android APK 下载

| 版本 | 用途 | 正式签名 APK | 校验 |
| --- | --- | --- | --- |
| LuckyBean（无后缀） | 在线版 | [下载 APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23/LuckyBean-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23/SHA256SUMS.txt) |
| LuckyBean DS | 离线版 | [下载 DS APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-ds/LuckyBean-DS-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-ds/SHA256SUMS.txt) |
| LuckyBean DS_B | 蓝牙版 | [下载 DS_B APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-dsb/LuckyBean-DS-B-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-dsb/SHA256SUMS.txt) |

本轮版本均为 1.24P-main.23 系列，包含水质、实测萃取核算、计时播报与 OCR JSON 模型加载修复。可直接下载安装或转发发布。

在线版可与 DS 或 DS_B 并行安装。DS 与 DS_B 沿用既有的同一 Android 包名，彼此安装会覆盖，不能并行安装；切换前请先导出本地备份。DS_B 的仓库分支、历史文件名沿用 `DS-B` 拼写，指同一蓝牙版本。

OCR 下载接管修复详见 [更新说明](docs/OCR_MODEL_TRANSPORT_20261116.md)。

## 本次水质与计时更新

DS-B 1.24P-main.23-dsb：原水TDS与咖啡液TDS分开，增加本杯实测核算和萃离离子账本核对；修复重复段号及Android旧语音缓存。详见[更新与验证说明](docs/WATER_TDS_VOICE_20261115.md)。


LuckyBean DS_B 是 LuckyBean 的蓝牙版本，基于 DS 离线核心增加 xBloom 蓝牙设备适配，与在线版和 DS 分开发布。豆卡、库存、冲煮记录、品鉴记录和设置保存在本机。

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

正式安装包由本分支 CI 校验官方签名、入包源码及 Android 10 全新安装后发布：[DS-B 1.24P APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-dsb/LuckyBean-DS-B-1.24P-release.apk)、[SHA256 校验](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-dsb/SHA256SUMS.txt)、[构建来源](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.23-dsb/BUILD_INFO.txt)。DS-B 独立发布，不替换 Cloud 的最新版入口。若已安装旧 debug 包，签名不同会阻止覆盖；更换前先导出本地备份。

DS-B 网页入口：[打开 LuckyBean DS-B](https://luckybean-ds-b.jjlink2025.chatgpt.site)。
