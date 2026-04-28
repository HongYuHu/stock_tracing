/**
 * Holdings.gs — CRUD operations for stock holdings
 */

function getHoldingsSheet() {
  const ss = SpreadsheetApp.openById(SCRIPT_PROPS.getProperty('SHEET_ID'));
  return ss.getSheetByName('Holdings');
}

const HOLDINGS_HEADERS = [
  'id', 'symbol', 'name', 'shares', 'avg_cost',
  'buy_date', 'expiry_date', 'strategy', 'notes',
  'created_at', 'updated_at'
];

function holdingsList() {
  const sheet = getHoldingsSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = rowToObj(headers, row);
    // Strip leading apostrophe inserted to prevent Sheets auto-converting symbols to numbers
    if (obj.symbol && String(obj.symbol).startsWith("'")) {
      obj.symbol = String(obj.symbol).slice(1);
    }
    return obj;
  }).filter(r => r.id);
}

function holdingsCreate(body) {
  const symbol = String(body.symbol || '').replace(/^'+/, '').trim().toUpperCase();
  if (!symbol) throw new Error('symbol is required');
  const shares = Number(body.shares);
  if (!shares || shares <= 0) throw new Error('shares must be > 0');
  const avgCost = Number(body.avg_cost);
  if (isNaN(avgCost) || avgCost < 0) throw new Error('avg_cost must be >= 0');

  const sheet = getHoldingsSheet();
  const now = new Date().toISOString();
  const id = Utilities.getUuid();
  const buyDate = body.buy_date || now.split('T')[0];
  const expiryDate = body.expiry_date || addDays(buyDate, 60);

  const row = [
    id,
    "'" + symbol,  // apostrophe prevents Sheets from converting e.g. "00935" → 935
    body.name || '',
    shares,
    avgCost,
    buyDate,
    expiryDate,
    body.strategy || 'manual',
    body.notes || '',
    now,
    now
  ];
  sheet.appendRow(row);
  const obj = rowToObj(HOLDINGS_HEADERS, row);
  obj.symbol = symbol; // return clean symbol without apostrophe
  return obj;
}

function holdingsUpdate(body) {
  const sheet = getHoldingsSheet();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf('id');
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === body.id) {
        const patch = body.patch || {};
        const now = new Date().toISOString();
        headers.forEach((h, j) => {
          if (h in patch) data[i][j] = patch[h];
        });
        const updIdx = headers.indexOf('updated_at');
        if (updIdx >= 0) data[i][updIdx] = now;
        sheet.getRange(i + 1, 1, 1, data[i].length).setValues([data[i]]);
        return rowToObj(headers, data[i]);
      }
    }
    return null;
  } finally {
    lock.releaseLock();
  }
}

function holdingsDelete(body) {
  const sheet = getHoldingsSheet();
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf('id');
    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === body.id) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, error: 'not found' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atomic sell: reduce/remove holding + append RealizedPnL row.
 */
function holdingsSell(body) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const hSheet = getHoldingsSheet();
    const data = hSheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf('id');
    const sharesIdx = headers.indexOf('shares');
    const avgCostIdx = headers.indexOf('avg_cost');
    const symbolIdx = headers.indexOf('symbol');
    const nameIdx = headers.indexOf('name');
    const buyDateIdx = headers.indexOf('buy_date');

    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === body.id) {
        const holding = rowToObj(headers, data[i]);
        // Strip apostrophe from symbol for output
        if (holding.symbol && String(holding.symbol).startsWith("'")) {
          holding.symbol = String(holding.symbol).slice(1);
        }

        const sellShares = Number(body.shares);
        if (!sellShares || sellShares <= 0) throw new Error('sell shares must be > 0');
        if (sellShares > Number(holding.shares)) throw new Error('sell shares exceeds holding');

        const remaining = Number(holding.shares) - sellShares;
        const pnl = (Number(body.sell_price) - Number(holding.avg_cost)) * sellShares;
        const pnlPct = Number(holding.avg_cost) > 0
          ? ((Number(body.sell_price) - Number(holding.avg_cost)) / Number(holding.avg_cost)) * 100
          : 0;

        // Append to RealizedPnL
        const realized = realizedCreate({
          symbol: holding.symbol,
          name: holding.name,
          shares: sellShares,
          buy_price: holding.avg_cost,
          sell_price: Number(body.sell_price),
          buy_date: holding.buy_date,
          sell_date: body.sell_date || new Date().toISOString().split('T')[0],
          pnl: pnl,
          pnl_pct: pnlPct,
          notes: body.notes || ''
        });

        if (remaining <= 0) {
          hSheet.deleteRow(i + 1);
          return { realized: realized, holding: null };
        } else {
          data[i][sharesIdx] = remaining;
          const now = new Date().toISOString();
          const updIdx = headers.indexOf('updated_at');
          if (updIdx >= 0) data[i][updIdx] = now;
          hSheet.getRange(i + 1, 1, 1, data[i].length).setValues([data[i]]);
          return { realized: realized, holding: rowToObj(headers, data[i]) };
        }
      }
    }
    return { error: 'holding not found' };
  } finally {
    lock.releaseLock();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
