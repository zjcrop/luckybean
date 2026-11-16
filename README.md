# LuckyBean / 富贵盒子

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

Cloud 1.24P-main.23：原水TDS与咖啡液TDS分开，增加本杯实测核算和萃离离子账本核对；修复重复段号及Android旧语音缓存。详见[更新与验证说明](docs/WATER_TDS_VOICE_20261115.md)。


LuckyBean 是一个本地优先的咖啡豆管理、冲煮方案、冲煮执行与感官记录工具。

当前正式发布：**1.24P-main.23**（语义版本 `1.24.24`，本地数据 Schema v10）。上方 APK 来自已通过同 SHA 发布门禁的正式 Release。

## 主要能力

- 咖啡豆豆卡、库存、分组、历史与回收站
- 图片/文字 RecognitionDocument 识别与 Coffee Foundation canonical 归一化
- 中英日韩及繁体中文咖啡标签匹配
- 强证据多豆识别拆分与逐豆确认
- 服务端智谱 AI 低置信度辅助候选（仅 advisory，不覆盖权威事实）
- BrewProfiles 冲煮方案、滤杯/滤纸参数、冷热冲、实时注水引导与语音执行
- 三套感官记录、反馈优化与 3D 冲煮状态/风味趋势
- 本地优先 IndexedDB、离线运行及可恢复云同步
- Web/PWA 与 Android

开发状态、当前发布候选范围和强制验收门禁见 [`DEVELOPMENT_STATUS.md`](./DEVELOPMENT_STATUS.md)。
