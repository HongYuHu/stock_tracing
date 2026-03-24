# 金玉峰投顧股票回測專案 — 交接文件

## 專案目標

從 [jinyufeng.com.tw](https://jinyufeng.com.tw) 抓取 2025-01-01 ~ 2026-03-23 的「買進」評等股票報告，
用 Apple Vision OCR 辨識圖片中的目標價，再用 yfinance 回測是否達標，計算年化報酬率。

---

## 環境與設定

- **主腳本**：`/Users/kai/jyf_backtest.py`
- **進度快取**：`/Users/kai/jyf_progress.json`（已處理 72 篇，不需重新抓取）
- **原始結果 CSV**：`/Users/kai/jyf_backtest_result.csv`
- **整理後 CSV**：`/Users/kai/jyf_backtest_clean.csv`
- **圖片快取**：`/tmp/jyf_images/`（77 個 PNG）
- **Python**：系統 Python 3.9（`/usr/bin/python3`）
- **依賴**：`requests`, `yfinance`, `Pillow`, `numpy`, `pyobjc-framework-Vision`, `pyobjc-framework-Quartz`

### API 資訊
```
BASE_API = 'https://prod-api.jinyufeng.com.tw/api'
REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IkpZRi0wNzNtOTM1...'
```
- Token 自動 refresh：`POST /member/refresh-token` with `{"refreshToken": "..."}`
- 2026 年文章無法透過分頁 API 取得，需直接 ID 掃描（805~870）

---

## 報告格式（2 種模板）

### 舊格式（2025 年 4~6 月初，代表：522, 527, 532...）
```
甜甜價   目標價   瘋狂價
$60      $99      $126

現價：73.8
```
- 三個欄位由左至右：甜甜 / 目標 / 瘋狂
- 現價帶冒號 `現價：73.8`

### 新格式（2025 年 6 月後，代表：570, 635, 847...）
```
         [目標價]   甜甜價   瘋狂價
         233        160      270

評等   買進
現價   179.5
```
- 目標價以大字顯示在中央，甜甜/瘋狂在右側小字
- 現價在下方表格（無冒號，換行格式）
- **重要**：目標價的數字有時與「元」字分在兩行（如：`...目標價233\n元，給予買進...`）

### 另一種變體（最新 2025-11 後部分報告）
```
目標價   甜甜價   瘋狂價
 155      95      215

現價（換行格式）
```
- 目標價在左側標題，大數字在中央偏左

---

## OCR 方法（Apple Vision Framework）

```python
import Vision, Quartz
from Foundation import NSURL

def apple_ocr(image_path):
    url = NSURL.fileURLWithPath_(image_path)
    src = Quartz.CGImageSourceCreateWithURL(url, None)
    cg  = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLanguages_(["zh-Hant", "en-US"])
    req.setUsesLanguageCorrection_(True)
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg, {})
    handler.performRequests_error_([req], None)
    obs = sorted(req.results(), key=lambda o: -o.boundingBox().origin.y)
    # Vision 座標 y=0 在底部，-y 排序 = 由上至下
    return [(o.topCandidates_(1)[0].string(),
             o.boundingBox().origin.x,
             o.boundingBox().origin.y) for o in obs]
```

OCR 輸出為 `(text, x, y)` 列表，**x/y 為 0~1 正規化座標**，y=1 為圖片頂部。

---

## 解析邏輯（已修正版）

### 目標價（最重要）
```python
# 在 full_text（整體字串含 \n）搜尋，可跨行比對
full_text = '\n'.join([t for t,x,y in obs])
m = re.search(r'目標價\s*(\d+(?:\.\d+)?)\s*元', full_text)
if m:
    target = float(m.group(1))
```
- 此方法解決了「目標價233」與「元，」分在兩行的問題（Article 847, 757 等）
- 部分報告格式為 `目標價 XXX`（無「元」字），需 fallback：找「目標價」標題後 x 位置相近的數字

### 甜甜價 / 瘋狂價（用 x 位置比對）
```python
# 找各標籤的 x 位置，再找 x 相近且 y 略低的數字
label_x = {}
for t, x, y in obs:
    if t.strip() in ('甜甜價','瘋狂價','目標價'):
        label_x[t.strip()] = (x, y)

def nearest_value(lx, ly):
    candidates = [(abs(x-lx), v, x, y)
                  for v,x,y in nums if y < ly and ly-y < 0.12]
    if candidates:
        return sorted(candidates)[0][1]
    return None
```

### 現價
```python
# 格式1：「現價：73.8」（舊格式）
cur = re.search(r'現價[：:]\s*(\d+(?:\.\d+)?)', full_text)
# 格式2：「現價\n643」（新格式，換行）
for i,(t,x,y) in enumerate(obs):
    if t.strip() == '現價' and i+1 < len(obs):
        nxt = obs[i+1][0].strip()
        if re.fullmatch(r'(\d+(?:\.\d+)?)', nxt):
            current_price = float(nxt)
```

---

## 價格關係驗證規則（使用者確認）

```
甜甜價 < 現價 < 目標價 < 瘋狂價
```

- **甜甜價**：相對低檔進場點，一定比現價低
- **瘋狂價**：一定比目標價高
- 可用此規則驗證 OCR 解析是否正確

---

## 目前狀態

### 已完成
- ✅ 72 篇買進報告全數抓取（51 篇 2025 年分頁 + 21 篇 2026 年 ID 掃描）
- ✅ Apple Vision OCR 辨識
- ✅ yfinance 回測（是否達到目標價）
- ✅ 年化報酬率計算（隔日買進，30 天後賣出，等權重）
- ✅ 修正 Article 847（國精化 4722）目標價 160 → 233
- ✅ 修正 Articles 570, 635, 648, 665, 757 目標價
- ✅ 修正甜甜/瘋狂價解析改用 x 位置比對

### 待完成（交接重點）

**1. 5 篇目標價仍為 None（句子解析失敗，需特殊處理）**

| AID | 公司 | 代號 | 日期 | 正確目標價 | 原因 |
|-----|------|------|------|-----------|------|
| 532 | 必應 | 6625 | 2025-05-06 | **99** | 報告寫「TP 99元」非「目標價XX元」格式 |
| 610 | 華景電 | 6788 | 2025-06-27 | **303** | 「目標價303，給予買進評等」缺「元」字 |
| 668 | 中華化 | 1727 | 2025-08-05 | **42.2** | 「目標\n標價 42.2 元」跨行且有空格 |
| 743 | 泰金-KY | 6629 | 2025-10-17 | **155** | 「目標\n標價 155 元」跨行 |
| 753 | 凌航 | 3135 | 2025-10-28 | **65** | 「目標\n價 65 元」跨行有空格 |

目前 progress.json 中這 5 篇儲存的值：
- 532: target=99（實際正確，但新 parser 找不到，不影響結果）
- 610: target=192（**錯誤**，應為 303；192 是甜甜價）
- 668: target=25（**錯誤**，應為 42.2；25 是甜甜價）
- 743: target=215（**錯誤**，應為 155；215 是瘋狂價）
- 753: target=39（**錯誤**，應為 65；39 是甜甜價）

**需修正的 3 筆（610, 668, 743, 753）後重新執行 yfinance 回測。**

**2. 甜甜/瘋狂價有約 15 筆顯示異常**（sw==crz 或 sw>cur）
主要是 OCR 只找到一個值而非兩個不同值。不影響回測，但影響 CSV 可讀性。

**3. 重新計算年化報酬率**（修正上述目標價後）

---

## 回測方法

```python
import yfinance as yf
from datetime import timedelta

# 買入：報告日隔天第一個交易日的開盤/收盤價
# 賣出：買入後第 30 天的收盤價
# 若賣出日 > 2026-03-24，視為「持倉中」不納入計算

for suffix in ['.TW', '.TWO']:
    df = yf.download(f'{code}{suffix}', start=pub_date, end='2026-03-25',
                     progress=False, auto_adjust=True)
```

---

## 上次計算的年化報酬率（尚未包含最新修正）

> 策略：報告出的隔天買進，30 天後賣出，等權重

| 指標 | 數值 |
|------|------|
| 已結算筆數 | 57 |
| 持倉中 | 7 |
| 無資料 | 4 |
| 勝率 | 59.6% |
| 平均月報酬 | +8.77% |
| 年化報酬率（算術） | +105.2% |
| 年化報酬率（幾何） | +131.0% |
| 最佳 | 燿華 2367 +100.0%（2026-01-05） |
| 最差 | 達運光電 8045 -19.8%（2025-08-22） |

---

## 下一步建議

1. 修正 progress.json 中 4 筆錯誤目標價：
   - `610`: 192 → **303**（華景電 6788）
   - `668`: 25 → **42.2**（中華化 1727）
   - `743`: 215 → **155**（泰金-KY 6629）
   - `753`: 39 → **65**（凌航 3135）

2. 重新執行這 4 筆的 yfinance 回測

3. 重建 CSV 檔案

4. 重新計算年化報酬率（含修正後數據）

5. （選用）修正 ~15 筆的甜甜/瘋狂價顯示問題

---

## 快速修正範例

```python
import json, yfinance as yf
from datetime import timedelta, datetime

with open('/Users/kai/jyf_progress.json') as f:
    p = json.load(f)

# 手動修正目標價
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

# 對每筆重新跑 yfinance backtest，更新 progress.json，重建 CSV
```
