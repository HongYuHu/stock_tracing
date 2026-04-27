/**
 * format.js — Display formatting utilities
 */

export function fmtTwd(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(n);
}

export function fmtNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(decimals);
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  const v = Number(n);
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

export function fmtDate(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toISOString();
  return s.slice(0, 10);
}

export function colorClass(n) {
  if (n == null || isNaN(n)) return '';
  return Number(n) > 0 ? 'gain' : Number(n) < 0 ? 'loss' : 'muted';
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date(new Date().toDateString());
  return Math.round(diff / 86400000);
}

export function expiryClass(dateStr) {
  const d = daysUntil(dateStr);
  if (d == null) return '';
  if (d < 0) return 'expired';
  if (d <= 7) return 'expiring';
  return '';
}

export function expiryLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d == null) return '';
  if (d < 0) return `過期 ${Math.abs(d)}天`;
  if (d === 0) return '今日到期';
  return `剩 ${d} 天`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
