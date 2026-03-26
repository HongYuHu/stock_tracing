import streamlit as st
import pandas as pd
import json
import os
import base64
import requests as http
from datetime import datetime

try:
    import yfinance as yf
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False

# ── 路徑設定 ──────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTFOLIO_FILE = os.path.join(BASE_DIR, 'portfolio.json')
JYF_CSV = os.path.join(BASE_DIR, 'jyf_backtest_60d_results.csv')
ASSETS_FILE = os.path.join(BASE_DIR, 'assets.json')
NET_WORTH_HISTORY_FILE = os.path.join(BASE_DIR, 'net_worth_history.json')

# ── GitHub 設定（從 Streamlit secrets 讀取，本地端不填則走本地檔案）──
try:
    GH_TOKEN = st.secrets.get("GITHUB_TOKEN", "")
    GH_REPO  = st.secrets.get("GITHUB_REPO",  "")   # 格式：owner/repo-name
except Exception:
    GH_TOKEN = os.getenv("GITHUB_TOKEN", "")
    GH_REPO  = os.getenv("GITHUB_REPO",  "")
GH_PATH  = "portfolio.json"
GH_API   = f"https://api.github.com/repos/{GH_REPO}/contents/{GH_PATH}" if GH_REPO else ""
GH_HDR   = {"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"} if GH_TOKEN else {}

GH_USAGE_PATH = "api_usage.json"
GH_USAGE_API  = f"https://api.github.com/repos/{GH_REPO}/contents/{GH_USAGE_PATH}" if GH_REPO else ""
API_USAGE_FILE = os.path.join(BASE_DIR, 'api_usage.json')

