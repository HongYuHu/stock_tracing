# 專案交接與代碼審查報告 (Handoff & Code Review)

## 📁 近期專案進度與資料夾整理說明

除了原本的 Python 後端排程與 Streamlit 架構外，我們已針對前端的 GitHub Pages/GAS 靜態網頁部分進行了大規模重構與極致視覺升級：

### 1. 介面設計全面升級 (Dark Luxury Theme)
- **深色高階金融儀表板**：已完成全新的 `app.css`，採用類似 Bloomberg Terminal 與 Robinhood 的高階深色風格（毛玻璃特效、發光點綴、漸層圖表）。
- **完全去除了淺色模式切換**：`index.html` 的開關已被安全移除。全域採用深底色，有效避免淺色模式下圖表破版與反差過大，提供更專注的看盤體驗。
- **重新設計且嚴謹的輔助圖示**：已清除前端 JS (`holdings.js`, `networth.js`) 中的 Emoji（例如 ➕, 📸），並改以簡潔純文字或是標準幾何符號（如 ◈, ⚙, ✕）呈現，大幅提升質感。
- **Chart.js 全局整合**：硬編碼入深藍色設定，並且字體完全綁定到全域 `Inter`, `Noto Sans TC` 以符合現代感。

### 2. 腳本目錄梳理
- **新增 `backtest_scripts/` 資料夾**：將與金玉峰投資報告回測相關的獨立腳本（`analyze_strategies.py`, `fix_and_backtest.py`, `generate_60d_csv.py`, `jyf_backtest.py`, `summarize_60d.py`）移入此目錄，將它們與主系統分離。
- **保留根目錄核心結構**：`app.py` (主程式)、`daily_ai_analysis.py` (每日排程)、`utils/` (共用邏輯) 以及相關的設定檔與資料檔（JSON/CSV）保留在根目錄，確保 Streamlit 應用程式和同步功能正常。

---

## 🔍 Code Review 發現與未解建議 (Python 後端)

前端已經達到極高完成度，如果您打算繼續擴展 **後端 Python 或 Streamlit**，請留意以下之前檢閱發現的重點：

### 1. `jyf_backtest.py` 存在寫死的絕對路徑與跨平台問題
- **問題**：腳本內寫死了 macOS 的絕對路徑（例如：`/Users/kai/jyf_backtest_result.csv`）。
- **風險**：這在 Windows（您目前的作業系統）或其他開發者的電腦上執行時會直接報錯 (`FileNotFoundError`)。
- **建議**：改用相對於專案根目錄的相對路徑，例如 `os.path.join(os.path.dirname(__file__), '..', 'data', 'jyf_backtest_result.csv')`。

### 2. 安全性疑慮：Hardcoded Token
- **問題**：在 `jyf_backtest.py` 中，`REFRESH_TOKEN` 被直接寫死在程式碼中。
- **建議**：比照 Gemini API Key 的做法，將 `REFRESH_TOKEN` 移至 `.env` 檔案中，並使用 `os.getenv('REFRESH_TOKEN')` 讀取。

### 3. 異常處理 (Exception Handling) 過於寬鬆
- **問題**：在 `utils/helpers.py` 等檔案中，有多處使用 `except Exception:` 且直接 `pass`（沒有任何日誌輸出）。
- **風險**：這會隱藏潛在的 Bug（例如 JSON 格式損壞、檔案權限不足或網路中斷）。
- **建議**：加入錯誤日誌，例如 `except Exception as e: print(f"Error loading {PORTFOLIO_FILE}: {e}")`。

### 4. API 呼叫的限速與穩定性
- **問題**：`daily_ai_analysis.py` 在迴圈中連續呼叫 `yfinance` 獲取歷史資料與新聞，並緊接著呼叫 Gemini API。
- **建議**：在迴圈之間加入 `time.sleep(1)`，或加入 Retry 機制來增加穩定性。

### 5. UI 與商業邏輯耦合度高 (Streamlit 端)
- **問題**：`app.py` 混合了所有的 UI 元件宣告（Tab）與業務邏輯。
- **建議**：隨著專案複雜度提高，可將介面邏輯拆分到 `.streamlit/` 或是 `components/` 目錄下（例如 `render_portfolio_tab()`）。

---

## 🚀 後續行動建議
1. **享受前端體驗**：目前的前端 (GitHub Pages + Google Sheets API) 已經具備極完整的現代化介面，您可以直接發布預覽，並使用手機與電腦上來展示這個流暢的儀表板。
2. **修復 Python 回測腳本**：如果需要再次跑回測資料，請優先修改 `backtest_scripts/jyf_backtest.py`，將絕對路徑改為相對路徑，並把 Token 移出程式碼。可以準備 `.env.example`。
3. **統一後端資料管理**：您可以建立一個 `data/` 資料夾，集中存放所有的背端產生的 `.json` 與 `.csv`，然後修改 `utils/helpers.py` 常數指向該處，專案結構會更為強健。