/**
 * sheets.js — GAS Web App API client
 *
 * All GET requests use query params.
 * All POST requests use Content-Type: text/plain to avoid CORS preflight.
 */

import { getConfig } from '../config.js';

async function gasGet(action, params = {}) {
  const { gasUrl, readToken } = getConfig();
  if (!gasUrl) throw new Error('GAS URL 未設定，請先到 ⚙️ 設定填入');

  const qs = new URLSearchParams({ action, token: readToken, ...params }).toString();
  const res = await fetch(`${gasUrl}?${qs}`);
  if (!res.ok) throw new Error(`GAS 回應錯誤 ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API error');
  return json.data;
}

async function gasPost(action, body = {}) {
  const { gasUrl, writeToken } = getConfig();
  if (!gasUrl) throw new Error('GAS URL 未設定，請先到 ⚙️ 設定填入');
  if (!writeToken) throw new Error('Write Token 未設定，無法修改資料');

  const res = await fetch(gasUrl, {
    method: 'POST',
    // text/plain avoids CORS preflight; GAS parses postData.contents
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, token: writeToken, ...body })
  });
  if (!res.ok) throw new Error(`GAS 回應錯誤 ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'API write error');
  return json.data;
}

// ── Holdings ─────────────────────────────────────────────────────────

export const holdings = {
  list: () => gasGet('holdings.list'),
  create: (data) => gasPost('holdings.create', data),
  update: (id, patch) => gasPost('holdings.update', { id, patch }),
  delete: (id) => gasPost('holdings.delete', { id }),
  sell: (id, shares, sellPrice, sellDate, notes) =>
    gasPost('holdings.sell', { id, shares, sell_price: sellPrice, sell_date: sellDate, notes })
};

// ── Realized P&L ──────────────────────────────────────────────────────

export const realized = {
  list: (from, to) => gasGet('realized.list', { from: from || '', to: to || '' })
};

// ── Net worth ─────────────────────────────────────────────────────────

export const networth = {
  list: (from, to) => gasGet('networth.list', { from: from || '', to: to || '' }),
  snapshot: (data) => gasPost('networth.snapshot', data)
};

// ── Assets / liabilities ──────────────────────────────────────────────

export const assets = {
  list: () => gasGet('assets.list'),
  upsert: (data) => gasPost('assets.upsert', data),
  delete: (id, type) => gasPost('assets.delete', { id, type })
};

// ── AI reports ────────────────────────────────────────────────────────

export const ai = {
  get: (date, symbol) => gasGet('ai.get', { date: date || '', symbol: symbol || '' }),
  save: (data) => gasPost('ai.save', data)
};

// ── Bootstrap (all data in one call) ──────────────────────────────────

export async function bootstrap() {
  return gasGet('bootstrap');
}
