import urllib.request
import json

url = "http://127.0.0.1:8000/ohlcv?pair=XAUUSD&tf=M1&bars=5&user_id=618e0c66-fa09-422e-bc46-2d38231e4405"
try:
    with urllib.request.urlopen(url, timeout=5) as response:
        print("Status Code:", response.status)
        data = json.loads(response.read().decode("utf-8"))
        print("Data length:", len(data))
        print("Sample rate:", data[0] if data else "Empty")
except Exception as e:
    print("Error:", e)
