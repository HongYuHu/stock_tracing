# 金玉峰投顧股票回測專案 (Stock Tracing)

本專案旨在針對 [金玉峰投顧](https://jinyufeng.com.tw) 提供的每日研究報告中，評等為「買進」的股票進行自動化回測分析。

## 🚀 專案目標
- 從 API 抓取 2025 年至今的各項研究報告。
- 利用 **Apple Vision OCR** 技術進行高精度的圖片文字辨識，擷取：目標價、現價、甜甜價與瘋狂價。
- 對接 **yfinance** 獲取歷史股價，實施多維度的回測策略。

## 📊 回測核心發現：持有 60 天策略
根據歷史數據回測分析，目前發現**最穩定且勝率最高**的買法是：**「報告出刊隔日買進，持有 60 天（約兩個月）結算賣出」**。

### 策略統計結果：
- **歷史勝率**：**70.9%** (已結算 55 筆中，39 筆獲利)
- **單筆平均報酬率**：**+14.16%**
- **預估年化報酬率**：約 **+120%** 以上 (複利計)

## 📂 檔案說明
- `jyf_backtest.py`: 主程式，包含 API 抓取、OCR 辨識與基礎回測邏輯。
- `jyf_progress.json`: 原始抓取進度與辨識結果。
- `jyf_backtest_60d_results.csv`: **(核心文件)** 針對 60 天持有策略的各股詳細回測報告。
- `analyze_strategies.py`: 多種策略（30天、60天、停利停損）的對比分析腳本。
- `summarize_60d.py`: 快速產出目前 60 天策略的績效統計。

## 🛠️ 環境需求
- Python 3.9+ 
- 依賴庫：`requests`, `yfinance`, `Pillow`, `numpy`, `pyobjc-framework-Vision` (Mac OS 專屬)

## 💡 注意事項
- **Apple Vision OCR** 高度依賴 macOS 系統，如在其他平台運行，OCR 模組需更換。
- 資料來源係由 API 擷取，回測僅供參考，不構成功投資建議。

---
*Created by [HongYuHu](https://github.com/HongYuHu)*
