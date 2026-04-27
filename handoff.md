# 專案交接與代碼審查報告 (Handoff & Code Review)

## 📁 資料夾整理說明
為了讓專案結構更清晰，我已經協助將專案進行了初步整理：
- **新增 `backtest_scripts/` 資料夾**：將與金玉峰投資報告回測相關的獨立腳本（`analyze_strategies.py`, `fix_and_backtest.py`, `generate_60d_csv.py`, `jyf_backtest.py`, `summarize_60d.py`）移入此目錄，將它們與主系統（股票追蹤儀表板）分離。
- **保留根目錄核心結構**：`app.py` (主程式)、`daily_ai_analysis.py` (每日排程)、`utils/` (共用邏輯) 以及相關的設定檔與資料檔（JSON/CSV）暫時保留在根目錄，以確保 Streamlit 應用程式和 GitHub Sync 功能不會因為路徑變更而中斷。

---

## 🔍 Code Review 發現與建議

### 1. `jyf_backtest.py` 存在寫死的絕對路徑與跨平台問題
- **問題**：腳本內寫死了 macOS 的絕對路徑，例如：
  - `OUTPUT_CSV = '/Users/kai/jyf_backtest_result.csv'`
  - `PROGRESS_FILE = '/Users/kai/jyf_progress.json'`
  - `IMG_CACHE_DIR = '/tmp/jyf_images'`
- **風險**：這在 Windows（您目前的作業系統）或其他開發者的電腦上執行時會直接報錯 (`FileNotFoundError`)。
- **建議**：改用相對於專案根目錄的相對路徑，例如 `os.path.join(os.path.dirname(__file__), '..', 'data', 'jyf_backtest_result.csv')`。

### 2. 安全性疑慮：Hardcoded Token
- **問題**：在 `jyf_backtest.py` 中，`REFRESH_TOKEN` 被直接寫死在程式碼中。
- **風險**：若程式碼上傳至公開的 GitHub 儲存庫，會導致 API 存取權限外洩。
- **建議**：比照 Gemini API Key 的做法，將 `REFRESH_TOKEN` 移至 `.env` 檔案中，並使用 `os.getenv('REFRESH_TOKEN')` 讀取。

### 3. 異常處理 (Exception Handling) 過於寬鬆
- **問題**：在 `utils/helpers.py` 等檔案中，有多處讀寫檔案或呼叫 API 的地方使用了 `except Exception:` 且直接 `pass`（沒有任何日誌輸出）。
- **風險**：這會隱藏潛在的 Bug（例如 JSON 格式損壞、檔案權限不足或網路中斷），導致後續除錯時難以追蹤問題根源。
- **建議**：建議加入錯誤日誌，例如 `except Exception as e: print(f"Error loading {PORTFOLIO_FILE}: {e}")`，或使用 Python 的 `logging` 模組取代 `print`。

### 4. API 呼叫的限速與穩定性
- **問題**：`daily_ai_analysis.py` 在迴圈中連續呼叫 `yfinance` 獲取歷史資料與新聞，並緊接著呼叫 Gemini API。
- **風險**：若持股數量增加，極可能觸發 `yfinance` 或 Google Gemini 的限速 (Rate Limit) 導致中斷。
- **建議**：在迴圈之間加入 `time.sleep(1)`，或加入 Retry 機制來增加穩定性。此外，`yfinance` 的新聞抓取有時不穩定，應確保其發生例外時有穩定的 Fallback（目前已有初步的 Try-Catch）。

### 5. UI 與商業邏輯耦合度高
- **問題**：`app.py` 行數較多，混合了所有的 UI 元件宣告（Tab）與業務邏輯（例如直接在按鈕回呼中處理資料儲存）。
- **建議**：隨著專案複雜度提高，建議將介面邏輯拆分到 `.streamlit/` 或是自定義的 `components/` 目錄下（例如 `render_portfolio_tab()`），讓 `app.py` 專注於全域設定與路由。

---

## 🚀 後續行動建議
1. **修正路徑與金鑰**：優先修改 `backtest_scripts/jyf_backtest.py`，將絕對路徑改為相對路徑，並將 Token 移出程式碼。
2. **統一資料管理**：您可以建立一個 `data/` 資料夾，統一集中存放所有的 `.json` 與 `.csv`，然後修改 `utils/helpers.py` 內的 `BASE_DIR` 相關常數指向該資料夾，這會讓專案看起來更專業。
3. **享受使用**：目前的專案已經具備了很完整的 MVP（最小可行性產品）雛形，且整合了創新的 AI 功能，可以開始編譯或直接執行測試了！