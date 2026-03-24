# 股票追蹤系統 — 交接文件

> 最後更新：2026-03-24
> GitHub Repo：https://github.com/HongYuHu/stock_tracing

---

## 專案概述

這個專案分兩大部分：

### Part A：金玉峰回測（已完成）
- 用 Apple Vision OCR 解析金玉峰投顧每日研究報告圖片
- 抓取 2025-01 ~ 2026-03 所有「買進」報告，對接 yfinance 做回測
- **核心發現**：報告出刊隔日買進、持有 60 天賣出 → 勝率 70.9%，平均報酬 +14.16%
- 回測結果存在 `jyf_backtest_60d_results.csv`

### Part B：Streamlit 股票追蹤 UI（本次新增，已完成）
- `app.py`：雙分頁 Web UI，可本地或雲端部署
- **分頁一「我的持股」**：新增/追蹤/刪除個人持股，自動抓現價、算報酬率、60天到期提醒
- **分頁二「金玉峰追蹤」**：顯示 60 天策略持倉狀態、到期警示、歷史統計

---

## 檔案結構

```
tracking_tracing/
├── app.py                        ← Streamlit 主程式（核心）
├── requirements.txt              ← Python 依賴
├── portfolio.json                ← 個人持股資料（新增/刪除自動更新）
├── run.bat                       ← Windows 啟動腳本
├── run.sh                        ← Mac 啟動腳本
├── .streamlit/
│   └── secrets.toml              ← 本機密鑰（不 commit，見下方說明）
├── jyf_backtest_60d_results.csv  ← 金玉峰 60天回測結果（核心資料）
├── jyf_backtest.py               ← 原始回測腳本（macOS Only，Apple Vision OCR）
├── jyf_progress.json             ← 回測進度快取
├── analyze_strategies.py         ← 多策略比較腳本
├── summarize_60d.py              ← 60天統計輸出腳本
├── generate_60d_csv.py           ← 生成 60天 CSV 的腳本
└── fix_and_backtest.py           ← 補跑回測用腳本
```

---

## 在新電腦上繼續開發

### 1. Clone repo
```bash
git clone https://github.com/HongYuHu/stock_tracing
cd stock_tracing
```

### 2. 安裝依賴

**Windows：**
```bash
py -3 -m pip install -r requirements.txt
```

**Mac：**
```bash
pip3 install -r requirements.txt
```

### 3. 設定本地密鑰（雲端讀寫 portfolio.json 用）

建立 `.streamlit/secrets.toml`（此檔不會被 git 追蹤）：

```toml
GITHUB_TOKEN = "ghp_你的_Personal_Access_Token"
GITHUB_REPO  = "HongYuHu/stock_tracing"
```

> GitHub Token 申請：GitHub → Settings → Developer settings → Personal access tokens → 勾選 `repo`

**如果只在本地使用，不填這兩個值也沒關係**，持股資料會存在本地 `portfolio.json`。

### 4. 啟動

**Windows（雙擊）：** `run.bat`

**Mac：**
```bash
chmod +x run.sh
./run.sh
```

**或直接：**
```bash
# Windows
py -3 -m streamlit run app.py

# Mac
python3 -m streamlit run app.py
```

瀏覽器開啟 http://localhost:8501

---

## 雲端部署（Streamlit Community Cloud）

1. 前往 https://share.streamlit.io 並連結 GitHub
2. 選擇 repo `HongYuHu/stock_tracing`，Branch: `master`，Main file: `app.py`
3. **Advanced settings → Secrets** 填入：
   ```toml
   GITHUB_TOKEN = "ghp_你的token"
   GITHUB_REPO  = "HongYuHu/stock_tracing"
   ```
4. Deploy → 取得公開網址

> 免費方案。7天無人使用會休眠，開啟時等 ~30 秒喚醒即可。

---

## app.py 核心設計說明

### 現價抓取
```
fetch_prices_batch(codes)
  └─ yf.download() 批次下載全部股票（一次請求）
  └─ 先試 .TW，失敗再試 .TWO
  └─ @st.cache_data(ttl=300)  → 快取 5 分鐘
  └─ 交易時段（週一~五 09:00-13:30）自動每 5 分鐘 rerun
```

### 公司名稱自動填入
```
on_code_change()  → 輸入代號後觸發
  └─ _build_local_name_dict()  → 先查 jyf_backtest_60d_results.csv
  └─ lookup_company_name()     → 查無則 fallback 到 yfinance .info
  └─ @st.cache_data(ttl=86400) → 快取 24 小時
```

### 持股資料讀寫
```
load_portfolio() / save_portfolio()
  └─ 有 GITHUB_TOKEN → 走 GitHub Contents API（適合雲端）
  └─ 無 token        → 走本地 portfolio.json（適合本地開發）
```

---

## 目前持股（portfolio.json）

| 代號 | 公司 | 買入日 | 買入價 | 提醒 |
|------|------|--------|--------|------|
| 2330 | 台積電 | 2026-03-24 | 1800 | ✅ |
| 2430 | — | 2026-03-24 | 96 | ✅ |

> 這是測試資料，請在 app 上自行更新為實際持股。

---

## 待辦 / 可以繼續做的方向

- [ ] 定期自動更新 `jyf_backtest_60d_results.csv`（目前需手動跑 `jyf_backtest.py`，macOS Only）
- [ ] 加入 Email / Line Notify 到期通知
- [ ] 支援賣出記錄（標記已賣出、記錄賣出價）
- [ ] 多帳戶損益彙總圖表
