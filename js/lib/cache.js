/**
 * cache.js — localStorage TTL cache
 */

export function ttlSet(key, value, ttlSeconds) {
  try {
    localStorage.setItem('cache_' + key, JSON.stringify({
      v: value,
      exp: Date.now() + ttlSeconds * 1000
    }));
  } catch (_) {}
}

export function ttlGet(key) {
  try {
    const raw = localStorage.getItem('cache_' + key);
    if (!raw) return null;
    const { v, exp } = JSON.parse(raw);
    if (Date.now() > exp) {
      localStorage.removeItem('cache_' + key);
      return null;
    }
    return v;
  } catch (_) {
    return null;
  }
}

export function ttlDel(key) {
  try { localStorage.removeItem('cache_' + key); } catch (_) {}
}
