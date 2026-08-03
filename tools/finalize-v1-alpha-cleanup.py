from pathlib import Path
import re

VERSION = "1.0.0-alpha"


def update(path: str, transform) -> None:
    file = Path(path)
    before = file.read_text(encoding="utf-8")
    after = transform(before)
    if after == before:
        print(f"unchanged: {path}")
    else:
        file.write_text(after, encoding="utf-8")
        print(f"updated: {path}")


def clean_app(text: str) -> str:
    text = text.replace(
        'popup.innerHTML = `<button type="button" data-manage-action="export">导出数据</button><button type="button" data-manage-action="import">导入数据</button><button type="button" data-manage-action="history">诹吉</button>`;',
        'popup.innerHTML = `<button type="button" data-manage-action="export">导出数据</button><button type="button" data-manage-action="import">导入数据</button>`;'
    )
    text = text.replace("if(action==='history')openHistory();", "")
    return text


def clean_capture(text: str) -> str:
    old = """  setTimeout(() => {
    const textarea = document.querySelector('#recognitionText');
    if (!textarea) return;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#parseTextBtn')?.focus();
  }, 0);"""
    new = """  requestAnimationFrame(() => {
    const textarea = document.querySelector('#recognitionText');
    if (!textarea) return;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#parseTextBtn')?.click();
  });"""
    if old in text:
        text = text.replace(old, new, 1)
    elif "document.querySelector('#parseTextBtn')?.click();" not in text:
        raise RuntimeError("OCR handoff block not found")
    return text


def clean_runtime(text: str) -> str:
    text = re.sub(r"^import './v099o-dom-stability\.js\?v=[^']+';", f"import './v099o-dom-stability.js?v={VERSION}';", text, count=1, flags=re.M)
    text = re.sub(r"^import './v099u-menu-ocr-flow\.js\?v=[^']+';\n?", "", text, flags=re.M)
    return text


def clean_auth(text: str) -> str:
    return re.sub(
        r"const redirect = `\$\{location\.origin\}\$\{location\.pathname\}\?v=[^`]+`;",
        f"const redirect = `${{location.origin}}${{location.pathname}}?v={VERSION}`;",
        text,
        count=1,
    )


def clean_sw(text: str) -> str:
    text = re.sub(r"\n\s*`\./src/v099u-menu-ocr-flow\.js\?v=\$\{RELEASE\}`,?", "", text)
    return text


update("src/app.js", clean_app)
update("src/v096-package-capture.js", clean_capture)
update("src/v099j-runtime-stability.js", clean_runtime)
update("src/v099d-supabase-auth.js", clean_auth)
update("sw.js", clean_sw)

legacy = Path("src/v099u-menu-ocr-flow.js")
if legacy.exists():
    legacy.unlink()
    print("deleted: src/v099u-menu-ocr-flow.js")

app = Path("src/app.js").read_text(encoding="utf-8")
capture = Path("src/v096-package-capture.js").read_text(encoding="utf-8")
runtime = Path("src/v099j-runtime-stability.js").read_text(encoding="utf-8")
assert 'data-manage-action="history"' not in app
assert "if(action==='history')" not in app
assert "document.querySelector('#parseTextBtn')?.click();" in capture
assert "v099u-menu-ocr-flow" not in runtime
print("Alpha source cleanup complete")
