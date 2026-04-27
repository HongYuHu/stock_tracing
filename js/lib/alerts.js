/**
 * alerts.js — 60-day expiry alert logic
 */

import { daysUntil } from './format.js';

/**
 * Returns holdings that expire within alertDays (default 7) or are already expired.
 */
export function getExpiringHoldings(holdings, alertDays = 7) {
  return holdings.filter(h => {
    if (!h.expiry_date) return false;
    const d = daysUntil(h.expiry_date);
    return d != null && d <= alertDays;
  });
}

/**
 * Show a browser notification for expiring holdings (if permission granted).
 */
export async function notifyExpiring(holdings) {
  const expiring = getExpiringHoldings(holdings);
  if (expiring.length === 0) return;

  if (!('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (Notification.permission === 'granted') {
    expiring.forEach(h => {
      const d = daysUntil(h.expiry_date);
      const msg = d <= 0
        ? `${h.name || h.symbol} 的 60天持有期已到期！`
        : `${h.name || h.symbol} 還有 ${d} 天到期提醒`;
      new Notification('📈 股票到期提醒', { body: msg, icon: 'icons/icon-192.png' });
    });
  }
}
