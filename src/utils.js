export const APP_VERSION = '0.9.8';
export const SCHEMA_VERSION = 6;

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('zh-CN');
}

export function daysBetween(a, b = new Date()) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.floor((db - da) / 86400000);
}

export function debounce(fn, wait = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function downloadBlob(filename, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function safeJsonParse(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export function assertPlainObject(value, label = '对象') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}格式错误`);
  return value;
}

export function assertSafeJson(value, { maxDepth = 20, maxKeys = 20000, maxString = 2_000_000 } = {}) {
  let keys = 0;
  const seen = new Set();
  const visit = (node, depth) => {
    if (depth > maxDepth) throw new Error('数据嵌套过深');
    if (typeof node === 'string' && node.length > maxString) throw new Error('文本字段过大');
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) throw new Error('数据包含循环引用');
    seen.add(node);
    for (const [key, child] of Object.entries(node)) {
      keys += 1;
      if (keys > maxKeys) throw new Error('数据字段过多');
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('数据包含不安全字段');
      visit(child, depth + 1);
    }
    seen.delete(node);
  };
  visit(value, 0);
  return value;
}

export function browserTitle(section = '') {
  document.title = section ? `${section} · 富贵盒子` : '富贵盒子';
}
