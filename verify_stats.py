import urllib.request
import json

NEXT_PUBLIC_SUPABASE_URL = "https://mzjsqfjkeajgywflvvyp.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16anNxZmprZWFqZ3l3Zmx2dnlwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ2Mjc1MCwiZXhwIjoyMDk3MDM4NzUwfQ.Ot54QRgtshb9yCusX80mlB8rvstmjB87Gfan1ksieg0"

def get_trades(user_id):
    url = f"{NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trades?user_id=eq.{user_id}&order=opened_at.asc&select=*"
    req = urllib.request.Request(url, method="GET")
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body) if res_body else []
    except Exception as e:
        print(f"Error: {e}")
        return []

trades = get_trades('597cbcf4-6cda-458d-b0af-67732f66df87')
print(f"Total trades: {len(trades)}")
sum_pnl = 0.0
wins = 0
r_sum = 0.0
by_day = {}
for i, t in enumerate(trades):
    pnl = float(t.get("pnl_usd") or 0)
    pnl_r = float(t.get("pnl_r") or 0)
    opened_at = t.get("opened_at")
    day = opened_at.split('T')[0] if opened_at else 'unknown'
    by_day[day] = by_day.get(day, 0) + pnl
    
    sum_pnl += pnl
    r_sum += pnl_r
    if pnl > 0:
        wins += 1
        
    print(f"{i+1}: Ticket: {t.get('mt5_ticket')}, Pair: {t.get('pair')}, P&L: {pnl}, P&L R: {pnl_r}, Date: {opened_at}")

win_rate = (wins / len(trades)) * 100 if trades else 0
avg_rr = r_sum / len(trades) if trades else 0
best_day = max(by_day.values()) if by_day else 0

print(f"\nCalculated Stats:")
print(f"Total P&L: {sum_pnl:.2f}")
print(f"Win Rate: {win_rate:.1f}%")
print(f"Avg R:R: {avg_rr:.2f}R")
print(f"Total Trades: {len(trades)}")
print(f"Best Day: ${best_day:.2f}")
