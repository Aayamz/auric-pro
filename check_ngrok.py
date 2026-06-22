import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:4040/api/tunnels", timeout=5) as response:
        data = json.loads(response.read().decode("utf-8"))
        print("Tunnels info:")
        for t in data.get("tunnels", []):
            print(f"  Name: {t.get('name')}, URL: {t.get('public_url')}, Proto: {t.get('proto')}")
except Exception as e:
    print(f"Failed to query local Ngrok API: {e}")
