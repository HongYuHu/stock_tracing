/**
 * PriceProxy.gs — Server-side TWSE/Yahoo price fallback
 * Used when browser cannot reach Yahoo Finance directly.
 */

function priceProxy(symbol) {
  // Normalize: "2330" → "2330.TW", "6505.TWO" stays as-is
  let ySymbol = symbol;
  if (!/\.(TW|TWO)$/i.test(symbol)) {
    ySymbol = symbol + '.TW';
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5d`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      const meta = data.chart.result[0].meta;
      return {
        symbol: symbol,
        price: meta.regularMarketPrice,
        prev_close: meta.previousClose || meta.chartPreviousClose,
        currency: meta.currency,
        ts: new Date().toISOString()
      };
    }
  } catch (e) {
    Logger.log('Yahoo failed for ' + ySymbol + ': ' + e.message);
  }

  // Fallback: TWSE OpenAPI (上市)
  try {
    const twseUrl = `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG?stockNo=${symbol}`;
    const res = UrlFetchApp.fetch(twseUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const rows = JSON.parse(res.getContentText());
      if (rows && rows.length > 0) {
        const last = rows[rows.length - 1];
        return {
          symbol: symbol,
          price: parseFloat(last.ClosingPrice || last.收盤價 || 0),
          prev_close: null,
          currency: 'TWD',
          ts: new Date().toISOString()
        };
      }
    }
  } catch (e) {
    Logger.log('TWSE failed for ' + symbol + ': ' + e.message);
  }

  return { symbol: symbol, price: null, error: 'price unavailable' };
}
