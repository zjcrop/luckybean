from pathlib import Path

main = Path('android/app/src/main/java/com/luckybean/app/MainActivity.java')
gradle = Path('android/app/build.gradle')

text = main.read_text(encoding='utf-8')

if 'LuckyBeanOcrAndroid' not in text:
    text = text.replace(
        'webView.addJavascriptInterface(new NativeBridge(), "LuckyBeanAndroid");',
        'webView.addJavascriptInterface(new NativeBridge(), "LuckyBeanAndroid");\n        webView.addJavascriptInterface(new NativeOcrBridge(this, webView), "LuckyBeanOcrAndroid");'
    )
    text = text.replace(
        'webView.removeJavascriptInterface("LuckyBeanAndroid");',
        'webView.removeJavascriptInterface("LuckyBeanAndroid");\n            webView.removeJavascriptInterface("LuckyBeanOcrAndroid");'
    )

if 'const nativeOcr = window.LuckyBeanOcrAndroid;' not in text:
    text = text.replace(
        'const native = window.LuckyBeanAndroid;\n          const detailEvent',
        'const native = window.LuckyBeanAndroid;\n          const nativeOcr = window.LuckyBeanOcrAndroid;\n          const ocrPending = new Map();\n          const detailEvent'
    )

ocr_facade = '''\n          window.__LuckyBeanNativeOcrResult = (requestId, ok, payload) => {\n            const pending = ocrPending.get(String(requestId || ''));\n            if (!pending) return;\n            ocrPending.delete(String(requestId || ''));\n            if (ok) pending.resolve(payload || { engine: 'android-mlkit-chinese', results: [] });\n            else pending.reject(new Error(String(payload || '原生 OCR 识别失败')));\n          };\n\n          if (nativeOcr && typeof nativeOcr.recognizeCoffeeBag === 'function') {\n            window.LuckyBeanRecognitionBridge = {\n              recognizeCoffeeBag(payload) {\n                const requestId = `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;\n                return new Promise((resolve, reject) => {\n                  ocrPending.set(requestId, { resolve, reject });\n                  window.dispatchEvent(new CustomEvent('luckybean:ocr-progress', {\n                    detail: { status: '正在使用 Android 原生中文 OCR', progress: 12 }\n                  }));\n                  try {\n                    nativeOcr.recognizeCoffeeBag(requestId, JSON.stringify(payload || {}));\n                  } catch (error) {\n                    ocrPending.delete(requestId);\n                    reject(error);\n                  }\n                });\n              }\n            };\n            document.documentElement.dataset.webOcr = 'android-mlkit-chinese-16.0.1';\n          }\n'''

if 'window.__LuckyBeanNativeOcrResult' not in text:
    text = text.replace(
        '          const enforceCloudOnly = () => {',
        ocr_facade + '\n          const enforceCloudOnly = () => {'
    )

main.write_text(text, encoding='utf-8')

gradle_text = gradle.read_text(encoding='utf-8')
needle = "    implementation 'androidx.exifinterface:exifinterface:1.3.7'"
addition = needle + "\n    implementation 'com.google.mlkit:text-recognition-chinese:16.0.1'"
if 'com.google.mlkit:text-recognition-chinese' not in gradle_text:
    gradle_text = gradle_text.replace(needle, addition)

resolution_block = '''\n\nconfigurations.configureEach {\n    exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk7'\n    exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk8'\n    resolutionStrategy.force 'org.jetbrains.kotlin:kotlin-stdlib:1.8.22'\n}\n'''
if "exclude group: 'org.jetbrains.kotlin', module: 'kotlin-stdlib-jdk7'" not in gradle_text:
    gradle_text += resolution_block

gradle.write_text(gradle_text, encoding='utf-8')
