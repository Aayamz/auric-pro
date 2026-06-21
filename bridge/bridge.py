# bridge.py — runs on user's Windows PC alongside MT5
# Establishes outbound WSS connection to AURIC cloud
# Streams prices, positions, OHLCV
# Receives and executes trade commands

import asyncio
import json
import os
import sys
import argparse
import random
from datetime import datetime
import websockets

# Optional dependencies handled gracefully
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

try:
    from cryptography.fernet import Fernet
    FERNET_AVAILABLE = True
except ImportError:
    FERNET_AVAILABLE = False

try:
    import pystray
    from PIL import Image, ImageDraw
    PRAY_AVAILABLE = True
except ImportError:
    PRAY_AVAILABLE = False

CONFIG_FILE = "bridge_config.json"
DEFAULT_ENCRYPTION_KEY = b"fW8kZ2dUbWRKMWNmU0xYQzh6cDVxZ2M0djhkZ2hqa2w="  # Static fallback key for MVP

def get_fernet():
    if not FERNET_AVAILABLE:
        return None
    encryption_key = os.getenv("ENCRYPTION_KEY", "").encode()
    if not encryption_key:
        encryption_key = DEFAULT_ENCRYPTION_KEY
    try:
        return Fernet(encryption_key)
    except Exception:
        return Fernet(DEFAULT_ENCRYPTION_KEY)

def run_setup():
    print("=== AURIC PRO BRIDGE SETUP WIZARD ===")
    server = input("Enter MT5 Server Name (e.g. MetaQuotes-Demo): ").strip()
    login_str = input("Enter MT5 Login ID: ").strip()
    password = input("Enter MT5 Password: ").strip()
    
    try:
        login = int(login_str)
    except ValueError:
        print("Error: Login must be an integer.")
        sys.exit(1)
        
    config = {
        "server": server,
        "login": login,
        "password": password
    }
    
    # Encrypt config values if cryptography is installed
    fernet = get_fernet()
    if fernet:
        encrypted_config = {
            "server": fernet.encrypt(server.encode()).decode(),
            "login": login,
            "password": fernet.encrypt(password.encode()).decode()
        }
    else:
        print("Warning: cryptography package not installed. Storing credentials in plaintext.")
        encrypted_config = config
        
    with open(CONFIG_FILE, "w") as f:
        json.dump(encrypted_config, f, indent=2)
        
    print(f"Setup complete! Credentials saved securely in {CONFIG_FILE}.")
    sys.exit(0)

def load_credentials():
    if not os.path.exists(CONFIG_FILE):
        print(f"Error: Credentials file {CONFIG_FILE} not found. Please run with --setup first.")
        sys.exit(1)
        
    with open(CONFIG_FILE, "r") as f:
        config = json.load(f)
        
    fernet = get_fernet()
    if fernet and isinstance(config.get("server"), str) and len(config.get("server")) > 30:
        try:
            return {
                "server": fernet.decrypt(config["server"].encode()).decode(),
                "login": config["login"],
                "password": fernet.decrypt(config["password"].encode()).decode()
            }
        except Exception as e:
            print(f"Error decrypting credentials: {e}. Check your ENCRYPTION_KEY.")
            sys.exit(1)
    return config

def resolve_mt5_symbol(symbol):
    if not MT5_AVAILABLE:
        return symbol
    # Try direct selection first
    if mt5.symbol_select(symbol, True):
        info = mt5.symbol_info(symbol)
        if info and getattr(info, 'trade_mode', 4) != 0:
            return symbol
    # Try suffix / substring matching across broker symbols
    symbols = mt5.symbols_get()
    if symbols:
        # Find all matching symbols
        matches = [s for s in symbols if symbol.upper() in s.name.upper()]
        # 1. Look for a matching symbol that is tradable (trade_mode != 0)
        for s in matches:
            if getattr(s, 'trade_mode', 4) != 0:
                if mt5.symbol_select(s.name, True):
                    print(f"Mapped symbol {symbol} to tradable terminal symbol {s.name}")
                    return s.name
        # 2. Fallback to any matching symbol if no fully tradable one is found
        for s in matches:
            if mt5.symbol_select(s.name, True):
                print(f"Mapped symbol {symbol} to terminal symbol {s.name} (fallback)")
                return s.name
    return symbol

