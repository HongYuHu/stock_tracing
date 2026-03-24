#!/usr/bin/env python3
"""
金玉峰 每日報告 買進 股票回測腳本
使用 Apple Vision Framework OCR（精準度最高）
抓取 2025-01 ~ 2026-01 的買進報告，回測是否達到目標價
"""
import requests
import json
import re
import time
import csv
import os
from datetime import datetime
from io import BytesIO

import Vision
import Quartz
from Foundation import NSURL
from PIL import Image
import yfinance as yf
import numpy as np

# ── 設定 ──────────────────────────────────────────────────────────
BASE_API      = 'https://prod-api.jinyufeng.com.tw/api'
REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IkpZRi0wNzNtOTM1IiwibW9kZWwiOiJtZW1iZXIiLCJ0eXBlIjoicmVmcmVzaFRva2VuIiwiaWF0IjoxNzc0MTE0MDA1LCJleHAiOjE3NzQ3MTg4MDV9.tHKnVluf6MAZbk-MUq2ys-SkiKElT9ZIX3Gz7gWo-Ws'
START_DATE      = datetime(2025, 1, 1)
END_DATE        = datetime(2026, 3, 24)  # 含 2026-03-23
# 2026年文章無法透過分頁API取得，用ID範圍直接掃描
ID_SCAN_START   = 805   # 2025-12-23後的第一篇
ID_SCAN_END     = 870
OUTPUT_CSV    = '/Users/kai/jyf_backtest_result.csv'
PROGRESS_FILE = '/Users/kai/jyf_progress.json'
IMG_CACHE_DIR = '/tmp/jyf_images'
os.makedirs(IMG_CACHE_DIR, exist_ok=True)

# ── Token 管理 ────────────────────────────────────────────────────
_token_refreshed_at = None
_current_token = None

def get_valid_token():
    global _token_refreshed_at, _current_token
    now = datetime.now()
    if _current_token is None or (now - _token_refreshed_at).seconds > 3000:
        r = requests.post(
            f'{BASE_API}/member/refresh-token',
            json={'refreshToken': REFRESH_TOKEN},
            headers={'Content-Type': 'application/json'},
            timeout=15
        )
        r.raise_for_status()
        _current_token = r.json()['data']['accessToken']
        _token_refreshed_at = now
        print(f"  [Token refreshed at {now.strftime('%H:%M:%S')}]")
    return _current_token

def make_session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
        'Referer': 'https://jinyufeng.com.tw/',
        'Origin': 'https://jinyufeng.com.tw',
    })
    return s

def auth_get(session, url, **kwargs):
    """帶 Bearer token 的 GET，自動 refresh"""
    session.headers['Authorization'] = f'Bearer {get_valid_token()}'
    return session.get(url, **kwargs)


# ── 收集符合條件的文章 ─────────────────────────────────────────────
def collect_articles(session):
    matched = []

    # 方法1：分頁API（抓 2025 年文章）
    page = 1
    while True:
        r = auth_get(session, f'{BASE_API}/article', params={'page': page, 'size': 50}, timeout=15)
        data = r.json()['data']
        total_pages = data['totalPage']
        stop = False
        for a in data['articles']:
            pub = datetime.fromisoformat(a['publishDate'].replace('Z', '+00:00')).replace(tzinfo=None)
            if pub < START_DATE:
                stop = True
                break
            if pub < END_DATE and '買進' in a['title'] and a.get('researchResource') == 1:
                matched.append({'id': a['id'], 'date': a['publishDate'][:10], 'title': a['title']})
        print(f"  Page {page}/{total_pages} → {len(matched)} matches (分頁API)")
        if stop or page >= total_pages:
            break
        page += 1
        time.sleep(0.3)

    existing_ids = {a['id'] for a in matched}

    # 方法2：ID 掃描（補抓 2026 年文章，分頁API不回傳）
    print(f"  掃描 ID {ID_SCAN_START}~{ID_SCAN_END} 補抓 2026 年文章...")
    for aid in range(ID_SCAN_START, ID_SCAN_END + 1):
        if aid in existing_ids:
            continue
        try:
            r = auth_get(session, f'{BASE_API}/article/{aid}', timeout=8)
            if r.status_code != 200:
                continue
            d = r.json()['data']
            pub_raw = d.get('publishedAt') or d.get('publishDate', '')
            if not pub_raw:
                continue
            pub = datetime.fromisoformat(pub_raw.replace('Z', '+00:00')).replace(tzinfo=None)
            if pub < START_DATE or pub >= END_DATE:
                continue
            if '買進' not in d['title'] or d.get('researchResource') != 1:
                continue
            matched.append({'id': aid, 'date': pub_raw[:10], 'title': d['title']})
            print(f"    ✓ ID {aid}: {pub_raw[:10]} | {d['title'][:45]}")
        except Exception:
            pass
        time.sleep(0.1)

    # 按日期排序（新到舊）
    matched.sort(key=lambda x: x['date'], reverse=True)
    return matched


