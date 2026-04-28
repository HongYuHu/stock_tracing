/**
 * ai.js — AI 分析報告 tab
 */

import { ai as aiApi } from '../api/sheets.js';
import { fmtDate, escapeHtml } from '../lib/format.js';
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
        <p style="font-size:.875rem">AI 分析需透過 Google Apps Script 定時觸發 Gemini API 自動產生，<br>或點下方按鈕手動產生。</p>
        <button id="btn-generate-ai" class="btn-primary" style="margin-top:1rem;padding:6px 16px;font-size:0.85rem;border:none;cursor:pointer;">✨ 手動產生今日分析</button>
      </div>`;
    root.querySelector('#btn-generate-ai').addEventListener('click', async () => {
      let apiKey = localStorage.getItem('gemini_api_key');
      if (!apiKey) {
        apiKey = prompt('請輸入您的 Gemini API Key (僅儲存於本機瀏覽器):');
        if (!apiKey) return;
        localStorage.setItem('gemini_api_key', apiKey);
      }
      await runManualGeneration(root, apiKey);
    });
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
    <div style="display:flex;gap:.75rem;align-items:center;margin-bottom:1rem;justify-content:space-between;flex-wrap:wrap">
      <div style="display:flex;gap:.75rem;align-items:center;">
        <label style="margin:0;font-size:.875rem;display:flex;align-items:center;gap:.4rem">
          股票篩選
          <select id="ai-symbol-filter" style="font-size:.875rem;padding:.2rem .5rem">
            <option value="">全部</option>
            ${symbols.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </label>
        <span class="muted" style="font-size:.8rem">共 ${reports.length} 筆報告</span>
      </div>
      <button id="btn-generate-ai" class="btn-primary" style="padding:4px 12px;font-size:0.8rem;border-radius:4px;border:none;cursor:pointer;">✨ 手動產生今日分析</button>
    </div>
    <div id="ai-reports-list">
      ${renderReportGroups(byDate, dates, '')}
    </div>
  `;

  root.querySelector('#btn-generate-ai').addEventListener('click', async (e) => {
    let apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      apiKey = prompt('請輸入您的 Gemini API Key (僅儲存於本機瀏覽器):');
      if (!apiKey) return;
      localStorage.setItem('gemini_api_key', apiKey);
    }
    await runManualGeneration(root, apiKey);
  });

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
          <strong>${escapeHtml(r.symbol)}</strong>
          <span class="badge ${sentimentClass}">${sentimentLabel}</span>
          ${r.target_price ? `<small class="muted">目標價 ${escapeHtml(r.target_price)}</small>` : ''}
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

async function runManualGeneration(root, apiKey) {
  const btn = root.querySelector('#btn-generate-ai');
  const orgText = btn.textContent;
  btn.textContent = '⏳ 提取持股與現價中...';
  btn.disabled = true;

  try {
    const { holdings } = await import('../api/sheets.js');
    const { fetchPrices } = await import('../api/prices.js');
    
    const allHoldings = await holdings.list();
    const active = allHoldings.filter(h => Number(h.shares) > 0);
    if (!active.length) {
      alert('無持倉中股票，無法分析');
      return;
    }

    const priceMap = await fetchPrices(active.map(h => h.symbol));
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < active.length; i++) {
      const h = active[i];
      btn.textContent = `⏳ 正在分析 ${h.symbol} (${i+1}/${active.length})...`;
      
      const p = priceMap.get(h.symbol);
      const px = p ? p.price : '未知';
      const cost = h.avg_cost || 0;
      const profit = (px !== '未知' && cost) ? ((px - cost) / cost * 100).toFixed(2) + '%' : '未知';

      const prompt = `您是一位專業台股分析師。我的持股：${h.symbol} ${h.name}，目前現價為 ${px}，我的成本為 ${cost}，目前損益率 ${profit}。
請用繁體中文給予我一份簡短的專業操作建議。
請回傳**純 JSON 格式**（不要加任何 markdown code block 或多餘文字），格式必須嚴格如下：
{"sentiment": "bullish 或是 bearish 或是 neutral", "target_price": "您的預估目標價(字串)", "summary_md": "您的分析論述內容(支援 markdown，字串)"}`;

      try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts:[{text: prompt}] }] })
        });
        
        if (!res.ok) {
           const err = await res.json();
           if (err.error?.status === 'PERMISSION_DENIED' || err.error?.code === 400) {
             alert('Gemini API Key 無效，請檢查或重新設定！');
             localStorage.removeItem('gemini_api_key');
             break;
           }
           console.error('Gemini error:', err);
           continue;
        }

        const data = await res.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.replace(/^```json/g, '').replace(/```$/g, '').trim();

        let parsed = { sentiment: 'neutral', target_price: '', summary_md: '未能解析分析結果' };
        try { parsed = JSON.parse(text); } catch (e) { console.error('JSON parse fail', text); parsed.summary_md = text; }

        await aiApi.save({
          date: todayStr,
          symbol: h.symbol,
          model: 'gemini-2.5-flash-manual',
          sentiment: parsed.sentiment,
          target_price: parsed.target_price,
          summary_md: parsed.summary_md
        });
      } catch (err) {
        console.error('Failed to parse AI or save', err);
      }
    }

    btn.textContent = '✅ 分析完畢，正在重載...';
    await initAI(root); // completely reload AI tab
  } catch (err) {
    alert('分析過程發生錯誤：' + err.message);
  } finally {
    if (btn) {
      btn.textContent = orgText;
      btn.disabled = false;
    }
  }
}
