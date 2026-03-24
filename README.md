# 金玉峰投顧股票分析與 AI 追蹤系統 (Stock Tracing)

一個整合了 PDF 報告解析、多維度回測、個人投資組合管理以及 AI 智慧分析的強大台股追蹤決策系統。

## 🚀 專案兩大核心模塊

### 1. 報告自動化回測 (Backtesting)
利用 Apple Vision OCR 技術精準辨識金玉峰投顧報告中的目標價、操作建議等數值，並直接對接 `yfinance` 自動計算真實歷史績效。
- **最穩健策略**：報告出刊隔日開盤買進，持有 60 天結算賣出。
- **真實表現**：高達 70.9% 的勝率，平均單筆報酬率達 +14.16%。
- *腳本*: `jyf_backtest.py`, `analyze_strategies.py`

### 2. 智慧追蹤戰情室 (Streamlit Web App)
透過 `app.py` 所建立的美觀儀表板，用來長期管理多帳戶的股票配置與損益。
- **一鍵式操作**：輸入代號自動補齊公司名稱與當前報價，多次買進自動計算均價。
- **60 天到期警示與賣出功能**：隨時結算您的獲利，並匯聚為精美的已實現獲利分布圖表與時間軸。
- **AI 每日盤後健檢**：結合 Google Gemini 1.5 Flash，每天自動為您現有的持股抓取「技術線型 (均線狀態)」與「當日前三條新聞」，讓 AI 分析師給您最新的一對一個股解讀。

## ⚙️ 快速安裝與使用

### 依賴環境
本專案運行於 Python 3.9+。
```bash
git clone https://github.com/HongYuHu/stock_tracing.git
cd stock_tracing
pip3 install -r requirements.txt
```
*(Mac 用戶如果需跑本地回測，請額外安裝 `pyobjc-framework-Vision` 以啟用 OCR 解析)*

### AI 金鑰設定
若要啟用系統的 **AI 分析** 模塊，請複製 `.env.example` 並更名為 `.env`，填上您的免費 Google API Key：
```env
GEMINI_API_KEY=AIzaSy...你的金鑰
```

### 啟動網站服務
```bash
# Mac (或雙擊 run.sh)
./run.sh

# Windows (或雙擊 run.bat)
py -3 -m streamlit run app.py
```
網頁將自動開啟於 `http://localhost:8501`。

## 📁 檔案架構
- `app.py`：戰情室主程式 UI。
- `daily_ai_analysis.py`：盤後自動生成 LLM 報告的腳本。
- `utils/helpers.py`：股票報價、本地資料庫（`portfolio.json`）的核心封裝邏輯。
- `.streamlit/secrets.toml`（需自行建立）：可用於放置 `GITHUB_TOKEN` 將您的持股資料無縫上雲備份。

---
*Created by [HongYuHu](https://github.com/HongYuHu)*
