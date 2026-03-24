@echo off
cd /d %~dp0
py -3 -m streamlit run app.py
pause
