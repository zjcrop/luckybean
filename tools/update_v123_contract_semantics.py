from pathlib import Path

# This migration updates the historical core test to the deliberate separation
# between the cloud-sync account and the installation-scoped brew gateway.
# The live gateway implementation is BrewProfiles brew-analyze-v2/2.1.1.
path = Path('tests/v120-core-contracts-static.mjs')
text = path.read_text(encoding='utf-8')
analysis_import = "const analysis = read('src/services/brew-analysis-service.js');\n"
if "const brewApi = read('src/services/brew-api-client.js');" not in text:
    if analysis_import not in text:
        raise SystemExit('analysis import not found')
    text = text.replace(
        analysis_import,
        analysis_import + "const brewApi = read('src/services/brew-api-client.js');\n",
        1,
    )

lines = text.splitlines(keepends=True)
replaced = False
output = []
for line in lines:
    if not replaced and line.startswith('assert.match(analysis, /authorization:'):
        output.extend([
            "assert.doesNotMatch(analysis, /LuckyBeanCloudAuth|access_token|authorization:\\s*`Bearer/);\n",
            "assert.match(brewApi, /x-installation-id/);\n",
            "assert.match(brewApi, /luckybean\\.installation\\.id\\.v1/);\n",
            "assert.doesNotMatch(brewApi, /authorization:\\s*`Bearer|LuckyBeanCloudAuth|access_token/);\n",
        ])
        replaced = True
    else:
        output.append(line)
if not replaced:
    raise SystemExit('old cloud-account authorization assertion not found')
path.write_text(''.join(output), encoding='utf-8')
