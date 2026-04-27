/**
 * networth.js — 總資產管理 tab
 */

import { networth as nwApi, assets as assetsApi } from '../api/sheets.js';
import { fmtTwd, fmtDate, colorClass } from '../lib/format.js';
import { isConfigured, canWrite } from '../config.js';

export async function initNetWorth(root) {
  root.innerHTML = `<div class="loading"><div class="spinner"></div> 載入資產中…</div>`;
  if (!isConfigured()) {
    root.innerHTML = `<p class="muted" style="padding:2rem">請先設定 GAS URL。</p>`;
    return;
  }

  try {
    const [history, assetsData] = await Promise.all([
      nwApi.list(),
      assetsApi.list()
    ]);
    renderNetWorth(root, history, assetsData);
  } catch (e) {
    root.innerHTML = `<p class="loss" style="padding:2rem">載入失敗：${e.message}</p>`;
  }
}

function renderNetWorth(root, history, assetsData) {
  const latest = history.length ? history[history.length - 1] : null;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const totalAssets = (assetsData.assets || []).reduce((s, a) => s + Number(a.value || 0), 0);
  const totalLiab = (assetsData.liabilities || []).reduce((s, l) => s + Number(l.amount || 0), 0);

  const change = (latest && prev)
    ? Number(latest.total) - Number(prev.total) : null;

  root.innerHTML = `
    <div class="stat-row">
      <div class="card">
        <div class="card-title">最新淨值</div>
        <div class="card-value">${latest ? fmtTwd(latest.total) : '—'}</div>
        ${change != null ? `<small class="${colorClass(change)}">${change >= 0 ? '+' : ''}${fmtTwd(change)} 較上次</small>` : ''}
      </div>
      <div class="card">
        <div class="card-title">現金（TWD）</div>
        <div class="card-value">${latest ? fmtTwd(latest.cash_twd) : '—'}</div>
      </div>
      <div class="card">
        <div class="card-title">持股市值</div>
        <div class="card-value">${latest ? fmtTwd(latest.stocks_value) : '—'}</div>
      </div>
      <div class="card">
        <div class="card-title">其他資產</div>
        <div class="card-value">${fmtTwd(totalAssets)}</div>
      </div>
    </div>

    ${canWrite() ? renderSnapshotForm() : ''}

    <h3>資產與負債</h3>
    ${renderAssetsTable(assetsData.assets || [], assetsData.liabilities || [], totalLiab)}

    <h3>淨值歷史</h3>
    ${renderHistoryTable(history)}
  `;

  if (canWrite()) {
    bindSnapshotForm(root, latest);
    bindAssetsActions(root, assetsData);
  }
}

function renderSnapshotForm() {
  return `
    <details class="add-form">
      <summary>📸 記錄今日淨值快照</summary>
      <form id="snapshot-form" onsubmit="return false">
        <div class="form-grid">
          <label>日期 <input id="snap-date" type="date" value="${new Date().toISOString().slice(0,10)}" required /></label>
          <label>現金（TWD）<input id="snap-cash" type="number" min="0" step="1" placeholder="0" /></label>
          <label>持股市值 <input id="snap-stocks" type="number" min="0" step="1" placeholder="0" /></label>
          <label>其他資產 <input id="snap-other" type="number" min="0" step="1" placeholder="0" /></label>
          <label>負債 <input id="snap-liab" type="number" min="0" step="1" placeholder="0" /></label>
          <label style="grid-column:1/-1">備註 <input id="snap-note" type="text" /></label>
        </div>
        <button id="snap-btn" type="submit" style="margin-top:.5rem">儲存快照</button>
      </form>
    </details>
  `;
}

