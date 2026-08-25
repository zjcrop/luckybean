from pathlib import Path

path = Path('src/app.js')
text = path.read_text(encoding='utf-8')
old = '''<button id=\"brewDose\" class=\"control control-button brew-large-control brew-dose-button${settings.doseMode!=='manual'?' model-recommended':' custom-selected'}\" type=\"button\">${esc(resolvedDoseLabel(brewProfiles))}</button></label><label class=\"field brew-primary-field\"><span>粉水比</span><select id=\"brewRatio\" class=\"control brew-large-control${settings.ratioMode!=='manual'?' model-recommended':' custom-selected'}\">'''
new = '''<button id=\"brewDose\" class=\"control control-button brew-large-control brew-dose-button${settings.doseMode!=='manual'?' model-recommended lb-auto-field':' custom-selected'}\"${settings.doseMode!=='manual'?' data-source=\"auto\"':''} type=\"button\">${esc(resolvedDoseLabel(brewProfiles))}</button></label><label class=\"field brew-primary-field\"><span>粉水比</span><select id=\"brewRatio\" class=\"control brew-large-control${settings.ratioMode!=='manual'?' model-recommended lb-auto-field':' custom-selected'}\"${settings.ratioMode!=='manual'?' data-source=\"auto\"':''}>'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected one brew auto-state source block, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('brew dose/ratio auto state now renders from canonical settings')
