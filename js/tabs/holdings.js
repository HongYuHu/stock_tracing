/**
 * holdings.js — 我的持股 tab
 */

import { holdings as api } from '../api/sheets.js';
import { fetchPrices, lookupName } from '../api/prices.js';
import { fmtTwd, fmtNum, fmtPct, fmtDate, colorClass, escapeHtml } from '../lib/format.js';
import { isConfigured, canWrite } from '../config.js';
import { isMarketOpen } from '../lib/market.js';

export async function initHoldings(root) {
  if (root._priceTimer) { clearInterval(root._priceTimer); root._priceTimer = null; }
  root.innerHTML = renderSkeleton();
  if (!isConfigured()) {
    root.innerHTML = `<p class="muted" style="padding:2rem">請先在 設定 中填入 GAS URL 和 Read Token。</p>`;
    return;
  }

  try {
    const data = await api.list();
    await renderHoldings(root, data);
  } catch (e) {
    root.innerHTML = `<p class="loss" style="padding:2rem">載入失敗：${e.message}</p>`;
  }
}

async function renderHoldings(root, rows) {
  // Fetch current prices in parallel
  const symbols = rows.map(r => r.symbol);
  const priceMap = symbols.length ? await fetchPrices(symbols) : new Map();

  // Attach price data
  const enriched = rows.map(r => {
    const p = priceMap.get(r.symbol);
    const cost = Number(r.avg_cost) || 0;
    const shares = Number(r.shares) || 0;
    const price = p?.price ?? null;
    const pnl = price != null ? (price - cost) * shares : null;
    const pnlPct = (price != null && cost > 0) ? ((price - cost) / cost) * 100 : null;
    const marketVal = price != null ? price * shares : null;
    return { ...r, price, pnl, pnlPct, marketVal, change: p?.change, changePct: p?.changePct };
  });

  // Summary stats
  const safeNum = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const totalCost = enriched.reduce((s, r) => s + (safeNum(r.avg_cost) * safeNum(r.shares)), 0);
  const totalVal = enriched.reduce((s, r) => s + (r.marketVal ?? safeNum(r.avg_cost) * safeNum(r.shares)), 0);
  const totalPnl = totalVal - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  root.innerHTML = `
    ${renderAddForm()}
    ${renderStats(enriched.length, totalCost, totalVal, totalPnl, totalPnlPct)}
    ${renderTable(enriched)}
    ${renderSellModal()}
    ${renderEditModal()}
  `;

  bindAddForm(root, rows, enriched);
  bindTableActions(root, enriched);
  updateSidebarPortfolio(totalVal, totalPnl, totalPnlPct);

  // Store rows for in-place price refresh
  root._holdingRows = rows;
  if (root._priceTimer) clearInterval(root._priceTimer);
  const REFRESH_MS = isMarketOpen() ? 60_000 : 300_000;
  root._priceTimer = setInterval(() => refreshPrices(root), REFRESH_MS);
}

async function refreshPrices(root) {
  const rows = root._holdingRows;
  if (!rows || !rows.length) return;
  if (root.querySelector('dialog[open]')) return; // skip while modal is open

  const safeNum = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const priceMap = await fetchPrices(rows.map(r => r.symbol));

  let totalVal = 0, totalCost = 0;
  rows.forEach(r => {
    const p = priceMap.get(r.symbol);
    const cost = safeNum(r.avg_cost), shares = safeNum(r.shares);
    const price = p?.price ?? null;
    const pnl = price != null ? (price - cost) * shares : null;
    const pnlPct = (price != null && cost > 0) ? ((price - cost) / cost) * 100 : null;
    const marketVal = price != null ? price * shares : null;
    totalCost += cost * shares;
    totalVal += marketVal ?? cost * shares;

    const tr = root.querySelector(`tr[data-id="${r.id}"]`);
    if (!tr) return;
    const cells = tr.querySelectorAll('td');
    const changeArrow = p?.changePct != null
      ? `<br><small class="${colorClass(p.changePct)}">${p.changePct >= 0 ? '▲' : '▼'} ${Math.abs(p.changePct).toFixed(2)}%</small>`
      : '';
    cells[3].innerHTML = price != null ? `${fmtTwd(price)}${changeArrow}` : '—';
    cells[4].textContent = marketVal != null ? fmtTwd(marketVal) : '—';
    cells[5].textContent = pnl != null ? fmtTwd(pnl) : '—';
    cells[5].className = `right ${colorClass(pnl)}`;
    cells[6].textContent = pnlPct != null ? fmtPct(pnlPct) : '—';
    cells[6].className = `right ${colorClass(pnlPct)}`;
    tr.className = pnl != null ? (pnl > 0 ? 'row-gain' : pnl < 0 ? 'row-loss' : '') : '';
  });

  const totalPnl = totalVal - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  updateSidebarPortfolio(totalVal, totalPnl, totalPnlPct);

  // Update stats cards (non-destructive, just text)
  const valEl = root.querySelector('.stat-card.total-asset-card .asset-value');
  const pnlEl = root.querySelector('.stat-card .pnl-value');
  if (valEl) valEl.textContent = fmtTwd(totalVal);
  if (pnlEl) {
    const sign = totalPnl >= 0 ? '+' : '';
    pnlEl.innerHTML = `${sign}${fmtTwd(totalPnl)} <span class="pnl-pct">(${sign}${fmtPct(totalPnlPct)})</span>`;
    pnlEl.className = `pnl-value ${totalPnl >= 0 ? 'gain' : 'loss'}`;
  }
}

