# LuckyBean

LuckyBean 主线是咖啡冲煮应用与跨项目数据编排层。

静态网页：[https://zjcrop.github.io/luckybean/](https://zjcrop.github.io/luckybean/)

## ⚠️ 跨项目稳定数据格式（后续开发强制规则）

本节是后续接口接入、数据同步和测试的强制规则。

### 稳定业务数据不依赖项目发布版本

跨项目业务数据只依赖约定好的字段、类型、单位和语义，不把 appVersion、engineVersion 或项目发布号写入业务对象，也不把它们作为能否读取数据的条件。接口、鉴权和传输协议可以有独立版本元数据，但必须位于业务数据之外。

业务对象顶层不得新增或依赖：schemaVersion、appVersion、engineVersion、profileVersion。协议元数据只能放在 HTTP 头或响应包络中。

### LuckyBean 的数据边界

LuckyBean 负责豆子、冲煮输入、水质、环境和目标风味的组合，调用 BrewProfiles、Brew-Water-Calibrato、BrewIon、Grind-PSD 的稳定数据，并将结果转换为统一的冲煮阶段、空间轨迹和用户记录。

LuckyBean 不得重新定义上游字段含义，不得用本地硬编码表覆盖服务端方案，也不得把上游内部数据库结构直接暴露为跨项目接口。

### 稳定输入

| 对象 | 关键字段 | 单位/约束 |
|---|---|---|
| bean | countryCode、regionCode、varietyCode、processCode、roastCode、roastColor、altitude | 代码语义稳定；海拔 m |
| brew | doseG、ratio、profileId、method、dripperCode、filterPaper、grinder | 粉量 g；粉水比无量纲；器具先规范化 |
| water | profileId、recipeVolumeL、tdsMgL、calciumMgL、magnesiumMgL、bicarbonateMgL | L、mg/L |
| environment | ambientTemperatureC、relativeHumidityPct、initialBedTemperatureC | °C、%、°C |
| targets | acidity、floral、fruity、sweetness、bitterness、astringency | 六项均为 0–3；前四项为强调程度，后两项为抑制优先级；禁止 body |

### 稳定输出

冲煮阶段字段固定为：index、name、startSec、durationSec、stageWaterG、cumulativeWaterG、temperatureC、coreTemperatureC、flowGPerSec。

三维坐标固定为 [time_s, bed_temperature_c, cumulative_water_g]。目标区 ID 固定为 acidity、floral、fruity、sweetness、bitterness、astringency。

### 兼容性规则

- 只允许向后兼容的新增字段，不得复用旧字段表达新含义。
- 改名必须由边界适配层双读、规范化写入，并补充跨项目测试。
- 必填字段缺失、类型错误、单位错误或数值越界时必须明确拒绝，禁止静默猜测。
- 未知的新增字段应保留，不得无理由丢弃。
- 各项目内部版本可以独立演进，但边界只能依赖本节稳定格式。
- 任何跨项目字段变更必须同步更新相关 README、适配器和测试。

完整契约见 contracts/luckybean-brew-data-format.md 与 contracts/luckybean-brew-data.schema.json。
