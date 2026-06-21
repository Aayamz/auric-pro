import urllib.request
import json

NEXT_PUBLIC_SUPABASE_URL = "https://mzjsqfjkeajgywflvvyp.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16anNxZmprZWFqZ3l3Zmx2dnlwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ2Mjc1MCwiZXhwIjoyMDk3MDM4NzUwfQ.Ot54QRgtshb9yCusX80mlB8rvstmjB87Gfan1ksieg0"

def get_trades(user_id):
    url = f"{NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trades?user_id=eq.{user_id}&order=opened_at.desc&select=*"
    req = urllib.request.Request(url, method="GET")
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body) if res_body else []
    except Exception as e:
        print(f"Error for user {user_id}: {e}")
        return []

for uid in ['597cbcf4-6cda-458d-b0af-67732f66df87', '618e0c66-fa09-422e-bc46-2d38231e4405']:
    trades = get_trades(uid)
    print(f"\nUser {uid} trades:")
    closed_trades = [t for t in trades if t.get("status") in ['closed', 'CLOSED', 'completed', 'COMPLETED', 'SL_HIT', 'TP1_HIT', 'TP2_HIT', 'TP3_HIT']]
    total_pnl = sum(float(t.get("pnl_usd") or 0) for t in closed_trades)
    print(f"  Closed trades count: {len(closed_trades)}")
    print(f"  Sum of P&L: {total_pnl:.2f}")
    print(f"  Last 10 trades:")
    for t in closed_trades[:10]:
        print(f"    Date: {t.get('opened_at')}, Pair: {t.get('pair')}, Dir: {t.get('direction')}, Lots: {t.get('lots')}, Entry: {t.get('open_price')}, Exit: {t.get('close_price')}, P&L: {t.get('pnl_usd')}, P&L R: {t.get('pnl_r')}")
