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

def safe_float(val, default=0.0):
    try:
        if val is None or val == "":
            return default
        return float(val)
    except:
        return default

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
    if MT5_AVAILABLE:
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
            
    if base_price == 1950.0:
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
mock_bid = float(os.getenv("MOCK_XAUUSD_BASE_PRICE", "3300.0"))
mock_ask = round(mock_bid + 0.5, 2)

async def mock_price_stream(ws):
    global mock_bid, mock_ask
    if MT5_AVAILABLE:
        try:
            if mt5.initialize():
                resolved = resolve_mt5_symbol("XAUUSD")
                tick = mt5.symbol_info_tick(resolved)
                if tick:
                    mock_bid = tick.bid
                    mock_ask = tick.ask
        except Exception:
            pass
            
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
    
    symbol = request.get("symbol", "")
    
    # Read the broker-supported filling modes from symbol_info().filling_mode bitmask
    # Bit 0 = FOK, Bit 1 = IOC, Bit 2 = RETURN
    # Only try modes the broker actually supports to avoid retcode 10030
    supported_modes = []
    if symbol:
        sym_info = mt5.symbol_info(symbol)
        if sym_info is not None:
            fm = getattr(sym_info, 'filling_mode', 7)  # 7 = all modes fallback
            if fm & 1:  # FOK
                supported_modes.append(mt5.ORDER_FILLING_FOK)
            if fm & 2:  # IOC
                supported_modes.append(mt5.ORDER_FILLING_IOC)
            if fm & 4:  # RETURN
                supported_modes.append(mt5.ORDER_FILLING_RETURN)
            print(f"[FillMode] Symbol {symbol} filling_mode bitmask={fm}, trying modes: {supported_modes}")
    
    # Fall back to trying all three if we couldn't read symbol info
    if not supported_modes:
        print(f"[FillMode] Could not read symbol filling_mode, trying all modes")
        supported_modes = [
            mt5.ORDER_FILLING_FOK,
            mt5.ORDER_FILLING_IOC,
            mt5.ORDER_FILLING_RETURN
        ]
    
    last_result = None
    for fill_mode in supported_modes:
        request["type_filling"] = fill_mode
        last_result = mt5.order_send(request)
        if last_result and last_result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]:
            print(f"[FillMode] Order executed with filling mode: {fill_mode}")
            return last_result
        else:
            ret_code = last_result.retcode if last_result else 'Unknown'
            comment = last_result.comment if last_result else 'None'
            print(f"[FillMode] Failed with filling mode {fill_mode}: retcode={ret_code} comment={comment}")
    return last_result

