import streamlit as st
import pandas as pd
import json
import os
import base64
import requests as http

try:
    import yfinance as yf
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False

# ── 路徑設定 ──────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTFOLIO_FILE = os.path.join(BASE_DIR, 'portfolio.json')
JYF_CSV = os.path.join(BASE_DIR, 'jyf_backtest_60d_results.csv')

# ── GitHub 設定（從 Streamlit secrets 讀取，本地端不填則走本地檔案）──
try:
    GH_TOKEN = st.secrets.get("GITHUB_TOKEN", "")
    GH_REPO  = st.secrets.get("GITHUB_REPO",  "")   # 格式：owner/repo-name
except Exception:
    GH_TOKEN = ""
    GH_REPO  = ""
GH_PATH  = "portfolio.json"
GH_API   = f"https://api.github.com/repos/{GH_REPO}/contents/{GH_PATH}" if GH_REPO else ""
GH_HDR   = {"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"} if GH_TOKEN else {}

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
