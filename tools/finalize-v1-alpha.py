from pathlib import Path
import json
import re

VERSION = "1.0.0-alpha"
REVISION = "1.0.0-alpha"


def replace_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, got {count}")
    return updated


package_path = Path("package.json")
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = VERSION
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

utils_path = Path("src/utils.js")
utils = utils_path.read_text(encoding="utf-8")
utils = replace_once(
    utils,
    r"export const APP_VERSION = '[^']+';",
    f"export const APP_VERSION = '{VERSION}';",
    "APP_VERSION",
)
utils_path.write_text(utils, encoding="utf-8")

index_path = Path("index.html")
html = index_path.read_text(encoding="utf-8")
html = replace_once(
    html,
    r'(<meta name="application-version" content=")[^"]+("\s*/?>)',
    rf'\g<1>{VERSION}\2',
    "application-version meta",
)
html = replace_once(
    html,
    r'(<meta name="release-revision" content=")[^"]+("\s*/?>)',
    rf'\g<1>{REVISION}\2',
    "release-revision meta",
)
html = replace_once(html, r"<title>富贵盒子[^<]*</title>", f"<title>富贵盒子 {VERSION}</title>", "title")
html = replace_once(html, r'data-release="[^"]+"', f'data-release="{VERSION}"', "body data-release")
html = replace_once(
    html,
    r'data-release-revision="[^"]+"',
    f'data-release-revision="{REVISION}"',
    "body data-release-revision",
)
html = re.sub(r"\?v=[A-Za-z0-9._-]+", f"?v={REVISION}", html)
index_path.write_text(html, encoding="utf-8")

manifest_path = Path("manifest.webmanifest")
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["name"] = f"富贵盒子 {VERSION}"
manifest["short_name"] = "富贵盒子"
manifest["start_url"] = f"./?v={REVISION}"
manifest["scope"] = "./"
manifest["description"] = (
    f"富贵盒子 {VERSION}：本地优先的咖啡豆管理、豆袋识别、冲煮轨迹、品鉴与器具数据工具"
)
for icon in manifest.get("icons", []):
    src = str(icon.get("src", "")).split("?", 1)[0]
    icon["src"] = f"{src}?v={REVISION}"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

