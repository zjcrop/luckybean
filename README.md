# 富贵盒子 Lucky Bean

**当前内部测试版本：v0.9.5**  
**稳定网址：<https://zjcrop.github.io/BrewIon/luckybean/>**

富贵盒子是本地优先的咖啡豆档案、冲煮方案和感官品鉴工具。1.0 之前均属于内部测试版本，允许直接在 `main` 修改和部署；仓库根目录 `index.html` 是唯一网页入口，不再维护独立 Beta 页面或长期发布支线。

## v0.9.5

- 使用用户提供的红色、白色启动封面，红色默认，白色可在器设中选择；
- 修复黑色/白色模式切换，顶部“分组 / 管理 / 主题”同排靠右；
- 统一“溯旧”“小酌”等正式命名；
- 修正豆卡处理法、冷藏雪花和详情操作排版；
- 冲煮基础字段按整行四等分，冲煮法与分段方式按二等分，次要变量归入“细节设定”；
- 冲煮轨迹与专业内容标题左对齐，箭头紧随标题；
- 品鉴入口改为三种直接启动的流程模式，保留人工逐项互动；
- 全流程增加干香、高温、中温、低温、双雷达图、整体描述与建议分；
- 器设页底部加入透明背景品牌图；
- 删除 v0.9.4 扩展、旧 SVG/WebP 封面、旧 Beta 文档和不再使用的发布资源。

## 目录

```text
index.html              main 根目录网页入口
styles.css              基础样式
styles-v095.css         v0.9.5 响应式界面
src/                    应用、数据库、冲煮与品鉴逻辑
public/                 正式运行图片和编码表
tests/                  单元、静态及浏览器测试
android/                暂停发布的 Android 工程
```

## 本地运行与检查

```bash
python3 -m http.server 8080
npm test
npm run check
npm run browser:smoke
```

不要通过 `file://` 打开。每次发布必须同步更新 `package.json`、`src/utils.js`、`sw.js`、`manifest.webmanifest` 和 README，并由 BrewIon 发布流程核验线上版本、源 SHA 与资源 HTTP 状态。

## 数据边界

数据默认保存在当前设备 IndexedDB。真实邮箱/微信注册、跨设备同步和跨用户留言仍需独立后端；网页不会伪装为已经完成这些能力。

## 许可证

以 `LICENSE` 和 `LICENSE-NOTICE.md` 为准。
