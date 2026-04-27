/**
 * performance.js — 績效圖表 tab
 */

import { networth as nwApi, realized as realizedApi } from '../api/sheets.js';
import { fmtTwd, fmtDate, fmtPct, colorClass } from '../lib/format.js';
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

  root.innerHTML = `
    <div class="stat-row">
      <div class="card">
        <div class="card-title">已實現損益</div>
        <div class="card-value ${colorClass(totalPnl)}">${fmtTwd(totalPnl)}</div>
      </div>
      <div class="card">
        <div class="card-title">勝率</div>
        <div class="card-value">${fmtPct(winRate)}</div>
      </div>
      <div class="card">
        <div class="card-title">平均報酬</div>
        <div class="card-value ${colorClass(avgReturn)}">${fmtPct(avgReturn)}</div>
      </div>
      <div class="card">
        <div class="card-title">交易筆數</div>
        <div class="card-value">${realized.length}</div>
      </div>
    </div>

    <h3>淨值走勢</h3>
    <div class="chart-container card">
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
        borderColor: '#1a73e8',
        backgroundColor: 'rgba(26,115,232,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: values.length > 60 ? 0 : 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmtTwd(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: { callback: v => fmtTwd(v) }
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
      <td><strong>${r.symbol}</strong><br><small class="muted">${r.name || ''}</small></td>
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
