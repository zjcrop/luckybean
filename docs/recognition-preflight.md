# Recognition Preflight 1.24P

`OCR -> layout relations -> multilingual normalization -> field audit -> date ownership review (when required) -> fixed-format preflight -> user confirmation -> bean form`

普通界面不展示置信度百分比；置信度与原始证据只保留在识别 provenance 中，用于冲突裁决与追溯。字段锚点覆盖简体中文、繁体中文、英文、日文、韩文。`harvestSeason` 作为豆卡一等字段保存，并在可解析时派生 `harvestYear` / `harvestEndYear`。Knowledge 标记为 `blockAutomaticEntityResolution` 的歧义实体继续进入人工确认，不静默落稳定编码。现有日期归属审查保持优先，不被 preflight 绕过。
