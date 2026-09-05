# Recognition Preflight 1.24P

`OCR -> layout relations -> multilingual normalization -> field audit -> date ownership review (when required) -> fixed-format preflight -> user confirmation -> bean form`

普通界面不展示置信度百分比；置信度与原始证据只保留在识别 provenance 中，用于冲突裁决与追溯。字段锚点覆盖简体中文、繁体中文、英文、日文、韩文。`harvestSeason` 作为豆卡一等字段保存，并在可解析时派生 `harvestYear` / `harvestEndYear`。Knowledge 标记为 `blockAutomaticEntityResolution` 的歧义实体继续进入人工确认，不静默落稳定编码。现有日期归属审查保持优先，不被 preflight 绕过。

## ROI 局部重识别

共享 Recognition Foundation 现在定义 `recognition-roi/1.0`：

- ROI 使用相对原图的 `[0,1]` 归一化 `left/top/right/bottom`；
- 浏览器原图解码、方向修正、裁剪与 Blob 生成全部在独立同源 Worker 中完成；
- ROI Worker 使用 `createImageBitmap(..., { imageOrientation: 'from-image' }) + OffscreenCanvas`，不允许回退到 DOM Canvas、FileReader/Base64 或 Tesseract 主线程路径；
- 裁剪后的 Blob 继续交给正式 PP-OCRv5 Worker，而不是另建一套 OCR/字段解析器；
- 共享桥通过 `recognizeImageRegion()` 暴露局部识别，结果仍进入既有 RecognitionDocument / Foundation semantic pipeline；
- ROI 失败时必须显式失败，不允许静默改走高分辨率主线程图像处理。

协议结构见 `contracts/recognition-roi-v1.schema.json`。当前浏览器 Worker 路径是正式实现；Android native ROI 作为独立能力门，在实现方向/裁剪一致性和内存约束后再声明可用，现阶段 Android 可使用同一个安全 Web Worker ROI 路径而不影响整图 native OCR。
