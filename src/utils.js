export const APP_VERSION = '0.8.0-beta.1';
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function freshness(bean, now = new Date()) {
  const roasted = new Date(bean.roastDate || now);
  const days = Math.floor((now - roasted) / 86400000);
  const level = Number(String(bean.roastCode || 'RL-L2').replace(/\D/g, '')) || 2;
  const refrigerated = Boolean(bean.refrigerated);
  const rest = Math.max(4, 6 + (2 - Math.min(level, 2)) * 2);
  const peakStart = refrigerated ? rest + 8 : rest;
  const peakEnd = refrigerated ? 65 : Math.max(22, 38 - level * 4);
  const goodEnd = refrigerated ? 110 : peakEnd + 24;
  if (days < peakStart) return { key: 'resting', label: '养豆期', days, remaining: peakStart - days };
  if (days <= peakEnd) return { key: 'peak', label: '最佳赏味', days, remaining: peakEnd - days };
  if (days <= goodEnd) return { key: 'good', label: '仍适饮', days, remaining: goodEnd - days };
  return { key: days > goodEnd + 45 ? 'urgent' : 'decline', label: days > goodEnd + 45 ? '建议尽快使用' : '风味衰减', days, remaining: goodEnd - days };
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeJsonParse(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export function assertPlainObject(value, name = '数据') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}必须是普通对象`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${name}对象原型无效`);
  return value;
}

export function assertSafeJson(value, { maxDepth = 16, maxKeys = 20000 } = {}) {
  let keys = 0;
  const visit = (node, depth) => {
    if (depth > maxDepth) throw new Error('导入数据嵌套过深');
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.length > maxKeys) throw new Error('导入数组过长');
      node.forEach(item => visit(item, depth + 1));
      return;
    }
    assertPlainObject(node, '导入数据');
    for (const [key, child] of Object.entries(node)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('导入数据包含危险键');
      keys += 1;
      if (keys > maxKeys) throw new Error('导入字段过多');
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return value;
}

export async function sha256Hex(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
  if (!globalThis.crypto?.subtle) throw new Error('当前环境不支持 SHA-256');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function browserTitle(pageTitle) {
  document.title = `${pageTitle} · 富贵盒子`;
}

export function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