def fetch_real_ohlcv(pair, tf, bars):
    if not MT5_AVAILABLE:
        return []
    try:
        if mt5.initialize():
            resolved = resolve_mt5_symbol(pair)
            
            mt5_tf = mt5.TIMEFRAME_M15
            if tf == "M1": mt5_tf = mt5.TIMEFRAME_M1
            elif tf == "M5": mt5_tf = mt5.TIMEFRAME_M5
            elif tf == "M15": mt5_tf = mt5.TIMEFRAME_M15
            elif tf == "H1": mt5_tf = mt5.TIMEFRAME_H1
            elif tf == "H4": mt5_tf = mt5.TIMEFRAME_H4
            elif tf == "D1": mt5_tf = mt5.TIMEFRAME_D1
            
            rates = mt5.copy_rates_from_pos(resolved, mt5_tf, 0, bars)
            if rates is not None and len(rates) > 0:
                data = []
                for r in rates:
                    data.append({
                        "time": int(r[0]), # seconds
                        "open": float(r[1]),
                        "high": float(r[2]),
                        "low": float(r[3]),
                        "close": float(r[4]),
                        "volume": int(r[5])
                    })
                return data
    except Exception as e:
        print(f"Error copying rates in bridge: {e}")
    return []

def generate_mock_ohlcv(pair, tf, bars):
    import time
    now_ms = int(time.time() * 1000)
    tf_minutes = 15
    if tf == "M1": tf_minutes = 1
    elif tf == "M5": tf_minutes = 5
    elif tf == "H1": tf_minutes = 60
    elif tf == "H4": tf_minutes = 240
    
    base_price = 1950.0
    if "EURUSD" in pair: base_price = 1.0850
    elif "GBPUSD" in pair: base_price = 1.2650
    elif "USDJPY" in pair: base_price = 151.50
    
    data = []
    current_price = base_price
    for i in range(bars - 1, -1, -1):
        t = now_ms - (bars - 1 - i) * tf_minutes * 60 * 1000
        c = current_price
        o = c - random.uniform(-3, 3)
        h = max(o, c) + random.uniform(0, 1.5)
        l = min(o, c) - random.uniform(0, 1.5)
        v = random.randint(100, 5000)
        data.append({
            "time": t // 1000,
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": v
        })
        current_price = o
    data.reverse()
    return data

# Mock State for non-Windows or Mock verification
mock_positions = []
mock_bid = 1950.0
mock_ask = 1950.5

async def mock_price_stream(ws):
    global mock_bid, mock_ask
    while True:
        # Simulate small price changes for XAUUSD
        change = random.uniform(-0.5, 0.5)
        mock_bid = round(mock_bid + change, 2)
        mock_ask = round(mock_bid + 0.5, 2)
        await ws.send(json.dumps({
            "type": "price",
            "pair": "XAUUSD",
            "bid": mock_bid,
            "ask": mock_ask,
            "time": int(datetime.now().timestamp() * 1000)
        }))
        await asyncio.sleep(0.5)

async def mock_position_stream(ws):
    while True:
        # Update unrealized profit for mock positions
        for p in mock_positions:
            entry = p["open_price"]
            direction = p["type"]
            current = mock_ask if direction == "BUY" else mock_bid
            diff = (current - entry) if direction == "BUY" else (entry - current)
            p["current_price"] = current
            p["profit"] = round(diff * p["volume"] * 100, 2)  # Simplified pip value
        
        # Simulating balance & equity variations
        total_profit = sum(p["profit"] for p in mock_positions)
        balance = 10000.00
        equity = round(balance + total_profit, 2)

        await ws.send(json.dumps({
            "type": "positions",
            "data": mock_positions,
            "balance": balance,
            "equity": equity
        }))
        await asyncio.sleep(2.0)

def execute_mock_trade(cmd):
    ticket = random.randint(100000, 999999)
    position = {
        "ticket": ticket,
        "symbol": cmd.get("pair", "XAUUSD"),
        "type": cmd.get("direction", "BUY"),
        "volume": cmd.get("lots", 0.01),
        "open_price": mock_ask if cmd.get("direction") == "BUY" else mock_bid,
        "current_price": mock_ask if cmd.get("direction") == "BUY" else mock_bid,
        "profit": 0.0,
        "sl": cmd.get("sl"),
        "tp": cmd.get("tp")
    }
    mock_positions.append(position)
    print(f"[MOCK] Opened position {ticket}: {position}")
    return position

