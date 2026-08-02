# 富贵盒子 Lucky Bean

**当前内部测试版本：v0.9.6**  
**稳定网址：<https://zjcrop.github.io/BrewIon/luckybean/>**

富贵盒子是本地优先的咖啡豆档案、冲煮方案和感官品鉴工具。1.0 之前均属于内部测试版本，允许直接在 `main` 修改和部署；仓库根目录 `index.html` 是唯一网页入口，不维护独立 Beta 页面或长期发布支线。

## v0.9.6

### 多视角豆袋采集与网页 OCR

- 将原“拍照识别”从二维码图片入口中拆分，正式命名为“拍袋录入”；
- 支持正面主体、背面参数、侧面补充和日期标签四类照片，最多保留四张；
- 拍摄后自动压缩到适合移动端处理的尺寸，并检查分辨率、模糊、反光、曝光和低对比度；
- 根据已有视角提示继续补拍背面或日期标签，不再假设一张照片包含全部信息；
- 网页版内置 Tesseract.js 6.0.1 OCR，默认识别英文与简体中文；
- 第一次识别需要联网下载 WebAssembly 核心和语言模型，后续由浏览器缓存复用；
- OCR 结果先进入可编辑文字区，再交给现有 BrewIon 编码表和自然语言解析器填充豆卡；
- 统一识别桥接仍兼容未来 Android、iOS、HarmonyOS 原生 PP-OCRv5 + ncnn 插件，原生引擎优先于网页引擎。

识别架构详见 `docs/recognition-architecture.md`。

### 冲煮完成后的品鉴入口

- 完成冲煮并记录咖啡豆、滤纸消耗后，仅跳转到“品鉴”主页；
- 保留当前豆卡为默认选择，但不自动启动任何品鉴模式；
- 用户仍需在“专业品鉴 / 玩家互动品鉴 / 札记”三个模式中主动选择；
- 页面切换过程中隐藏短暂生成的原生品鉴节点，避免闪屏和误触；
- Chromium 回归测试会完整执行“生成方案 → 计时结束 → 记录消耗 → 三模式选择页”流程。

### 二维码自动捕捉与兼容解码

- 摄像头扫描改为连续自动捕捉，不需要按快门；
- 取景页显示方形扫描框、动态扫描线、“自动捕捉中”和操作提示；
- 主引擎使用固定版本的 ZXing Browser 0.2.0；
- 支持时使用浏览器原生 `BarcodeDetector` 加速，兼容环境回退至 jsQR 1.4.0；
- 图片识别增加多阈值二值化与中心区域裁切，提高低对比、偏暗或占画面较小二维码的识别率；
- 支持 BrewIon 二进制二维码、HEX 二维码、JSON 豆卡二维码；
- 支持富贵盒子自身生成的 `#share=LB8…` 分享二维码，并解压回豆卡确认页；
- 解码顺序为“结构化文本与分享编码优先、合法 BrewIon 二进制其次”，普通网址或 JSON 二维码不再被误判为 CRC16 错误；
- 手动选择图片仍作为自动捕捉困难时的兜底方式。

## v0.9.5

### 界面与主题

- 使用用户提供的红色、白色启动封面，红色默认，白色可在器设中选择；
- 黑色模式显示白色太阳，白色模式显示黑色月亮；
- 顶部“分组 / 管理 / 主题”固定同排靠右；
- 完成白色模式主页面、分组、榜单、弹层、表单、冲煮、品鉴和器设子页覆盖；
- 白色模式中红色页面章保持白字，金色状态与推荐标记保留金色；
- 右下角快捷区恢复四格背景，正式命名为“搜索 / 添丁 / 溯旧 / 选择”；
- “余量”推荐项使用灰色圆点；
- 器设页透明品牌图固定为 120 px，不随屏幕宽度缩放。

### 豆藏与冲煮

- 统一“溯旧”“小酌”等正式命名；
- 修正豆卡处理法、冷藏雪花和详情操作排版；
- 冲煮基础字段按整行四等分，冲煮法与分段方式按二等分，次要变量归入“细节设定”；
- 冲煮轨迹与专业内容标题左对齐，箭头紧随标题；
- 滤杯与滤纸采用一致的左对齐粗体管理结构；
- 磨豆机改为结构化多条记录，必须记录“手冲常用刻度范围”的起始值和结束值；旧的纯文本磨豆机记录会兼容为一条历史记录。

### 三种品鉴模式

1. **专业品鉴**：专业杯测品鉴 / 雷达图 / 札记  
   使用标签化描述性评估、0–15 强度、双雷达图和五项 1–9 偏好评分。豆卡已有风味优先显示并标记“原”；已选标签可以拖动排序，排序靠前代表感知强度更高。评分位于流程末端，完成后直接进入札记，不再重复执行玩家互动或原生评分。
2. **玩家互动品鉴**：风味互动 / 札记  
   保留原有逐项风味互动，完成后进入评分和札记。
3. **札记**：自然语言记录，评分  
   跳过风味互动，仅保留评分与自然语言札记。

专业品鉴参考 SCA Coffee Value Assessment 的描述性评估与偏好评估分离思路、CATA 标签和 9 点偏好量表。标签拖动排序、温区拆分、雷达图和应用映射建议分是富贵盒子的产品化扩展，不是 SCA 官方表单字段，也不构成 SCA 认证杯测结果。

## 目录

```text
index.html                       main 根目录网页入口
styles.css                       基础及历史兼容样式
styles-v095.css                  v0.9.5 基础响应式界面
styles-theme-light.css           完整白色主题
styles-action-grid.css           右下角快捷四格组件
styles-v095-refine.css           子页、器具与专业品鉴补充样式
styles-v096-recognition.css      多视角豆袋采集界面
styles-qr-scan.css               二维码自动捕捉取景界面
src/app.js                       核心业务与数据保存
src/qr.js                        文本优先的二维码兼容包装层
src/qr-core.js                   ZXing/BarcodeDetector/jsQR 扫描与 BrewIon 核心解码
src/v095-qr-ui.js                二维码自动捕捉提示与取景框
src/v095-postbrew-sensory.js     冲煮结束后恢复品鉴模式选择
src/v096-web-ocr.js              Tesseract.js 网页 OCR 运行层
src/v096-package-capture.js      拍袋录入与多图工作流
src/image-quality.js             照片清晰度、反光和曝光检查
src/recognition-bridge.js        Web/原生统一 OCR 桥接
src/v095-ui.js                   v0.9.5 基础界面扩展
src/theme-bridge.js              稳定主题切换
src/v095-layout-gear.js          文案、滤杯与磨豆机管理
src/v095-sensory-pro.js          三种品鉴流程
docs/recognition-architecture.md 豆袋识别架构与桥接约定
public/                          正式运行图片和编码表
tests/                           单元、静态及浏览器测试
android/                         暂停发布的 Android 工程
```

## 本地运行与检查

```bash
python3 -m http.server 8080
npm test
npm run check
npm run browser:smoke
python tests/sensory-modes-smoke.py
python tests/postbrew-qr-smoke.py
python tests/ocr-qr-regression-smoke.py
```

不要通过 `file://` 打开。每次发布必须同步检查 `package.json`、`src/utils.js`、`sw.js`、`manifest.webmanifest` 和 README，并由 BrewIon 发布流程核验线上版本、源 SHA 与资源 HTTP 状态。

## 数据边界

数据默认保存在当前设备 IndexedDB。真实邮箱/微信注册、跨设备同步和跨用户留言仍需独立后端；网页不会伪装为已经完成这些能力。

## 许可证

以 `LICENSE` 和 `LICENSE-NOTICE.md` 为准。
