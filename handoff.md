# 專案交接與代碼審查報告 (Handoff & Code Review)

## 📁 近期專案進度與資料夾整理說明

除了原本的 Python 後端排程與 Streamlit 架構外，我們已針對前端的 GitHub Pages/GAS 靜態網頁部分進行了大規模重構與極致視覺升級。近期主要完成了以下重要更新：

### 1. 介面設計全面升級 (Dark Luxury Theme)
- **深色高階金融儀表板**：已完成全新的 `app.css`，採用類似 Bloomberg Terminal 與 Robinhood 的高階深色風格（純黑背景 `#111111`、毛玻璃特效卡片、螢光綠點綴）。
- **側邊欄導航 (Sidebar) 與版型重構**：移除了原本上方的分頁切換，改為更現代左側固定的導航欄，並於 `Holdings` 頁面實作了上方三大資訊卡（總資產、未實現損益、總成本）。
- **Chart.js 全局整合**：硬編碼入深藍色與暗黑設定，並且字體完全綁定到全域 `Inter`, `Noto Sans TC`。

### 2. 功能強力擴展 (由 Antigravity 實作)
- **AI 分析前端化**：在 `js/tabs/ai.js` 中加入了「手動產生今日分析」按鈕。當使用者未綁定本地 Python 腳本時，可以直接透過前端利用 `localStorage` 儲存的 API Key 呼叫 Gemini REST API 進行全持股自動分析並寫回 Google Sheets，達成完全無伺服器化的自動分析體驗。
- **總資產 (NetWorth) 動態即時連動**：修正了原本 `networth.js` 只會載入死板的歷史快照紀錄，我們現在會自動與即時股市報價 (`js/api/prices.js`) 結合，**即時動態結算當下最真實的淨資產**，並自動填入快照表單。

---

## ✅ 已修復 Bug (2026-04-28)

1. **ai.js 黑畫面 crash** — 修復 `root.innerHTML = \`` 賦值遺失導致模組解析失敗
2. **networth.js 數值錯誤** — `h.qty` → `h.shares` 欄位名稱修正
3. **sheets.js 後端錯誤遮蔽** — 加入 `res.ok` 檢查，GAS 500 不再靜默失敗
4. **holdings.js 查詢 hanging** — Promise.all 加 try/catch
5. **prices.js 無聲失敗** — 改為 `console.warn` 有日誌的錯誤處理
6. **config.js hardcoded token** — 移除測試用 `read_abc123`

---

## 🔍 Code Review 發現與未解建議 (Python 後端)

前端已經達到極高完成度，如需繼續擴展 **後端 Python 或 Streamlit**，請留意以下建議：

1. **`jyf_backtest.py` 存在寫死的絕對路徑**：腳本內寫死了 macOS / 特定的絕對路徑。建議統一改為 `os.path.join(BASE_DIR, ...)` 免得其他環境崩潰。
2. **安全性疑慮：Hardcoded Token**：在 `jyf_backtest.py` 中，`REFRESH_TOKEN` 用明碼寫死，未來請移至 `.env`。
3. **API 限速問題**：`daily_ai_analysis.py` 連續敲擊 yfinance 與 Gemini API 偶爾會遭遇 429 錯誤需要 Retry 機制。
4. **UI 耦合度**：`app.py` 混合了所有業務邏輯，如果未來專案長大建議拆分至 `.streamlit/`。

---

## 🎨 UI/UX 重構內容 (2026-04-28)

- **頁面標題區塊**：每個 tab 都有 `.page-header` 含標題 + 副標題
- **持股行著色**：損益正負對應綠/紅左側 border + 漸層背景
- **現價欄**：顯示 ▲/▼ 日漲跌幅箭頭
- **操作按鈕**：改為 📤 ✏️ 🗑️ icon button 含 tooltip
- **Sidebar footer**：顯示即時總持股市值和損益
- **績效頁**：改為 4 欄統計 grid + 最佳/最差單筆卡片
- **Mobile 支援**：漢堡選單 + 側邊欄 overlay + 底部 bottom nav bar
- **XSS 保護**：`escapeHtml` 統一在 `format.js`，全 tab 套用

> 🤝 **下次 Claude 交接說明**：
> 目前所有功能穩定運作。如有問題請先確認 GAS URL 已在設定中填入，並檢查 Console 有無紅色錯誤。