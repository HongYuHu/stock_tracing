import json
import csv
import yfinance as yf
from datetime import datetime, timedelta
import os
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

PROGRESS_FILE = '/Users/kai/jyf_progress.json'
OUTPUT_CSV = '/Users/kai/jyf_backtest_result.csv'
CLEAN_CSV = '/Users/kai/jyf_backtest_clean.csv'

# 1. Load progress
with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
    progress = json.load(f)

# 2. Hand corrections
corrections = {
    '610': {'stock_code': '6788', 'company_name': '華景電', 'target_price': 303.0,
            'sweet_price': 192.0, 'crazy_price': 367.0, 'current_price_at_report': None},
    '668': {'target_price': 42.2, 'sweet_price': 25.0, 'crazy_price': 63.0,
            'current_price_at_report': 33.2},
    '743': {'stock_code': '6629', 'company_name': '泰金-KY', 'target_price': 155.0,
            'sweet_price': 95.0, 'crazy_price': 215.0, 'current_price_at_report': 122.0},
    '753': {'target_price': 65.0, 'sweet_price': 39.0, 'crazy_price': 90.0,
            'current_price_at_report': 48.5},
}

for k, v in corrections.items():
    if k in progress:
        progress[k].update(v)

# 3. Fix anomalies & download yfinance for the 30-day strategy
results = []
returns = []
win_count = 0
total_closed = 0
ongoing = 0

print("Processing and Running Backtest...")

for k, v in progress.items():
    # Fix anomalies sweet < current, crazy > target
    cur = v.get('current_price_at_report')
    tgt = v.get('target_price')
    sw = v.get('sweet_price')
    crz = v.get('crazy_price')
    
    if sw is not None:
        if cur is not None and sw >= cur:
            v['sweet_price'] = None
        elif tgt is not None and sw >= tgt:
            v['sweet_price'] = None
    
    if crz is not None and tgt is not None and crz <= tgt:
        v['crazy_price'] = None

    # Run yfinance backtest
    code = v.get('stock_code')
    tgt = v.get('target_price')
    pub_date_str = v.get('date')
    
    if not code or not tgt or not pub_date_str:
        results.append(v)
        continue
        
    pub_date = datetime.strptime(pub_date_str, '%Y-%m-%d')
    start_date = pub_date.strftime('%Y-%m-%d')
    today = datetime.today()
    
    sym = f'{code}.TW'
    df = yf.download(sym, start=start_date, end=today.strftime('%Y-%m-%d'), progress=False, auto_adjust=True)
    if df.empty:
        sym = f'{code}.TWO'
        df = yf.download(sym, start=start_date, end=today.strftime('%Y-%m-%d'), progress=False, auto_adjust=True)
        
    if df.empty:
        v['reached_target'] = None
        results.append(v)
        continue
        
    if hasattr(df['High'], 'columns'):
        high = df['High'].iloc[:, 0].dropna()
        open_p = df['Open'].iloc[:, 0].dropna()
        close_p = df['Close'].iloc[:, 0].dropna()
    else:
        high = df['High'].dropna()
        open_p = df['Open'].dropna()
        close_p = df['Close'].dropna()
        
    if high.empty:
        v['reached_target'] = None
        results.append(v)
        continue
        
    reached = high[high >= tgt]
    v['max_price_since'] = round(float(high.max()), 2)
    v['ticker'] = sym
    
    if not reached.empty:
        v['reached_target'] = True
        v['reached_date'] = str(reached.index[0])[:10]
    else:
        v['reached_target'] = False
        v['reached_date'] = None
        
    # 30-day strategy return calculation
    # Buy next day open
    after_pub = open_p[open_p.index > pub_date]
    if not after_pub.empty:
        buy_date = after_pub.index[0]
        buy_price = float(after_pub.iloc[0])
        
        target_sell_date = buy_date + timedelta(days=30)
        # Sell at close of the first trading day >= target_sell_date
        after_sell = close_p[close_p.index >= target_sell_date]
        if not after_sell.empty:
            sell_date = after_sell.index[0]
            sell_price = float(after_sell.iloc[0])
            trade_return = (sell_price - buy_price) / buy_price
            returns.append(trade_return)
            total_closed += 1
            if trade_return > 0:
                win_count += 1
        else:
            ongoing += 1

    results.append(v)

with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
    json.dump(progress, f, indent=2, ensure_ascii=False)

fieldnames = [
    'article_id', 'date', 'title',
    'company_name', 'stock_code',
    'sweet_price', 'target_price', 'crazy_price',
    'current_price_at_report',
    'ticker', 'reached_target', 'reached_date', 'max_price_since'
]

with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(results)
    
with open(CLEAN_CSV, 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(results)

# Calculate metrics
if total_closed > 0:
    win_rate = win_count / total_closed
    avg_trade_return = np.mean(returns)
    annualized_return_arithmetic = avg_trade_return * (365 / 30)
    annualized_return_geometric = ((1 + avg_trade_return) ** (365 / 30)) - 1
else:
    win_rate = 0
    avg_trade_return = 0
    annualized_return_arithmetic = 0
    annualized_return_geometric = 0

print("\n=== 月回測策略統計 (出刊隔日買進，30天後賣出) ===")
print(f"已結算筆數: {total_closed}")
print(f"持倉中: {ongoing}")
print(f"勝率: {win_rate*100:.1f}%")
print(f"平均單筆報酬 (約一個月): {avg_trade_return*100:.2f}%")
print(f"年化報酬率 (算術): {annualized_return_arithmetic*100:.1f}%")
print(f"年化報酬率 (幾何): {annualized_return_geometric*100:.1f}%")
print("\n完成！")
