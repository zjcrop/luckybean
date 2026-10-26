# LuckyBean DS-B：xBloom Studio 配方适配

## 目标设备与数据依据

该功能以 xBloom Studio（社区实现中也称 J15）为目标。xBloom 官方产品页列出了设备、研磨和冲煮形态等功能，但没有公布 BLE 配方协议。LuckyBean DS-B 因此只把社区逆向协议作为可选兼容实现，不宣称它是 xBloom 官方 API，也不推定适用于其他型号或固件。

当前 BLE 编码依据是 [Janczykkkko/xbloom-ble](https://github.com/Janczykkkko/xbloom-ble)：该项目说明其协议由 Android 蓝牙抓包逆向，并报告在 xBloom Studio 固件 V12.0D.500 上逐字节对照且实机验证。LuckyBean DS-B 采用它记录的 load-only 流程与数值范围。它仍是社区证据，LuckyBean DS-B 没有连接用户的机器验证，固件更新可能改变行为。

`luckybean-ds-b` 原型文档记录了 PyBloom 的 `0x8001` 两字节命令族，也指出它与 `0xa4/0x56` 命令族不一致且没有实机确认。本分支不混合两套帧格式；目前使用带 V12.0D.500 实机验证说明的 `0xa4/0x56` load 序列。PyBloom 记录仍可作独立对照，不能与本分支帧构造器互换。

## 设备配方边界

下列数值来自社区逆向实现中的配方校验/设备记录，不代表 xBloom 对其他固件的官方承诺：

| 项目 | DS-B 当前边界 | 编码/使用说明 |
|---|---:|---|
| 粉量 | 1–18 g 整数；5–18 g 为常见 App 配方区间 | 超界转换会限制并提示；低于 5 g 会提示复核 |
| 研磨度 | 1–80 | 研磨关闭时发送社区协议记录的 `0xFE` 旁路磨豆标记 |
| 首段旋转转速 | 60–120 RPM，每 10 RPM 一档 | 配方协议把 RPM 放在首段；后续段编码为 0 |
| 每段数字水温 | 40–95 °C，每 1 °C 一档 | RT/BP 是特殊模式，当前字节编码未确认，因此不自动代替数字温度 |
| 设备预热设定 | 两个 40–130 °C 数值，默认 110/90 °C | 这是预热/阶段设定，不是每段出水温度 |
| 每段流量 | 3.0–3.5 ml/s，每 0.1 ml/s 一档 | 各注水段单独编码 |
| 段后暂停 | DS-B 输入 0–99 秒 | 协议字节可表达 0–255 秒；设备显示倒计时约在 99 秒附近 |
| 单段水量 | DS-B 编辑上限 240 ml | 这是 DS-B 的保守编辑上限；协议按 127 ml 子步拆分，不是机器的硬件上限 |
| 注水模式 | 中心、环绕、螺旋 | 螺旋段可独立启用搅动 |
| 注水段数 | 2–16 段 | 单段方案自动按 35%/65% 拆分并提示确认 |

设备参数的详细社区说明见 [xBloom BLE 配方范围和协议 README](https://github.com/Janczykkkko/xbloom-ble/blob/main/README.md)、[协议帧构造器](https://github.com/Janczykkkko/xbloom-ble/blob/main/xbloom_ble/protocol.py)及 [Nucleus 的 Studio 控制变量说明](https://nucleuscoffee.com/en/blogs/focus-xbloom-studio/focus-xbloom-studio-2-variables-de-controle)。官方产品信息见 [xBloom Studio](https://xbloom.com/products/xbloom-studio)。

## LuckyBean 方案转换

- 原始 LuckyBean 冲煮方案保持不变；设备编辑器保存的是独立 xBloom 配方。
- 注水段水量按设备粉量与原方案粉水比等比例重算；每段水量以 1 g 水约等于 1 ml 作为配方输入近似，不做高温水密度校正。
- 数字温度映射为整数 °C 并限制在 40–95 °C。超过上限时明确告警；不把 RT/BP 假作某个数字温度。
- LuckyBean 阶段流量为 g/s，xBloom 使用 ml/s。默认只映射低/中/高相对档位到 3.0–3.5 ml/s；这不是单位等值换算，用户可以逐段编辑。
- LuckyBean 阶段时长不直接当作 xBloom 暂停时间。首段采用闷蒸暂停建议，后续段仅保留明确的 `drainWaitSec`。
- 冰冲配方只发送热水注水段；用户须预先在杯中加冰。
- xBloom 设备方案可本机保存、导出 JSON，并随 LuckyBean DS 完整备份导出。

## BLE 装载过程与安全边界

Android 原生 BLE 与安全上下文中的 Web Bluetooth 共用同一套纯 JavaScript 帧构造器。连接时订阅 `FFE2` 通知；装载时按顺序写入：

1. `0xA4` 会话开始。
2. `0x56` 状态握手，留出设备稳定时间。
3. `0xA6` 粉量。
4. `0xA8` 两个设备预热温度设定。
5. `0x41` 现磨配方，或 `0x44` 预磨粉配方；配方含逐段温度、模式、搅动、暂停、RPM、流量、研磨度和粉水比。

通知返回状态 `0x1F` 后才向界面报告装载成功。DS-B 不发送 `0x42` commit 或 `0x46` start，因此装载不会自动冲煮；用户仍要在机器前确认豆、水和容器并在设备上开始。机器一次只允许一个 BLE 连接，连接前应退出官方 xBloom App。

命令帧为 `58 01 01 | command | sequence | total-length(u16 LE) | 00 00 | payload | CRC16(u16 LE)`。CRC 为 CRC-16/KERMIT（反射多项式 `0x8408`、初值 0、无末尾异或）。每段超过 127 ml 时，协议把前续子步编码为 127 ml，末段保留暂停、RPM 和流量字段。配方尾字节为 `(总注水量 / 粉量) × 10`，不是 `总水量 / 10`。

iPhone Safari 网页环境不提供 Web Bluetooth；设备直连目前需要 Android LuckyBean DS APK 或支持 Web Bluetooth 的浏览器。

## 发布验证范围

帧格式和状态顺序按公开项目的 V12.0D.500 说明实现，但当前工作环境没有 Android SDK/JDK，无法在这里构建 APK；也没有目标 xBloom 实机可用于蓝牙验证。发布前后的必要实机核对包括：设备进入装载状态、每段温度/流量/注水模式显示，以及预磨粉和现磨两条装载路径。未完成这些核对前，不应把“代码已实现”描述成“已在用户设备验证”。
