# 富贵盒子 Lucky Bean

**当前正式版本：0.9.4**  
**在线使用：<https://zjcrop.github.io/BrewIon/luckybean/>**

富贵盒子是一个本地优先（Local-first）的咖啡豆档案、冲煮方案与感官品鉴工具。正式源码只维护在本仓库 `main`；网页运行入口为根目录 `index.html`，不存在需要执行的历史补丁。

## 版本与部署状态

- 应用版本：`0.9.4`
- 数据结构版本：`6`
- Service Worker 缓存：`luckybean-v0.9.4`
- 源码入口：`main/index.html`
- 稳定网页：<https://zjcrop.github.io/BrewIon/luckybean/>
- 发布方式：BrewIon 仓库从本仓库 `main` 拉取、测试并复制运行文件

线上发布只有在单元测试、静态检查、版本号、源提交 SHA 和核心资源 HTTP 状态全部通过后才标记为成功。

## 0.9.4 主要更新

- 启动页改用 SVG，默认使用红色版本，并提供第二套素色版本；
- 增加日间/夜间主题切换和本地持久化；
- “拾味”调整为“小酌”，底部导航调整为“酌”；
- 豆藏快捷操作调整为“搜索 / 添丁 / 溯旧 / 选择”；
- 冲煮页重排粉量、粉水比、滤杯、滤纸与冲煮法，次要变量归入“细节设定”；
- 品鉴增加分温区流程、可跳过节点、强度记录和可拖拽雷达图；
- 版本测试、静态检查、PWA 缓存清单和线上资源验收同步更新。

## 页面结构

| 导航 | 页面 | 主要功能 |
|---|---|---|
| 藏 | 豆藏 | 豆卡、库存、赏味期、分组与归档 |
| 酌 | 小酌 | 冲煮参数、方案、萃取轨迹、计时与复刻 |
| 鉴 | 品鉴 | 分温区感官记录、评分、札记与修正方案 |
| 器 | 器设 | 账户、器具、数据、主题和启动页设置 |

## 数据与隐私

- 豆卡、冲煮和品鉴数据默认保存在当前设备的 IndexedDB；
- BrewIon 提供公开编码数据与二维码协议；
- 浏览器不会读取私有 GitHub 仓库，也不会保存 GitHub Token；
- 未配置后端时，邮箱/微信只能作为本机身份，不能伪装为真实跨设备账号；
- 私有冲煮算法必须通过服务端 API 使用，前端保留完整公开回退模型。

## 根目录结构

```text
index.html              网页入口
styles.css              基础样式
styles-v094.css         0.9.4 界面与主题扩展
manifest.webmanifest    PWA 清单
sw.js                   离线缓存与更新策略
src/                    应用、数据库、二维码和冲煮模型
public/                 编码表、Logo、SVG/WebP 运行资源
tests/                  单元测试、静态检查和浏览器冒烟测试
android/                暂停发布的 Android 工程
```

`release/`、Base64 分块、触发文本、一次性应用脚本及历史发布工作流不属于正式源码，已从 `main` 清除。

## 本地运行

```bash
python3 -m http.server 8080
```

打开 <http://localhost:8080/>。不要直接使用 `file://`，否则浏览器可能阻止 ES Modules、Service Worker 和数据文件加载。

## 校验

```bash
npm test
npm run check
npm run browser:smoke
```

浏览器冒烟测试需要 Python Playwright 与 Chromium。提交发布前至少必须通过 `npm test` 和 `npm run check`。

## 发布规则

1. 所有正式修改直接落入或合并到 `main`；
2. 根目录必须保留可运行的 `index.html`；
3. 版本号需同时更新 `package.json`、`src/utils.js` 和 `sw.js`；
4. 新增运行资源必须加入 Service Worker 缓存清单；
5. 发布流程从 `main` 拉取并重新执行测试；
6. 线上 `release.json` 的版本和源 SHA 必须与 `main` 一致；
7. 历史发布分支、传输包和迁移工作流不得长期留在仓库。

## 当前边界

- 真实邮箱/微信注册、跨设备同步和跨用户留言需要独立后端；
- 首次载入二维码识别依赖时可能需要联网；
- Android 工程保留，但 0.9.4 未发布新的 APK；
- Web 版本是当前唯一正式交付物。

## 许可证

许可证及品牌声明以仓库中的 `LICENSE` 与 `LICENSE-NOTICE.md` 为准。
