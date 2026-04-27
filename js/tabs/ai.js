/**
 * ai.js — AI 分析報告 tab
 */

import { ai as aiApi } from '../api/sheets.js';
import { fmtDate } from '../lib/format.js';
import { isConfigured } from '../config.js';

export async function initAI(root) {
  root.innerHTML = `<div class="loading"><div class="spinner"></div> 載入 AI 分析…</div>`;
  if (!isConfigured()) {
    root.innerHTML = `<p class="muted" style="padding:2rem">請先設定 GAS URL。</p>`;
    return;
  }

  try {
    const reports = await aiApi.get();
    renderAI(root, reports);
  } catch (e) {
    root.innerHTML = `<p class="loss" style="padding:2rem">載入失敗：${e.message}</p>`;
  }
}

function renderAI(root, reports) {
  if (!reports.length) {
    root.innerHTML = `
      <div style="padding:2rem;text-align:center">
        <p class="muted">尚無 AI 分析報告。</p>
        <p style="font-size:.875rem">AI 分析需透過 Google Apps Script 定時觸發 Gemini API 自動產生，<br>並儲存至 Google Sheets 的 <code>AIReports</code> 分頁。</p>
      </div>`;
    return;
  }

  // Group by date
  const byDate = {};
  reports.forEach(r => {
    const d = String(r.date || '').slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });

  const dates = Object.keys(byDate).sort((a, b) => b > a ? 1 : -1);

  // Filter controls
  const symbols = [...new Set(reports.map(r => r.symbol))].sort();

  root.innerHTML = `
    <div style="display:flex;gap:.75rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap">
      <label style="margin:0;font-size:.875rem;display:flex;align-items:center;gap:.4rem">
        股票篩選
        <select id="ai-symbol-filter" style="font-size:.875rem;padding:.2rem .5rem">
          <option value="">全部</option>
          ${symbols.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </label>
      <span class="muted" style="font-size:.8rem">共 ${reports.length} 筆報告</span>
    </div>
    <div id="ai-reports-list">
      ${renderReportGroups(byDate, dates, '')}
    </div>
  `;

  root.querySelector('#ai-symbol-filter').addEventListener('change', e => {
    const filter = e.target.value;
    root.querySelector('#ai-reports-list').innerHTML =
      renderReportGroups(byDate, dates, filter);
    bindToggle(root);
  });

  bindToggle(root);
}

function renderReportGroups(byDate, dates, symbolFilter) {
  return dates.map(date => {
    const rows = byDate[date].filter(r =>
      !symbolFilter || String(r.symbol).toUpperCase() === symbolFilter.toUpperCase()
    );
    if (!rows.length) return '';

    return `
      <div style="margin-bottom:1.5rem">
        <h4 style="font-size:.9rem;color:var(--color-neutral);margin-bottom:.5rem">${date}</h4>
        ${rows.map(r => renderReportCard(r)).join('')}
      </div>`;
  }).join('');
}

function renderReportCard(r) {
  const sentimentClass = {
    bullish: 'badge-bullish',
    bearish: 'badge-bearish',
    neutral: 'badge-neutral'
  }[r.sentiment] || 'badge-neutral';

  const sentimentLabel = {
    bullish: '看多',
    bearish: '看空',
    neutral: '中性'
  }[r.sentiment] || r.sentiment || '—';

  return `
    <div class="ai-card">
      <div class="ai-card-header" data-toggle>
        <div style="display:flex;align-items:center;gap:.6rem">
          <strong>${r.symbol}</strong>
          <span class="badge ${sentimentClass}">${sentimentLabel}</span>
          ${r.target_price ? `<small class="muted">目標價 ${r.target_price}</small>` : ''}
        </div>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="ai-card-body" style="display:none">${escapeHtml(r.summary_md || '無分析內容')}</div>
    </div>`;
}

function bindToggle(root) {
  root.querySelectorAll('[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      const icon = header.querySelector('.toggle-icon');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (icon) icon.textContent = isOpen ? '▼' : '▲';
    });
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
