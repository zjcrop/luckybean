# 富贵盒子 Lucky Bean

本地优先的咖啡豆管理、拾味冲煮辅助与品鉴记录工具。

## 在线稳定版

<https://zjcrop.github.io/BrewIon/luckybean/>

当前稳定版本：**0.7.0**。

## 页面命名

| 导航 | 页面题注 | 功能 |
|---|---|---|
| 藏 | 豆藏 | 豆卡、库存、赏味期和诹吉归档 |
| 拾 | 拾味 | 冲煮方案、萃取轨迹、计时和制作记录 |
| 鉴 | 品鉴 | 九节点感官评价、往昔记录和历史筛选 |
| 器 | 器设 | 账户、私器、数藏和本物 |

## 数据架构

- BrewIon：公开编码数据和二维码协议；
- Lucky Bean：公开前端、本地数据和完整离线回退；
- brew-profiles：私有冲煮算法，通过服务端 API 调用。

浏览器不会直接读取私有仓库，也不会保存 GitHub Token。未配置服务端 API 时，拾味页面使用版本化本地模型，仍提供自动分段、首段降温、萃取轨迹、风味拟合和全屏计时。

## 本地运行

```bash
python3 -m http.server 8080
```

打开 `http://localhost:8080/`。不要直接使用 `file://`，否则浏览器可能阻止 ES Modules 和数据文件加载。

## 校验

```bash
npm test
npm run check
npm run browser:smoke
```

浏览器冒烟测试需要 Python Playwright 和 Chromium。

## 发布

Lucky Bean 源码维护在本仓库；稳定网页由 BrewIon 仓库的受控发布工作流复制到 `BrewIon/luckybean/`。每次发布前均重新执行单元测试和静态检查。

Android 工程暂时保留，但 APK 工作流仅允许手动触发。Web 版本完成实际使用验收前，不发布新的 APK。

## 当前外部依赖

- BrewIon 公共编码数据远程地址；
- jsQR 1.4.0，用于二维码图片和摄像头扫描；
- qrcodejs 1.0.0，用于生成分享二维码；
- 可选的私有冲煮 API。

## 已知边界

- 真实邮箱/微信注册、跨设备同步和跨用户留言需要独立后端；
- 私有 `brew-profiles` 不能由浏览器直接调用，必须部署服务端适配接口；
- 首次使用二维码识别库且浏览器尚无缓存时需要联网；
- Android 旧测试包的空白页问题已定位为 WebView 资产路径不一致，源码已修复，仍需在 Web 版本验收完成后重新构建验证。
