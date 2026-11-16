# LuckyBean / 富贵盒子

## Android APK 下载

| 版本 | 正式签名 APK | 校验文件 |
| --- | --- | --- |
| 云端版 · 1.24P-main.22 | [下载云端版 APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.22/LuckyBean-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.22/SHA256SUMS.txt) |
| DS-B 离线版 · 1.24P-main.22-dsb | [下载 DS-B APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.22-dsb/LuckyBean-DS-B-1.24P-release.apk) | [SHA256](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.22-dsb/SHA256SUMS.txt) |

两款 APK 均包含本次水质、实测萃取核算与计时播报更新，使用各自的 Android 包名，可并行安装。下载后可直接安装或转发发布。

## 本次水质与计时更新

Cloud 1.24P-main.22：原水TDS与咖啡液TDS分开，增加本杯实测核算和萃离离子账本核对；修复重复段号及Android旧语音缓存。详见[更新与验证说明](docs/WATER_TDS_VOICE_20261115.md)。


LuckyBean 是一个本地优先的咖啡豆管理、冲煮方案、冲煮执行与感官记录工具。

当前正式发布：**1.24P-main.22**（语义版本 `1.24.24`，本地数据 Schema v10）。上方 APK 来自已通过同 SHA 发布门禁的正式 Release。

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
