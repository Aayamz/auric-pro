import urllib.request

try:
    with urllib.request.urlopen("http://127.0.0.1:8000/docs", timeout=2) as response:
        print("FastAPI is running! Status:", response.status)
except Exception as e:
    print("FastAPI is NOT running:", e)

try:
    with urllib.request.urlopen("http://localhost:3000/", timeout=2) as response:
        print("Next.js is running! Status:", response.status)
except Exception as e:
    print("Next.js is NOT running:", e)
