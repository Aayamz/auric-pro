import urllib.request
import json

NEXT_PUBLIC_SUPABASE_URL = "https://mzjsqfjkeajgywflvvyp.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16anNxZmprZWFqZ3l3Zmx2dnlwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ2Mjc1MCwiZXhwIjoyMDk3MDM4NzUwfQ.Ot54QRgtshb9yCusX80mlB8rvstmjB87Gfan1ksieg0"

def get_broker_accounts():
    url = f"{NEXT_PUBLIC_SUPABASE_URL}/rest/v1/broker_accounts?select=*"
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

accounts = get_broker_accounts()
print("Broker Accounts:")
for a in accounts:
    print(f"User: {a.get('user_id')}, Login: {a.get('login')}, Server: {a.get('server')}")
