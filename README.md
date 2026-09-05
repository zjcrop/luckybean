# LuckyBean / 富贵盒子

LuckyBean 是一个本地优先的咖啡豆管理、冲煮方案、冲煮执行与感官记录工具。

当前发布候选：**1.24P-main.3**（语义版本 `1.24.17`，本地数据 Schema v10）。正式可用版本以 GitHub `main` 最新通过同 SHA 发布门禁的 Release 为准。

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
