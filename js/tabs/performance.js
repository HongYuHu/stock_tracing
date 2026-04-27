/**
 * performance.js — 績效圖表 tab
 */

import { networth as nwApi, realized as realizedApi } from '../api/sheets.js';
import { fmtTwd, fmtDate, fmtPct, colorClass, escapeHtml } from '../lib/format.js';
import { isConfigured } from '../config.js';

let networthChart = null;

export async function initPerformance(root) {
  root.innerHTML = `<div class="loading"><div class="spinner"></div> 載入績效資料…</div>`;
  if (!isConfigured()) {
    root.innerHTML = `<p class="muted" style="padding:2rem">請先設定 GAS URL。</p>`;
    return;
  }

  try {
    const [history, realizedRows] = await Promise.all([
      nwApi.list(),
      realizedApi.list()
    ]);
    renderPerformance(root, history, realizedRows);
  } catch (e) {
    root.innerHTML = `<p class="loss" style="padding:2rem">載入失敗：${e.message}</p>`;
  }
}

function renderPerformance(root, history, realized) {
  const totalPnl = realized.reduce((s, r) => s + Number(r.pnl || 0), 0);
  const winRows = realized.filter(r => Number(r.pnl) > 0);
  const winRate = realized.length ? (winRows.length / realized.length * 100) : 0;
  const avgReturn = realized.length
    ? realized.reduce((s, r) => s + Number(r.pnl_pct || 0), 0) / realized.length : 0;

  const bestTrade = realized.length
    ? realized.reduce((best, r) => Number(r.pnl_pct) > Number(best.pnl_pct) ? r : best, realized[0])
    : null;
  const worstTrade = realized.length
    ? realized.reduce((worst, r) => Number(r.pnl_pct) < Number(worst.pnl_pct) ? r : worst, realized[0])
    : null;

  root.innerHTML = `
    <div class="stats-grid-4">
      <div class="stat-card total-asset-card">
        <div class="card-title">已實現損益</div>
        <div class="card-value ${colorClass(totalPnl)}">${fmtTwd(totalPnl)}</div>
      </div>
      <div class="stat-card">
        <div class="card-title">勝率</div>
        <div class="card-value">${realized.length ? winRate.toFixed(1) + '%' : '—'}</div>
      </div>
      <div class="stat-card">
        <div class="card-title">平均報酬</div>
        <div class="card-value ${colorClass(avgReturn)}">${realized.length ? fmtPct(avgReturn) : '—'}</div>
      </div>
      <div class="stat-card">
        <div class="card-title">交易筆數</div>
        <div class="card-value">${realized.length}</div>
      </div>
    </div>

    ${realized.length >= 2 ? `
    <div class="top-stats-grid" style="margin-bottom:var(--space-6)">
      <div class="stat-card ${bestTrade && Number(bestTrade.pnl_pct) > 0 ? 'is-gain' : ''}">
        <div class="pnl-title">🏆 最佳單筆</div>
        <div class="pnl-value gain" style="font-size:1.5rem">${bestTrade ? fmtPct(bestTrade.pnl_pct) : '—'}</div>
        <div class="muted" style="font-size:.75rem;margin-top:4px">${bestTrade ? escapeHtml(bestTrade.symbol) + ' · ' + fmtDate(bestTrade.sell_date) : ''}</div>
      </div>
      <div class="stat-card ${worstTrade && Number(worstTrade.pnl_pct) < 0 ? 'is-loss' : ''}">
        <div class="pnl-title">📉 最差單筆</div>
        <div class="pnl-value loss" style="font-size:1.5rem">${worstTrade ? fmtPct(worstTrade.pnl_pct) : '—'}</div>
        <div class="muted" style="font-size:.75rem;margin-top:4px">${worstTrade ? escapeHtml(worstTrade.symbol) + ' · ' + fmtDate(worstTrade.sell_date) : ''}</div>
      </div>
      <div class="stat-card">
        <div class="pnl-title">📊 總交易金額</div>
        <div class="pnl-value" style="color:var(--text-primary);font-size:1.5rem">${fmtTwd(realized.reduce((s,r) => s + Number(r.sell_price||0)*Number(r.shares||0), 0))}</div>
      </div>
    </div>` : ''}

    <h3>淨值走勢</h3>
    <div class="chart-container">
      <canvas id="networth-chart"></canvas>
    </div>

    <h3>已實現損益記錄</h3>
    ${renderRealizedTable(realized)}
  `;

  drawNetworthChart(history);
}

function drawNetworthChart(history) {
  const canvas = document.getElementById('networth-chart');
  if (!canvas) return;
  if (networthChart) { networthChart.destroy(); networthChart = null; }

  const sorted = [...history].sort((a, b) => a.date > b.date ? 1 : -1);
  const labels = sorted.map(h => h.date);
  const values = sorted.map(h => Number(h.total) || 0);

  networthChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '總淨值 (TWD)',
        data: values,
        borderColor: '#4f8ef7',
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
          gradient.addColorStop(0, 'rgba(79,142,247,0.22)');
          gradient.addColorStop(0.6, 'rgba(79,142,247,0.06)');
          gradient.addColorStop(1, 'rgba(79,142,247,0.0)');
          return gradient;
        },
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: values.length > 60 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#4f8ef7',
        pointBorderColor: '#0a0c0f',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(26,29,36,0.97)',
          borderColor: 'rgba(255,255,255,0.10)',
          borderWidth: 1,
          titleColor: '#9aa0ac',
          bodyColor: '#e8eaed',
          titleFont: { size: 11, weight: '600', family: 'Inter, system-ui' },
          bodyFont: { size: 13, weight: '700', family: 'Inter, system-ui' },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: ctx => '  ' + fmtTwd(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { color: '#5f6470', font: { size: 11, family: 'Inter, system-ui' } },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: '#5f6470',
            font: { size: 11, family: 'Inter, system-ui' },
            callback: v => fmtTwd(v)
          },
          border: { display: false }
        }
      }
    }
  });
}

function renderRealizedTable(rows) {
  if (!rows.length) return `<p class="muted">尚無已實現損益記錄。</p>`;

  const sorted = [...rows].sort((a, b) => b.sell_date > a.sell_date ? 1 : -1);
  const trs = sorted.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.symbol)}</strong><br><small class="muted">${escapeHtml(r.name)}</small></td>
      <td class="right">${Number(r.shares).toLocaleString()}</td>
      <td class="right">${fmtTwd(r.buy_price)}</td>
      <td class="right">${fmtTwd(r.sell_price)}</td>
      <td>${fmtDate(r.buy_date)}</td>
      <td>${fmtDate(r.sell_date)}</td>
      <td class="right ${colorClass(r.pnl)}">${fmtTwd(r.pnl)}</td>
      <td class="right ${colorClass(r.pnl_pct)}">${fmtPct(r.pnl_pct)}</td>
    </tr>`).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>股票</th>
            <th class="right">股數</th>
            <th class="right">買入</th>
            <th class="right">賣出</th>
            <th>買入日</th>
            <th>賣出日</th>
            <th class="right">損益</th>
            <th class="right">損益%</th>
          </tr>
        </thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `;
}