# ── Apple Vision OCR ──────────────────────────────────────────────
def apple_ocr(image_path):
    """使用 Apple Vision Framework 辨識圖片文字，回傳由上至下排列的字串列表"""
    url = NSURL.fileURLWithPath_(image_path)
    src = Quartz.CGImageSourceCreateWithURL(url, None)
    if not src:
        return []
    cg = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    if not cg:
        return []

    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLanguages_(["zh-Hant", "en-US"])
    req.setUsesLanguageCorrection_(True)
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg, {})
    ok, err = handler.performRequests_error_([req], None)
    if not ok:
        return []

    obs_list = list(req.results())
    # 由上至下排序（Vision 座標系 y=0 在底部，所以大 y = 上方）
    obs_list.sort(key=lambda o: -o.boundingBox().origin.y)
    return [o.topCandidates_(1)[0].string() for o in obs_list]


def download_and_ocr(img_url, cache_name):
    """下載圖片並 OCR，使用快取"""
    cache_path = os.path.join(IMG_CACHE_DIR, cache_name + '.png')
    if not os.path.exists(cache_path):
        r = requests.get(img_url, timeout=20)
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert('RGB')
        img.save(cache_path, 'PNG')
    return apple_ocr(cache_path)


# ── 解析 OCR 文字 ─────────────────────────────────────────────────
def parse_ocr_lines(lines):
    """
    從 Apple Vision OCR 結果提取關鍵欄位
    策略：
    1. 股票代號：找「公司名 XXXX」同行的4位數
    2. 目標價：優先找「目標價\nXXX元」或表格中的「133元」行
    3. 甜甜價/瘋狂價：從 $XXX 列中按位置推斷
    4. 現價：「現價：XX.X」
    """
    result = {
        'company_name': None,
        'stock_code': None,
        'sweet_price': None,
        'target_price': None,
        'crazy_price': None,
        'current_price': None,
    }

    full_text = '\n'.join(lines)

    # ── 1. 股票代號（4-5碼，排除年份）──
    for line in lines:
        m = re.search(r'([^\d\s]{2,6})\s+(\d{4,5})$', line.strip())
        if m:
            candidate = m.group(2)
            if not candidate.startswith('202'):
                result['company_name'] = m.group(1)
                result['stock_code']   = candidate
                break
    # fallback: 單獨一行 4 位數
    if not result['stock_code']:
        for line in lines:
            m = re.fullmatch(r'\s*(\d{4,5})\s*', line)
            if m and not m.group(1).startswith('202'):
                result['stock_code'] = m.group(1)
                break

    # ── 2. 目標價 ──
    # 【最優先】從敘述句找「目標價XXX元」，在 full_text 搜尋（\s* 可跨行比對）
    # e.g. "目標價190元" 同行，或 "目標價233\n元" 跨行
    m = re.search(r'目標價\s*(\d+(?:\.\d+)?)\s*元', full_text)
    if m:
        result['target_price'] = float(m.group(1))

    # 【次要】投資建議表格中獨立的「XXX元」行（緊接在「目標價」標題行後）
    if result['target_price'] is None:
        for i, line in enumerate(lines):
            if line.strip() == '目標價' and i + 1 < len(lines):
                nxt = re.search(r'^(\d+(?:\.\d+)?)\s*元$', lines[i+1].strip())
                if nxt:
                    result['target_price'] = float(nxt.group(1))
                    break

    # ── 3. 甜甜價 / 瘋狂價 / 目標價（從欄位區塊對應）──
    # 找到三個標籤，再找緊接的數字（$XXX 或純數字），按標籤順序對應
    label_order = []
    label_positions = {}   # label -> line index
    for i, line in enumerate(lines):
        s = line.strip()
        if s in ('甜甜價', '瘋狂價', '目標價'):
            label_order.append(s)
            label_positions[s] = i

    # 收集數字值（$XXX 或獨立數字行），記錄行號
    price_items = []   # (line_index, value)
    for i, line in enumerate(lines):
        s = line.strip()
        m = re.fullmatch(r'\$\s*(\d+(?:\.\d+)?)', s)
        if not m:
            m = re.fullmatch(r'(\d{2,4}(?:\.\d+)?)', s)  # 純數字（排除單位數）
        if m:
            price_items.append((i, float(m.group(1))))

    # 依標籤位置，找每個標籤後最近的數字
    label_map = {}
    for label in label_order:
        lpos = label_positions[label]
        # 找在標籤之後最近的數字行
        for pidx, pval in price_items:
            if pidx > lpos:
                label_map[label] = pval
                break

    result['sweet_price'] = label_map.get('甜甜價')
    result['crazy_price'] = label_map.get('瘋狂價')
    if result['target_price'] is None:
        result['target_price'] = label_map.get('目標價')

    # ── 4. 現價（兩種格式：「現價：93.3」或「現價\n93.3」）──
    cur = re.search(r'現價[：:]\s*(\d+(?:\.\d+)?)', full_text)
    if cur:
        result['current_price'] = float(cur.group(1))
    else:
        for i, line in enumerate(lines):
            if line.strip() == '現價' and i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                m = re.fullmatch(r'(\d+(?:\.\d+)?)', nxt)
                if m:
                    result['current_price'] = float(m.group(1))
                    break

    return result


