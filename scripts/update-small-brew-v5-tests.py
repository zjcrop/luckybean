from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path, old, new, label):
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one legacy assertion, got {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


patch(
    'tests/v120-core-contracts-static.mjs',
    "assert.match(app, /环境细节（默认25°C，可选）/);",
    "assert.match(app, /id=\\\"openEnvironmentBtn\\\"/);\nassert.match(app, /function openBrewEnvironmentDialog/);\nassert.match(app, /室温 °C/);\nassert.match(app, /相对湿度 %/);\nassert.match(app, /初始粉床温度 °C/);",
    'environment-dialog contract'
)

print('Legacy small-brew tests aligned with the five-row contract.')
