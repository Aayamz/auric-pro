import os
import urllib.request
import json
from cryptography.fernet import Fernet
import MetaTrader5 as mt5

NEXT_PUBLIC_SUPABASE_URL = "https://mzjsqfjkeajgywflvvyp.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16anNxZmprZWFqZ3l3Zmx2dnlwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTQ2Mjc1MCwiZXhwIjoyMDk3MDM4NzUwfQ.Ot54QRgtshb9yCusX80mlB8rvstmjB87Gfan1ksieg0"
DEFAULT_ENCRYPTION_KEY = b"fW8kZ2dUbWRKMWNmU0xYQzh6cDVxZ2M0djhkZ2hqa2w="

def get_fernet():
    return Fernet(DEFAULT_ENCRYPTION_KEY)

def decrypt_password(encrypted_pw: str) -> str:
    fernet = get_fernet()
    try:
        return fernet.decrypt(encrypted_pw.encode()).decode()
    except Exception as e:
        print(f"Decryption error: {e}. Falling back to plaintext.")
        return encrypted_pw

def get_account(user_id):
    url = f"{NEXT_PUBLIC_SUPABASE_URL}/rest/v1/broker_accounts?user_id=eq.{user_id}&limit=1"
    req = urllib.request.Request(url, method="GET")
    req.add_header("apikey", SUPABASE_SERVICE_ROLE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_SERVICE_ROLE_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode("utf-8")
            res = json.loads(res_body)
            return res[0] if res else None
    except Exception as e:
        print(f"Error: {e}")
        return None

user_id = "618e0c66-fa09-422e-bc46-2d38231e4405"
acc = get_account(user_id)
if acc:
    print(f"Account for {user_id}:")
    print(f"  Login: {acc['login']}")
    print(f"  Server: {acc['server']}")
    pw = decrypt_password(acc['credentials_enc'])
    print(f"  Decrypted Password: {pw}")
    
    if mt5.initialize():
        res = mt5.login(login=int(acc['login']), password=pw, server=acc['server'])
        print(f"  Login result: {res}")
        if not res:
            print(f"  Login error: {mt5.last_error()}")
        mt5.shutdown()
    else:
        print("  Failed to initialize MT5")
else:
    print("Account not found")
