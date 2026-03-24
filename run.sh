#!/bin/bash
cd "$(dirname "$0")"

# 安裝依賴（若尚未安裝）
pip3 install streamlit pandas yfinance --quiet

# 啟動
python3 -m streamlit run app.py