def ocr_article(session, article_id):
    """取得文章第2張圖片（fallback第1張）並 OCR"""
    r = auth_get(session, f'{BASE_API}/article/{article_id}', timeout=15)
    d = r.json()['data']
    content = json.loads(d['content'])
    images = [x['attrs']['src'] for x in content['content'] if x.get('type') == 'image']
    if not images:
        return None

    priority = [1, 0] if len(images) > 1 else [0]
    for idx in priority:
        try:
            img_id = images[idx].split('/')[-1]
            lines = download_and_ocr(images[idx], f'{article_id}_{idx}_{img_id[:8]}')
            parsed = parse_ocr_lines(lines)
            if parsed['stock_code'] and parsed['target_price']:
                return parsed
        except Exception as e:
            print(f"    圖片{idx+1} 失敗: {e}")

    # 最終 fallback：回傳任何結果
    try:
        img_id = images[0].split('/')[-1]
        lines = download_and_ocr(images[0], f'{article_id}_0_{img_id[:8]}')
        return parse_ocr_lines(lines)
    except Exception as e:
        print(f"    所有圖片失敗: {e}")
        return None


# ── yfinance 回測 ─────────────────────────────────────────────────
def backtest_stock(stock_code, target_price, pub_date_str):
    """
    從 pub_date 到今天，檢查最高價是否曾達到 target_price。
    回傳: ticker, reached_target(bool), reached_date, max_price
    """
    today = datetime.today().strftime('%Y-%m-%d')

    for suffix in ['.TW', '.TWO']:
        sym = f'{stock_code}{suffix}'
        try:
            df = yf.download(sym, start=pub_date_str, end=today,
                             progress=False, auto_adjust=True)
            if df.empty:
                continue

            high = df['High']
            # 處理 MultiIndex（yfinance 有時回傳 MultiIndex）
            if hasattr(high, 'columns'):
                high = high.iloc[:, 0]

            high = high.dropna()
            if high.empty:
                continue

            reached = high[high >= target_price]
            max_high = float(high.max())

            if not reached.empty:
                reached_date = str(reached.index[0])[:10]
                return {'ticker': sym, 'reached_target': True,
                        'reached_date': reached_date, 'max_price': round(max_high, 2)}
            else:
                return {'ticker': sym, 'reached_target': False,
                        'reached_date': None, 'max_price': round(max_high, 2)}
        except Exception as e:
            continue

    return {'ticker': f'{stock_code}.TW', 'reached_target': None,
            'reached_date': None, 'max_price': None}


