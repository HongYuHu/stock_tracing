/**
 * NetWorth.gs — Net worth history and assets/liabilities
 */

function getNetWorthSheet() {
  const ss = SpreadsheetApp.openById(SCRIPT_PROPS.getProperty('SHEET_ID'));
  return ss.getSheetByName('NetWorthHistory');
}

function getAssetsSheet() {
  const ss = SpreadsheetApp.openById(SCRIPT_PROPS.getProperty('SHEET_ID'));
  return ss.getSheetByName('Assets');
}

function getLiabilitiesSheet() {
  const ss = SpreadsheetApp.openById(SCRIPT_PROPS.getProperty('SHEET_ID'));
  return ss.getSheetByName('Liabilities');
}

const NW_HEADERS = ['date', 'cash_twd', 'stocks_value', 'other_assets', 'liabilities', 'total', 'note'];

function networthList(from, to) {
  const sheet = getNetWorthSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .map(row => rowToObj(headers, row))
    .filter(r => {
      // Force YYYY-MM-DD string comparison to handle both string and Date cell types
      const d = String(r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date || '').slice(0, 10);
      if (from && d < String(from).slice(0, 10)) return false;
      if (to && d > String(to).slice(0, 10)) return false;
      return d.length > 0;
    });
}

/**
 * Upsert: if row with same date exists, update it; otherwise append.
 */
function networthSnapshot(body) {
  const sheet = getNetWorthSheet();
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const date = body.date || new Date().toISOString().split('T')[0];
    const cashTwd = Number(body.cash_twd) || 0;
    const stocksValue = Number(body.stocks_value) || 0;
    const otherAssets = Number(body.other_assets) || 0;
    const liabilities = Number(body.liabilities) || 0;
    const total = cashTwd + stocksValue + otherAssets - liabilities;
    const note = body.note || '';

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const dateIdx = headers.indexOf('date');

    const newRow = [date, cashTwd, stocksValue, otherAssets, liabilities, total, note];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][dateIdx]) === String(date)) {
        sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
        return rowToObj(NW_HEADERS, newRow);
      }
    }
    sheet.appendRow(newRow);
    return rowToObj(NW_HEADERS, newRow);
  } finally {
    lock.releaseLock();
  }
}

function assetsList() {
  const aSheet = getAssetsSheet();
  const lSheet = getLiabilitiesSheet();
  const aData = aSheet.getDataRange().getValues();
  const lData = lSheet.getDataRange().getValues();

  const assets = aData.length > 1
    ? aData.slice(1).map(row => rowToObj(aData[0], row)).filter(r => r.id)
    : [];
  const liabilities = lData.length > 1
    ? lData.slice(1).map(row => rowToObj(lData[0], row)).filter(r => r.id)
    : [];

  return { assets, liabilities };
}

function assetsUpsert(body) {
  const sheet = body.type === 'liability' ? getLiabilitiesSheet() : getAssetsSheet();
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const now = new Date().toISOString();

    if (body.id) {
      const idIdx = headers.indexOf('id');
      for (let i = 1; i < data.length; i++) {
        if (data[i][idIdx] === body.id) {
          headers.forEach((h, j) => {
            if (h in body && h !== 'id') data[i][j] = body[h];
          });
          sheet.getRange(i + 1, 1, 1, data[i].length).setValues([data[i]]);
          return rowToObj(headers, data[i]);
        }
      }
    }

    const id = Utilities.getUuid();
    const newRow = headers.map(h => {
      if (h === 'id') return id;
      if (h === 'created_at') return now;
      return body[h] !== undefined ? body[h] : '';
    });
    sheet.appendRow(newRow);
    return rowToObj(headers, newRow);
  } finally {
    lock.releaseLock();
  }
}

function assetsDelete(body) {
  const sheet = body.type === 'liability' ? getLiabilitiesSheet() : getAssetsSheet();
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
