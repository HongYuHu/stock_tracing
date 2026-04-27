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
  return data.slice(1).map(row => rowToObj(headers, row)).filter(r => r.id);
}

function holdingsCreate(body) {
  const sheet = getHoldingsSheet();
  const now = new Date().toISOString();
  const id = Utilities.getUuid();
  const buyDate = body.buy_date || now.split('T')[0];
  const expiryDate = body.expiry_date || addDays(buyDate, 60);

  const row = [
    id,
    String(body.symbol || '').trim().toUpperCase(),
    body.name || '',
    Number(body.shares) || 0,
    Number(body.avg_cost) || 0,
    buyDate,
    expiryDate,
    body.strategy || 'manual',
    body.notes || '',
    now,
    now
  ];
  sheet.appendRow(row);
  return rowToObj(HOLDINGS_HEADERS, row);
}

function holdingsUpdate(body) {
  const sheet = getHoldingsSheet();
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
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
  lock.waitLock(10000);
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
  lock.waitLock(10000);
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
        const sellShares = Number(body.shares);
        const remaining = holding.shares - sellShares;
        const pnl = (Number(body.sell_price) - holding.avg_cost) * sellShares;
        const pnlPct = holding.avg_cost > 0
          ? ((Number(body.sell_price) - holding.avg_cost) / holding.avg_cost) * 100
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
