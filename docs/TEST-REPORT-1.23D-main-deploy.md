# LuckyBean 1.23D main 部署候选测试报告

日期：2026-08-08  
基线：`zjcrop/luckybean` main `ebcd1b7`  
状态：本地预检通过，等待 GitHub Actions、Pages 与 Android 构建

## 本次整合

- 保留 main 已有的独立品鉴状态机、器具模型、分享地址、云同步安全和 BrewProfiles 集成。
- 合入 Schema 8、`.luckybean` v1 完整归档、分区/整包 SHA-256、旧版 JSON 迁移和单事务恢复。
- 合入结构化 OCR 文档、日期字段分类、硬排除、多候选确认和来源留存。
- Android WebView 增加系统文件保存桥接；导出不再依赖不可用的 `blob:` 下载。
- Web、PWA、Android 与 Actions 版本统一为 `1.23D`，Android `versionCode=102304`。

## 已执行验证

| 验证 | 结果 |
| --- | --- |
| 全部 JavaScript / MJS 语法 | 通过 |
| main 原有静态与业务契约 | 通过 |
| BrewProfiles 真实服务合约与 6 个竞赛方案 | 通过 |
| 归档往返、篡改拒绝、旧版迁移、未来 Schema 拒绝 | 4/4 通过 |
| 日期分类、确认决策与 30 组黄金样本 | 45/45 通过 |
| 1.23D 部署、Android SAF 与版本契约 | 通过 |
| Service Worker 离线资源 | 66 项，缺失 0 |
| 本地 HTTP 关键入口 | 5 项均返回 200 |
| `npm audit --audit-level=high` | 0 个漏洞 |

归档与日期专项合计为 49 项；加上 main 既有静态、BrewProfiles 与部署契约测试均通过。

## 尚待 CI/真机验证

- 本机 Playwright 包可安装，但浏览器二进制下载被网络代理截断，因此未在本机完成 Chromium UI 套件。
- GitHub Actions 将安装 Chromium，并执行 smoke、core、visual 全套浏览器测试；只有通过后才触发 Pages 和 APK 构建。
- Android `ACTION_CREATE_DOCUMENT`、相机、语音、WebView 导入恢复仍需在真实设备验收。
- 100 组真实豆袋收集按用户决定取消本次发布门禁，保留为后续抽样质量改进，不能标记为已完成。

## 部署门禁

1. `LuckyBean main tests` 成功。
2. `LuckyBean main web deploy` 成功且公开版本提交与目标 SHA 一致。
3. `LuckyBean main build` 成功，APK 包名、版本、内嵌 Web 资源、公开分享地址及秘密扫描通过。
4. 下载 Actions 构建产物并核对 `SHA256SUMS.txt`。
