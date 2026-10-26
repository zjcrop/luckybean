# LuckyBean DS Android

这是 LuckyBean DS 离线本地版的 Android WebView 封装工程。应用通过受控 HTTPS 虚拟源加载内置静态资源，保留 ES Modules、IndexedDB、本地存储、相机和文件选择能力；APK 使用 `com.luckybean.ds`，可与 LuckyBean Cloud 并行安装，且不声明 INTERNET 权限。

## 构建

本地调试构建在仓库根目录执行：

```bash
gradle -p android :app:assembleDebug
```

生成：`android/app/build/outputs/apk/debug/app-debug.apk`。该 APK 为 DS 本地版调试签名包。

推送与应用资源相关的改动到 `LuckyBean-DS-B` 分支后，GitHub Actions 会先恢复并校验离线 PP-OCRv5 运行时，再构建 APK。构建还会校验包名和 APK 内的 OCR 模型/WASM 文件，并归档 APK、SHA-256 与构建来源信息。完成后在该提交的 `LuckyBean DS-B APK` 工作流运行记录中下载 `luckybean-ds-b-apk-<commit SHA>`。该流程生成调试签名包，不是正式发布签名包。

正式发布APK由GitHub Actions读取仓库Secrets中的长期发布Keystore，执行
`:app:assembleRelease`，并对照`android/signing/CERT_SHA256.txt`锁定签名。
没有正式Keystore时不得把debug APK作为可升级发布包交付。

## 安全说明

- 不在 APK 中嵌入 GitHub Token 或私有仓库凭据；
- 仅允许 HTTPS 网络请求；
- 本地应用资源通过 `https://app.luckybean.local/` 拦截提供；
- 相机和麦克风按需请求运行时权限；
- v0.6.0 Debug APK 使用 Android 默认调试签名，仅用于测试和侧载；
- 正式商店发布前必须使用长期保存的发布密钥重新签名，并递增 `versionCode`。