function renderAssetsTable(assetsList, liabList, totalLiab) {
  const assetRows = assetsList.map(a => `
    <tr>
      <td>${a.name || ''}</td>
      <td>${a.category || ''}</td>
      <td class="right">${fmtTwd(a.value)}</td>
      <td>${a.currency || 'TWD'}</td>
      ${canWrite() ? `<td><button class="btn-sm secondary del-asset-btn" data-id="${a.id}" data-type="asset">刪除</button></td>` : '<td></td>'}
    </tr>`).join('');

  const liabRows = liabList.map(l => `
    <tr>
      <td>${l.name || ''}</td>
      <td>負債</td>
      <td class="right loss">${fmtTwd(l.amount)}</td>
      <td>${l.currency || 'TWD'}</td>
      ${canWrite() ? `<td><button class="btn-sm secondary del-asset-btn" data-id="${l.id}" data-type="liability">刪除</button></td>` : '<td></td>'}
    </tr>`).join('');

  const addAssetForm = canWrite() ? `
    <details class="add-form" style="margin-top:.5rem">
      <summary>➕ 新增資產/負債</summary>
      <form id="add-asset-form" onsubmit="return false">
        <div class="form-grid">
          <label>名稱 * <input id="asset-name" type="text" required /></label>
          <label>類型
            <select id="asset-type">
              <option value="asset">資產</option>
              <option value="liability">負債</option>
            </select>
          </label>
          <label>類別 <input id="asset-category" type="text" placeholder="現金/房產/其他" /></label>
          <label>金額 * <input id="asset-value" type="number" min="0" step="1" required /></label>
          <label>幣別 <input id="asset-currency" type="text" value="TWD" maxlength="5" /></label>
        </div>
        <button id="add-asset-btn" type="submit" style="margin-top:.5rem">新增</button>
      </form>
    </details>` : '';

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>名稱</th><th>類別</th><th class="right">金額</th><th>幣別</th><th></th></tr></thead>
        <tbody>
          ${assetRows}
          ${liabRows}
          <tr style="border-top:2px solid var(--pico-muted-border-color)">
            <td colspan="2"><strong>負債合計</strong></td>
            <td class="right loss"><strong>${fmtTwd(totalLiab)}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>
    ${addAssetForm}
  `;
}

function renderHistoryTable(history) {
  if (!history.length) return `<p class="muted">尚無歷史記錄。</p>`;
  const rows = [...history].reverse().slice(0, 30).map(h => `
    <tr>
      <td>${fmtDate(h.date)}</td>
      <td class="right">${fmtTwd(h.cash_twd)}</td>
      <td class="right">${fmtTwd(h.stocks_value)}</td>
      <td class="right">${fmtTwd(h.other_assets)}</td>
      <td class="right loss">${fmtTwd(h.liabilities)}</td>
      <td class="right"><strong>${fmtTwd(h.total)}</strong></td>
      <td class="muted">${h.note || ''}</td>
    </tr>`).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>日期</th><th class="right">現金</th><th class="right">持股</th><th class="right">其他</th><th class="right">負債</th><th class="right">淨值</th><th>備註</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bindSnapshotForm(root, latest) {
  if (latest) {
    root.querySelector('#snap-cash').value = latest.cash_twd || 0;
    root.querySelector('#snap-stocks').value = latest.stocks_value || 0;
    root.querySelector('#snap-other').value = latest.other_assets || 0;
    root.querySelector('#snap-liab').value = latest.liabilities || 0;
  }

  root.querySelector('#snapshot-form').addEventListener('submit', async () => {
    const btn = root.querySelector('#snap-btn');
    btn.disabled = true;
    btn.textContent = '儲存中…';
    try {
      await nwApi.snapshot({
        date: root.querySelector('#snap-date').value,
        cash_twd: parseFloat(root.querySelector('#snap-cash').value) || 0,
        stocks_value: parseFloat(root.querySelector('#snap-stocks').value) || 0,
        other_assets: parseFloat(root.querySelector('#snap-other').value) || 0,
        liabilities: parseFloat(root.querySelector('#snap-liab').value) || 0,
        note: root.querySelector('#snap-note').value
      });
      window.showToast('快照已儲存', 'success');
      await initNetWorth(root);
    } catch (e) {
      window.showToast('儲存失敗：' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = '儲存快照';
    }
  });
}

function bindAssetsActions(root, assetsData) {
  root.querySelectorAll('.del-asset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('確定刪除？')) return;
      try {
        await assetsApi.delete(btn.dataset.id, btn.dataset.type);
        window.showToast('已刪除', 'success');
        await initNetWorth(root);
      } catch (e) {
        window.showToast('刪除失敗：' + e.message, 'error');
      }
    });
  });

  root.querySelector('#add-asset-form')?.addEventListener('submit', async () => {
    const btn = root.querySelector('#add-asset-btn');
    btn.disabled = true;
    try {
      const type = root.querySelector('#asset-type').value;
      await assetsApi.upsert({
        type,
        name: root.querySelector('#asset-name').value.trim(),
        category: root.querySelector('#asset-category').value.trim(),
        value: parseFloat(root.querySelector('#asset-value').value) || 0,
        amount: parseFloat(root.querySelector('#asset-value').value) || 0,
        currency: root.querySelector('#asset-currency').value.trim() || 'TWD'
      });
      window.showToast('已新增', 'success');
      await initNetWorth(root);
    } catch (e) {
      window.showToast('新增失敗：' + e.message, 'error');
      btn.disabled = false;
    }
  });
}
