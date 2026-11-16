# LuckyBean DS

## 本次水质与计时更新

DS-B 1.24P-main.22-dsb：原水TDS与咖啡液TDS分开，增加本杯实测核算和萃离离子账本核对；修复重复段号及Android旧语音缓存。详见[更新与验证说明](docs/WATER_TDS_VOICE_20261115.md)。


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

正式安装包由本分支 CI 校验官方签名、入包源码及 Android 10 全新安装后发布：[DS-B 1.24P APK](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.22-dsb/LuckyBean-DS-B-1.24P-release.apk)、[SHA256 校验](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.22-dsb/SHA256SUMS.txt)、[构建来源](https://github.com/zjcrop/luckybean/releases/download/v1.24P-main.22-dsb/BUILD_INFO.txt)。DS-B 独立发布，不替换 Cloud 的最新版入口。若已安装旧 debug 包，签名不同会阻止覆盖；更换前先导出本地备份。

DS-B 网页入口：[打开 LuckyBean DS-B](https://luckybean-ds-b.jjlink2025.chatgpt.site)。