// ── Stats row ─────────────────────────────────────────────────────────

function renderStats(count, cost, val, pnl, pnlPct) {
  const isGain = pnl >= 0;
  const pnlClass = isGain ? 'gain' : 'loss';
  const pnlBgClass = isGain ? 'is-gain' : 'is-loss';
  const pnlSign = isGain ? '+' : '';

  return `
    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: var(--space-4); margin-top: 0;">當前持股</h2>
    <div class="top-stats-grid">
      <div class="stat-card total-asset-card">
        <div class="asset-title">總資產</div>
        <div class="asset-value">${fmtTwd(val)}</div>
      </div>
      <div class="stat-card ${pnlBgClass}">
        <div class="pnl-title">未實現損益</div>
        <div class="pnl-value ${pnlClass}">${pnlSign}${fmtTwd(pnl)} <span class="pnl-pct">(${pnlSign}${fmtPct(pnlPct)})</span></div>
      </div>
      <div class="stat-card">
        <div class="pnl-title">總成本</div>
        <div class="pnl-value" style="color:var(--text-primary);">${fmtTwd(cost)}</div>
      </div>
    </div>
  `;
}

// ── Add form ──────────────────────────────────────────────────────────

function renderAddForm() {
  if (!canWrite()) {
    return `<p class="muted" style="font-size:.85rem;margin-bottom:.75rem">⚠️ 未設定 Write Token，目前僅能讀取資料。</p>`;
  }
  return `
    <details class="add-form" id="add-form-details">
      <summary>＋ 新增持股</summary>
      <form id="add-holding-form" onsubmit="return false">
        <div class="form-grid">
          <label>
            股票代號 *
            <input id="f-symbol" type="text" placeholder="例：2330" maxlength="10" required />
          </label>
          <label>
            公司名稱
            <input id="f-name" type="text" placeholder="自動帶入" />
          </label>
          <label>
            買入日期 *
            <input id="f-buy-date" type="date" value="${new Date().toISOString().slice(0,10)}" required />
          </label>
          <label>
            買入價格 *
            <input id="f-avg-cost" type="number" min="0" step="0.01" placeholder="0.00" required />
          </label>
          <label>
            股數 *
            <input id="f-shares" type="number" min="1" step="1" placeholder="1000" required />
          </label>
          <label>
            策略
            <select id="f-strategy">
              <option value="manual">手動</option>
              <option value="jyf60">金玉峰60天</option>
              <option value="long">長期持有</option>
              <option value="swing">波段</option>
            </select>
          </label>
          <label style="grid-column:1/-1">
            備註
            <input id="f-notes" type="text" placeholder="選填" />
          </label>
        </div>
        <div style="display:flex;gap:.5rem;margin-top:.75rem">
          <button id="add-btn" type="submit">新增</button>
          <small id="add-status" style="align-self:center;color:var(--color-neutral)"></small>
        </div>
      </form>
    </details>
  `;
}

// ── Holdings table ────────────────────────────────────────────────────

