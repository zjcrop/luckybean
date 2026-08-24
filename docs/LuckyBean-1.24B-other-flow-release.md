# LuckyBean 1.24B — 其他咖啡流程收口

本次保持产品版本 `1.24B`，继续使用当前发布修订线。

## 已完成

- 小酌一级模式收敛为“手冲 / 其他”二态开关；其他模式只选择咖啡种类。
- “其他”页面底部固定两个动作：左侧“返回”，右侧“完成”。
- 其他模式新增“实际咖啡粉克重”，完成时以该值写入 `inventoryEvents` 的 `brew-consume` 权威库存事件并同步豆卡剩余重量。
- 完成后提示“已自动扣除 X.Xg 咖啡豆，进入品鉴记录”，随后进入品鉴页面。
- 非手冲工艺教程扩展为“关键参数 / 准备 / 制作步骤 / 完成判断 / 常见偏差与调整”，覆盖 Espresso、Ristretto、Lungo、AeroPress、摩卡壶、法压、冷萃、冰滴、虹吸、Cezve、Phin、南印度滤器，以及常见意式衍生饮品和特调。
- 工艺参数只作为可靠起始参考，不将设备相关经验数值写成普适定律。
- Android 与 Web 使用同一套内嵌资源；PR Android 安装门限提高到 300 秒，以避免大体积 APK 在 GitHub API 29 模拟器中因 ADB 安装耗时被误判失败。
- Android APK 契约分别验证教程控制器的页面结构与配方数据的 `prep / finish / adjust` 字段，避免以错误文件位置作为发布条件。

## 发布验收

正式发布要求 Web 的静态、BrewProfiles、Smoke、Core、Visual 门禁全部通过；Android 必须完成 APK 编译、内嵌 Web/原生契约校验以及 Android 10 启动验证。正式 release APK 继续使用 GitHub Actions 中既有官方 keystore，并核对 `android/signing/CERT_SHA256.txt`。
