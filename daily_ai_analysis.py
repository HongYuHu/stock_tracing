#!/usr/bin/env python3
"""
每日 AI 持股分析腳本 (Daily AI Analysis)
用途：每天下午三點執行，自動抓取您的目前的持股最新報價、技術線型（MA、RSI 等）以及當日最新相關新聞。
最後將這些資訊整合並交由 AI 模型進行大盤與個股的整體分析。
"""

import os
import json
import datetime
import yfinance as yf
import pandas as pd
from dotenv import load_dotenv

# 取得目前專案路徑
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO_FILE = os.path.join(BASE_DIR, 'portfolio.json')

# 載入 .env 檔案中的環境變數
load_dotenv(os.path.join(BASE_DIR, '.env'))

def call_ai_for_analysis(stock_name, technical_data, news_headlines):
    """
    這裡負責將整理好的台股數據，傳送給大語言模型 (LLM) 進行分析。
    """
    prompt = f"""
請扮演一位專業的台股分析師。
我的持股：{stock_name}
今日技術面資訊：
- {technical_data}

今日最新新聞標題：
{chr(10).join(f'- {n}' for n in news_headlines)}

請根據以上資料，給我一份針對這檔股票的簡短操作建議與解讀。
"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "⚠️ 【系統提醒】：尚未設定 GEMINI_API_KEY，無法呼叫 AI 進行分析。\n請在專案根目錄建立 `.env` 檔案並填寫 `GEMINI_API_KEY=你的金鑰`\n或者在系統環境變數中設置該金鑰。"

    try:
        from google import genai
        # 建立 Gemini 客戶端
        client = genai.Client(api_key=api_key)
        
        # 呼叫強大的 gemini-2.5-flash 模型 (免費且快速)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return response.text.replace('\n\n', '\n').strip()
    except Exception as e:
        return f"❌ 呼叫 Gemini AI 發生錯誤：{str(e)}"


def calculate_technical_indicators(df):
    """計算基礎技術指標：5日均線、20日均線以及簡單的價格變化"""
    if df.empty or len(df) < 20:
        return "資料不足以計算完整的 20MA 技術線型"
    
    close_today = df['Close'].iloc[-1]
    ma5 = df['Close'].rolling(window=5).mean().iloc[-1]
    ma20 = df['Close'].rolling(window=20).mean().iloc[-1]
    
    # 簡單畫分多空趨勢
    if close_today > ma5 and ma5 > ma20:
        trend = "多頭排列 (強勢)"
    elif close_today < ma5 and ma5 < ma20:
        trend = "空頭排列 (弱勢)"
    else:
        trend = "盤整中"
        
    return f"收盤: {close_today:.2f} | 5MA: {ma5:.2f} | 20MA (月線): {ma20:.2f} | 目前均線狀態: {trend}"

def main():
    print(f"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 開始執行每日 AI 持股分析...")
    print("=" * 60)
    
    if not os.path.exists(PORTFOLIO_FILE):
        print("❌ 找不到 portfolio.json，沒有持股需要分析。")
        return
        
    with open(PORTFOLIO_FILE, 'r', encoding='utf-8') as f:
        portfolio = json.load(f)
        
    active_stocks = [s for s in portfolio if s.get('status', 'active') == 'active']
    
    if not active_stocks:
        print("💡 目前無活躍的持股記錄。")
        return
        
    print(f"📊 總共需要分析 {len(active_stocks)} 檔您目前擁有的持股")
    print("-" * 60)
    
    for stock in active_stocks:
        code = stock['code']
        name = stock.get('name', code)
        ticker_tw = f"{code}.TW"
        
        print(f"🔍 正在獲取 【{code} {name}】 的技術線型與新聞...")
        ticker = yf.Ticker(ticker_tw)
        
        # 1. 獲取近一個月歷史價格（用於計算均線）
        try:
            hist = ticker.history(period="1mo")
            # 如果是上櫃股票，.TW 會抓不到資料，要換成 .TWO
            if hist.empty:
                ticker_two = f"{code}.TWO"
                ticker = yf.Ticker(ticker_two)
                hist = ticker.history(period="1mo")
        except Exception:
            hist = pd.DataFrame()
            
        tech_summary = calculate_technical_indicators(hist)
        
        # 2. 獲取最新新聞 (yfinance 的 news 欄位)
        try:
            news_data = ticker.news
            news_titles = [item['title'] for item in news_data[:3]] if news_data else ["今日無相關重大新聞..."]
        except Exception:
            news_titles = ["新聞爬取失敗"]
        
        # 3. 呼叫 AI 產生分析報告
        analysis_report = call_ai_for_analysis(f"{code} {name}", tech_summary, news_titles)
        
        # 4. 印出排版過的報告
        print("\n" + "★" * 60)
        print(f" 📈 【{code} {name}】 每日報告")
        print("★" * 60)
        print(f" ▌技術面：\n   {tech_summary}\n")
        print(" ▌最新新聞：")
        for idx, title in enumerate(news_titles, 1):
            print(f"   {idx}. {title}")
        print(f"\n ▌AI 操作建議：\n   {analysis_report}")
        print("=" * 60)
        
    print(f"\n✅ 今日分析報告已產生完畢！")

if __name__ == "__main__":
    main()
