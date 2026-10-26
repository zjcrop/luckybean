# LuckyBean DS-B 网页发布

- 公开地址：https://luckybean-ds-b.racingllama18.chatgpt.site
- Sites 项目标识：`appgprj_6adfcb6726308191b4b4f5e2f8e08cca`
- 本机 Sites 源码目录：`E:\ChatGPT开发项目\LuckyBean\dsb-web`
- 发行源码：本仓库 `LuckyBean-DS-B` 分支。
- 静态目录：Sites 源码目录中的 `dist/`；身份配置：`.openai/hosting.json`。

部署为独立站点，不覆盖 LuckyBean Cloud。公开访问不要求网站登录；业务数据保存在访问者浏览器中。不要把任何浏览器导出的个人备份放进静态目录。

更新时，从发行源码复制 `index.html`、`recognition-test.html`、`manifest.webmanifest`、`release.json`、`sw.js`、`styles.css`、`src/`、`public/`、`contracts/` 和 `schemas/`。先运行 `npm ci` 准备轻量第三方文件，并恢复或生成 `public/vendor/paddleocr/`，执行 `npm run verify:ocr`。仅复制受控静态文件，不复制 Git 元数据、签名文件、账户凭据或个人备份。

使用 Sites 技能提供的 source helper 同步并打包源代码，再保存和部署同一提交生成的归档。沿用已有项目标识；凭据仅通过 helper 标准输入提供，不写入文件。每次发行更新网页与 service worker 的 revision/cacheRevision，避免 Safari 保留上一版脚本。

浏览器检查：

```text
npx playwright test tests/dsb-web-ios.spec.mjs --browser=webkit --workers=1
npx playwright test tests/dsb-web-ios.spec.mjs --browser=chromium --workers=1
```

真实在线服务检查需显式设置 `DSB_LIVE=1`，并可用 `DSB_TEST_URL` 指向正式站点。WebKit OCR 检查位于 `tests/v124p-webkit-auth-ocr.spec.mjs`，按测试名选择 runtime/PP-OCR 两项；其中账户测试针对 Cloud，不适用于 DS-B。

首次发布验证：本地 WebKit 的移动编辑/备份/设备方案导出两项、真实 OCR 两项及未模拟的在线冲煮计算一项通过，Chromium 的两项移动回归通过。正式站点的匿名 HTTP、service worker 与 WASM 请求均返回 200，WASM 类型为 `application/wasm`；正式地址的 WebKit 自动化访问被托管平台 Cloudflare 防护阻挡，因此不能将该轮正式站点浏览器检查记为通过，iPhone 真机仍待验证。
