import csv
import numpy as np

CSV_FILE = '/Users/kai/Documents/stock_sideproject/stock_test/jyf_backtest_60d_results.csv'

completed_returns = []
ongoing_returns = []
best_trade = None
worst_trade = None

with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if not row['報酬率(%)']:
            continue
            
        ret = float(row['報酬率(%)'])
        trade_info = f"{row['公司']} ({row['代號']}): {ret}%"
        
        if best_trade is None or ret > best_trade['ret']:
            best_trade = {'ret': ret, 'info': trade_info}
        if worst_trade is None or ret < worst_trade['ret']:
            worst_trade = {'ret': ret, 'info': trade_info}
            
        if row['狀態'] == '已結算':
            completed_returns.append(ret)
        elif '持倉中' in row['狀態']:
            ongoing_returns.append(ret)

# Completed stats
if completed_returns:
    win_count = sum(1 for r in completed_returns if r > 0)
    total_completed = len(completed_returns)
    win_rate = win_count / total_completed * 100
    avg_return = np.mean(completed_returns)
else:
    total_completed = 0; win_rate = 0; avg_return = 0

# Ongoing stats
if ongoing_returns:
    avg_ongoing = np.mean(ongoing_returns)
    ongoing_wins = sum(1 for r in ongoing_returns if r > 0)
    total_ongoing = len(ongoing_returns)
else:
    total_ongoing = 0; avg_ongoing = 0; ongoing_wins = 0

print("=== 60天策略（約兩個月）回測總結 ===")
print(f"總交易筆數: {total_completed + total_ongoing}")
print(f"|-- 已結算筆數: {total_completed}")
print(f"|-- 未滿60天(持倉中): {total_ongoing}")
print("\n[ 已結算部位表現 ]")
print(f"勝率: {win_rate:.1f}% ({win_count}/{total_completed})")
print(f"平均單筆報酬率: {avg_return:.2f}%")
print(f"年化報酬率(算術粗估): {avg_return * (365/60):.2f}%")
print(f"年化報酬率(幾何粗估): {((1 + avg_return/100)**(365/60) - 1)*100:.2f}%")

if total_ongoing > 0:
    print("\n[ 持倉中部位表現 (帳面未實現) ]")
    print(f"目前正報酬比例: {ongoing_wins/total_ongoing*100:.1f}% ({ongoing_wins}/{total_ongoing})")
    print(f"平均目前帳面報酬: {avg_ongoing:.2f}%")

print("\n[ 個股極值 (含所有部位) ]")
print(f"🏆 最佳獲利: {best_trade['info']}")
print(f"💔 最大虧損: {worst_trade['info']}")
