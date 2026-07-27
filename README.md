# 富贵盒子 Lucky Bean

本地优先的咖啡豆管理、冲煮辅助与品鉴记录工具。

## 页面命名

| 导航 | 页面题注 | 功能 |
|---|---|---|
| 藏 | 豆藏 | 豆卡、库存、赏味期和老黄历 |
| 烹 | 手作 | 冲煮方案、计时和制作记录 |
| 鉴 | 品鉴 | 九节点感官评价和历史筛选 |
| 器 | 器设 | 器具、数据源、接口和本地设置 |

## 数据架构

- BrewIon：公开编码表与二维码协议；
- Lucky Bean：公开前端、本地数据和离线回退；
- brew-profiles：私有冲煮配置，通过服务端 API 调用。

浏览器不会直接读取私有仓库，也不会保存 GitHub Token。

## 本地运行

```bash
python3 -m http.server 8080
```

打开 `http://localhost:8080/`。不要直接使用 `file://`，否则浏览器可能阻止 ES Modules 和数据文件加载。

## 校验

```bash
npm test
npm run check
# 可选：需要 Python Playwright 和 Chromium
npm run browser:smoke
```

## 部署

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 后，测试通过才会部署 GitHub Pages。

## 当前外部依赖

- BrewIon 公共编码表远程地址；
- jsQR 1.4.0，用于二维码图片和摄像头扫描；
- qrcodejs 1.0.0，用于生成分享二维码；
- 可选的私有冲煮 API。

断网时，豆卡管理、库存、已有编码表缓存和本地冲煮回退仍可使用；首次扫码库未缓存时，二维码识别需要网络。

## 已知边界

- 真实邮箱/微信注册、跨设备同步和跨用户留言需要独立后端，本版本只提供明确标注的本机身份与本机备注；
- 私有冲煮算法只有在部署 `server/cloudflare-worker.js` 并配置 `brew-profiles` 后才会启用；未配置时使用版本化本地回退引擎；
- BrewIon 当前按公开 `coffee_qr_codebook_v6.json` 自动校验更新；待其发布 manifest 与 ESM 二维码核心后，可无缝切换到发布清单模式；
- jsQR 与 qrcodejs 固定到明确版本，但首次未缓存时仍需网络加载。
