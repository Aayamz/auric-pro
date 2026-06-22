"""Test open_trade via WebSocket to see what error the backend returns."""
import asyncio
import websockets
import json

async def test():
    uri = "ws://localhost:8000/ws/client?token=test_token"
    try:
        async with websockets.connect(uri) as ws:
            print("Connected to FastAPI WebSocket")

            # Read initial bridge_status message
            msg = await asyncio.wait_for(ws.recv(), timeout=3)
            print(f"Initial msg: {msg}")

            # Send open_trade command
            cmd = {
                "type": "open_trade",
                "pair": "XAUUSD",
                "direction": "BUY",
                "lots": 0.01,
                "sl": 3290.0,
                "tp": 3320.0
            }
            await ws.send(json.dumps(cmd))
            print(f"Sent: {cmd}")

            # Wait for response
            for _ in range(10):
                try:
                    resp = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(resp)
                    print(f"Response: {data}")
                    if data.get("type") in ("trade_opened", "trade_error"):
                        break
                except asyncio.TimeoutError:
                    print("Timeout waiting for response")
                    break
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
