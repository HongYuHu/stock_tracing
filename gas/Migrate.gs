/**
 * Migrate.gs — One-time migration from portfolio.json (GitHub) to Google Sheets
 *
 * How to use:
 * 1. Open the GAS editor
 * 2. Set Script Properties: GH_TOKEN, GH_REPO (format: owner/repo)
 * 3. Run migrateFromGitHub() once from the editor
 */

function migrateFromGitHub() {
  const token = SCRIPT_PROPS.getProperty('GH_TOKEN');
  const repo = SCRIPT_PROPS.getProperty('GH_REPO');
  if (!token || !repo) {
    Logger.log('Set GH_TOKEN and GH_REPO in Script Properties first.');
    return;
  }

  const url = `https://api.github.com/repos/${repo}/contents/portfolio.json`;
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    Logger.log('Failed to fetch portfolio.json: ' + res.getContentText());
    return;
  }

  const json = JSON.parse(res.getContentText());
  const content = Utilities.newBlob(
    Utilities.base64Decode(json.content.replace(/\n/g, ''))
  ).getDataAsString();
  const portfolio = JSON.parse(content);

  let created = 0;
  portfolio.forEach(item => {
    try {
      holdingsCreate({
        symbol: item.code || item.symbol || '',
        name: item.name || '',
        shares: item.quantity || item.shares || 0,
        avg_cost: item.avg_cost || item.buy_price || 0,
        buy_date: item.buy_date || item.date || new Date().toISOString().split('T')[0],
        strategy: item.strategy || 'manual',
        notes: item.notes || ''
      });
      created++;
    } catch (e) {
      Logger.log('Skip row: ' + JSON.stringify(item) + ' — ' + e.message);
    }
  });

  Logger.log(`Migration complete. ${created} / ${portfolio.length} rows imported.`);
}
