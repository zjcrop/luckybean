# LuckyBean 1.24B — 豆藏分组与手机库存摘要验收

本次保持产品版本 `1.24B` 与发布修订 `1.24B-main.4`。

## 本轮收口

- 豆藏分组按真正的“文件夹打开”状态机处理：`activeGroup` 只由 `bean-groups-controller` 管理，并暴露正式 `closeActiveGroup()` / `hasActiveGroup()` API。
- 展开态 DOM 已彻底删除旧 `data-v099t-group-back` 与“收”按钮；空白、再次点击底部“藏”、切换主页面、左滑和系统返回都直接调用状态 API，不再模拟点击隐藏控件。
- 豆卡列表 `.bean-grid` 的空白不再被错误视为交互控件；只有豆卡、按钮、链接和输入控件阻止关闭。
- 品鉴已选标签排序由独立 Pointer Events 控制器接管：长按任一已选标签约 320ms 进入排序，使用 pointer capture、明确的拖动/目标反馈和排序态滚动抑制；不再要求精准长按右侧小圆点。
- 排序完成后不仅更新 DOM，还在 `professional-sensory-complete` 捕获阶段写回 `professionalData.selections` 与摘要顺序，保证保存记录后的标签顺序一致。
- 手机端库存摘要保持两条语义信息：第一行大字显示“现有咖啡豆共计 … kg”；第二行显示“今日已饮用 … g豆，还可饮用 … g豆（非罗布斯塔）”。
- 当日已超过参考上限时保留超限提示，不显示负的“还可饮用”数量。
- Service Worker 保持 `1.24B-main.4` 发布修订和 `main-4-folder2` 缓存桶，并预缓存新的 sensory sorter；Web/PWA 与 Android WebView 使用同一运行图。
- Web、Pages、Android integration 与正式签名 APK 门禁均禁止旧隐藏返回按钮，并要求 canonical group state API 与 sensory sorter 实际存在于产物中。

## 发布要求

Web 与 Android 必须使用同一 main 源码。Web 需通过静态、BrewProfiles、Smoke、Core、Visual 门禁；Android 需完成 APK 编译、内嵌 Web/原生契约校验与 Android 10 启动验证。正式 APK 继续使用仓库既有官方 release keystore，并核对 `android/signing/CERT_SHA256.txt`。
