/**
 * AIReports.gs — Read/write AI analysis reports
 */

function getAISheet() {
  const ss = SpreadsheetApp.openById(SCRIPT_PROPS.getProperty('SHEET_ID'));
  return ss.getSheetByName('AIReports');
}

const AI_HEADERS = ['date', 'symbol', 'model', 'summary_md', 'sentiment', 'target_price', 'created_at'];

function aiGet(date, symbol) {
  const sheet = getAISheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .map(row => rowToObj(headers, row))
    .filter(r => {
      if (!r.date) return false;
      if (date && r.date !== date) return false;
      if (symbol && String(r.symbol).toUpperCase() !== symbol.toUpperCase()) return false;
      return true;
    })
    .sort((a, b) => (b.date > a.date ? 1 : -1));
}

function aiSave(body) {
  const sheet = getAISheet();
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const date = body.date || new Date().toISOString().split('T')[0];
    const symbol = String(body.symbol || '').trim().toUpperCase();
    const now = new Date().toISOString();

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const dateIdx = headers.indexOf('date');
    const symIdx = headers.indexOf('symbol');

    const newRow = [
      date, symbol,
      body.model || 'gemini',
      body.summary_md || '',
      body.sentiment || 'neutral',
      body.target_price || '',
      now
    ];

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][dateIdx]) === date && String(data[i][symIdx]).toUpperCase() === symbol) {
        sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
        return rowToObj(AI_HEADERS, newRow);
      }
    }
    sheet.appendRow(newRow);
    return rowToObj(AI_HEADERS, newRow);
  } finally {
    lock.releaseLock();
  }
}
