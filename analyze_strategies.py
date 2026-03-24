import json
import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

PROGRESS_FILE = '/Users/kai/jyf_progress.json'

with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
    progress = json.load(f)

# Define strategies
# Data structure for results: { strategy_name: {'wins':0, 'total':0, 'returns':[]} }
stats = {
    '1. 基準策略：隔日開盤買進，持有 30 天賣出': {'wins': 0, 'total': 0, 'returns': []},
    '2. 停利策略：隔日開盤買進，碰到目標價提早賣出，否則 30 天賣出': {'wins': 0, 'total': 0, 'returns': []},
    '3. 嚴格停損停利：隔日買，觸及目標價賣，跌 10% 停損，否則 30 天賣': {'wins': 0, 'total': 0, 'returns': []},
    '4. 甜甜價低接：掛單甜甜價(14天內)，買到後持有 30 天賣出': {'wins': 0, 'total': 0, 'returns': []},
    '5. 甜甜價低接 + 目標價停利': {'wins': 0, 'total': 0, 'returns': []},
    '6. 長線持有：隔日開盤買進，持有 60 天賣出': {'wins': 0, 'total': 0, 'returns': []}
}

print("Running deep backtest analysis on different strategies...")

for k, v in progress.items():
    code = v.get('stock_code')
    tgt = v.get('target_price')
    sw = v.get('sweet_price')
    pub_date_str = v.get('date')
    
    if not code or not tgt or not pub_date_str:
        continue
        
    pub_date = datetime.strptime(pub_date_str, '%Y-%m-%d')
    start_date = pub_date.strftime('%Y-%m-%d')
    today_dt = datetime.today()
    
    sym = v.get('ticker')
    if not sym: continue
        
    df = yf.download(sym, start=start_date, end=today_dt.strftime('%Y-%m-%d'), progress=False, auto_adjust=True)
    if df.empty:
        continue
        
    if hasattr(df['High'], 'columns'):
        high = df['High'].iloc[:, 0].dropna()
        low = df['Low'].iloc[:, 0].dropna()
        open_p = df['Open'].iloc[:, 0].dropna()
        close_p = df['Close'].iloc[:, 0].dropna()
    else:
        high = df['High'].dropna()
        low = df['Low'].dropna()
        open_p = df['Open'].dropna()
        close_p = df['Close'].dropna()
        
    after_pub = open_p[open_p.index > pub_date]
    if after_pub.empty:
        continue
        
    buy_date = after_pub.index[0]
    buy_price = float(after_pub.iloc[0])
    
    # helper for selling logic
    def get_sell_logic(b_date, b_price, hold_days=30, tp_target=None, sl_pct=None):
        drange = close_p[close_p.index >= b_date]
        if drange.empty: return None, None
        
        target_date = b_date + timedelta(days=hold_days)
        
        for d in drange.index:
            if d == b_date: continue # Skip intraday buy day for simplicity or include it? Let's include after buy_date
            c_high = float(high.loc[d])
            c_low = float(low.loc[d])
            c_close = float(close_p.loc[d])
            
            # Stop loss hits first
            if sl_pct and c_low <= b_price * (1 - sl_pct):
                return d, b_price * (1 - sl_pct) # Sold at stop loss
            
            # Take profit hits
            if tp_target and c_high >= tp_target:
                return d, tp_target # Sold at target
                
            # Time limit
            if d >= target_date:
                return d, c_close
                
        return None, None # Still holding

    # S1
    s1_d, s1_p = get_sell_logic(buy_date, buy_price, hold_days=30)
    if s1_p:
        ret = (s1_p - buy_price)/buy_price
        stats['1. 基準策略：隔日開盤買進，持有 30 天賣出']['total'] += 1
        stats['1. 基準策略：隔日開盤買進，持有 30 天賣出']['returns'].append(ret)
        if ret > 0: stats['1. 基準策略：隔日開盤買進，持有 30 天賣出']['wins'] += 1

    # S2
    s2_d, s2_p = get_sell_logic(buy_date, buy_price, hold_days=30, tp_target=tgt)
    if s2_p:
        ret = (s2_p - buy_price)/buy_price
        stats['2. 停利策略：隔日開盤買進，碰到目標價提早賣出，否則 30 天賣出']['total'] += 1
        stats['2. 停利策略：隔日開盤買進，碰到目標價提早賣出，否則 30 天賣出']['returns'].append(ret)
        if ret > 0: stats['2. 停利策略：隔日開盤買進，碰到目標價提早賣出，否則 30 天賣出']['wins'] += 1

    # S3
    s3_d, s3_p = get_sell_logic(buy_date, buy_price, hold_days=30, tp_target=tgt, sl_pct=0.10)
    if s3_p:
        ret = (s3_p - buy_price)/buy_price
        stats['3. 嚴格停損停利：隔日買，觸及目標價賣，跌 10% 停損，否則 30 天賣']['total'] += 1
        stats['3. 嚴格停損停利：隔日買，觸及目標價賣，跌 10% 停損，否則 30 天賣']['returns'].append(ret)
        if ret > 0: stats['3. 嚴格停損停利：隔日買，觸及目標價賣，跌 10% 停損，否則 30 天賣']['wins'] += 1
        
    # S6
    s6_d, s6_p = get_sell_logic(buy_date, buy_price, hold_days=60)
    if s6_p:
        ret = (s6_p - buy_price)/buy_price
        stats['6. 長線持有：隔日開盤買進，持有 60 天賣出']['total'] += 1
        stats['6. 長線持有：隔日開盤買進，持有 60 天賣出']['returns'].append(ret)
        if ret > 0: stats['6. 長線持有：隔日開盤買進，持有 60 天賣出']['wins'] += 1
        
    # S4, S5 (Sweet price entry)
    if sw:
        # Check if low hits sweet price within 14 days
        search_range = low[(low.index > pub_date) & (low.index <= pub_date + timedelta(days=14))]
        hit_sweet = search_range[search_range <= sw]
        if not hit_sweet.empty:
            swt_buy_date = hit_sweet.index[0]
            swt_buy_price = sw # bought at limit order
            
            s4_d, s4_p = get_sell_logic(swt_buy_date, swt_buy_price, hold_days=30)
            if s4_p:
                ret = (s4_p - swt_buy_price)/swt_buy_price
                stats['4. 甜甜價低接：掛單甜甜價(14天內)，買到後持有 30 天賣出']['total'] += 1
                stats['4. 甜甜價低接：掛單甜甜價(14天內)，買到後持有 30 天賣出']['returns'].append(ret)
                if ret > 0: stats['4. 甜甜價低接：掛單甜甜價(14天內)，買到後持有 30 天賣出']['wins'] += 1

            s5_d, s5_p = get_sell_logic(swt_buy_date, swt_buy_price, hold_days=30, tp_target=tgt)
            if s5_p:
                ret = (s5_p - swt_buy_price)/swt_buy_price
                stats['5. 甜甜價低接 + 目標價停利']['total'] += 1
                stats['5. 甜甜價低接 + 目標價停利']['returns'].append(ret)
                if ret > 0: stats['5. 甜甜價低接 + 目標價停利']['wins'] += 1

print("\n")
print(f"{'策略名稱':<45} | {'交易筆數':<5} | {'勝率':<8} | {'平均報酬(單筆)':<10}")
print("-" * 80)
for name, data in stats.items():
    if data['total'] > 0:
        win_rate = data['wins'] / data['total'] * 100
        avg_ret = np.mean(data['returns']) * 100
        print(f"{name.split('：')[0]:<45} | {data['total']:<9} | {win_rate:>5.1f}%   | {avg_ret:>6.2f}%")

