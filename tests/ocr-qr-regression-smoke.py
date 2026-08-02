import contextlib
import http.server
import json
import socketserver
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextlib.contextmanager
def local_server():
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_address[1]}/'
        finally:
            server.shutdown()
            thread.join(timeout=3)


with local_server() as base_url, sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base_url, wait_until='domcontentloaded', timeout=60_000)
    page.wait_for_function("document.documentElement.dataset.webOcr === 'tesseract-6.0.1'", timeout=30_000)

    qr_result = page.evaluate("""async () => {
      const mod = await import('./src/qr.js?browser-regression=1');
      return mod.decodeJsQrResult({
        data: JSON.stringify({ countryCode: 'CT-ET', varietyCode: 'VR-001' }),
        binaryData: Array.from({ length: 96 }, (_, index) => (index * 17) % 256)
      }, {});
    }""")
    assert qr_result['countryCode'] == 'CT-ET', qr_result
    assert qr_result['source'] == 'json-qr', qr_result

    ocr_result = page.evaluate("""async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 340;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000000';
      context.font = 'bold 116px Arial, sans-serif';
      context.fillText('ETHIOPIA 2026', 45, 205);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const bridge = await import('./src/recognition-bridge.js?browser-regression=1');
      const result = await bridge.recognizeCoffeeBag([
        { id: 'ocr-smoke', role: 'front', roleLabel: '正面主体', blob }
      ], { languages: ['eng'] });
      return { engine: result.engine, text: result.fullText };
    }""", timeout=360_000)

    normalized = ''.join(str(ocr_result['text']).upper().split())
    assert 'ETHIOPIA' in normalized, ocr_result
    assert '2026' in normalized, ocr_result
    assert 'tesseract.js-6.0.1' in ocr_result['engine'], ocr_result
    assert not errors, errors
    print(json.dumps({'qr': qr_result, 'ocr': ocr_result}, ensure_ascii=False))
    browser.close()