async def real_price_stream(ws):
    terminal_symbol = resolve_mt5_symbol("XAUUSD")
    print(f"Using MT5 Symbol for price stream: {terminal_symbol}")
    while True:
        tick = mt5.symbol_info_tick(terminal_symbol)
        if tick:
            await ws.send(json.dumps({
                "type": "price",
                "pair": "XAUUSD",
                "bid": tick.bid,
                "ask": tick.ask,
                "time": int(tick.time_msc)
            }))
        await asyncio.sleep(0.5)

async def real_position_stream(ws):
    while True:
        positions = mt5.positions_get()
        data = []
        if positions:
            for p in positions:
                # Map tuple/object to dict
                p_dict = p._asdict() if hasattr(p, "_asdict") else dict(p)
                # Ensure compatibility with frontend expected fields
                data.append({
                    "ticket": p_dict.get("ticket"),
                    "symbol": p_dict.get("symbol"),
                    "type": "BUY" if p_dict.get("type") == 0 else "SELL",
                    "volume": p_dict.get("volume"),
                    "open_price": p_dict.get("price_open"),
                    "current_price": p_dict.get("price_current"),
                    "profit": p_dict.get("profit")
                })
        
        # Query account info for live balance & equity
        acc_info = mt5.account_info()
        balance = acc_info.balance if acc_info else 10000.00
        equity = acc_info.equity if acc_info else 10000.00

        await ws.send(json.dumps({
            "type": "positions",
            "data": data,
            "balance": balance,
            "equity": equity
        }))
        await asyncio.sleep(2.0)

def send_order_with_filling_fallback(request):
    if not MT5_AVAILABLE:
        return None
    # Try different filling modes because brokers have strict requirements (FOK, IOC, RETURN)
    filling_modes = [
        mt5.ORDER_FILLING_FOK,
        mt5.ORDER_FILLING_IOC,
        mt5.ORDER_FILLING_RETURN
    ]
    last_result = None
    for fill_mode in filling_modes:
        request["type_filling"] = fill_mode
        last_result = mt5.order_send(request)
        if last_result and last_result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]:
            print(f"MT5 Order executed successfully with filling mode: {fill_mode}")
            return last_result
        else:
            ret_code = last_result.retcode if last_result else 'Unknown'
            print(f"MT5 Order failed with filling mode {fill_mode}: retcode={ret_code}")
    return last_result

def execute_real_trade(cmd):
    # Prepare trade request
    symbol = cmd.get("pair", "XAUUSD")
    direction = cmd.get("direction", "BUY")
    lots = cmd.get("lots", 0.01)
    
    # Resolve to broker terminal symbol variation
    terminal_symbol = resolve_mt5_symbol(symbol)
    
    # Initialize symbol if not initialized
    mt5.symbol_select(terminal_symbol, True)
    
    info = mt5.symbol_info(terminal_symbol)
    if not info:
        print(f"Error: Symbol {terminal_symbol} not found on server.")
        return None
        
    action_type = mt5.ORDER_TYPE_BUY if direction == "BUY" else mt5.ORDER_TYPE_SELL
    price = mt5.symbol_info_tick(terminal_symbol).ask if direction == "BUY" else mt5.symbol_info_tick(terminal_symbol).bid
    
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": terminal_symbol,
        "volume": lots,
        "type": action_type,
        "price": price,
        "sl": float(cmd["sl"]) if cmd.get("sl") else 0.0,
        "tp": float(cmd["tp"]) if cmd.get("tp") else 0.0,
        "deviation": 20,
        "magic": 202400,
        "comment": "AURIC Cloud Trade",
        "type_time": mt5.ORDER_TIME_GTC,
    }
    
    result = send_order_with_filling_fallback(request)
    print(f"MT5 final execution result: {result}")
    return result

