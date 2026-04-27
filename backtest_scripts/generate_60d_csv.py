import json
import csv
import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

PROGRESS_FILE = '/Users/kai/Documents/stock_sideproject/stock_test/jyf_progress.json'
OUTPUT_CSV = '/Users/kai/Documents/stock_sideproject/stock_test/jyf_backtest_60d_results.csv'

with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
    progress = json.load(f)

results = []

print("Generating 60-day holding backtest CSV for all reports...")

for k, v in progress.items():
    code = v.get('stock_code')
    pub_date_str = v.get('date')
    company = v.get('company_name', '')
    title = v.get('title', '')
    sym = v.get('ticker')
    
    if not code or not pub_date_str or not sym:
        continue
        
    pub_date = datetime.strptime(pub_date_str, '%Y-%m-%d')
    start_date = pub_date.strftime('%Y-%m-%d')
    today_dt = datetime.today()
    
    df = yf.download(sym, start=start_date, end=today_dt.strftime('%Y-%m-%d'), progress=False, auto_adjust=True)
    if df.empty:
        results.append({
            '報告日期': pub_date_str, '公司': company, '代號': code, '標題': title,
            '買進日期': '', '買進價格': '', '賣出日期': '', '賣出價格': '', '報酬率(%)': '', '狀態': '無資料'
        })
        continue
        
    if hasattr(df['Open'], 'columns'):
        open_p = df['Open'].iloc[:, 0].dropna()
        close_p = df['Close'].iloc[:, 0].dropna()
    else:
        open_p = df['Open'].dropna()
        close_p = df['Close'].dropna()
        
    after_pub = open_p[open_p.index > pub_date]
    if after_pub.empty:
        results.append({
            '報告日期': pub_date_str, '公司': company, '代號': code, '標題': title,
            '買進日期': '', '買進價格': '', '賣出日期': '', '賣出價格': '', '報酬率(%)': '', '狀態': '尚未達買進日'
        })
        continue
        
    buy_date = after_pub.index[0]
    buy_price = float(after_pub.iloc[0])
    
    target_sell_date = buy_date + timedelta(days=60)
    after_sell = close_p[close_p.index >= target_sell_date]
    
    if after_sell.empty:
        # Currently holding, output the latest close price as current value
        latest_date = close_p.index[-1]
        latest_price = float(close_p.iloc[-1])
        ret = (latest_price - buy_price) / buy_price * 100
        results.append({
            '報告日期': pub_date_str, '公司': company, '代號': code, '標題': title,
            '買進日期': buy_date.strftime('%Y-%m-%d'), '買進價格': round(buy_price, 2), 
            '賣出日期': latest_date.strftime('%Y-%m-%d'), '賣出價格': round(latest_price, 2), 
            '報酬率(%)': round(ret, 2), '狀態': '未滿60天(持倉中)'
        })
    else:
        sell_date = after_sell.index[0]
        sell_price = float(after_sell.iloc[0])
        ret = (sell_price - buy_price) / buy_price * 100
        results.append({
            '報告日期': pub_date_str, '公司': company, '代號': code, '標題': title,
            '買進日期': buy_date.strftime('%Y-%m-%d'), '買進價格': round(buy_price, 2), 
            '賣出日期': sell_date.strftime('%Y-%m-%d'), '賣出價格': round(sell_price, 2), 
            '報酬率(%)': round(ret, 2), '狀態': '已結算'
        })

# Sort by report date
results.sort(key=lambda x: x['報告日期'], reverse=True)

fieldnames = ['報告日期', '標題', '公司', '代號', '買進日期', '買進價格', '賣出日期', '賣出價格', '報酬率(%)', '狀態']

with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(results)

print(f"CSV successfully generated at: {OUTPUT_CSV}")
