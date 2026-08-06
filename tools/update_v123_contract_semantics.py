from pathlib import Path

path = Path('tests/v120-core-contracts-static.mjs')
text = path.read_text(encoding='utf-8')
text = text.replace(
    "const analysis = read('src/services/brew-analysis-service.js');\n",
    "const analysis = read('src/services/brew-analysis-service.js');\nconst brewApi = read('src/services/brew-api-client.js');\n",
    1,
)
old = "assert.match(analysis, /authorization:\\s*`Bearer \\${token}`/);\n"
new = "assert.doesNotMatch(analysis, /LuckyBeanCloudAuth|access_token|authorization:\\s*`Bearer/);\nassert.match(brewApi, /x-installation-id/);\nassert.match(brewApi, /luckybean\\.installation\\.id\\.v1/);\nassert.doesNotMatch(brewApi, /authorization:\\s*`Bearer|LuckyBeanCloudAuth|access_token/);\n"
if old not in text:
    raise SystemExit('old cloud-account authorization assertion not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