def execute_real_trade(cmd):
    # Prepare trade request
    symbol = cmd.get("pair", "XAUUSD")
    direction = cmd.get("direction", "BUY")
    lots = safe_float(cmd.get("lots"), 0.01)
    
    # Resolve to broker terminal symbol variation
    terminal_symbol = resolve_mt5_symbol(symbol)
    
    # Initialize symbol if not initialized
    mt5.symbol_select(terminal_symbol, True)
    
    info = mt5.symbol_info(terminal_symbol)
    if not info:
        print(f"Error: Symbol {terminal_symbol} not found on server.")
        return None
        
    action_type = mt5.ORDER_TYPE_BUY if direction == "BUY" else mt5.ORDER_TYPE_SELL
    tick = mt5.symbol_info_tick(terminal_symbol)
    if not tick:
        print(f"Error: Could not get tick for {terminal_symbol}")
        return None
    price = tick.ask if direction == "BUY" else tick.bid
    
    sl_val = safe_float(cmd.get("sl"), 0.0)
    tp_val = safe_float(cmd.get("tp") if cmd.get("tp") is not None else cmd.get("tp1"), 0.0)
    
    # Only include SL/TP if non-zero and on valid side of price (avoids retcode 10014)
    request: dict = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": terminal_symbol,
        "volume": lots,
        "type": action_type,
        "price": price,
        "deviation": int(os.getenv("MT5_DEVIATION_POINTS", "20")),
        "magic": int(os.getenv("MT5_MAGIC_NUMBER", "202400")),
        "comment": os.getenv("MT5_TRADE_COMMENT", "AURIC Cloud Trade"),
        "type_time": mt5.ORDER_TIME_GTC,
    }
    if sl_val > 0.0:
        if direction == "BUY" and sl_val < price:
            request["sl"] = sl_val
        elif direction == "SELL" and sl_val > price:
            request["sl"] = sl_val
        else:
            print(f"[bridge] SL {sl_val} is on wrong side of price {price} for {direction} — omitting SL")
    if tp_val > 0.0:
        if direction == "BUY" and tp_val > price:
            request["tp"] = tp_val
        elif direction == "SELL" and tp_val < price:
            request["tp"] = tp_val
        else:
            print(f"[bridge] TP {tp_val} is on wrong side of price {price} for {direction} — omitting TP")
    
    print(f"[bridge] Sending order: {terminal_symbol} {direction} {lots}L price={price} sl={request.get('sl','none')} tp={request.get('tp','none')}")
    result = send_order_with_filling_fallback(request)
    print(f"[bridge] MT5 result: retcode={result.retcode if result else 'None'} comment={result.comment if result else 'None'}")
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
                            "deviation": int(os.getenv("MT5_DEVIATION_POINTS", "20")),
                            "magic": int(os.getenv("MT5_MAGIC_NUMBER", "202400")),
                            "comment": os.getenv("MT5_CLOSE_COMMENT", "AURIC Close Trade"),
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
                            "sl": safe_float(sl, pos.sl),
                            "tp": safe_float(tp, pos.tp)
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
                
                # Check MT5 connection and active session to configure mock mode dynamically
                terminal_initialized = False
                terminal_logged_in = False
                acc_info = None
                
                if MT5_AVAILABLE and not is_mock:
                    if mt5.initialize(timeout=10000):
                        terminal_initialized = True
                        acc_info = mt5.account_info()
                        terminal_logged_in = acc_info and acc_info.login > 0
                    
                # Dynamically try to log in if creds are provided/loaded
                login_success = False
                if terminal_initialized:
                    if not creds:
                        try:
                            creds = load_credentials()
                        except Exception:
                            creds = None
                    
                    if creds:
                        desired_login = int(creds["login"])
                        desired_server = creds["server"]
                        if terminal_logged_in and acc_info.login == desired_login and acc_info.server == desired_server:
                            print(f"MT5 terminal already logged in to correct account: {desired_login}")
                            login_success = True
                        else:
                            print(f"Attempting to login to MT5 account {desired_login} on {desired_server}...")
                            if mt5.login(login=desired_login, password=creds["password"], server=desired_server, timeout=10000):
                                print("MT5 login successful.")
                                login_success = True
                                acc_info = mt5.account_info()
                                terminal_logged_in = True
                            else:
                                print(f"MT5 login failed: {mt5.last_error()}")
                
                # If login failed but terminal is already logged in, fallback to using active session
                if not login_success and terminal_logged_in:
                    print(f"MT5 Login failed or no creds, but using active terminal session (login={acc_info.login}, server={acc_info.server})")
                    login_success = True
                
                active_mock = is_mock or not login_success
                if not active_mock:
                    print(f"Running bridge in LIVE MT5 mode — login={acc_info.login}, server={acc_info.server}")
                else:
                    print("Running bridge in MOCK mode...")
                    if terminal_initialized:
                        mt5.shutdown()
                
                await ws.send(json.dumps({
                    "type": "bridge_hello",
                    "version": "1.0",
                    "is_mock": active_mock
                }))
                
                # Reset reconnect delay on successful connection
                delay = 1
                
                if active_mock:
                    await asyncio.gather(
                        mock_price_stream(ws),
                        mock_position_stream(ws),
                        command_listener(ws, is_mock=True)
                    )
                else:
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