async def command_listener(ws, is_mock):
    async for message in ws:
        try:
            cmd = json.loads(message)
            print(f"Received cloud command: {cmd}")
            cmd_type = cmd.get("type")
            
            if cmd_type == "open_trade":
                if is_mock:
                    pos = execute_mock_trade(cmd)
                    if pos:
                        await ws.send(json.dumps({
                            "type": "trade_opened",
                            "ticket": pos["ticket"],
                            "pair": pos["symbol"],
                            "direction": pos["type"],
                            "lots": pos["volume"],
                            "open_price": pos["open_price"]
                        }))
                else:
                    result = execute_real_trade(cmd)
                    if result and result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]:
                        await ws.send(json.dumps({
                            "type": "trade_opened",
                            "ticket": result.order,
                            "pair": cmd.get("pair", "XAUUSD"),
                            "direction": cmd.get("direction"),
                            "lots": cmd.get("lots"),
                            "open_price": result.price
                        }))
                    else:
                        retcode = result.retcode if result else "no_result"
                        comment = result.comment if result else "Unknown error"
                        await ws.send(json.dumps({
                            "type": "trade_error",
                            "message": f"MT5 order failed: retcode={retcode} — {comment}"
                        }))
            elif cmd_type == "close_trade":
                ticket = cmd.get("ticket")
                if is_mock:
                    global mock_positions
                    mock_positions = [p for p in mock_positions if p["ticket"] != ticket]
                    print(f"[MOCK] Closed position: {ticket}")
                    await ws.send(json.dumps({
                        "type": "trade_closed",
                        "ticket": ticket
                    }))
                else:
                    # MT5 Close Deal
                    # Find open position
                    positions = mt5.positions_get(ticket=ticket)
                    if positions:
                        pos = positions[0]
                        symbol = pos.symbol
                        lots = pos.volume
                        action_type = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
                        price = mt5.symbol_info_tick(symbol).bid if pos.type == 0 else mt5.symbol_info_tick(symbol).ask
                        request = {
                            "action": mt5.TRADE_ACTION_DEAL,
                            "symbol": symbol,
                            "volume": lots,
                            "type": action_type,
                            "position": ticket,
                            "price": price,
                            "deviation": 20,
                            "magic": 202400,
                            "comment": "AURIC Close Trade",
                            "type_time": mt5.ORDER_TIME_GTC,
                        }
                        result = send_order_with_filling_fallback(request)
                        print(f"MT5 position close result: {result}")
                        if result and result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]:
                            await ws.send(json.dumps({
                                "type": "trade_closed",
                                "ticket": ticket
                            }))
                        else:
                            retcode = result.retcode if result else "no_result"
                            await ws.send(json.dumps({
                                "type": "trade_error",
                                "message": f"MT5 position close failed: retcode={retcode}"
                            }))
            elif cmd_type == "modify_trade":
                ticket = cmd.get("ticket")
                sl = cmd.get("sl")
                tp = cmd.get("tp") if cmd.get("tp") is not None else cmd.get("tp1")
                if is_mock:
                    for p in mock_positions:
                        if p["ticket"] == ticket:
                            if sl is not None: p["sl"] = sl
                            if tp is not None: p["tp"] = tp
                            print(f"[MOCK] Modified position {ticket}: sl={sl}, tp={tp}")
                    await ws.send(json.dumps({
                        "type": "trade_modified",
                        "ticket": ticket
                    }))
                else:
                    # MT5 Modify SL/TP
                    positions = mt5.positions_get(ticket=ticket)
                    if positions:
                        pos = positions[0]
                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "position": ticket,
                            "sl": float(sl) if sl else pos.sl,
                            "tp": float(tp) if tp else pos.tp
                        }
                        result = mt5.order_send(request)
                        print(f"MT5 modify result: {result}")
                        if result and result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]:
                            await ws.send(json.dumps({
                                "type": "trade_modified",
                                "ticket": ticket
                            }))
                        else:
                            retcode = result.retcode if result else "no_result"
                            await ws.send(json.dumps({
                                "type": "trade_error",
                                "message": f"MT5 modify failed: retcode={retcode}"
                            }))
            elif cmd_type == "fetch_ohlcv":
                req_id = cmd.get("request_id")
                pair = cmd.get("pair", "XAUUSD")
                tf = cmd.get("tf", "M15")
                bars = int(cmd.get("bars", 200))
                
                ohlcv_data = []
                if is_mock:
                    ohlcv_data = generate_mock_ohlcv(pair, tf, bars)
                else:
                    ohlcv_data = fetch_real_ohlcv(pair, tf, bars)
                
                await ws.send(json.dumps({
                    "type": "ohlcv_data",
                    "request_id": req_id,
                    "data": ohlcv_data
                }))
        except Exception as e:
            print(f"Error handling message: {e}")

