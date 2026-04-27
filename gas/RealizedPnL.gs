/**
 * RealizedPnL.gs — Append-only realized profit/loss ledger
 */

function getRealizedSheet() {
  const ss = SpreadsheetApp.openById(SCRIPT_PROPS.getProperty('SHEET_ID'));
  return ss.getSheetByName('RealizedPnL');
}

const REALIZED_HEADERS = [
  'id', 'symbol', 'name', 'shares',
  'buy_price', 'sell_price', 'buy_date', 'sell_date',
  'pnl', 'pnl_pct', 'fees', 'tax', 'notes'
];

function realizedList(from, to) {
  const sheet = getRealizedSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .map(row => rowToObj(headers, row))
    .filter(r => {
      if (!r.id) return false;
      if (from && r.sell_date < from) return false;
      if (to && r.sell_date > to) return false;
      return true;
    });
}

function realizedCreate(body) {
  const sheet = getRealizedSheet();
  const id = Utilities.getUuid();
  const row = [
    id,
    String(body.symbol || '').trim().toUpperCase(),
    body.name || '',
    Number(body.shares) || 0,
    Number(body.buy_price) || 0,
    Number(body.sell_price) || 0,
    body.buy_date || '',
    body.sell_date || new Date().toISOString().split('T')[0],
    Number(body.pnl) || 0,
    Number(body.pnl_pct) || 0,
    Number(body.fees) || 0,
    Number(body.tax) || 0,
    body.notes || ''
  ];
  sheet.appendRow(row);
  return rowToObj(REALIZED_HEADERS, row);
}
