import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const root = path.resolve(process.cwd());
const port = Number(process.argv[2] || process.env.PORT || 4173);
const host = '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid port: ${process.argv[2] || process.env.PORT || ''}`);
}

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.tar', 'application/x-tar'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function log(message) {
  process.stdout.write(`[ci-static] ${new Date().toISOString()} ${message}\n`);
}

function resolveTarget(requestUrl) {
  const url = new URL(requestUrl || '/', `http://${host}:${port}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    const error = new Error('Malformed URL encoding');
    error.statusCode = 400;
    throw error;
  }
  if (pathname.includes('\0')) {
    const error = new Error('NUL byte in path');
    error.statusCode = 400;
    throw error;
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    const error = new Error('Path escapes repository root');
    error.statusCode = 403;
    throw error;
  }
  return target;
}

async function loadTarget(requestUrl) {
  let target = resolveTarget(requestUrl);
  let stat = await fs.stat(target);
  if (stat.isDirectory()) {
    target = path.join(target, 'index.html');
    stat = await fs.stat(target);
  }
  if (!stat.isFile()) {
    const error = new Error('Not a regular file');
    error.code = 'ENOENT';
    throw error;
  }
  const body = await fs.readFile(target);
  return { target, body };
}

const server = http.createServer(async (req, res) => {
  const startedAt = performance.now();
  const method = String(req.method || 'GET').toUpperCase();
  const requestUrl = String(req.url || '/');
  let completed = false;

  res.once('finish', () => {
    completed = true;
    log(`${method} ${requestUrl} ${res.statusCode} completed ${Math.round(performance.now() - startedAt)}ms`);
  });
  res.once('close', () => {
    if (!completed && !res.writableFinished) {
      log(`${method} ${requestUrl} ${res.statusCode || 0} aborted ${Math.round(performance.now() - startedAt)}ms`);
    }
  });

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' });
    res.end('Method Not Allowed\n');
    return;
  }

  try {
    const { target, body } = await loadTarget(requestUrl);
    const contentType = MIME.get(path.extname(target).toLowerCase()) || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (method === 'HEAD') res.end();
    else res.end(body);
  } catch (error) {
    const status = Number(error?.statusCode || (error?.code === 'ENOENT' ? 404 : 500));
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(`${status === 404 ? 'Not Found' : 'Request Failed'}\n`);
    log(`${method} ${requestUrl} error=${String(error?.message || error)}`);
  }
});

server.keepAliveTimeout = 5_000;
server.headersTimeout = 10_000;
server.requestTimeout = 0;
server.on('clientError', (error, socket) => {
  log(`client-error ${String(error?.code || '')} ${String(error?.message || error)}`);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(port, host, () => {
  log(`ready http://${host}:${port}/ root=${root}`);
});

function shutdown(signal) {
  log(`shutdown signal=${signal}`);
  server.close(error => {
    if (error) {
      log(`shutdown-error ${error.message}`);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
