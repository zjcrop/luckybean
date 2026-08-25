from pathlib import Path

path = Path('src/app.js')
text = path.read_text(encoding='utf-8')


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one occurrence, found {count}')
    return source.replace(old, new, 1)


dose_old = '''brew-dose-button${settings.doseMode!=='manual'?' model-recommended':' custom-selected'}" type="button"'''
dose_new = '''brew-dose-button${settings.doseMode!=='manual'?' model-recommended lb-auto-field':' custom-selected'}"${settings.doseMode!=='manual'?' data-source="auto"':''} type="button"'''
text = replace_once(text, dose_old, dose_new, 'dose automatic state')

ratio_old = '''brew-large-control${settings.ratioMode!=='manual'?' model-recommended':' custom-selected'}">'''
ratio_new = '''brew-large-control${settings.ratioMode!=='manual'?' model-recommended lb-auto-field':' custom-selected'}"${settings.ratioMode!=='manual'?' data-source="auto"':''}>'''
text = replace_once(text, ratio_old, ratio_new, 'ratio automatic state')

path.write_text(text, encoding='utf-8')
print('brew dose/ratio automatic state now renders from canonical settings')
