# Stock Tracing — AI-Powered Taiwan Stock Analysis System

A comprehensive Taiwan stock tracking and decision-support system integrating PDF report parsing, multi-strategy backtesting, personal portfolio management, and AI-driven daily analysis.

## 🚀 Two Core Modules

### 1. Automated Report Backtesting
Uses Apple Vision OCR to extract target prices and buy recommendations from Jin-Yu-Feng (金玉峰) investment reports, then automatically calculates real historical performance via `yfinance`.
- **Most robust strategy**: Buy at next-day open after report publication, sell after 60 days.
- **Real-world results**: 70.9% win rate with an average return of +14.16% per trade.
- *Scripts*: `jyf_backtest.py`, `analyze_strategies.py`

### 2. Smart Portfolio Dashboard (Streamlit Web App)
A clean dashboard built with `app.py` for long-term management of stock positions and P&L across multiple accounts.
- **One-click entry**: Auto-fills company name and live price from stock code; calculates average cost for multiple buy-ins.
- **60-day expiry alerts**: Track and close positions at any time, with realized P&L charts and a timeline view.
- **Daily AI health check**: Powered by Google Gemini, automatically fetches technical indicators (MA status) and top 3 news headlines for each holding after market close, delivering a personalized AI analysis per stock.

## ⚙️ Setup & Usage

### Requirements
Requires Python 3.9+.
```bash
git clone https://github.com/HongYuHu/stock_tracing.git
cd stock_tracing
pip3 install -r requirements.txt
```
*(macOS users running local backtests: install `pyobjc-framework-Vision` to enable OCR parsing)*

### AI Key Configuration
To enable the **AI analysis** module, copy `.env.example` to `.env` and fill in your free Google API key:
```env
GEMINI_API_KEY=AIzaSy...your_key_here
```
To enable **GitHub sync** for portfolio and API usage data, also add:
```env
GITHUB_TOKEN=your_github_token
GITHUB_REPO=owner/repo-name
```

### Launch the Web App
```bash
# macOS (or double-click run.sh)
./run.sh

# Windows (or double-click run.bat)
py -3 -m streamlit run app.py
```
The dashboard will open at `http://localhost:8501`.

## 📁 File Structure
- `app.py` — Main Streamlit dashboard UI.
- `daily_ai_analysis.py` — Post-market script that generates LLM reports for each holding.
- `utils/helpers.py` — Core logic for stock price fetching, portfolio I/O (`portfolio.json`), and API usage tracking (`api_usage.json`).
- `.streamlit/secrets.toml` *(create manually)* — Place `GITHUB_TOKEN` here to enable cloud backup of portfolio data.

---
*Created by [HongYuHu](https://github.com/HongYuHu)*
