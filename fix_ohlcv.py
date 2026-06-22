"""Patch script: fix generate_local_mock_ohlcv in backend/main.py"""
import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Normalize to \n for matching
content = content.replace('\r\n', '\n').replace('\r', '\n')

# Find and replace the function block
start_marker = 'def generate_local_mock_ohlcv(pair: str, tf: str, bars: int) -> list:'
end_marker = '    data.reverse()\n    return data\n'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx == -1:
    print("ERROR: Could not find generate_local_mock_ohlcv")
    exit(1)

if end_idx == -1:
    print("ERROR: Could not find data.reverse() end marker")
    exit(1)

end_idx += len(end_marker)

old_block = content[start_idx:end_idx]
print(f"Found block ({len(old_block)} chars), replacing...")

new_block = '''def generate_local_mock_ohlcv(pair: str, tf: str, bars: int) -> list:
    now_sec = int(time.time())
    tf_minutes = 15
    if tf == "M1": tf_minutes = 1
    elif tf == "M5": tf_minutes = 5
    elif tf == "M15": tf_minutes = 15
    elif tf == "H1": tf_minutes = 60
    elif tf == "H4": tf_minutes = 240
    elif tf == "D1": tf_minutes = 1440

    tf_seconds = tf_minutes * 60

    # Use live price as anchor for the most recent bar
    base_price = 0.0
    latest = latest_prices.get(pair)
    if latest:
        base_price = latest.get("bid", 0.0)

    if base_price == 0.0 and MT5_AVAILABLE:
        try:
            if mt5.initialize():
                resolved = resolve_mt5_symbol(pair)
                tick = mt5.symbol_info_tick(resolved)
                if tick:
                    base_price = tick.bid
                else:
                    rates = mt5.copy_rates_from_pos(resolved, mt5.TIMEFRAME_M15, 0, 1)
                    if rates is not None and len(rates) > 0:
                        base_price = float(rates[0][4])
        except Exception:
            pass

    if base_price == 0.0:
        base_price = 3300.0

    # Align newest bar to the current completed bar boundary
    latest_bar_time = (now_sec // tf_seconds) * tf_seconds
    start_time = latest_bar_time - (bars - 1) * tf_seconds

    # Walk oldest-to-newest: timestamps and OHLCV always aligned — no .reverse() bug
    current_price = base_price - bars * 2.0

    data = []
    for i in range(bars):
        t = start_time + i * tf_seconds
        o = current_price
        change = (0.8 if i > bars * 0.5 else -0.2) + (hash((pair, t)) % 100) / 50.0 - 1.0
        import math
        c = round(o + change + math.sin(i * 0.3) * 1.5, 2)
        h = round(max(o, c) + abs(hash((pair, t, 'h')) % 100) / 80.0, 2)
        l = round(min(o, c) - abs(hash((pair, t, 'l')) % 100) / 80.0, 2)
        v = 100 + abs(hash((pair, t, 'v')) % 4900)
        data.append({
            "time": t,
            "open": round(o, 2),
            "high": h,
            "low": l,
            "close": c,
            "volume": v
        })
        current_price = c

    return data
'''

new_content = content[:start_idx] + new_block + content[end_idx:]

with open('backend/main.py', 'w', encoding='utf-8', newline='\n') as f:
    f.write(new_content)

print("SUCCESS: OHLCV mock function patched")
