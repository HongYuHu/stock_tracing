/**
 * market.js — Taiwan stock market hours utilities
 */

export function getTWTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
}

export function isMarketOpen() {
  const tw = getTWTime();
  const h = tw.getHours(), m = tw.getMinutes(), day = tw.getDay();
  if (day === 0 || day === 6) return false;
  return (h === 9) || (h > 9 && h < 13) || (h === 13 && m <= 30);
}
