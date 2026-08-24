# LuckyBean 1.24B — 豆藏分组与手机库存摘要验收

本次保持产品版本 `1.24B` 与发布修订 `1.24B-main.4`。

## 本轮收口

- 豆藏分组按“文件夹打开”逻辑处理：展开分组后，点击豆藏页面空白、再次点击底部“藏”、切换到其他主页面或执行返回操作，均先关闭当前分组。
- 分组关闭调用 bean-groups canonical `data-v099t-group-back` 控件，不再动态构造隐藏返回节点。
- 底部导航采用 capture-phase 关闭，避免导航重绘先于分组状态清理造成竞态。
- 手机端库存摘要改为两条语义信息：第一行大字显示“现有咖啡豆共计 … kg”；第二行显示“今日已饮用 … g豆，还可饮用 … g豆（非罗布斯塔）”。
- 当日已超过参考上限时保留超限提示，不显示负的“还可饮用”数量。
- Service Worker 保持 `1.24B-main.4` 发布修订，但轮换内部缓存桶，确保 Web/PWA 与 Android WebView 获取本轮最新脚本。
- 发布门禁已同步迁移到当前 `main.4` 契约；历史 `main.3` 仅作为旧缓存/历史兼容语义保留。
- 当前同步 UI 的正式按钮文案为“合并云端”，发布门禁按该正式文案校验。
- 部署、缓存与 Web/Android parity 门禁已统一到本次 folder/mobile release contract。
- `ui-policy` 与 `brew-mode` 已进入正式 runtime feature graph；Android APK 门禁同时检查运行入口、分组关闭、两行摘要和新缓存桶。
- 赏味期即时横线、interaction、gear matching 与 final/complete release contracts 均已迁移到当前 main.4。
- UI stability 门禁已按真实的 `page?.contains(...)` 文件夹关闭实现校验。

## 发布要求

Web 与 Android 必须使用同一 main 源码。Web 需通过静态、BrewProfiles、Smoke、Core、Visual 门禁；Android 需完成 APK 编译、内嵌 Web/原生契约校验与 Android 10 启动验证。正式 APK 继续使用仓库既有官方 release keystore，并核对 `android/signing/CERT_SHA256.txt`。