function renderTable(rows) {
  if (rows.length === 0) {
    return `<p class="muted" style="padding:2rem;text-align:center">尚無持股，點上方「新增持股」開始。</p>`;
  }
  const trs = rows.map(r => {
    const rowClass = r.pnl != null ? (r.pnl > 0 ? 'row-gain' : r.pnl < 0 ? 'row-loss' : '') : '';
    const changeArrow = r.changePct != null
      ? `<br><small class="${colorClass(r.changePct)}">${r.changePct >= 0 ? '▲' : '▼'} ${Math.abs(r.changePct).toFixed(2)}%</small>`
      : '';
    return `
      <tr data-id="${r.id}" class="${rowClass}">
        <td><strong>${escapeHtml(r.symbol)}</strong><br><small class="muted">${escapeHtml(r.name)}</small></td>
        <td class="right">${fmtNum(r.shares, 0)}</td>
        <td class="right">${fmtTwd(r.avg_cost)}</td>
        <td class="right">${r.price != null ? fmtTwd(r.price) : '—'}${changeArrow}</td>
        <td class="right">${r.marketVal != null ? fmtTwd(r.marketVal) : '—'}</td>
        <td class="right ${colorClass(r.pnl)}">${r.pnl != null ? fmtTwd(r.pnl) : '—'}</td>
        <td class="right ${colorClass(r.pnlPct)}">${r.pnlPct != null ? fmtPct(r.pnlPct) : '—'}</td>
        <td style="white-space:nowrap">
          <button class="btn-sm secondary sell-btn" data-id="${r.id}" title="賣出">📤</button>
          <button class="btn-sm secondary edit-btn" data-id="${r.id}" title="編輯">✏️</button>
          <button class="btn-sm secondary btn-danger del-btn" data-id="${r.id}" title="刪除">🗑️</button>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>股票</th>
            <th class="right">股數</th>
            <th class="right">成本</th>
            <th class="right">現價</th>
            <th class="right">市值</th>
            <th class="right">損益</th>
            <th class="right">損益%</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `;
}

// ── Sell modal ────────────────────────────────────────────────────────

function renderSellModal() {
  return `
    <dialog id="sell-modal">
      <article>
        <header>
          <button class="close" aria-label="Close" id="sell-modal-close"></button>
          <h3>賣出持股</h3>
        </header>
        <form id="sell-form" onsubmit="return false">
          <input type="hidden" id="sell-id" />
          <label>
            股票 <input id="sell-symbol" type="text" readonly />
          </label>
          <label>
            賣出股數 * <input id="sell-shares" type="number" min="1" step="1" required />
          </label>
          <label>
            賣出價格 * <input id="sell-price" type="number" min="0" step="0.01" required />
          </label>
          <label>
            賣出日期 * <input id="sell-date" type="date" value="${new Date().toISOString().slice(0,10)}" required />
          </label>
          <label>
            備註 <input id="sell-notes" type="text" />
          </label>
          <footer>
            <button id="sell-submit-btn" type="submit">確認賣出</button>
            <button type="button" class="secondary" id="sell-cancel-btn">取消</button>
          </footer>
        </form>
      </article>
    </dialog>
  `;
}

// ── Edit modal ────────────────────────────────────────────────────────

function renderEditModal() {
  return `
    <dialog id="edit-modal">
      <article>
        <header>
          <button class="close" aria-label="Close" id="edit-modal-close"></button>
          <h3>編輯持股</h3>
        </header>
        <form id="edit-form" onsubmit="return false">
          <input type="hidden" id="edit-id" />
          <div class="form-grid">
            <label>股票代號 <input id="edit-symbol" type="text" disabled /></label>
            <label>名稱 <input id="edit-name" type="text" /></label>
            <label>買入日期 * <input id="edit-buy-date" type="date" required /></label>
            <label>成本價格 * <input id="edit-avg-cost" type="number" min="0" step="0.01" required /></label>
            <label>股數 * <input id="edit-shares" type="number" min="1" step="1" required /></label>
            <label>策略
              <select id="edit-strategy">
                <option value="manual">手動</option>
                <option value="jyf60">金玉峰60天</option>
                <option value="long">長期持有</option>
                <option value="swing">波段</option>
              </select>
            </label>
            <label style="grid-column:1/-1">備註 <input id="edit-notes" type="text" /></label>
          </div>
          <footer>
            <button id="edit-submit-btn" type="submit">儲存修改</button>
            <button type="button" class="secondary" id="edit-cancel-btn">取消</button>
          </footer>
        </form>
      </article>
    </dialog>
  `;
}

// ── Event binding ─────────────────────────────────────────────────────

function bindAddForm(root, existingRows, enriched) {
  if (!canWrite()) return;

  const symbolInput = root.querySelector('#f-symbol');
  const nameInput = root.querySelector('#f-name');
  const costInput = root.querySelector('#f-avg-cost');
  const statusEl = root.querySelector('#add-status');
  const btn = root.querySelector('#add-btn');

  if (!symbolInput) return;

  let lookupTimer;
  symbolInput.addEventListener('input', () => {
    clearTimeout(lookupTimer);
    const code = symbolInput.value.trim();
    if (code.length < 4) return;
    lookupTimer = setTimeout(async () => {
      statusEl.textContent = '查詢中…';
      try {
        const [name, priceData] = await Promise.all([
          lookupName(code),
          fetchPrices([code]).then(m => m.get(code))
        ]);
        if (name) nameInput.value = name;
        if (priceData?.price) costInput.value = priceData.price.toFixed(2);
        statusEl.textContent = name ? `✅ ${name}` : '查無公司名';
      } catch (e) {
        statusEl.textContent = '查詢失敗';
        console.warn('Symbol lookup error:', e.message);
      }
    }, 600);
  });

  root.querySelector('#add-holding-form').addEventListener('submit', () => {
    btn.disabled = true;
    btn.textContent = '新增中…';
    statusEl.textContent = '';
    
    // 建立新資料物件 (暫存 ID)
    const newObj = {
      id: Date.now().toString(),
      symbol: symbolInput.value.trim().toUpperCase(),
      name: nameInput.value.trim(),
      buy_date: root.querySelector('#f-buy-date').value,
      avg_cost: parseFloat(root.querySelector('#f-avg-cost').value),
      shares: parseInt(root.querySelector('#f-shares').value),
      strategy: root.querySelector('#f-strategy').value,
      notes: root.querySelector('#f-notes').value.trim()
    };

    // [毫秒級優化] 樂觀更新 UI (Optimistic UI)
    existingRows.unshift(newObj);
    renderHoldings(root, existingRows);
    window.showToast('處理中...', 'info');

    // 背景發送 API（GAS 端負責處理 symbol 前綴防止 Sheets 自動轉數字）
    api.create(newObj).then(async () => {
      window.showToast('持股已新增', 'success');
      try {
        const freshData = await api.list();
        existingRows.length = 0;
        existingRows.push(...freshData);
        renderHoldings(root, existingRows);
      } catch(e) {
        window.showToast('資料已儲存，同步失敗請手動重整', 'warn');
      }
    }).catch(e => {
      window.showToast('新增失敗：' + e.message, 'error');
      // 發生錯誤，回滾本地更新
      const index = existingRows.findIndex(r => r.id === newObj.id);
      if (index !== -1) existingRows.splice(index, 1);
      renderHoldings(root, existingRows);
    });
  });
}

function bindTableActions(root, rows) {
  if (!canWrite()) return;

  // Delete
  root.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const row = rows.find(r => r.id === id);
      if (!confirm(`確定刪除 ${row?.name || row?.symbol}？`)) return;
      
      // [毫秒級優化] 樂觀更新 UI (Optimistic UI)
      const idx = rows.findIndex(r => r.id === id);
      if (idx !== -1) rows.splice(idx, 1);
      renderHoldings(root, rows);

      // 背景發送 API
      api.delete(id).then(() => {
        window.showToast('已刪除', 'success');
      }).catch(e => {
        window.showToast('刪除失敗：' + e.message, 'error');
        // 發生錯誤，重載回來
        initHoldings(root); 
      });
    });
  });

  // Sell modal
  const modal = root.querySelector('#sell-modal');
  root.querySelectorAll('.sell-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const row = rows.find(r => r.id === id);
      if (!row) return;
      root.querySelector('#sell-id').value = id;
      root.querySelector('#sell-symbol').value = `${row.symbol} ${row.name || ''}`.trim();
      root.querySelector('#sell-shares').value = row.shares;
      root.querySelector('#sell-shares').max = row.shares;
      root.querySelector('#sell-price').value = row.price?.toFixed(2) || '';
      modal.showModal();
    });
  });

  root.querySelector('#sell-modal-close')?.addEventListener('click', () => modal.close());
  root.querySelector('#sell-cancel-btn')?.addEventListener('click', () => modal.close());

  root.querySelector('#sell-form')?.addEventListener('submit', () => {
    const submitBtn = root.querySelector('#sell-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '處理中…';
    
    // 取得資料
    const sellId = root.querySelector('#sell-id').value;
    const sellShares = parseInt(root.querySelector('#sell-shares').value);
    const sellPrice = parseFloat(root.querySelector('#sell-price').value);
    const sellDate = root.querySelector('#sell-date').value;
    const sellNotes = root.querySelector('#sell-notes').value;
    
    modal.close();

    // [毫秒級優化] 樂觀更新 UI (Optimistic UI)
    const targetRow = rows.find(r => r.id === sellId);
    if (targetRow) {
      targetRow.shares -= sellShares;
      if (targetRow.shares <= 0) {
        const idx = rows.findIndex(r => r.id === sellId);
        if (idx !== -1) rows.splice(idx, 1);
      }
      renderHoldings(root, rows);
    }

    // 發送 API
    api.sell(sellId, sellShares, sellPrice, sellDate, sellNotes)
      .then(() => {
        window.showToast('賣出成功，已記錄損益', 'success');
      })
      .catch(e => {
        window.showToast('賣出失敗：' + e.message, 'error');
        initHoldings(root); // 全部重載回復原樣
      });
  });

  // Edit modal
  const editModal = root.querySelector('#edit-modal');
  root.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const row = rows.find(r => r.id === id);
      if (!row) return;
      root.querySelector('#edit-id').value = id;
      root.querySelector('#edit-symbol').value = row.symbol;
      root.querySelector('#edit-name').value = row.name || '';
      // 確保 datetime 格式擷取開頭的 yyyy-mm-dd
      root.querySelector('#edit-buy-date').value = row.buy_date ? String(row.buy_date).slice(0, 10) : '';
      root.querySelector('#edit-avg-cost').value = row.avg_cost || '';
      root.querySelector('#edit-shares').value = row.shares || '';
      root.querySelector('#edit-strategy').value = row.strategy || 'manual';
      root.querySelector('#edit-notes').value = row.notes || '';
      editModal.showModal();
    });
  });

  root.querySelector('#edit-modal-close')?.addEventListener('click', () => editModal.close());
  root.querySelector('#edit-cancel-btn')?.addEventListener('click', () => editModal.close());

  root.querySelector('#edit-form')?.addEventListener('submit', () => {
    const editId = root.querySelector('#edit-id').value;
    const patch = {
      name: root.querySelector('#edit-name').value.trim(),
      buy_date: root.querySelector('#edit-buy-date').value,
      avg_cost: parseFloat(root.querySelector('#edit-avg-cost').value),
      shares: parseInt(root.querySelector('#edit-shares').value),
      strategy: root.querySelector('#edit-strategy').value,
      notes: root.querySelector('#edit-notes').value.trim()
    };
    
    editModal.close();

    // [毫秒級優化] 樂觀更新 UI (Optimistic UI)
    const targetRow = rows.find(r => r.id === editId);
    if (targetRow) {
      Object.assign(targetRow, patch);
      renderHoldings(root, rows);
    }

    // 發送更新 API
    api.update(editId, patch)
      .then(() => window.showToast('修改已儲存', 'success'))
      .catch(e => {
        window.showToast('修改失敗：' + e.message, 'error');
        initHoldings(root);
      });
  });
}

function updateSidebarPortfolio(totalVal, totalPnl, totalPnlPct) {
  const valEl = document.getElementById('sidebar-total-val');
  const pnlEl = document.getElementById('sidebar-total-pnl');
  if (!valEl) return;
  valEl.textContent = fmtTwd(totalVal);
  if (pnlEl) {
    const sign = totalPnl >= 0 ? '+' : '';
    pnlEl.textContent = `${sign}${fmtTwd(totalPnl)} (${sign}${fmtPct(totalPnlPct)})`;
    pnlEl.className = `sidebar-portfolio-pnl ${colorClass(totalPnl)}`;
  }
}

function renderSkeleton() {
  return `<div class="loading"><div class="spinner"></div> 載入持股中…</div>`;
}