sw_path = Path("sw.js")
sw = sw_path.read_text(encoding="utf-8")
sw = replace_once(
    sw,
    r"^// Release marker:.*$",
    f"// Release marker: luckybean-v{VERSION}",
    "service worker release marker",
    re.M,
)
sw = replace_once(
    sw,
    r"^// Compatibility marker:.*$",
    "// Compatibility marker: luckybean-v0.9.9-main-099u",
    "service worker compatibility marker",
    re.M,
)
sw = replace_once(sw, r"const CACHE_NAME = '[^']+';", f"const CACHE_NAME = 'luckybean-v{VERSION}';", "CACHE_NAME")
sw = replace_once(sw, r"const RELEASE = '[^']+';", f"const RELEASE = '{REVISION}';", "RELEASE")
sw_path.write_text(sw, encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
readme = re.sub(
    r"\*\*当前(?:内部测试|Alpha)版本：v[^*]+\*\*",
    f"**当前 Alpha 版本：v{VERSION}**",
    readme,
    count=1,
)
if f"## v{VERSION}" not in readme:
    first_version = readme.find("\n## v")
    notes = f"""

## v{VERSION}

- 网页与 Android 应用统一定版为 `v{VERSION}`；
- 固化豆藏分组、账号与器设交互、PP-OCR 豆袋识别和豆卡自动填充流程；
- Android 应用内置网页资源，不依赖 GitHub Pages 加载主界面；
- Alpha APK 使用测试签名，用于侧载验证，不作为应用商店正式签名。
"""
    readme = readme[:first_version] + notes + readme[first_version:] if first_version >= 0 else readme + notes
readme_path.write_text(readme, encoding="utf-8")

main_activity_path = Path("android/app/src/main/java/com/luckybean/app/MainActivity.java")
main_activity = main_activity_path.read_text(encoding="utf-8")
main_activity, count = re.subn(
    r"LuckyBeanAndroid/[0-9A-Za-z._-]+",
    f"LuckyBeanAndroid/{VERSION}",
    main_activity,
)
if count < 1:
    raise RuntimeError("Android user agent version not found")
main_activity_path.write_text(main_activity, encoding="utf-8")

build_gradle_path = Path("android/app/build.gradle")
build_gradle_path.write_text(
    r'''plugins {
    id 'com.android.application'
}

def repositoryRoot = rootProject.projectDir.parentFile
def generatedWebAssets = layout.buildDirectory.dir('generated/luckybeanWebAssets')

tasks.register('syncLuckyBeanWebAssets') {
    inputs.files(
        new File(repositoryRoot, 'index.html'),
        new File(repositoryRoot, 'manifest.webmanifest'),
        new File(repositoryRoot, 'sw.js'),
        fileTree(repositoryRoot) { include '*.css' },
        fileTree(new File(repositoryRoot, 'src')),
        fileTree(new File(repositoryRoot, 'public'))
    )
    outputs.dir(generatedWebAssets)
    doLast {
        File output = generatedWebAssets.get().asFile
        delete output
        copy {
            from(repositoryRoot) {
                include 'index.html', '*.css', 'manifest.webmanifest', 'sw.js'
                include 'src/**', 'public/**'
            }
            into output
        }

        File nativeBridge = new File(output, 'native-bridge.js')
        nativeBridge.write("globalThis.__LUCKYBEAN_ANDROID__ = true;\nglobalThis.__LUCKYBEAN_PUBLIC_URL__ = 'https://zjcrop.github.io/BrewIon/luckybean/';\n", 'UTF-8')

        File indexFile = new File(output, 'index.html')
        String indexHtml = indexFile.getText('UTF-8')
        def moduleMatcher = (indexHtml =~ /<script type="module" src="\.\/src\/app\.js(?:\?v=[^"]+)?"><\/script>/)
        if (!moduleMatcher.find()) {
            throw new GradleException('未找到应用模块入口，Android资产同步中止。')
        }
        String moduleTag = moduleMatcher.group(0)
        indexFile.write(indexHtml.replace(moduleTag, '<script src="./native-bridge.js"></script>\n  ' + moduleTag), 'UTF-8')

        File appScript = new File(output, 'src/app.js')
        String original = appScript.getText('UTF-8')
        String shareTarget = 'const link = `${location.origin}${location.pathname}#share=${encoded}`;'
        String shareReplacement = 'const shareBase = globalThis.__LUCKYBEAN_PUBLIC_URL__ || `${location.origin}${location.pathname}`; const link = `${shareBase}#share=${encoded}`;'
        if (original.contains(shareTarget)) {
            original = original.replace(shareTarget, shareReplacement)
        } else if (!original.contains('__LUCKYBEAN_PUBLIC_URL__')) {
            throw new GradleException('未找到分享链接生成语句，Android资产同步中止。')
        }
        appScript.write(original, 'UTF-8')
    }
}

android {
    namespace 'com.luckybean.app'
    compileSdk 35

    defaultConfig {
        applicationId 'com.luckybean.app'
        minSdk 26
        targetSdk 35
        versionCode 100001
        versionName '1.0.0-alpha'
    }

    sourceSets {
        main.assets.srcDir(generatedWebAssets)
    }

    buildTypes {
        debug {
            applicationIdSuffix '.debug'
            versionNameSuffix '-debug'
        }
        release {
            minifyEnabled false
            shrinkResources false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
        alpha {
            initWith release
            signingConfig signingConfigs.debug
            debuggable false
            matchingFallbacks = ['release']
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += ['/META-INF/{AL2.0,LGPL2.1}']
        }
    }
}

tasks.named('preBuild').configure {
    dependsOn tasks.named('syncLuckyBeanWebAssets')
}
''',
    encoding="utf-8",
)

docs_path = Path("docs/release-v1.0.0-alpha.md")
docs_path.write_text(
    f"""# 富贵盒子 v{VERSION}

- 网页版本：v{VERSION}
- Android applicationId：`com.luckybean.app`
- Android versionCode：`100001`
- Android versionName：`{VERSION}`
- 最低 Android 版本：8.0（API 26）
- 目标 Android 版本：API 35
- 分发方式：GitHub 预发布与 Actions 构建产物
- 签名：Alpha 测试签名，仅用于侧载测试；正式商店发布需配置长期固定签名。
""",
    encoding="utf-8",
)

print(f"Finalized Lucky Bean {VERSION}")