async def run_bridge(ws_url, token, is_mock, creds=None):
    print(f"Connecting to AURIC Cloud WebSocket: {ws_url}")
    
    # Dynamically handle websockets library version differences
    import inspect
    connect_kwargs = {}
    headers = {"Authorization": f"Bearer {token}"}
    try:
        connect_sig = inspect.signature(websockets.connect)
        if "additional_headers" in connect_sig.parameters:
            connect_kwargs["additional_headers"] = headers
        else:
            connect_kwargs["extra_headers"] = headers
    except Exception:
        # Fallback default
        connect_kwargs["additional_headers"] = headers

    delay = 1
    while True:
        try:
            async with websockets.connect(
                ws_url,
                **connect_kwargs
            ) as ws:
                print("Connected! Sending hello packet...")
                await ws.send(json.dumps({
                    "type": "bridge_hello",
                    "version": "1.0",
                    "is_mock": is_mock
                }))
                
                # Reset reconnect delay on successful connection
                delay = 1
                
                if is_mock:
                    print("Running bridge in MOCK mode...")
                    await asyncio.gather(
                        mock_price_stream(ws),
                        mock_position_stream(ws),
                        command_listener(ws, is_mock=True)
                    )
                else:
                    print("Running bridge in LIVE MT5 mode...")
                    if not creds:
                        creds = load_credentials()
                    
                    # Step 1: Initialize MT5 terminal connection
                    if not mt5.initialize(timeout=10000):
                        print(f"MT5 initialize() failed: {mt5.last_error()}. Falling back to MOCK mode.")
                        mt5.shutdown()
                        is_mock = True
                        await ws.send(json.dumps({
                            "type": "bridge_hello",
                            "version": "1.0",
                            "is_mock": True
                        }))
                        await asyncio.gather(
                            mock_price_stream(ws),
                            mock_position_stream(ws),
                            command_listener(ws, is_mock=True)
                        )
                        return
                    
                    # Step 2: Authenticate with credentials
                    if not mt5.login(
                        login=creds["login"],
                        password=creds["password"],
                        server=creds["server"],
                        timeout=10000
                    ):
                        print(f"MT5 login() failed: {mt5.last_error()}. Falling back to MOCK mode.")
                        mt5.shutdown()
                        is_mock = True
                        await ws.send(json.dumps({
                            "type": "bridge_hello",
                            "version": "1.0",
                            "is_mock": True
                        }))
                        await asyncio.gather(
                            mock_price_stream(ws),
                            mock_position_stream(ws),
                            command_listener(ws, is_mock=True)
                        )
                        return

                    acc_info = mt5.account_info()
                    if acc_info:
                        print(f"MT5 connected — login={acc_info.login}, server={acc_info.server}, balance={acc_info.balance}, equity={acc_info.equity}")

                    await asyncio.gather(
                        real_price_stream(ws),
                        real_position_stream(ws),
                        command_listener(ws, is_mock=False)
                    )
        except (websockets.exceptions.ConnectionClosed, OSError) as e:
            print(f"Connection error: {e}. Reconnecting in {delay}s...")
            if not is_mock and MT5_AVAILABLE:
                mt5.shutdown()
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)

def main():
    parser = argparse.ArgumentParser(description="AURIC PRO MetaTrader 5 Python Bridge")
    parser.add_argument("--setup", action="store_true", help="Run the credentials setup wizard")
    parser.add_argument("--token", type=str, help="AURIC User JWT authentication token")
    parser.add_argument("--ws-url", type=str, default="ws://localhost:8000/ws/bridge", help="AURIC Cloud WebSocket URL")
    parser.add_argument("--mock", action="store_true", help="Force mock data execution mode")
    parser.add_argument("--login", type=int, help="MetaTrader 5 login ID")
    parser.add_argument("--password", type=str, help="MetaTrader 5 password")
    parser.add_argument("--server", type=str, help="MetaTrader 5 server name")
    args = parser.parse_args()
    
    if args.setup:
        run_setup()
        
    token = args.token or os.getenv("AURIC_TOKEN")
    if not token:
        print("Error: A token is required. Pass --token or set AURIC_TOKEN in env.")
        sys.exit(1)
        
    is_mock = args.mock or (not MT5_AVAILABLE)
    if not MT5_AVAILABLE and not args.mock:
        print("MetaTrader5 module not available. Auto-switching to MOCK mode.")
        is_mock = True
        
    creds = None
    if args.login and args.password and args.server:
        creds = {
            "login": args.login,
            "password": args.password,
            "server": args.server
        }
        
    try:
        asyncio.run(run_bridge(args.ws_url, token, is_mock, creds))
    except KeyboardInterrupt:
        print("Bridge stopped by user.")
        if not is_mock and MT5_AVAILABLE:
            mt5.shutdown()

if __name__ == "__main__":
    main()
