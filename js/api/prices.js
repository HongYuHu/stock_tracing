/**
 * prices.js — Taiwan stock price fetching
 *
 * Primary:  Yahoo Finance query1 (CORS-friendly, no key needed)
 * Fallback: GAS price.proxy endpoint (server-side TWSE)
 */

import { getConfig } from '../config.js';
import { ttlGet, ttlSet } from '../lib/cache.js';
import { isMarketOpen } from '../lib/market.js';

const CACHE_TTL_MARKET = 60;    // seconds during market hours
const CACHE_TTL_CLOSED = 3600;  // seconds when market closed
const CACHE_TTL_FAILED = 300;   // seconds to suppress retries after a failed fetch

function cacheTtl() {
  return isMarketOpen() ? CACHE_TTL_MARKET : CACHE_TTL_CLOSED;
}

/**
 * 內部共用的 Yahoo API 呼叫 (回傳 meta)
 */
async function doFetchYahooChart(ySymbol, range = '5d') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=${range}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta || null;
  } catch (e) {
    console.warn(`Yahoo fetch failed for ${ySymbol}:`, e.message);
    return null;
  }
}

/**
 * Fetch a single stock's current price via Yahoo Finance.
 * Automatically tries .TW then .TWO
 */
async function fetchYahoo(symbol) {
  const cacheKey = 'price_' + symbol;
  const cached = ttlGet(cacheKey);
  // undefined = not in cache; null = cached failure; object = cached success
  if (cached !== undefined) return cached;

  const suffixes = /\.(TW|TWO)$/i.test(symbol) ? [''] : ['.TW', '.TWO'];

  for (const suffix of suffixes) {
    const meta = await doFetchYahooChart(symbol + suffix, '5d');
    if (meta) {
      const prevClose = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPrice;
      const result = {
        symbol,
        price: meta.regularMarketPrice,
        prevClose,
        change: meta.regularMarketPrice - prevClose,
        changePct: prevClose ? ((meta.regularMarketPrice - prevClose) / prevClose) * 100 : 0
      };
      ttlSet(cacheKey, result, cacheTtl());
      return result;
    }
  }

  // Cache null so we don't hammer Yahoo on every render cycle
  ttlSet(cacheKey, null, CACHE_TTL_FAILED);
  return null;
}

/**
 * Fallback: fetch via GAS price proxy.
 */
async function fetchViaProxy(symbol) {
  const { gasUrl, readToken } = getConfig();
  if (!gasUrl) return null;
  try {
    const qs = new URLSearchParams({ action: 'price.proxy', token: readToken, symbol }).toString();
    const res = await fetch(`${gasUrl}?${qs}`);
    const json = await res.json();
    if (!json.ok || !json.data?.price) return null;
    return {
      symbol,
      price: json.data.price,
      prevClose: json.data.prev_close,
      change: json.data.price - (json.data.prev_close || json.data.price),
      changePct: json.data.prev_close
        ? ((json.data.price - json.data.prev_close) / json.data.prev_close) * 100
        : 0
    };
  } catch (e) {
    console.warn(`GAS proxy failed for ${symbol}:`, e.message);
    return null;
  }
}

/**
 * Fetch price for a single symbol (Yahoo → GAS fallback).
 */
export async function fetchPrice(symbol) {
  const result = await fetchYahoo(symbol);
  if (result) return result;
  return fetchViaProxy(symbol);
}

/**
 * Fetch prices for multiple symbols in parallel (max 8 concurrent).
 * Returns Map<symbol, priceObj>.
 */
export async function fetchPrices(symbols) {
  const unique = [...new Set(symbols)];
  const CHUNK = 8;
  const map = new Map();

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(s => fetchPrice(s)));
    chunk.forEach((s, j) => {
      if (results[j]) map.set(s, results[j]);
    });
  }
  return map;
}

/**
 * Lookup company name from Yahoo Finance.
 * Returns name string or empty string.
 */
export async function lookupName(symbol) {
  const cacheKey = 'name_' + symbol;
  const cached = ttlGet(cacheKey);
  if (cached !== undefined) return cached || '';

  const suffixes = /\.(TW|TWO)$/i.test(symbol) ? [''] : ['.TW', '.TWO'];

  for (const suffix of suffixes) {
    const meta = await doFetchYahooChart(symbol + suffix, '1d');
    if (meta) {
      const name = meta.longName || meta.shortName || '';
      if (name) {
        ttlSet(cacheKey, name, 86400);
        return name;
      }
    }
  }
  ttlSet(cacheKey, '', CACHE_TTL_FAILED);
  return '';
}
