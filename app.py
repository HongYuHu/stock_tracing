#!/usr/bin/env python3
"""
股票追蹤系統
Part 1: 個人持股管理 + 60天賣出提醒
Part 2: 金玉峰 60天策略追蹤
"""
import streamlit as st
import pandas as pd
import json
import os
import time
import base64
import requests as http
from datetime import datetime, date, timedelta

# yfinance 可選
try:
    import yfinance as yf
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False

# ── 路徑設定 ──────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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

# ── 持股 JSON 讀寫（雲端走 GitHub API，本地走本地檔案）──────────────
def load_portfolio() -> list:
    if GH_TOKEN and GH_REPO:
        try:
            r = http.get(GH_API, headers=GH_HDR, timeout=10)
            if r.status_code == 200:
                content = base64.b64decode(r.json()["content"]).decode("utf-8")
                return json.loads(content)
        except Exception:
            pass
    # 本地 fallback
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
            # 取得現有檔案的 sha（更新時必須帶）
            r = http.get(GH_API, headers=GH_HDR, timeout=10)
            sha = r.json().get("sha") if r.status_code == 200 else None
            payload = {"message": "chore: update portfolio", "content": content_b64}
            if sha:
                payload["sha"] = sha
            http.put(GH_API, headers=GH_HDR, json=payload, timeout=15)
            return
        except Exception:
            pass
    # 本地 fallback
    with open(PORTFOLIO_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── 批次抓現價（一次下載全部，快取 5 分鐘）───────────────────────────
@st.cache_data(ttl=300, show_spinner="正在更新股價...")
def fetch_prices_batch(codes: tuple) -> dict:
    """一次抓取多檔股票現價，回傳 {code: price}"""
    if not HAS_YFINANCE or not codes:
        return {}

    result = {}
    # 先試 .TW，失敗的再試 .TWO
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
            # 處理單一 ticker 回傳 Series 的情況
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

# ── 公司名稱查詢（先查本地 JYF CSV，再查 yfinance）──────────────────
@st.cache_data(ttl=86400, show_spinner=False)
def _build_local_name_dict() -> dict:
    """從 JYF CSV 建立 {代號: 公司名} 字典"""
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
    """查公司中文名：先查本地 CSV，再查 yfinance"""
    code = code.strip()
    if not code:
        return ''

    # 1. 本地 JYF 資料
    local = _build_local_name_dict()
    if code in local:
        return local[code]

    # 2. yfinance shortName / longName
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

# ── 顏色輔助 ──────────────────────────────────────────────────────────
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

# ═══════════════════════════════════════════════════════════════════════
# 頁面設定
# ═══════════════════════════════════════════════════════════════════════
st.set_page_config(page_title="股票追蹤系統", page_icon="📈", layout="wide")
st.title("📈 股票追蹤系統")

tab1, tab2, tab3, tab4 = st.tabs(["📁 我的持股", "🔍 金玉峰追蹤", "📊 績效圖表", "🤖 AI 分析"])

# ═══════════════════════════════════════════════════════════════════════
# Part 1：個人持股管理
# ═══════════════════════════════════════════════════════════════════════
with tab1:
    st.header("我的持股管理")

    # ── session_state 初始化 ──────────────────────────────────────────
    if 'form_code' not in st.session_state:
        st.session_state['form_code'] = ''
    if 'form_name' not in st.session_state:
        st.session_state['form_name'] = ''
    if 'form_price' not in st.session_state:
        st.session_state['form_price'] = 0.0
    if 'name_lookup_status' not in st.session_state:
        st.session_state['name_lookup_status'] = ''

    def on_code_change():
        code = st.session_state.get('form_code', '').strip()
        if len(code) >= 4:
            name = lookup_company_name(code)
            # 同時抓取現價
            prices_dict = fetch_prices_batch((code,))
            latest_price = prices_dict.get(code)
            
            if name:
                st.session_state['form_name'] = name
                msg = f'✅ 已自動填入：{name}'
                if latest_price:
                    msg += f' (最新收盤/現價: {latest_price})'
                    st.session_state['form_price'] = float(latest_price)
                st.session_state['name_lookup_status'] = msg
            else:
                st.session_state['name_lookup_status'] = '⚠️ 查無資料，請手動輸入'
                if latest_price:
                    st.session_state['form_price'] = float(latest_price)
                    st.session_state['name_lookup_status'] += f' (但抓到現價: {latest_price})'
        else:
            st.session_state['name_lookup_status'] = ''

    # ── 新增持股表單 ──────────────────────────────────────────────────
    with st.expander("➕ 新增持股", expanded=True):
        c1, c2, c3 = st.columns(3)
        with c1:
            st.text_input(
                "股票代號 *", key='form_code',
                placeholder="例：2330，輸入後自動帶出公司名",
                on_change=on_code_change,
            )
            if st.session_state['name_lookup_status']:
                st.caption(st.session_state['name_lookup_status'])
            st.text_input(
                "公司名稱", key='form_name',
                placeholder="自動填入，或手動覆蓋",
            )
        with c2:
            new_date  = st.date_input("買入日期 *", value=date.today())
            new_price = st.number_input("買入價格 / 盤後最新價 *", min_value=0.0, step=0.5, format="%.2f", key='form_price')
        with c3:
            new_broker   = st.selectbox("證券戶", ["元富證券", "其他證券戶1", "其他證券戶2"])
            new_reminder = st.checkbox("開啟 60天賣出提醒", value=True)
            new_qty      = st.number_input("持有股數（選填）", min_value=0, step=1000)

        if st.button("✅ 新增持股", type="primary"):
            new_code = st.session_state.get('form_code', '').strip()
            new_name = st.session_state.get('form_name', '').strip()
            if new_code and new_price > 0:
                portfolio = load_portfolio()
                
                # 尋找是否已有同代號且未賣出的持股
                existing = [s for s in portfolio if s.get('code') == new_code and s.get('status', 'active') == 'active']
                
                if existing:
                    target = existing[0]  # 取第一筆進行合併
                    old_qty = target.get('qty', 1000)
                    old_price = target.get('buy_price', 0)
                    
                    new_total_qty = old_qty + new_qty
                    new_avg_price = (old_qty * old_price + new_qty * new_price) / new_total_qty
                    
                    target['qty'] = new_total_qty
                    target['buy_price'] = round(new_avg_price, 2)
                    target['buy_date'] = str(new_date) # 更新為最後加碼日期
                    # 覆蓋券商與筆記（如果這次有填）
                    if new_broker: target['broker'] = new_broker
                    if new_reminder: target['reminder'] = new_reminder
                    
                    st.success(f"✅ 已成功加碼合併 {new_code} {new_name}！新均價：{new_avg_price:.2f}，總股數：{new_total_qty}")
                else:
                    portfolio.append({
                        'code':      new_code,
                        'name':      new_name,
                        'buy_date':  str(new_date),
                        'buy_price': new_price,
                        'qty':       new_qty,
                        'broker':    new_broker,
                        'reminder':  new_reminder,
                        'status':    'active'
                    })
                    st.success(f"✅ 已新增 {new_code} {new_name}")

                save_portfolio(portfolio)
                # 清空表單：透過刪除 session_state 的 key 讓它重置，避免 exception
                for key in ['form_code', 'form_name', 'form_price', 'name_lookup_status']:
                    if key in st.session_state:
                        del st.session_state[key]
                st.rerun()
            else:
                st.warning("請填寫股票代號與買入價格")

    # ── 顯示持股列表 ──────────────────────────────────────────────────
    portfolio = load_portfolio()
    today = date.today()

    if not portfolio:
        st.info("尚未新增任何持股，請使用上方「新增持股」功能")
    else:
        # ── 刷新控制列 ────────────────────────────────────────────────
        r_col1, r_col2, r_col3 = st.columns([1, 2, 1])
        with r_col1:
            if st.button("🔄 刷新現價", type="primary"):
                st.cache_data.clear()
                st.rerun()
        with r_col2:
            # 自動刷新開關（台股交易時間 09:00-13:30）
            now_tw = datetime.now()
            is_market_open = (
                now_tw.weekday() < 5 and
                (9, 0) <= (now_tw.hour, now_tw.minute) <= (13, 30)
            )
            auto_label = "⚡ 自動刷新（交易時段中）" if is_market_open else "💤 交易時段外"
            st.caption(auto_label)
        with r_col3:
            st.caption(f"最後更新：{datetime.now().strftime('%H:%M:%S')}")

        # ── 批次抓全部現價 ────────────────────────────────────────────
        codes = tuple(s['code'] for s in portfolio)
        prices = fetch_prices_batch(codes)

        # ── 計算各持股數據 ────────────────────────────────────────────
        rows = []
        total_cost = 0.0
        total_value = 0.0

        for i, s in enumerate(portfolio):
            buy_date  = date.fromisoformat(s['buy_date'])
            days_held = (today - buy_date).days
            days_left = 60 - days_held
            qty       = s.get('qty', 0) or 0

            current_price = prices.get(s['code'])

            if current_price and s['buy_price']:
                pnl_pct = round((current_price - s['buy_price']) / s['buy_price'] * 100, 2)
            else:
                pnl_pct = None

            cost  = s['buy_price'] * qty
            value = current_price * qty if current_price else None
            profit = round(value - cost, 0) if value is not None else None

            if qty > 0:
                total_cost  += cost
                total_value += (value or cost)

            if s.get('status') == 'sold':
                continue

            alert = s.get('reminder', False) and days_left <= 0

            rows.append({
                '_idx':      i,
                '代號':      s['code'],
                '公司':      s['name'],
                '證券戶':    s.get('broker', ''),
                '買入日':    s['buy_date'],
                '買入價':    s['buy_price'],
                '現價':      current_price if current_price else '—',
                '漲跌幅(%)': pnl_pct if pnl_pct is not None else '—',
                '持股數':    qty if qty else '—',
                '損益(元)':  profit if profit is not None else '—',
                '持有天':    days_held,
                '距60天':    days_left,
                '提醒':      '🔔' if s.get('reminder') else '—',
                '狀態':      '🔴 到期賣出！' if alert else (
                              '🟡 快到期' if 0 < days_left <= 7 and s.get('reminder') else '🟢 持倉中'),
            })

        # ── 整體損益彙總 ──────────────────────────────────────────────
        if total_cost > 0 and total_value > 0:
            total_pnl     = total_value - total_cost
            total_pnl_pct = round(total_pnl / total_cost * 100, 2)
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("持股數", f"{len(portfolio)} 檔")
            m2.metric("總成本", f"${total_cost:,.0f}")
            m3.metric("總市值", f"${total_value:,.0f}",
                      delta=f"{'+' if total_pnl >= 0 else ''}{total_pnl:,.0f} 元")
            m4.metric("整體報酬率", f"{'+' if total_pnl_pct >= 0 else ''}{total_pnl_pct:.2f}%")
            st.divider()

        # ── 警示區 ────────────────────────────────────────────────────
        alerts = [r for r in rows if r['狀態'] == '🔴 到期賣出！']
        if alerts:
            st.error(f"⚠️ 以下 {len(alerts)} 檔股票已超過 60 天，建議賣出！")
            for a in alerts:
                ret = a['漲跌幅(%)']
                ret_str = f"{ret}%" if ret != '—' else '無資料'
                st.markdown(
                    f"**🔴 {a['代號']} {a['公司']}** — 已持有 **{a['持有天']} 天**，"
                    f"買入價 {a['買入價']}，現價 {a['現價']}，報酬率 {ret_str}"
                )

        # ── 資料表 ────────────────────────────────────────────────────
        df = pd.DataFrame(rows).drop(columns=['_idx'])

        # 數值欄轉換（讓 styler 能正確上色）
        df['漲跌幅(%)'] = pd.to_numeric(df['漲跌幅(%)'], errors='coerce')
        df['損益(元)']  = pd.to_numeric(df['損益(元)'],  errors='coerce')
        df['距60天']    = pd.to_numeric(df['距60天'],    errors='coerce')

        styled = (
            df.style
            .map(color_return, subset=['漲跌幅(%)', '損益(元)'])
            .map(color_days,   subset=['距60天'])
            .format({'漲跌幅(%)': lambda x: f"{x:+.2f}%" if pd.notna(x) else '—',
                     '損益(元)':  lambda x: f"{x:+,.0f}" if pd.notna(x) else '—',
                     '現價':      lambda x: f"{x:.2f}" if isinstance(x, float) else x,
                     '距60天':    lambda x: f"{int(x)}" if pd.notna(x) else '—'})
        )
        st.dataframe(styled, use_container_width=True, height=min(400, 80 + len(rows) * 35))

        # ── 賣出持股 ──────────────────────────────────────────────────
        st.divider()
        col_s1, col_s2 = st.columns(2)
        with col_s1:
            with st.expander("💸 賣出持股"):
                active_options = [f"[{i}] {s['code']} {s['name']}" for i, s in enumerate(portfolio) if s.get('status', 'active') == 'active']
                if active_options:
                    to_sell = st.selectbox("選擇要賣出的持股", active_options)
                    sell_date = st.date_input("賣出日期", value=date.today())
                    sell_price = st.number_input("賣出價格", min_value=0.0, step=0.1)
                    if st.button("確認賣出", type="primary"):
                        idx = int(to_sell.split(']')[0][1:])
                        portfolio[idx]['status'] = 'sold'
                        portfolio[idx]['sold_date'] = str(sell_date)
                        portfolio[idx]['sold_price'] = sell_price
                        save_portfolio(portfolio)
                        st.success(f"已記錄賣出 {portfolio[idx]['code']} {portfolio[idx]['name']}")
                        st.rerun()
                else:
                    st.info("尚無活動中持股")

        with col_s2:
            with st.expander("🗑️ 永久刪除"):
                all_options = [f"[{i}] {s['code']} {s['name']} ({s.get('status','active')})" for i, s in enumerate(portfolio)]
                if all_options:
                    to_delete = st.selectbox("選擇要刪除的持股", all_options)
                    if st.button("確認永久刪除", type="secondary"):
                        idx = int(to_delete.split(']')[0][1:])
                        removed = portfolio.pop(idx)
                        save_portfolio(portfolio)
                        st.success(f"已刪除 {removed['code']} {removed['name']}")
                        st.rerun()

        # ── 已實現損益歷史 ──────────────────────────────────────────
        sold_list = [s for s in portfolio if s.get('status') == 'sold']
        if sold_list:
            st.divider()
            st.subheader("📋 已實現損益歷史")
            history_rows = []
            total_realized = 0.0
            for s in sold_list:
                buy_p = s['buy_price']
                sell_p = s.get('sold_price', 0)
                qty = s.get('qty', 0)
                ret = round((sell_p - buy_p) / buy_p * 100, 2) if buy_p > 0 else 0
                realized = round((sell_p - buy_p) * qty, 0)
                total_realized += realized
                history_rows.append({
                    '代號': s['code'], '公司': s['name'], '買入日': s['buy_date'], '賣出日': s.get('sold_date',''),
                    '買入價': buy_p, '賣出價': sell_p, '報酬率(%)': ret, '損益(元)': realized
                })
            
            st.metric("累計已實現損益", f"${total_realized:,.0f} 元", 
                      delta=f"{'+' if total_realized >= 0 else ''}{total_realized:,.0f}", delta_color="normal")
            
            hist_df = pd.DataFrame(history_rows)
            styled_hist = hist_df.style.map(color_return, subset=['報酬率(%)', '損益(元)'])
            st.dataframe(styled_hist, use_container_width=True)

        # ── 交易時段自動刷新（每 5 分鐘）────────────────────────────
        if is_market_open:
            time.sleep(300)
            st.rerun()

# ═══════════════════════════════════════════════════════════════════════
# Part 2：金玉峰 60 天策略追蹤
# ═══════════════════════════════════════════════════════════════════════
with tab2:
    st.header("金玉峰 60天持倉追蹤")

    if not os.path.exists(JYF_CSV):
        st.error(f"找不到回測資料：{JYF_CSV}")
        st.stop()

    df_jyf = pd.read_csv(JYF_CSV, encoding='utf-8')
    today  = date.today()

    # 計算持有天數 / 剩餘天數
    def calc_days(row):
        if row['狀態'] == '未滿60天(持倉中)' and pd.notna(row.get('買進日期')):
            try:
                buy = date.fromisoformat(str(row['買進日期']))
                held = (today - buy).days
                return held, 60 - held
            except Exception:
                pass
        return None, None

    df_jyf[['持有天數', '距賣出天數']] = df_jyf.apply(
        lambda r: pd.Series(calc_days(r)), axis=1
    )

    # ── 統計概覽 ──────────────────────────────────────────────────────
    settled = df_jyf[df_jyf['狀態'] == '已結算'].copy()
    settled['報酬率(%)'] = pd.to_numeric(settled['報酬率(%)'], errors='coerce')
    active  = df_jyf[df_jyf['狀態'] == '未滿60天(持倉中)'].copy()
    pending = df_jyf[df_jyf['狀態'] == '尚未達買進日'].copy()

    if not settled.empty:
        wins     = (settled['報酬率(%)'] > 0).sum()
        total_bt = len(settled)
        win_rate = wins / total_bt * 100
        avg_ret  = settled['報酬率(%)'].mean()

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("已結算筆數", total_bt)
        c2.metric("勝率",       f"{win_rate:.1f}%")
        c3.metric("平均報酬率", f"{avg_ret:.2f}%")
        c4.metric("持倉中",     len(active))
        c5.metric("待買進",     len(pending))

    st.divider()

    # ── 持倉中（到期警示）────────────────────────────────────────────
    if not active.empty:
        st.subheader("🟡 持倉中（未滿60天）")

        # 快到期警示
        near = active[active['距賣出天數'].notna() & (active['距賣出天數'] <= 7)]
        
        # 這裡需要抓取最新的報價來顯示，與第一頁即時跳動同步
        jyf_codes = tuple(active['代號'].astype(str).unique())
        jyf_prices = fetch_prices_batch(jyf_codes)

        if not near.empty:
            for _, row in near.iterrows():
                rd = int(row['距賣出天數'])
                code = str(row.get('代號',''))
                buy = row.get('買進價格', 0)
                # 即時算報酬率
                live_price = jyf_prices.get(code, row.get('賣出價格'))
                if pd.notna(buy) and buy > 0 and live_price:
                    ret = round((float(live_price) - float(buy)) / float(buy) * 100, 2)
                else:
                    ret = row.get('報酬率(%)', '—')
                    
                if rd <= 0:
                    st.error(f"🔴 **{code} {row.get('公司','')}** 已達60天，建議賣出！現報酬率估：{ret}%")
                else:
                    st.warning(f"🟡 **{code} {row.get('公司','')}** 還剩 {rd} 天到期，現報酬率估：{ret}%")

        # 顯示表格
        cols_active = ['報告日期', '公司', '代號', '買進日期', '買進價格', '賣出價格', '報酬率(%)', '持有天數', '距賣出天數']
        display_a = active[[c for c in cols_active if c in active.columns]].copy()
        display_a = display_a.rename(columns={'賣出價格': '現價'})
        
        for idx, row in display_a.iterrows():
            code = str(row['代號'])
            if code in jyf_prices:
                current_price = float(jyf_prices[code])
                display_a.at[idx, '現價'] = current_price
                buy_price = row.get('買進價格')
                if pd.notna(buy_price) and float(buy_price) > 0:
                    display_a.at[idx, '報酬率(%)'] = round((current_price - float(buy_price)) / float(buy_price) * 100, 2)
                    
        display_a['報酬率(%)'] = pd.to_numeric(display_a['報酬率(%)'], errors='coerce')

        styled_a = display_a.style\
            .map(color_return, subset=['報酬率(%)'])\
            .map(color_days,   subset=['距賣出天數'])
        st.dataframe(styled_a, use_container_width=True)

    # ── 待買進 ────────────────────────────────────────────────────────
    if not pending.empty:
        st.subheader("⏳ 尚未達買進日")
        st.dataframe(
            pending[['報告日期', '公司', '代號', '標題']],
            use_container_width=True
        )

    # ── 歷史已結算 ────────────────────────────────────────────────────
    st.divider()
    with st.expander("📋 歷史已結算記錄", expanded=False):
        if not settled.empty:
            cols_settled = ['報告日期', '公司', '代號', '買進日期', '買進價格', '賣出日期', '賣出價格', '報酬率(%)']
            display_s = settled[[c for c in cols_settled if c in settled.columns]].sort_values('報告日期', ascending=False)
            styled_s = display_s.style.map(color_return, subset=['報酬率(%)'])
            st.dataframe(styled_s, use_container_width=True)

# ═══════════════════════════════════════════════════════════════════════
# Part 3：績效圖表 (改為追蹤個人持股)
# ═══════════════════════════════════════════════════════════════════════
with tab3:
    st.header("📊 總結與績效圖表 (我的持股)")
    
    portfolio = load_portfolio()
    sold_list = [s for s in portfolio if s.get('status') == 'sold']
    
    if sold_list:
        df_chart = pd.DataFrame(sold_list)
        df_chart['買入價'] = pd.to_numeric(df_chart['buy_price'], errors='coerce')
        df_chart['賣出價'] = pd.to_numeric(df_chart.get('sold_price', 0), errors='coerce')
        df_chart['賣出日期'] = df_chart.get('sold_date', '')
        
        df_chart['報酬率(%)'] = df_chart.apply(
            lambda r: round((r.get('賣出價', 0) - r['買入價']) / r['買入價'] * 100, 2) if pd.notna(r['買入價']) and r['買入價'] > 0 else 0,
            axis=1
        )
        
        c1, c2 = st.columns(2)
        with c1:
            st.subheader("已實現報酬率分布圖")
            if not df_chart.empty:
                # 簡單分箱
                bins = [-100, -20, -10, 0, 10, 20, 30, 50, 100, 500]
                labels = ["<-20%", "-20~-10%", "-10~0%", "0~10%", "10~20%", "20~30%", "30~50%", "50~100%", ">100%"]
                df_chart['range'] = pd.cut(df_chart['報酬率(%)'], bins=bins, labels=labels)
                dist = df_chart['range'].value_counts().reindex(labels)
                st.bar_chart(dist)
        
        with c2:
            st.subheader("已實現損益時間軸 (單筆)")
            if not df_chart.empty and '賣出日期' in df_chart:
                chart_data = df_chart[df_chart['賣出日期'] != ''].copy()
                chart_data['賣出日期'] = pd.to_datetime(chart_data['賣出日期'], errors='coerce')
                chart_data = chart_data.dropna(subset=['賣出日期']).sort_values('賣出日期')
                if not chart_data.empty:
                    st.line_chart(chart_data.set_index('賣出日期')['報酬率(%)'])
                else:
                    st.info("日期格式不符，無法畫出折線圖。")
                
        st.divider()
        st.info("💡 圖表說明：目前此分頁已改為追蹤『您個人真實操作』，統計標記為【已賣出】的歷史持股績效分布與時間軸。")
    else:
        st.warning("您目前尚未有『已賣出』的歷史持股紀錄，沒有資料可供製圖。如果想看到圖表，請先在第一頁點擊『賣出持股』來記錄獲利喔！")

# ═══════════════════════════════════════════════════════════════════════
# Part 4：AI 每日分析
# ═══════════════════════════════════════════════════════════════════════
with tab4:
    st.header("🤖 AI 每日持股聯合診斷")
    
    st.info("💡 系統會自動抓取您的活躍持股，整理最新「均線技術面」與「即時新聞」，並交由 Google Gemini AI 大模型進行獨家個股診斷。")
    
    if st.button("🚀 一鍵產生今日所有持股的 AI 報告", type="primary"):
        import daily_ai_analysis as ai_script
        import yfinance as yf
        import pandas as pd
        
        portfolio = load_portfolio()
        active_stocks = [s for s in portfolio if s.get('status', 'active') == 'active']
        
        if not active_stocks:
            st.warning("目前沒有活躍持股可供分析，請先至「我的持股」新增。")
        else:
            with st.spinner(f"正在對 {len(active_stocks)} 檔持股進行深度 AI 分析，這可能需要幾十秒，請稍候..."):
                for stock in active_stocks:
                    code = stock['code']
                    name = stock.get('name', code)
                    ticker_tw = f"{code}.TW"
                    
                    st.divider()
                    st.subheader(f"📊 【{code} {name}】 專屬診斷")
                    
                    try:
                        ticker = yf.Ticker(ticker_tw)
                        hist = ticker.history(period="1mo")
                        if hist.empty:
                            ticker_two = f"{code}.TWO"
                            ticker = yf.Ticker(ticker_two)
                            hist = ticker.history(period="1mo")
                    except Exception:
                        hist = pd.DataFrame()
                        
                    tech_summary = ai_script.calculate_technical_indicators(hist)
                    
                    try:
                        news_data = ticker.news
                        news_titles = [item['title'] for item in news_data[:3]] if news_data else ["今日無相關重大新聞..."]
                    except Exception:
                        news_titles = ["新聞爬取失敗"]
                        
                    # 顯示技術面與新聞摘要
                    c1, c2 = st.columns(2)
                    with c1:
                        st.markdown("**📌 今日技術面觀測：**")
                        st.code(tech_summary)
                    with c2:
                        st.markdown("**📰 市場最新重點新聞：**")
                        for idx, title in enumerate(news_titles, 1):
                            st.caption(f"{idx}. {title}")
                            
                    # 呼叫外部 AI 產生報告
                    report = ai_script.call_ai_for_analysis(f"{code} {name}", tech_summary, news_titles)
                    
                    st.markdown("### 🤖 操作建議與解讀")
                    if report.startswith("⚠️") or report.startswith("❌"):
                        st.error(report)
                    else:
                        st.success(report)
                
                st.balloons()
                st.success("✅ 今日所有持股的 AI 分析報告已產生完成！")