# ── 持股 JSON 讀寫 ───────────────────────────────────────────────────
def load_portfolio() -> list:
    if GH_TOKEN and GH_REPO:
        try:
            r = http.get(GH_API, headers=GH_HDR, timeout=10)
            if r.status_code == 200:
                content = base64.b64decode(r.json()["content"]).decode("utf-8")
                return json.loads(content)
        except Exception:
            pass
    if os.path.exists(PORTFOLIO_FILE):
        with open(PORTFOLIO_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_portfolio(data: list):
    content_b64 = base64.b64encode(
        json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    ).decode("ascii")

    if GH_TOKEN and GH_REPO:
        try:
            r = http.get(GH_API, headers=GH_HDR, timeout=10)
            sha = r.json().get("sha") if r.status_code == 200 else None
            payload = {"message": "chore: update portfolio", "content": content_b64}
            if sha:
                payload["sha"] = sha
            http.put(GH_API, headers=GH_HDR, json=payload, timeout=15)
            return
        except Exception:
            pass
    with open(PORTFOLIO_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── Gemini API 使用量追蹤 ──────────────────────────────────────────────────
def load_api_usage() -> list:
    if GH_TOKEN and GH_REPO:
        try:
            r = http.get(GH_USAGE_API, headers=GH_HDR, timeout=10)
            if r.status_code == 200:
                content = base64.b64decode(r.json()["content"]).decode("utf-8")
                return json.loads(content)
        except Exception:
            pass
    if os.path.exists(API_USAGE_FILE):
        with open(API_USAGE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_api_usage(data: list):
    content_b64 = base64.b64encode(
        json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    ).decode("ascii")

    if GH_TOKEN and GH_REPO:
        try:
            r = http.get(GH_USAGE_API, headers=GH_HDR, timeout=10)
            sha = r.json().get("sha") if r.status_code == 200 else None
            payload = {"message": "chore: update api usage", "content": content_b64}
            if sha:
                payload["sha"] = sha
            http.put(GH_USAGE_API, headers=GH_HDR, json=payload, timeout=15)
            return
        except Exception:
            pass
    with open(API_USAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def increment_gemini_call():
    """記錄一次 Gemini API 呼叫，並同步至 GitHub。"""
    today = datetime.now().strftime("%Y-%m-%d")
    history = load_api_usage()

    for entry in history:
        if entry.get("date") == today:
            entry["gemini_calls"] = entry.get("gemini_calls", 0) + 1
            save_api_usage(history)
            return entry["gemini_calls"]

    history.append({"date": today, "gemini_calls": 1})
    save_api_usage(history)
    return 1

# ── 資產 JSON 讀寫 (本地) ──────────────────────────────────────────────────
def load_assets() -> dict:
    if os.path.exists(ASSETS_FILE):
        try:
            with open(ASSETS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"cash": [], "other_assets": [], "liabilities": []}

def save_assets(data: dict):
    with open(ASSETS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── 淨資產歷史紀錄 ─────────────────────────────────────────────────────────
def calculate_current_net_worth() -> dict:
    assets = load_assets()
    portfolio = load_portfolio()
    
    total_cash = 0.0
    for item in assets.get("cash", []):
        try: total_cash += float(str(item.get("金額", 0)).replace(',', ''))
        except: pass
        
    total_other = 0.0
    for item in assets.get("other_assets", []):
        try: total_other += float(str(item.get("金額", 0)).replace(',', ''))
        except: pass
        
    total_liab = 0.0
    for item in assets.get("liabilities", []):
        try: total_liab += float(str(item.get("金額", 0)).replace(',', ''))
        except: pass
        
    active_stocks = [s for s in portfolio if s.get('status', 'active') == 'active']
    stock_total_value = 0.0
    if active_stocks:
        codes = tuple(set(str(s['code']) for s in active_stocks))
        prices = fetch_prices_batch(codes)
        for s in active_stocks:
            code = str(s['code'])
            qty = float(s.get('qty', 0))
            live_p = prices.get(code)
            if live_p is not None:
                stock_total_value += float(live_p) * qty
            else:
                stock_total_value += float(s.get('buy_price', 0)) * qty
                
    total_assets = total_cash + total_other + stock_total_value
    net_worth = total_assets - total_liab
    
    return {
        "total_cash": total_cash,
        "total_other": total_other,
        "stock_total_value": stock_total_value,
        "total_liab": total_liab,
        "total_assets": total_assets,
        "net_worth": net_worth
    }

def record_daily_net_worth():
    """計算當下淨資產並存入歷史紀錄，如果今日已有紀錄則更新。"""
    data = calculate_current_net_worth()
    today_str = datetime.now().strftime("%Y-%m-%d")
    data["date"] = today_str
    
    history = []
    if os.path.exists(NET_WORTH_HISTORY_FILE):
        try:
            with open(NET_WORTH_HISTORY_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            pass
            
    replaced = False
    for item in history:
        if item.get("date") == today_str:
            item.update(data)
            replaced = True
            break
            
    if not replaced:
        history.append(data)
        
    with open(NET_WORTH_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

# ── 批次抓現價 ───────────────────────────────────────────────────────
@st.cache_data(ttl=300, show_spinner="正在更新股價...")
def fetch_prices_batch(codes: tuple) -> dict:
    if not HAS_YFINANCE or not codes:
        return {}

    result = {}
    tickers_tw  = [f'{c}.TW'  for c in codes]
    tickers_two = [f'{c}.TWO' for c in codes]

    for tickers, suffix in [(tickers_tw, '.TW'), (tickers_two, '.TWO')]:
        missing = [c for c in codes if c not in result]
        if not missing:
            break
        batch = [f'{c}{suffix}' for c in missing]
        try:
            raw = yf.download(batch, period='5d', progress=False, auto_adjust=True)
            if raw.empty:
                continue
            close = raw['Close'] if 'Close' in raw.columns else raw.xs('Close', axis=1, level=0)
            if isinstance(close, pd.Series):
                close = close.to_frame(name=batch[0])
            for ticker in batch:
                code = ticker.replace(suffix, '')
                if ticker in close.columns:
                    series = close[ticker].dropna()
                    if not series.empty:
                        result[code] = round(float(series.iloc[-1]), 2)
        except Exception:
            pass
    return result

# ── 公司名稱查詢 ─────────────────────────────────────────────────────
@st.cache_data(ttl=86400, show_spinner=False)
def _build_local_name_dict() -> dict:
    result = {}
    if os.path.exists(JYF_CSV):
        try:
            df = pd.read_csv(JYF_CSV, encoding='utf-8', usecols=['代號', '公司'])
            for _, row in df.dropna(subset=['代號', '公司']).iterrows():
                code = str(row['代號']).strip()
                name = str(row['公司']).strip()
                if code and name:
                    result[code] = name
        except Exception:
            pass
    return result

@st.cache_data(ttl=86400, show_spinner=False)
def lookup_company_name(code: str) -> str:
    code = code.strip()
    if not code:
        return ''
    local = _build_local_name_dict()
    if code in local:
        return local[code]
    if HAS_YFINANCE:
        for suffix in ['.TW', '.TWO']:
            try:
                info = yf.Ticker(f'{code}{suffix}').info
                name = info.get('shortName') or info.get('longName') or ''
                if name:
                    return name
            except Exception:
                pass
    return ''

# ── 顏色輔助 ────────────────────────────────────────────────────────
def color_return(val):
    try:
        v = float(val)
        return 'color: #1a56db; font-weight:bold' if v > 0 else ('color: #dc2626; font-weight:bold' if v < 0 else '')
    except Exception:
        return ''

def color_days(val):
    try:
        v = int(val)
        if v <= 0:
            return 'background-color: #fecaca'
        if v <= 7:
            return 'background-color: #fef3c7'
    except Exception:
        pass
    return ''
