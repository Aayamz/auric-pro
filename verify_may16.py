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
print(f"May 16 Trades:")
for i, t in enumerate(trades):
    opened_at = t.get("opened_at")
    if opened_at and "2026-05-16" in opened_at:
        print(f"Index {i+1}: Ticket {t.get('mt5_ticket')}, Direction: {t.get('direction')}, Lots: {t.get('lots')}, Entry: {t.get('open_price')}, Exit: {t.get('close_price')}, P&L: {t.get('pnl_usd')}, P&L R: {t.get('pnl_r')}")
