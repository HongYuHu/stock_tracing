/**
 * holdings.js — 我的持股 tab
 */

import { holdings as api } from '../api/sheets.js';
import { fetchPrices, lookupName } from '../api/prices.js';
import { fmtTwd, fmtNum, fmtPct, fmtDate, colorClass, expiryClass, expiryLabel } from '../lib/format.js';
import { notifyExpiring } from '../lib/alerts.js';
import { isConfigured, canWrite } from '../config.js';

export async function initHoldings(root) {
  root.innerHTML = renderSkeleton();
  if (!isConfigured()) {
    root.innerHTML = `<p class="muted" style="padding:2rem">請先在 ⚙️ 設定中填入 GAS URL 和 Read Token。</p>`;
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
  const totalCost = enriched.reduce((s, r) => s + (Number(r.avg_cost) * Number(r.shares)), 0);
  const totalVal = enriched.reduce((s, r) => s + (r.marketVal ?? Number(r.avg_cost) * Number(r.shares)), 0);
  const totalPnl = totalVal - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  notifyExpiring(enriched).catch(() => {});

  root.innerHTML = `
    ${renderAddForm()}
    ${renderStats(enriched.length, totalCost, totalVal, totalPnl, totalPnlPct)}
    ${renderTable(enriched)}
    ${renderSellModal()}
  `;

  bindAddForm(root, rows, enriched);
  bindTableActions(root, enriched);
}

// ── Stats row ─────────────────────────────────────────────────────────

function renderStats(count, cost, val, pnl, pnlPct) {
  return `
    <div class="stat-row">
      <div class="card">
        <div class="card-title">持股數</div>
        <div class="card-value">${count}</div>
      </div>
      <div class="card">
        <div class="card-title">成本合計</div>
        <div class="card-value">${fmtTwd(cost)}</div>
      </div>
      <div class="card">
        <div class="card-title">市值合計</div>
        <div class="card-value">${fmtTwd(val)}</div>
      </div>
      <div class="card">
        <div class="card-title">未實現損益</div>
        <div class="card-value ${colorClass(pnl)}">${fmtTwd(pnl)} (${fmtPct(pnlPct)})</div>
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
      <summary>➕ 新增持股</summary>
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
    const rowClass = expiryClass(r.expiry_date);
    return `
      <tr class="${rowClass}" data-id="${r.id}">
        <td><strong>${r.symbol}</strong><br><small class="muted">${r.name || ''}</small></td>
        <td class="right">${fmtNum(r.shares, 0)}</td>
        <td class="right">${fmtTwd(r.avg_cost)}</td>
        <td class="right">${r.price != null ? fmtTwd(r.price) : '—'}
          ${r.changePct != null ? `<br><small class="${colorClass(r.changePct)}">${fmtPct(r.changePct)}</small>` : ''}</td>
        <td class="right">${r.marketVal != null ? fmtTwd(r.marketVal) : '—'}</td>
        <td class="right ${colorClass(r.pnl)}">${r.pnl != null ? fmtTwd(r.pnl) : '—'}</td>
        <td class="right ${colorClass(r.pnlPct)}">${r.pnlPct != null ? fmtPct(r.pnlPct) : '—'}</td>
        <td class="${rowClass}">${fmtDate(r.expiry_date)}<br><small>${expiryLabel(r.expiry_date)}</small></td>
        <td>
          <button class="btn-sm secondary sell-btn" data-id="${r.id}">賣出</button>
          <button class="btn-sm secondary btn-danger del-btn" data-id="${r.id}">刪除</button>
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
            <th>到期日</th>
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
          <h3>💰 賣出持股</h3>
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
      const [name, priceData] = await Promise.all([
        lookupName(code),
        fetchPrices([code]).then(m => m.get(code))
      ]);
      if (name) nameInput.value = name;
      if (priceData?.price) costInput.value = priceData.price.toFixed(2);
      statusEl.textContent = name ? `✅ ${name}` : '查無公司名';
    }, 600);
  });

  root.querySelector('#add-holding-form').addEventListener('submit', async () => {
    btn.disabled = true;
    btn.textContent = '新增中…';
    statusEl.textContent = '';
    try {
      await api.create({
        symbol: symbolInput.value.trim().toUpperCase(),
        name: nameInput.value.trim(),
        buy_date: root.querySelector('#f-buy-date').value,
        avg_cost: parseFloat(root.querySelector('#f-avg-cost').value),
        shares: parseInt(root.querySelector('#f-shares').value),
        strategy: root.querySelector('#f-strategy').value,
        notes: root.querySelector('#f-notes').value.trim()
      });
      window.showToast('持股已新增', 'success');
      await initHoldings(root);
    } catch (e) {
      window.showToast('新增失敗：' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = '新增';
    }
  });
}

function bindTableActions(root, rows) {
  if (!canWrite()) return;

  // Delete
  root.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const row = rows.find(r => r.id === id);
      if (!confirm(`確定刪除 ${row?.name || row?.symbol}？`)) return;
      try {
        await api.delete(id);
        window.showToast('已刪除', 'success');
        await initHoldings(root);
      } catch (e) {
        window.showToast('刪除失敗：' + e.message, 'error');
      }
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
      root.querySelector('#sell-symbol').value = `${row.symbol} ${row.name || ''}`;
      root.querySelector('#sell-shares').value = row.shares;
      root.querySelector('#sell-shares').max = row.shares;
      root.querySelector('#sell-price').value = row.price?.toFixed(2) || '';
      modal.showModal();
    });
  });

  root.querySelector('#sell-modal-close')?.addEventListener('click', () => modal.close());
  root.querySelector('#sell-cancel-btn')?.addEventListener('click', () => modal.close());

  root.querySelector('#sell-form')?.addEventListener('submit', async () => {
    const submitBtn = root.querySelector('#sell-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '處理中…';
    try {
      await api.sell(
        root.querySelector('#sell-id').value,
        parseInt(root.querySelector('#sell-shares').value),
        parseFloat(root.querySelector('#sell-price').value),
        root.querySelector('#sell-date').value,
        root.querySelector('#sell-notes').value
      );
      modal.close();
      window.showToast('賣出成功，已記錄損益', 'success');
      await initHoldings(root);
    } catch (e) {
      window.showToast('賣出失敗：' + e.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '確認賣出';
    }
  });
}

function renderSkeleton() {
  return `<div class="loading"><div class="spinner"></div> 載入持股中…</div>`;
}