# ── 主程式 ────────────────────────────────────────────────────────
def main():
    print("=== 金玉峰 買進報告 回測程式（Apple Vision OCR）===\n")

    session = make_session()

    # 1. 收集文章
    print("1. 收集 2025-01 ~ 2026-01 買進文章...")
    articles = collect_articles(session)
    print(f"   共找到 {len(articles)} 篇\n")

    # 2. 載入進度
    progress = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
            progress = json.load(f)
        print(f"   載入進度: 已處理 {len(progress)} 篇\n")

    # 3. 處理每篇文章
    print("2. OCR + 回測...\n")
    results = []

    for i, art in enumerate(articles):
        art_id    = art['id']
        art_date  = art['date']
        art_title = art['title']
        key       = str(art_id)

        print(f"  [{i+1:02d}/{len(articles)}] {art_date} | {art_title[:45]}...")

        if key in progress:
            results.append(progress[key])
            row = progress[key]
            print(f"    ✓ 已有進度: {row.get('stock_code')} 目標:{row.get('target_price')} 達標:{row.get('reached_target')}")
            continue

        row = {
            'article_id': art_id, 'date': art_date, 'title': art_title,
            'company_name': None, 'stock_code': None,
            'sweet_price': None, 'target_price': None, 'crazy_price': None,
            'current_price_at_report': None,
            'ticker': None, 'reached_target': None,
            'reached_date': None, 'max_price_since': None,
        }

        # OCR
        try:
            ocr = ocr_article(session, art_id)
            if ocr:
                row['company_name']            = ocr.get('company_name')
                row['stock_code']              = ocr.get('stock_code')
                row['sweet_price']             = ocr.get('sweet_price')
                row['target_price']            = ocr.get('target_price')
                row['crazy_price']             = ocr.get('crazy_price')
                row['current_price_at_report'] = ocr.get('current_price')
        except Exception as e:
            print(f"    OCR 錯誤: {e}")

        # 回測
        if row['stock_code'] and row['target_price']:
            bt = backtest_stock(row['stock_code'], row['target_price'], art_date)
            row['ticker']          = bt['ticker']
            row['reached_target']  = bt['reached_target']
            row['reached_date']    = bt['reached_date']
            row['max_price_since'] = bt['max_price']
            status = '✅達標' if bt['reached_target'] else ('❌未達' if bt['reached_target'] is False else '⚠️無資料')
            print(f"    代號:{row['stock_code']} | 目標:{row['target_price']} | 最高:{bt['max_price']} | {status}")
            if bt['reached_date']:
                print(f"    達標日: {bt['reached_date']}")
        else:
            print(f"    ⚠️  代號:{row['stock_code']} 目標:{row['target_price']} (無法回測)")

        results.append(row)
        progress[key] = row

        # 儲存進度
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

        time.sleep(0.3)

    # 4. 輸出 CSV
    print(f"\n3. 輸出 CSV → {OUTPUT_CSV}")
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

    # 5. 統計
    total      = len(results)
    with_code  = sum(1 for r in results if r['stock_code'])
    reached    = sum(1 for r in results if r['reached_target'] is True)
    not_reached= sum(1 for r in results if r['reached_target'] is False)
    no_data    = sum(1 for r in results if r['reached_target'] is None)

    print("\n=== 統計結果 ===")
    print(f"總文章數:       {total}")
    print(f"成功辨識代號:   {with_code}  ({with_code/total*100:.0f}%)")
    print(f"✅ 達到目標價:  {reached}")
    print(f"❌ 未達目標價:  {not_reached}")
    print(f"⚠️  無股價資料:  {no_data}")
    if reached + not_reached > 0:
        print(f"達標率:         {reached/(reached+not_reached)*100:.1f}%")
    print(f"\nCSV 已儲存至: {OUTPUT_CSV}")


if __name__ == '__main__':
    main()
