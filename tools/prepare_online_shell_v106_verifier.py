from pathlib import Path

path = Path('tools/apply_online_shell_v106_web.py')
text = path.read_text(encoding='utf-8')
old = """required = {
    db: ['luckybean:data-changed', \"operation: 'put'\"],
    brew: ['syncBrewProfileCatalog', 'requestSyncedBrewPlan', 'REMOTE_PROFILE_UNAVAILABLE'],
    app: ['restoreNativeBackupIfNeeded', 'syncBrewProfilesBtn', 'queueBrewProfileSync']
}
"""
new = """required = {
    'db': ['luckybean:data-changed', \"operation: 'put'\"],
    'brew': ['syncBrewProfileCatalog', 'requestSyncedBrewPlan', 'REMOTE_PROFILE_UNAVAILABLE'],
    'app': ['restoreNativeBackupIfNeeded', 'syncBrewProfilesBtn', 'queueBrewProfileSync']
}
"""
if old not in text:
    if "'db': ['luckybean:data-changed'" in text:
        print('v106 verifier keys already fixed.')
        raise SystemExit(0)
    raise SystemExit('v106 verifier dictionary was not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Prepared v1.0.6 verifier keys.')
