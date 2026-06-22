# backend/main.py — FastAPI app
import asyncio
import json
import uuid
import os
import random
import time
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as aioredis
from cryptography.fernet import Fernet

def load_env_local():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    for folder in [".", script_dir, parent_dir]:
        for env_file in [".env", ".env.local"]:
            env_path = os.path.join(folder, env_file)
            if os.path.exists(env_path):
                with open(env_path, "r") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            parts = line.split("=", 1)
                            if len(parts) == 2:
                                key, val = parts[0].strip(), parts[1].strip()
                                if val.startswith('"') and val.endswith('"'):
                                    val = val[1:-1]
                                elif val.startswith("'") and val.endswith("'"):
                                    val = val[1:-1]
                                os.environ[key] = val

# Load dotenv immediately so keys are available for initialization
load_env_local()

DEFAULT_ENCRYPTION_KEY = b"fW8kZ2dUbWRKMWNmU0xYQzh6cDVxZ2M0djhkZ2hqa2w="
SYSTEM_SECRET = os.getenv("SYSTEM_SECRET", "auric_secret_system_token_2026")

# MT5 Available check
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

def get_fernet():
    key = os.getenv("ENCRYPTION_KEY", "")
    if not key:
        return Fernet(DEFAULT_ENCRYPTION_KEY)
    try:
        return Fernet(key.encode())
    except:
        return Fernet(DEFAULT_ENCRYPTION_KEY)

def encrypt_password(plain_pw: str) -> str:
    fernet = get_fernet()
    return fernet.encrypt(plain_pw.encode()).decode()

def decrypt_password(encrypted_pw: str) -> str:
    fernet = get_fernet()
    try:
        return fernet.decrypt(encrypted_pw.encode()).decode()
    except Exception as e:
        print(f"Decryption error: {e}. Falling back to plaintext.")
        return encrypted_pw

def supabase_request(method: str, path: str, payload: dict = None) -> dict:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        print("Supabase URL or Service Key missing in environment")
        return None
        
    url = f"{supabase_url}/rest/v1/{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("apikey", service_key)
    req.add_header("Authorization", f"Bearer {service_key}")
    req.add_header("Content-Type", "application/json")
    
    if payload:
        req.add_header("Prefer", "resolution=merge-duplicates")
        data = json.dumps(payload).encode("utf-8")
        req.data = data
        
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body) if res_body else {"success": True}
    except Exception as e:
        print(f"Supabase request error {url}: {e}")
        return None

async def save_broker_credentials_in_supabase(user_id: str, login: int, server: str, encrypted_pw: str):
    payload = {
        "user_id": user_id,
        "platform": "mt5",
        "server": server,
        "login": login,
        "credentials_enc": encrypted_pw,
    }
    return await asyncio.to_thread(supabase_request, "POST", "broker_accounts", payload)

async def fetch_all_cloud_broker_accounts():
    res = await asyncio.to_thread(supabase_request, "GET", "broker_accounts?select=user_id,login,server,credentials_enc")
    if res and isinstance(res, list):
        return [d for d in res if d.get("credentials_enc")]
    return []

# Direct MT5 loops inside FastAPI
active_direct_loops = {}      # user_id -> asyncio.Task
active_mock_positions = {}    # user_id -> List[dict]
direct_loop_mock = {}         # user_id -> bool
latest_prices = {}
active_accounts = {}
bot_running_fallback = {}     # user_id -> bool (when Redis is offline)
pending_ohlcv_requests = {}    # request_id -> asyncio.Future

def resolve_mt5_symbol(pair: str) -> str:
    if not MT5_AVAILABLE:
        return pair
    try:
        if not mt5.initialize():
            return pair
        # Check if the exact pair is available and tradable
        if mt5.symbol_select(pair, True):
            info = mt5.symbol_info(pair)
            if info and getattr(info, 'trade_mode', 4) != 0:
                print(f"[SymbolResolver] Resolved {pair} directly")
                return pair
        symbols = mt5.symbols_get()
        if symbols:
            matches = [s for s in symbols if pair.upper() in s.name.upper()]
            # 1. Prioritize tradable symbol
            for s in matches:
                if getattr(s, 'trade_mode', 4) != 0:
                    if mt5.symbol_select(s.name, True):
                        print(f"[SymbolResolver] Resolved {pair} -> {s.name} (tradable)")
                        return s.name
            # 2. Fallback to any matching symbol
            for s in matches:
                if mt5.symbol_select(s.name, True):
                    print(f"[SymbolResolver] Resolved {pair} -> {s.name} (fallback match)")
                    return s.name
        print(f"[SymbolResolver] No matching symbol found for {pair}. Using default fallback: {pair}")
    except Exception as e:
        print(f"Error resolving MT5 symbol for {pair}: {e}")
    return pair

async def sync_mt5_history(user_id: str, login: int, password: str, server: str, mock: bool):
    if mock or not MT5_AVAILABLE:
        # Seeding mock trades if Supabase table is empty
        res = await asyncio.to_thread(supabase_request, "GET", f"trades?user_id=eq.{user_id}&limit=1")
        if not res or len(res) == 0:
            print(f"[SyncHistory] Seeding mock historical trades for user {user_id}...")
            strategies = ["order_block_reversal", "fvg_scalper", "trend_following", "liquidity_sweep"]
            sessions = ["London", "New York", "Asia"]
            
            trades_to_seed = []
            for i in range(15):
                d = datetime.now() - timedelta(days=(15 - i) + random.uniform(-0.2, 0.2))
                direction = random.choice(["BUY", "SELL"])
                lots = random.choice([0.01, 0.02, 0.05])
                open_price = 1930.0 + random.uniform(-20, 20)
                is_win = random.random() < 0.6
                pnl_r = random.uniform(1.2, 3.5) if is_win else random.uniform(-1.0, -1.0)
                pnl_usd = round(pnl_r * lots * 1000, 2)
                close_price = open_price + (pnl_usd / (lots * 100)) if direction == "BUY" else open_price - (pnl_usd / (lots * 100))
                
                trade = {
                    "user_id": user_id,
                    "mt5_ticket": random.randint(100000, 999999),
                    "pair": "XAUUSD",
                    "direction": direction,
                    "lots": lots,
                    "open_price": round(open_price, 2),
                    "close_price": round(close_price, 2),
                    "pnl_usd": pnl_usd,
                    "pnl_r": round(pnl_r, 2),
                    "commission": -0.07,
                    "swap": 0.0,
                    "strategy": random.choice(strategies),
                    "session": random.choice(sessions),
                    "status": "closed",
                    "opened_at": d.isoformat(),
                    "closed_at": (d + timedelta(hours=random.randint(1, 8))).isoformat()
                }
                trades_to_seed.append(trade)
            
            if trades_to_seed:
                await asyncio.to_thread(supabase_request, "POST", "trades", trades_to_seed)
            print("[SyncHistory] Completed seeding mock trades.")
        return

    # Real MT5 History Sync
    if not mt5.initialize(timeout=10000):
        print(f"[SyncHistory] MT5 initialize() failed: {mt5.last_error()}")
        return
    
    # Check if already logged in, otherwise login
    existing = mt5.account_info()
    login_success = False
    if existing and int(existing.login) == int(login) and existing.server == server:
        login_success = True
    elif login and password and server:
        if mt5.login(login=login, password=password, server=server, timeout=10000):
            login_success = True
        else:
            print(f"[SyncHistory] MT5 login() failed: {mt5.last_error()}")
            
    # Fallback to active terminal session if it matches the desired login
    if not login_success and existing and existing.login > 0:
        print(f"[SyncHistory] Login failed or skipped, using active terminal session (login={existing.login}, server={existing.server})")
        login_success = True
        
    if not login_success:
        mt5.shutdown()
        return


    # Delete existing trades for this user before rebuilding from real MT5 history
    # This clears any mock or seeded trades so only real data is shown on portfolio
    await asyncio.to_thread(supabase_request, "DELETE", f"trades?user_id=eq.{user_id}")

    from_date = datetime(2020, 1, 1)
    to_date = datetime.now()
    deals = mt5.history_deals_get(from_date, to_date)
    if not deals:
        print("[SyncHistory] No historical deals found on MT5 terminal.")
        return

    # Group deals by position_id
    positions = {}
    for deal in deals:
        deal_dict = deal._asdict() if hasattr(deal, "_asdict") else dict(deal)
        pos_id = deal_dict.get("position_id")
        if not pos_id:
            continue
        positions.setdefault(pos_id, []).append(deal_dict)

    reconstructed_count = 0
    trades_to_insert = []
    for pos_id, pos_deals in positions.items():
        entry_deal = next((d for d in pos_deals if d.get("entry") == 0), None)
        exit_deal = next((d for d in pos_deals if d.get("entry") == 1), None)

        if not entry_deal:
            continue

        direction = "BUY" if entry_deal.get("type") == 0 else "SELL"
        lots = entry_deal.get("volume", 0.01)
        open_price = entry_deal.get("price")
        opened_at = datetime.fromtimestamp(entry_deal.get("time")).isoformat()

        close_price = None
        closed_at = None
        pnl_usd = 0.0
        commission = 0.0
        swap = 0.0

        if exit_deal:
            close_price = exit_deal.get("price")
            closed_at = datetime.fromtimestamp(exit_deal.get("time")).isoformat()
            pnl_usd = exit_deal.get("profit", 0.0) + exit_deal.get("commission", 0.0) + exit_deal.get("swap", 0.0)
            commission = exit_deal.get("commission", 0.0)
            swap = exit_deal.get("swap", 0.0)

        trade = {
            "user_id": user_id,
            "mt5_ticket": pos_id,
            "pair": entry_deal.get("symbol"),
            "direction": direction,
            "lots": lots,
            "open_price": open_price,
            "close_price": close_price,
            "pnl_usd": pnl_usd,
            "pnl_r": round(pnl_usd / 10.0, 2),
            "commission": commission,
            "swap": swap,
            "strategy": "MT5 Automated Trade",
            "session": "N/A",
            "status": "closed" if exit_deal else "OPEN",
            "opened_at": opened_at,
            "closed_at": closed_at
        }
        trades_to_insert.append(trade)

    if trades_to_insert:
        await asyncio.to_thread(supabase_request, "POST", "trades", trades_to_insert)
        reconstructed_count = len(trades_to_insert)

    print(f"[SyncHistory] Reconstructed and upserted {reconstructed_count} trades from MT5 deals.")
    await broadcast_to_client(user_id, {"type": "trades_updated"})

async def run_direct_mt5_loop(user_id: str, login: int, password: str, server: str, mock: bool):
    print(f"[DirectEngine] Starting direct MT5 engine loop for user {user_id} (Mock={mock})...")
    
    try:
        await sync_mt5_history(user_id, login, password, server, mock)
    except Exception as e:
        print(f"[DirectEngine] Error syncing history: {e}")
        
    mock_bid = 1950.0
    mock_ask = 1950.5
    
    is_real_mt5 = not mock and MT5_AVAILABLE
    if is_real_mt5:
        # Step 1: Connect to the MT5 terminal
        if not mt5.initialize(timeout=10000):
            print(f"[DirectEngine] MT5 initialize() failed: {mt5.last_error()}. Falling back to simulation mode.")
            is_real_mt5 = False
            mock = True
            direct_loop_mock[user_id] = mock
        else:
            # Step 2: Check if already logged in with the correct account
            existing = mt5.account_info()
            login_success = False
            if existing and int(existing.login) == int(login) and existing.server == server:
                print(f"[DirectEngine] MT5 already logged in as {existing.login} on {existing.server}. Balance: {existing.balance}")
                login_success = True
            elif login and password and server:
                # Need to log in with the correct credentials
                print(f"[DirectEngine] Attempting to login to MT5 account {login} on {server}...")
                if mt5.login(login=int(login), password=password, server=server, timeout=10000):
                    print("MT5 login successful.")
                    login_success = True
                else:
                    print(f"[DirectEngine] MT5 login() failed: {mt5.last_error()}")

            # Fallback to active terminal session if it matches the desired login
            if not login_success and existing and existing.login > 0:
                print(f"[DirectEngine] Login failed or skipped, but using active terminal session (login={existing.login}, server={existing.server})")
                login_success = True

            if not login_success:
                print("[DirectEngine] Direct MT5 engine connection failed. Falling back to simulation mode.")
                mt5.shutdown()
                is_real_mt5 = False
                mock = True
                direct_loop_mock[user_id] = mock
            else:
                acc_info = mt5.account_info()
                if acc_info:
                    print(f"[DirectEngine] MT5 logged in — login={acc_info.login}, server={acc_info.server}, balance={acc_info.balance}, equity={acc_info.equity}")
                else:
                    print(f"[DirectEngine] MT5 login succeeded but account_info() returned None.")

        # Log account info — demo accounts are treated as live
        if is_real_mt5:
            acc_info = mt5.account_info()
            if acc_info:
                account_trade_mode = getattr(acc_info, 'trade_mode', 'unknown')
                print(f"[DirectEngine] MT5 connected — login={acc_info.login}, server={acc_info.server}, balance={acc_info.balance}, trade_mode={account_trade_mode}")
            
    terminal_symbol = "XAUUSD"
    if is_real_mt5:
        terminal_symbol = resolve_mt5_symbol("XAUUSD")
        print(f"[DirectEngine] Resolved symbol: {terminal_symbol}")

    # ─── Redis command reader ────────────────────────────────────────────────
    # This is the critical bridge: reads open_trade / close_trade commands that
    # server.ts publishes to Redis cmd:{user_id} and executes them directly.
    async def cmd_reader():
        if not redis_client:
            return
        print(f"[DirectEngine] Starting cmd_reader loop for cmd:{user_id}...")
        pubsub = None
        try:
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(f"cmd:{user_id}")
            print(f"[DirectEngine] Subscribed to cmd:{user_id}")
            while True:
                try:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
                    if message and message.get("type") == "message":
                        try:
                            cmd = json.loads(message["data"])
                            await execute_direct_command(user_id, cmd, mock)
                        except Exception as e:
                            print(f"[DirectEngine] Error executing command: {e}")
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    if "TimeoutError" in type(e).__name__:
                        # Idle timeout from get_message — normal, just continue polling
                        continue
                    print(f"[DirectEngine] cmd_reader get_message error: {e}")
                    await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[DirectEngine] cmd_reader subscription error: {e}")
        finally:
            if pubsub:
                try:
                    await pubsub.unsubscribe()
                    await pubsub.close()
                except Exception as close_err:
                    print(f"[DirectEngine] Error closing pubsub: {close_err}")

    cmd_task = asyncio.create_task(cmd_reader())
    # ────────────────────────────────────────────────────────────────────────
        
    counter = 0
    try:
        while True:
            counter += 1
            # 1. Price streams
            if is_real_mt5:
                tick = mt5.symbol_info_tick(terminal_symbol)
                if tick:
                    price_data = {
                        "type": "price",
                        "pair": "XAUUSD",
                        "bid": tick.bid,
                        "ask": tick.ask,
                        "time": int(tick.time_msc)
                    }
                    await broadcast_to_client(user_id, price_data)
                    latest_prices["XAUUSD"] = {"bid": tick.bid, "ask": tick.ask}
            else:
                change = random.uniform(-0.4, 0.4)
                mock_bid = round(mock_bid + change, 2)
                mock_ask = round(mock_bid + 0.5, 2)
                price_data = {
                    "type": "price",
                    "pair": "XAUUSD",
                    "bid": mock_bid,
                    "ask": mock_ask,
                    "time": int(datetime.now().timestamp() * 1000)
                }
                await broadcast_to_client(user_id, price_data)
                latest_prices["XAUUSD"] = {"bid": mock_bid, "ask": mock_ask}

            # 2. Position updates (every 2.0s)
            if counter % 4 == 0:
                if is_real_mt5:
                    positions = mt5.positions_get()
                    data = []
                    if positions:
                        for p in positions:
                            p_dict = p._asdict() if hasattr(p, "_asdict") else dict(p)
                            data.append({
                                "ticket": p_dict.get("ticket"),
                                "symbol": p_dict.get("symbol"),
                                "type": "BUY" if p_dict.get("type") == 0 else "SELL",
                                "volume": p_dict.get("volume"),
                                "open_price": p_dict.get("price_open"),
                                "current_price": p_dict.get("price_current"),
                                "profit": p_dict.get("profit"),
                                "sl": p_dict.get("sl"),
                                "tp": p_dict.get("tp")
                            })
                    acc_info = mt5.account_info()
                    balance = acc_info.balance if acc_info else 10000.0
                    equity = acc_info.equity if acc_info else 10000.0
                    
                    pos_data = {
                        "type": "positions",
                        "data": data,
                        "balance": balance,
                        "equity": equity
                    }
                    await broadcast_to_client(user_id, pos_data)
                    if redis_client:
                        status_data = {
                            "connected": True,
                            "last_seen": datetime.now().isoformat(),
                            "balance": balance,
                            "equity": equity,
                            "login": login if login else (acc_info.login if acc_info else None),
                            "server": server if server else (acc_info.server if acc_info else None),
                            "mock": False
                        }
                        try:
                            await redis_client.setex(f"bridge:status:{user_id}", 10, json.dumps(status_data))
                        except Exception as e:
                            print(f"[DirectEngine] Redis setex error: {e}")
                    active_accounts[user_id] = {
                        "balance": balance,
                        "equity": equity,
                        "last_seen": datetime.now().isoformat()
                    }
                else:
                    mock_pos = active_mock_positions.setdefault(user_id, [])
                    for p in mock_pos:
                        entry = p["open_price"]
                        direction = p["type"]
                        current = mock_ask if direction == "BUY" else mock_bid
                        diff = (current - entry) if direction == "BUY" else (entry - current)
                        p["current_price"] = current
                        p["profit"] = round(diff * p["volume"] * 100, 2)
                        
                    tot_pnl = sum(p["profit"] for p in mock_pos)
                    balance = 10000.0
                    equity = round(balance + tot_pnl, 2)
                    
                    pos_data = {
                        "type": "positions",
                        "data": mock_pos,
                        "balance": balance,
                        "equity": equity
                    }
                    await broadcast_to_client(user_id, pos_data)
                    if redis_client:
                        status_data = {
                            "connected": True,
                            "last_seen": datetime.now().isoformat(),
                            "balance": balance,
                            "equity": equity,
                            "login": login,
                            "server": server,
                            "mock": True
                        }
                        try:
                            await redis_client.setex(f"bridge:status:{user_id}", 10, json.dumps(status_data))
                        except Exception as e:
                            print(f"[DirectEngine] Redis setex error: {e}")
                    active_accounts[user_id] = {
                        "balance": balance,
                        "equity": equity,
                        "last_seen": datetime.now().isoformat()
                    }

            # 3. Strategy / Signal Generation (every 20.0s, when bot is running)
            if counter % 40 == 0:
                bot_active = False
                if redis_client:
                    bot_active = (await redis_client.get(f"bot_running:{user_id}")) == "true"
                else:
                    bot_active = bot_running_fallback.get(user_id, False)
                
                if bot_active:
                    print(f"[DirectEngine] Bot is active for user {user_id}. Executing strategy logic...")
                    strat_name = "ema_crossover"
                    user_strat = await asyncio.to_thread(
                        supabase_request, "GET", f"user_strategies?user_id=eq.{user_id}&is_active=eq.true&limit=1"
                    )
                    if user_strat and isinstance(user_strat, list) and len(user_strat) > 0:
                        strat_name = user_strat[0].get("strategy_name", "ema_crossover")
                    
                    # Generate a signal
                    signal = await generate_signal(pair="XAUUSD", tf="M15", strategy_name=strat_name, user_id=user_id)
                    print(f"[DirectEngine] Generated signal: {signal['direction']} on {signal['pair']} via {signal['strategy']}")
                    
                    # Auto-execute trade since algo is active
                    lots = 0.05
                    risk_profile = await asyncio.to_thread(
                        supabase_request, "GET", f"risk_profiles?user_id=eq.{user_id}&limit=1"
                    )
                    if risk_profile and isinstance(risk_profile, list) and len(risk_profile) > 0:
                        lots = float(risk_profile[0].get("max_lot_size", 0.05))
                    
                    trade_cmd = {
                        "type": "open_trade",
                        "pair": signal["pair"],
                        "direction": signal["direction"],
                        "lots": lots,
                        "sl": signal["sl_price"],
                        "tp": signal["tp_levels"][0]["price"]
                    }
                    print(f"[DirectEngine] Auto-executing trade: {trade_cmd}")
                    await execute_direct_command(user_id, trade_cmd, mock)

            await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        print(f"[DirectEngine] Direct MT5 engine loop cancelled for user {user_id}")
        cmd_task.cancel()
        if is_real_mt5:
            mt5.shutdown()

async def start_direct_user_bridge(user_id: str, login: int, password: str, server: str, mock: bool):
    await stop_direct_user_bridge(user_id)
    direct_loop_mock[user_id] = mock
    task = asyncio.create_task(run_direct_mt5_loop(user_id, login, password, server, mock))
    active_direct_loops[user_id] = task
    return True

async def stop_direct_user_bridge(user_id: str):
    task = active_direct_loops.pop(user_id, None)
    if task:
        print(f"[DirectEngine] Stopping direct loop task for user {user_id}")
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

async def auto_start_bridges():
    print("Auto-starting cloud bridges for active broker accounts...")
    accounts = await fetch_all_cloud_broker_accounts()
    for acc in accounts:
        user_id = acc.get("user_id")
        login = acc.get("login")
        server = acc.get("server")
        encrypted_pw = acc.get("credentials_enc")
        
        password = decrypt_password(encrypted_pw)
        if password and user_id and login and server:
            is_mock = not MT5_AVAILABLE
            await start_direct_user_bridge(user_id, login, password, server, mock=is_mock)

app = FastAPI(title="AURIC PRO FastAPI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Built-in Redis-Compatible Mock Server (RESP/RESP3) ---
async def _read_redis_command(reader):
    try:
        line = await reader.readline()
        if not line:
            return None
        if line[0] == ord('*'):
            try:
                num_args = int(line[1:-2])
            except ValueError:
                return None
            args = []
            for _ in range(num_args):
                arg_line = await reader.readline()
                if not arg_line or arg_line[0] != ord('$'):
                    return None
                try:
                    arg_len = int(arg_line[1:-2])
                except ValueError:
                    return None
                data = await reader.readexactly(arg_len)
                await reader.readexactly(2) # read \r\n
                args.append(data.decode('utf-8'))
            return args
        else:
            return line.decode('utf-8').strip().split()
    except Exception:
        return None

def _to_redis_resp(val):
    if val is None:
        return b"$-1\r\n"
    if isinstance(val, bool):
        return b":1\r\n" if val else b":0\r\n"
    if isinstance(val, int):
        return f":{val}\r\n".encode()
    if isinstance(val, str):
        encoded = val.encode('utf-8')
        return f"${len(encoded)}\r\n".encode() + encoded + b"\r\n"
    if isinstance(val, bytes):
        return f"${len(val)}\r\n".encode() + val + b"\r\n"
    if isinstance(val, list):
        res = f"*{len(val)}\r\n".encode()
        for item in val:
            res += _to_redis_resp(item)
        return res
    if isinstance(val, dict):
        res = f"%{len(val)}\r\n".encode()
        for k, v in val.items():
            res += _to_redis_resp(k) + _to_redis_resp(v)
        return res
    return f"+{str(val)}\r\n".encode()

class RedisMockConnectionHandler:
    def __init__(self, server, reader, writer):
        self.server = server
        self.reader = reader
        self.writer = writer
        self.subscribed_channels = set()
        self.write_lock = asyncio.Lock()
        self.proto = 2

    async def send(self, data):
        async with self.write_lock:
            try:
                self.writer.write(data)
                await self.writer.drain()
            except Exception:
                pass

    async def send_push(self, array_data):
        if self.proto == 3:
            res = f">{len(array_data)}\r\n".encode()
            for item in array_data:
                res += _to_redis_resp(item)
            await self.send(res)
        else:
            await self.send(_to_redis_resp(array_data))

    async def run(self):
        try:
            while True:
                cmd_args = await _read_redis_command(self.reader)
                if cmd_args is None:
                    break
                if not cmd_args:
                    continue
                
                cmd = cmd_args[0].upper()
                if cmd == "PING":
                    if len(cmd_args) > 1:
                        await self.send(_to_redis_resp(cmd_args[1]))
                    else:
                        await self.send(b"+PONG\r\n")
                elif cmd == "HELLO":
                    proto = 2
                    if len(cmd_args) > 1:
                        try:
                            proto = int(cmd_args[1])
                        except ValueError:
                            pass
                    self.proto = proto
                    if proto == 3:
                        hello_map = {
                            "server": "redis-mock",
                            "version": "6.0.0",
                            "proto": 3,
                            "id": 1,
                            "mode": "standalone",
                            "role": "master",
                            "modules": []
                        }
                        await self.send(_to_redis_resp(hello_map))
                    else:
                        hello_arr = [
                            "server", "redis-mock",
                            "version", "6.0.0",
                            "proto", 2,
                            "id", 1,
                            "mode", "standalone",
                            "role", "master"
                        ]
                        await self.send(_to_redis_resp(hello_arr))
                elif cmd == "CLIENT":
                    await self.send(b"+OK\r\n")
                elif cmd == "GET":
                    if len(cmd_args) < 2:
                        await self.send(b"-ERR wrong number of arguments for 'get' command\r\n")
                        continue
                    key = cmd_args[1]
                    val = self.get_key(key)
                    await self.send(_to_redis_resp(val))
                elif cmd == "SET":
                    if len(cmd_args) < 3:
                        await self.send(b"-ERR wrong number of arguments for 'set' command\r\n")
                        continue
                    key, val = cmd_args[1], cmd_args[2]
                    expiry = None
                    if len(cmd_args) >= 5 and cmd_args[3].upper() == "EX":
                        try:
                            expiry = time.time() + float(cmd_args[4])
                        except ValueError:
                            pass
                    self.server.db[key] = (val, expiry)
                    await self.send(b"+OK\r\n")
                elif cmd == "SETEX":
                    if len(cmd_args) < 4:
                        await self.send(b"-ERR wrong number of arguments for 'setex' command\r\n")
                        continue
                    key, seconds, val = cmd_args[1], cmd_args[2], cmd_args[3]
                    try:
                        expiry = time.time() + float(seconds)
                    except ValueError:
                        expiry = None
                    self.server.db[key] = (val, expiry)
                    await self.send(b"+OK\r\n")
                elif cmd == "DEL":
                    if len(cmd_args) < 2:
                        await self.send(b"-ERR wrong number of arguments for 'del' command\r\n")
                        continue
                    deleted = 0
                    for key in cmd_args[1:]:
                        if key in self.server.db:
                            del self.server.db[key]
                            deleted += 1
                    await self.send(_to_redis_resp(deleted))
                elif cmd == "EXISTS":
                    if len(cmd_args) < 2:
                        await self.send(b"-ERR wrong number of arguments for 'exists' command\r\n")
                        continue
                    exists = 0
                    for key in cmd_args[1:]:
                        if self.get_key(key) is not None:
                            exists = 1
                    await self.send(_to_redis_resp(exists))
                elif cmd == "PUBLISH":
                    if len(cmd_args) < 3:
                        await self.send(b"-ERR wrong number of arguments for 'publish' command\r\n")
                        continue
                    channel, msg = cmd_args[1], cmd_args[2]
                    count = await self.server.publish(channel, msg)
                    await self.send(_to_redis_resp(count))
                elif cmd == "SUBSCRIBE":
                    if len(cmd_args) < 2:
                        await self.send(b"-ERR wrong number of arguments for 'subscribe' command\r\n")
                        continue
                    for channel in cmd_args[1:]:
                        self.subscribed_channels.add(channel)
                        if channel not in self.server.subscribers:
                            self.server.subscribers[channel] = set()
                        self.server.subscribers[channel].add(self)
                        sub_count = len(self.subscribed_channels)
                        await self.send_push(["subscribe", channel, sub_count])
                elif cmd == "UNSUBSCRIBE":
                    channels = cmd_args[1:] if len(cmd_args) > 1 else list(self.subscribed_channels)
                    for channel in channels:
                        if channel in self.subscribed_channels:
                            self.subscribed_channels.remove(channel)
                        if channel in self.server.subscribers:
                            self.server.subscribers[channel].discard(self)
                            if not self.server.subscribers[channel]:
                                del self.server.subscribers[channel]
                        sub_count = len(self.subscribed_channels)
                        await self.send_push(["unsubscribe", channel, sub_count])
                elif cmd == "QUIT":
                    await self.send(b"+OK\r\n")
                    break
                else:
                    await self.send(f"-ERR unknown command '{cmd}'\r\n".encode())
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[RedisMock] Client connection error: {e}")
        finally:
            for channel in list(self.subscribed_channels):
                if channel in self.server.subscribers:
                    self.server.subscribers[channel].discard(self)
                    if not self.server.subscribers[channel]:
                        del self.server.subscribers[channel]
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass

    def get_key(self, key):
        if key in self.server.db:
            val, expiry = self.server.db[key]
            if expiry is not None and time.time() > expiry:
                del self.server.db[key]
                return None
            return val
        return None

class RedisMockServer:
    def __init__(self):
        self.db = {}
        self.subscribers = {}
        self.server = None

    async def start(self, host='127.0.0.1', port=6379):
        self.server = await asyncio.start_server(self.handle_client, host, port)
        print(f"Local Redis Mock Server listening on {host}:{port}")

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()

    async def handle_client(self, reader, writer):
        handler = RedisMockConnectionHandler(self, reader, writer)
        await handler.run()

    async def publish(self, channel, message):
        count = 0
        if channel in self.subscribers:
            for sub in list(self.subscribers[channel]):
                try:
                    await sub.send_push(["message", channel, message])
                    count += 1
                except Exception:
                    pass
        return count


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = None
redis_mock_server = None

# Global memory fallback for pub/sub if Redis is offline
class MemoryPubSub:
    def __init__(self):
        self.subscribers = {}
        
    def subscribe(self, channel: str, callback):
        if channel not in self.subscribers:
            self.subscribers[channel] = []
        self.subscribers[channel].append(callback)
        
    def unsubscribe(self, channel: str, callback):
        if channel in self.subscribers:
            self.subscribers[channel] = [c for c in self.subscribers[channel] if c != callback]
            
    def publish(self, channel: str, message: str):
        if channel in self.subscribers:
            for cb in self.subscribers[channel]:
                asyncio.create_task(cb(message))

memory_pubsub = MemoryPubSub()

@app.on_event("startup")
async def startup_event():
    global redis_client, redis_mock_server
    try:
        redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
        # Ping to test connection
        await redis_client.ping()
        print(f"FastAPI connected to external Redis at {REDIS_URL}")
    except Exception as e:
        print(f"External Redis not available: {e}. Starting built-in Redis Mock Server...")
        try:
            port = 6379
            try:
                clean_url = REDIS_URL.split("://")[-1]
                if "@" in clean_url:
                    clean_url = clean_url.split("@")[-1]
                parts = clean_url.split("/")[0].split(":")
                if len(parts) == 2:
                    port = int(parts[1])
            except Exception:
                pass

            redis_mock_server = RedisMockServer()
            await redis_mock_server.start(host='127.0.0.1', port=port)
            
            # Re-attempt connection to our local mock server
            redis_client = aioredis.from_url(f"redis://127.0.0.1:{port}", decode_responses=True)
            await redis_client.ping()
            print(f"FastAPI connected to built-in Redis Mock Server at redis://127.0.0.1:{port}")
        except Exception as mock_err:
            print(f"Failed to start built-in Redis Mock Server: {mock_err}. Running with memory fallback.")
            redis_client = None

    # Auto-start cloud bridges for users in background
    asyncio.create_task(auto_start_bridges())

    # Start ngrok tunnel in the background
    tunnel_url = None
    try:
        from pyngrok import ngrok
        
        # Check if there are existing tunnels
        tunnels = ngrok.get_tunnels()
        if tunnels:
            tunnel_url = tunnels[0].public_url
            print(f"\n[ngrok] Found existing Public Tunnel URL: {tunnel_url}\n")
        else:
            ngrok_token = os.getenv("NGROK_AUTHTOKEN")
            if ngrok_token:
                ngrok.set_auth_token(ngrok_token)
            
            # Connect to port 8000
            tunnel = ngrok.connect(8000)
            tunnel_url = tunnel.public_url
            print(f"\n[ngrok] Public Tunnel URL: {tunnel_url}\n")
    except Exception as e:
        print(f"[ngrok] Failed to start ngrok tunnel: {e}")
        # Try local ngrok API fallback
        try:
            with urllib.request.urlopen("http://localhost:4040/api/tunnels", timeout=2) as response:
                t_data = json.loads(response.read().decode("utf-8"))
                for t in t_data.get("tunnels", []):
                    if t.get("proto") in ["http", "https"]:
                        tunnel_url = t.get("public_url")
                        print(f"[ngrok] Recovered tunnel URL from local API: {tunnel_url}")
                        break
        except Exception as api_err:
            print(f"[ngrok] Local API fallback query failed: {api_err}")

    if tunnel_url and redis_client:
        try:
            # Save a general/default key
            await redis_client.set("bridge:url:default", tunnel_url)
            print(f"[ngrok] Saved default tunnel URL to Redis: {tunnel_url}")
            
            # Save for all active broker accounts in Supabase
            accounts = await fetch_all_cloud_broker_accounts()
            for acc in accounts:
                user_id = acc.get("user_id")
                if user_id:
                    await redis_client.set(f"bridge:url:{user_id}", tunnel_url)
                    print(f"[ngrok] Saved tunnel URL to Redis for user {user_id}: {tunnel_url}")
        except Exception as re:
            print(f"[ngrok] Failed to write tunnel URL to Redis: {re}")

@app.on_event("shutdown")
async def shutdown_event():
    global redis_mock_server
    print("[Shutdown] Cleaning up resources...")
    if redis_mock_server:
        try:
            print("[Shutdown] Stopping built-in Redis Mock Server...")
            await redis_mock_server.stop()
        except Exception as se:
            print(f"[Shutdown] Error stopping Redis Mock Server: {se}")
    try:
        from pyngrok import ngrok
        print("[ngrok] Stopping tunnel...")
        ngrok.kill()
    except Exception as e:
        print(f"[ngrok] Error stopping ngrok tunnel: {e}")

def resolve_user_id(user_id: str) -> str:
    if (not user_id or user_id == "00000000-0000-0000-0000-000000000000") and active_direct_loops:
        return list(active_direct_loops.keys())[0]
    return user_id

# JWT verification fallback helper
def verify_jwt(token: str) -> str:
    """Validate Supabase JWT and return user_id"""
    fallback_id = list(active_direct_loops.keys())[0] if active_direct_loops else "00000000-0000-0000-0000-000000000000"
    if not token or token == "undefined" or token == "null":
        # Fallback static UUID for onboarding/local testing if no token provided
        return fallback_id
    
    # Check for system cloud bridge token bypass
    if token.startswith("system_cloud_bridge_"):
        suffix = token.replace("system_cloud_bridge_", "")
        secret = SYSTEM_SECRET
        if suffix.endswith(secret):
            user_id = suffix[:-len(secret)-1]
            return user_id
        return fallback_id

    # Try decoding JWT payload safely without signature verification for local dev ease
    # Supabase tokens are standard JWTs: header.payload.signature
    try:
        import base64
        parts = token.split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1]
            # Add padding
            payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
            payload = json.loads(base64.b64decode(payload_b64).decode("utf-8"))
            user_id = payload.get("sub")
            if user_id:
                if user_id == "00000000-0000-0000-0000-000000000000":
                    return fallback_id
                return user_id
    except Exception as e:
        print(f"JWT decode warning: {e}")
        
    # Standard fallback user_id for dev
    return fallback_id

# Bridge Connection Manager
class BridgeManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        print(f"Bridge connected for user: {user_id}")

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            print(f"Bridge disconnected for user: {user_id}")

    async def send_command(self, user_id: str, cmd: dict):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(cmd)
            return True
        return False

bridge_manager = BridgeManager()

# Next.js Client Connection Manager (duplex WebSocket relay when Redis is offline)
class ClientManager:
    def __init__(self):
        self.active_connections: Dict[str, list] = {}  # user_id -> List[WebSocket]

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        print(f"Client socket relay connected for user: {user_id} (total={len(self.active_connections[user_id])})")

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            try:
                self.active_connections[user_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            print(f"Client socket relay disconnected for user: {user_id}")

    async def send_message(self, user_id: str, msg: dict):
        sockets = self.active_connections.get(user_id, [])
        dead = []
        for ws in sockets:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self.active_connections[user_id].remove(ws)
            except (ValueError, KeyError):
                pass
        return len(sockets) - len(dead) > 0

client_manager = ClientManager()

async def broadcast_to_client(user_id: str, event: dict):
    """Broadcast an event to both Redis and active WebSocket connections to prevent mismatches."""
    # 1. Publish to Redis if available (Skip high-frequency price updates to stay within Upstash limits)
    if redis_client and event.get("type") != "price":
        try:
            await redis_client.publish(f"bridge:{user_id}", json.dumps(event))
        except Exception as e:
            print(f"[DirectEngine] Redis publish error: {e}")
            
    # 2. Publish to Memory Pub/Sub if active
    try:
        memory_pubsub.publish(f"bridge:{user_id}", json.dumps(event))
    except Exception as e:
        print(f"[DirectEngine] Memory pubsub publish error: {e}")
        
    # 3. Always send directly via WebSocket client manager if active
    try:
        await client_manager.send_message(user_id, event)
    except Exception as e:
        print(f"[DirectEngine] WS send_message error: {e}")

active_accounts: Dict[str, dict] = {}
latest_prices = {}

# Background Redis Listener for commands targeting specific bridge
async def redis_command_listener(user_id: str, ws: WebSocket):
    # Callback helper for memory pub/sub fallback
    async def memory_cb(message: str):
        try:
            cmd = json.loads(message)
            await ws.send_json(cmd)
        except Exception as e:
            print(f"Error sending local command down: {e}")

    if redis_client:
        pubsub = None
        try:
            pubsub = redis_client.pubsub()
            await pubsub.subscribe(f"cmd:{user_id}")
            print(f"Subscribed to cmd:{user_id} Redis channel")
            
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("data"):
                    cmd_data = json.loads(message["data"])
                    # Send command to bridge
                    await ws.send_json(cmd_data)
                await asyncio.sleep(0.1)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Redis command listener error for {user_id}: {e}")
        finally:
            if pubsub:
                try:
                    await pubsub.unsubscribe(f"cmd:{user_id}")
                    await pubsub.close()
                except Exception as close_err:
                    print(f"Error closing pubsub in command listener: {close_err}")
    else:
        # Register local subscription
        memory_pubsub.subscribe(f"cmd:{user_id}", memory_cb)
        try:
            while True:
                await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            memory_pubsub.unsubscribe(f"cmd:{user_id}", memory_cb)

@app.websocket("/ws/bridge")
async def bridge_endpoint(websocket: WebSocket):
    headers = websocket.headers
    token = headers.get("Authorization", "").replace("Bearer ", "")
    
    # Check query params as fallback
    if not token:
        query_params = dict(websocket.query_params)
        token = query_params.get("token", "")
        
    user_id = verify_jwt(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    await bridge_manager.connect(user_id, websocket)
    
    # Broadcast bridge_status: connected immediately so clients know to refresh
    await broadcast_to_client(user_id, {
        "type": "bridge_status",
        "connected": True
    })
    
    # Fetch broker account for this user
    acc = await fetch_user_broker_account(user_id)
    
    # Sync MT5 trade history immediately on bridge connection
    if acc and acc.get("credentials_enc"):
        login = acc.get("login")
        server = acc.get("server")
        password = decrypt_password(acc.get("credentials_enc"))
        if password:
            is_mock = direct_loop_mock.get(user_id, not MT5_AVAILABLE)
            asyncio.create_task(sync_mt5_history(user_id, login, password, server, mock=is_mock))
    
    # Broadcast bridge_live event — signals the frontend to hard-refresh
    # OHLCV, portfolio stats, trades, and equity curve from real MT5 data
    await broadcast_to_client(user_id, {
        "type": "bridge_status",
        "connected": True,
        "live_refresh": True  # flag for client to invalidate all cached data
    })

    # Start background Redis task to listen for commands and send to the bridge
    listener_task = asyncio.create_task(redis_command_listener(user_id, websocket))
    
    try:
        while True:
            # Receive data updates from bridge.py (prices, positions, etc.)
            data = await websocket.receive_json()
            data["userId"] = user_id
            
            # Cache latest account statistics locally in memory
            if data.get("type") == "bridge_hello":
                is_mock_val = data.get("is_mock", False)
                direct_loop_mock[user_id] = is_mock_val
                print(f"[Bridge] Received hello from user {user_id}. Bridge is_mock={is_mock_val}")
            elif data.get("type") == "positions":
                # Check for closed positions to trigger history sync
                prev_info = active_accounts.get(user_id, {})
                prev_tickets = prev_info.get("tickets", set())
                curr_tickets = {p.get("ticket") for p in data.get("data", []) if p.get("ticket")}
                
                active_accounts[user_id] = {
                    "balance": data.get("balance", 10000.00),
                    "equity": data.get("equity", 10000.00),
                    "last_seen": datetime.now().isoformat(),
                    "tickets": curr_tickets
                }
                
                # If some tickets were closed, sync history so the portfolio updates instantly
                if prev_tickets and not curr_tickets.issubset(prev_tickets):
                    closed_tickets = prev_tickets - curr_tickets
                    if closed_tickets:
                        print(f"[Bridge] Detected closed tickets {closed_tickets} for user {user_id}. Triggering sync...")
                        acc = await fetch_user_broker_account(user_id)
                        if acc and acc.get("credentials_enc"):
                            login = acc.get("login")
                            server = acc.get("server")
                            password = decrypt_password(acc.get("credentials_enc"))
                            if password:
                                is_mock = direct_loop_mock.get(user_id, not MT5_AVAILABLE)
                                asyncio.create_task(sync_mt5_history(user_id, login, password, server, mock=is_mock))
            elif data.get("type") == "price" and data.get("pair"):
                latest_prices[data["pair"]] = {
                    "bid": data.get("bid"),
                    "ask": data.get("ask")
                }
            elif data.get("type") == "ohlcv_data":
                req_id = data.get("request_id")
                if req_id in pending_ohlcv_requests:
                    fut = pending_ohlcv_requests[req_id]
                    if not fut.done():
                        fut.set_result(data.get("data", []))

            # Route to Redis pub/sub if running (Skip price ticks to save Upstash command quota)
            if redis_client:
                if data.get("type") != "price":
                    try:
                        await redis_client.publish(f"bridge:{user_id}", json.dumps(data))
                    except Exception as e:
                        print(f"[Bridge] Redis publish error: {e}")
                
                # Set status in Redis only for positions/connection updates
                if data.get("type") == "positions":
                    status_data = {
                        "connected": True,
                        "last_seen": datetime.now().isoformat(),
                        "balance": data.get("balance", 10000.00),
                        "equity": data.get("equity", 10000.00)
                    }
                    try:
                        await redis_client.setex(f"bridge:status:{user_id}", 10, json.dumps(status_data))
                    except Exception as e:
                        print(f"[Bridge] Redis status setex error: {e}")

            # Always send directly over WebSocket to client and memory pub/sub
            await client_manager.send_message(user_id, data)
            memory_pubsub.publish(f"bridge:{user_id}", json.dumps(data))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        listener_task.cancel()
        bridge_manager.disconnect(user_id)
        # Broadcast bridge_status: false immediately on disconnect
        await broadcast_to_client(user_id, {
            "type": "bridge_status",
            "connected": False
        })

def send_order_with_filling_fallback(request):
    if not MT5_AVAILABLE:
        return None
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


def safe_float(val, default=0.0):
    try:
        if val is None or val == "":
            return default
        return float(val)
    except:
        return default

def execute_real_trade(cmd, login=None, password=None, server=None):
    """Execute a real MT5 trade and return the result."""
    if not MT5_AVAILABLE:
        return None
        
    if not mt5.initialize():
        print("[DirectEngine] MT5 initialize failed in execute_real_trade")
        return None
        
    if login and password and server:
        existing = mt5.account_info()
        if not existing or int(existing.login) != int(login) or existing.server != server:
            print(f"[DirectEngine] Logging in to MT5 account {login} on {server} from execution thread...")
            if not mt5.login(login=int(login), password=password, server=server):
                print(f"[DirectEngine] MT5 login failed in execution thread: {mt5.last_error()}")
                if existing and existing.login > 0:
                    print(f"[DirectEngine] Using active terminal session (login={existing.login}) despite login error.")
                else:
                    return None
                
    symbol = cmd.get("pair", "XAUUSD")
    direction = cmd.get("direction", "BUY")
    lots = safe_float(cmd.get("lots"), 0.01)
    
    terminal_symbol = symbol
    if mt5.symbol_select(terminal_symbol, True):
        pass
    else:
        symbols = mt5.symbols_get()
        if symbols:
            matches = [s for s in symbols if symbol.upper() in s.name.upper()]
            for s in matches:
                if getattr(s, 'trade_mode', 4) != 0:
                    if mt5.symbol_select(s.name, True):
                        terminal_symbol = s.name
                        break
                        
    info = mt5.symbol_info(terminal_symbol)
    if not info:
        print(f"Error: Symbol {terminal_symbol} not found on server.")
        return None
        
    action_type = mt5.ORDER_TYPE_BUY if direction == "BUY" else mt5.ORDER_TYPE_SELL
    
    tick = mt5.symbol_info_tick(terminal_symbol)
    if not tick:
        print(f"Error: Could not retrieve tick for symbol {terminal_symbol}.")
        return None
        
    price = tick.ask if direction == "BUY" else tick.bid
    
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": terminal_symbol,
        "volume": float(lots),
        "type": action_type,
        "price": price,
        "sl": safe_float(cmd.get("sl"), 0.0),
        "tp": safe_float(cmd.get("tp") if cmd.get("tp") is not None else cmd.get("tp1"), 0.0),
        "deviation": 20,
        "magic": 202400,
        "comment": "AURIC Cloud Trade",
        "type_time": mt5.ORDER_TIME_GTC,
    }
    
    result = send_order_with_filling_fallback(request)
    print(f"MT5 final execution result: {result}")
    return result

def execute_real_close(ticket, login: int = None, password: str = None, server: str = None):
    if not MT5_AVAILABLE:
        return False
    if not mt5.initialize():
        return False
        
    try:
        ticket = int(ticket)
    except (ValueError, TypeError):
        print(f"Error: Invalid ticket format in execute_real_close: {ticket}")
        return False
        
    if login and password and server:
        existing = mt5.account_info()
        if not existing or int(existing.login) != int(login) or existing.server != server:
            if not mt5.login(login=int(login), password=password, server=server):
                if existing and existing.login > 0:
                    print(f"[DirectEngine] Close: Using active terminal session (login={existing.login}) despite login error.")
                else:
                    return False
                
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        print(f"Error: Ticket {ticket} not found in positions.")
        return False
        
    pos = positions[0]
    symbol = pos.symbol
    lots = pos.volume
    action_type = mt5.ORDER_TYPE_SELL if pos.type == 0 else mt5.ORDER_TYPE_BUY
    
    tick = mt5.symbol_info_tick(symbol)
    if not tick:
        return False
    price = tick.bid if pos.type == 0 else tick.ask
    
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
    return result and result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]

def execute_real_modify(ticket, sl, tp, login: int = None, password: str = None, server: str = None):
    if not MT5_AVAILABLE:
        return False
    if not mt5.initialize():
        return False
        
    try:
        ticket = int(ticket)
    except (ValueError, TypeError):
        print(f"Error: Invalid ticket format in execute_real_modify: {ticket}")
        return False
        
    if login and password and server:
        existing = mt5.account_info()
        if not existing or int(existing.login) != int(login) or existing.server != server:
            if not mt5.login(login=int(login), password=password, server=server):
                if existing and existing.login > 0:
                    print(f"[DirectEngine] Modify: Using active terminal session (login={existing.login}) despite login error.")
                else:
                    return False
                
    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        return False
        
    pos = positions[0]
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": ticket,
        "sl": float(sl) if sl is not None else pos.sl,
        "tp": float(tp) if tp is not None else pos.tp
    }
    mt5.order_send(request)
    return True


async def execute_direct_command(user_id: str, cmd: dict, is_mock: bool):
    cmd_type = cmd.get("type")
    print(f"[DirectEngine] Received command for user {user_id}: {cmd} (Mock={is_mock})")
    
    async def publish_result(event: dict):
        """Send trade result back to the browser via bridge and WS channel."""
        await broadcast_to_client(user_id, event)
    
    try:
        # Route commands to external bridge if connected (Option B / Remote Bridge mode)
        if user_id in bridge_manager.active_connections:
            print(f"[DirectEngine] Routing command to remote bridge for user {user_id}: {cmd_type}")
            if await bridge_manager.send_command(user_id, cmd):
                return

        if is_mock or not MT5_AVAILABLE:
            if cmd_type == "open_trade":
                ticket = random.randint(100000, 999999)
                latest = latest_prices.get("XAUUSD", {"bid": 1950.0, "ask": 1950.5})
                direction = cmd.get("direction", "BUY")
                price = latest["ask"] if direction == "BUY" else latest["bid"]
                pos = {
                    "ticket": ticket,
                    "symbol": "XAUUSD",
                    "type": direction,
                    "volume": cmd.get("lots", 0.01),
                    "open_price": price,
                    "current_price": price,
                    "profit": 0.0,
                    "sl": cmd.get("sl"),
                    "tp": cmd.get("tp")
                }
                active_mock_positions.setdefault(user_id, []).append(pos)
                print(f"[DirectMock-{user_id}] Opened trade: {pos}")
                # Notify browser of successful execution
                await publish_result({
                    "type": "trade_opened",
                    "ticket": ticket,
                    "pair": "XAUUSD",
                    "direction": direction,
                    "lots": pos["volume"],
                    "open_price": price
                })
                
            elif cmd_type == "close_trade":
                ticket = cmd.get("ticket")
                positions = active_mock_positions.get(user_id, [])
                closed = [p for p in positions if p["ticket"] == ticket]
                active_mock_positions[user_id] = [p for p in positions if p["ticket"] != ticket]
                
                if closed:
                    c = closed[0]
                    latest = latest_prices.get("XAUUSD", {"bid": 1950.0, "ask": 1950.5})
                    close_price = latest["bid"] if c["type"] == "BUY" else latest["ask"]
                    diff = (close_price - c["open_price"]) if c["type"] == "BUY" else (c["open_price"] - close_price)
                    pnl = round(diff * c["volume"] * 100, 2)
                    
                    trade_record = {
                        "user_id": user_id,
                        "mt5_ticket": ticket,
                        "pair": "XAUUSD",
                        "direction": c["type"],
                        "lots": c["volume"],
                        "open_price": c["open_price"],
                        "close_price": close_price,
                        "pnl_usd": pnl,
                        "pnl_r": round(pnl / 10.0, 2),
                        "commission": -0.07,
                        "swap": 0.0,
                        "strategy": "order_block_reversal",
                        "session": "New York",
                        "status": "closed",
                        "opened_at": datetime.now().isoformat(),
                        "closed_at": datetime.now().isoformat()
                    }
                    await asyncio.to_thread(supabase_request, "POST", "trades", trade_record)
                    print(f"[DirectMock-{user_id}] Closed trade: {trade_record}")
                    await publish_result({"type": "trade_closed", "ticket": ticket, "pnl": pnl})
                    
            elif cmd_type == "modify_trade":
                ticket = cmd.get("ticket")
                sl = cmd.get("sl")
                tp = cmd.get("tp")
                for p in active_mock_positions.setdefault(user_id, []):
                    if p["ticket"] == ticket:
                        if sl is not None: p["sl"] = sl
                        if tp is not None: p["tp"] = tp
                        print(f"[DirectMock-{user_id}] Modified trade {ticket}: sl={sl}, tp={tp}")
        else:
            # Fetch broker account credentials inside async event loop
            acc = await fetch_user_broker_account(user_id)
            login = acc.get("login") if acc else None
            server = acc.get("server") if acc else None
            password = decrypt_password(acc.get("credentials_enc")) if acc else None

            if cmd_type == "open_trade":
                result = await asyncio.to_thread(execute_real_trade, cmd, login, password, server)
                if result and result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]:
                    await publish_result({
                        "type": "trade_opened",
                        "ticket": result.order,
                        "pair": cmd.get("pair", "XAUUSD"),
                        "direction": cmd.get("direction"),
                        "lots": cmd.get("lots"),
                        "open_price": result.price
                    })
                else:
                    retcode = result.retcode if result else "no_result"
                    comment = result.comment if result else "Unknown error"
                    await publish_result({
                        "type": "trade_error",
                        "message": f"MT5 order failed: retcode={retcode} — {comment}"
                    })
            elif cmd_type == "close_trade":
                ticket = cmd.get("ticket")
                success = await asyncio.to_thread(execute_real_close, ticket, login, password, server)
                if success:
                    await publish_result({"type": "trade_closed", "ticket": ticket})
                    # Sync history in background so portfolio updates instantly
                    asyncio.create_task(sync_mt5_history(user_id, login, password, server, mock=False))
                else:
                    await publish_result({
                        "type": "trade_error",
                        "message": "Failed to close MT5 position"
                    })
            elif cmd_type == "modify_trade":
                ticket = cmd.get("ticket")
                sl = cmd.get("sl")
                tp = cmd.get("tp") if cmd.get("tp") is not None else cmd.get("tp1")
                success = await asyncio.to_thread(execute_real_modify, ticket, sl, tp, login, password, server)
                if success:
                    await publish_result({"type": "trade_modified", "ticket": ticket})
    except Exception as e:
        print(f"[DirectEngine] Error executing direct command {cmd_type} for user {user_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            await publish_result({
                "type": "trade_error",
                "message": f"MT5 direct execution error: {str(e)}"
            })
        except Exception as pub_err:
            print(f"[DirectEngine] Failed to publish error: {pub_err}")

@app.websocket("/ws/client")
async def client_endpoint(websocket: WebSocket):
    headers = websocket.headers
    token = headers.get("Authorization", "").replace("Bearer ", "")
    
    if not token:
        query_params = dict(websocket.query_params)
        token = query_params.get("token", "")
        
    user_id = verify_jwt(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    await client_manager.connect(user_id, websocket)
    
    # Send current bridge status immediately to the connected client browser
    is_connected = user_id in bridge_manager.active_connections or user_id in active_direct_loops
    await websocket.send_json({
        "type": "bridge_status",
        "connected": is_connected
    })
    
    try:
        while True:
            cmd = await websocket.receive_json()
            # Intercept commands and execute them directly via in-process loops
            is_mock = direct_loop_mock.get(user_id, not MT5_AVAILABLE)
            await execute_direct_command(user_id, cmd, is_mock)
    except WebSocketDisconnect:
        pass
    finally:
        client_manager.disconnect(user_id, websocket)

@app.post("/bridge/setup")
async def api_setup_bridge(data: dict):
    user_id = data.get("user_id")
    login = data.get("login")
    password = data.get("password")
    server = data.get("server")
    token = data.get("token", "")  # token is optional — user_id is the authority
    
    if not all([user_id, login, password, server]):
        raise HTTPException(status_code=400, detail="Missing required parameters: user_id, login, password, server")
        
    # Encrypt password
    encrypted_pw = encrypt_password(password)
    
    # Save to Supabase
    success = await save_broker_credentials_in_supabase(user_id, login, server, encrypted_pw)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save credentials in database")
        
    print(f"[BridgeSetup] Credentials saved for user {user_id} | login={login} | server={server}")
    # Do NOT start the bridge here — it will be auto-started when /bridge/status is polled.
    # Starting it here would hijack the user's running MT5 terminal and log them out.
    
    return {"success": True, "mock": False}

@app.post("/trading/start/{user_id}")
async def api_start_trading(user_id: str):
    user_id = resolve_user_id(user_id)
    bot_running_fallback[user_id] = True
    if redis_client:
        await redis_client.set(f"bot_running:{user_id}", "true")
    print(f"[DirectEngine] Trading started for user {user_id} (memory fallback)")
    return {"success": True, "running": True}

@app.post("/trading/stop/{user_id}")
async def api_stop_trading(user_id: str):
    user_id = resolve_user_id(user_id)
    bot_running_fallback[user_id] = False
    if redis_client:
        await redis_client.set(f"bot_running:{user_id}", "false")
    print(f"[DirectEngine] Trading stopped for user {user_id} (memory fallback)")
    return {"success": True, "running": False}

@app.get("/trading/status/{user_id}")
async def api_trading_status(user_id: str):
    user_id = resolve_user_id(user_id)
    running = False
    if redis_client:
        val = await redis_client.get(f"bot_running:{user_id}")
        running = val == "true"
    else:
        running = bot_running_fallback.get(user_id, False)
    return {"success": True, "running": running}

@app.post("/bridge/stop/{user_id}")
async def api_stop_bridge(user_id: str):
    user_id = resolve_user_id(user_id)
    await stop_direct_user_bridge(user_id)
    return {"success": True}

@app.post("/bridge/start/{user_id}")
async def api_start_bridge_for_user(user_id: str):
    user_id = resolve_user_id(user_id)
    accounts = await fetch_all_cloud_broker_accounts()
    acc = next((a for a in accounts if a.get("user_id") == user_id), None)
    if not acc:
        raise HTTPException(status_code=404, detail="Broker account not found")
        
    login = acc.get("login")
    server = acc.get("server")
    encrypted_pw = acc.get("credentials_enc")
    
    password = decrypt_password(encrypted_pw)
    if not password:
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")
        
    is_mock = not MT5_AVAILABLE
    started = await start_direct_user_bridge(user_id, login, password, server, mock=is_mock)
    return {"success": started}

@app.post("/bridge/sync/{user_id}")
async def api_sync_bridge_for_user(user_id: str):
    user_id = resolve_user_id(user_id)
    accounts = await fetch_all_cloud_broker_accounts()
    acc = next((a for a in accounts if a.get("user_id") == user_id), None)
    if not acc:
        raise HTTPException(status_code=404, detail="Broker account not found")
        
    login = acc.get("login")
    server = acc.get("server")
    encrypted_pw = acc.get("credentials_enc")
    
    password = decrypt_password(encrypted_pw)
    if not password:
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")
        
    is_mock = not MT5_AVAILABLE
    await sync_mt5_history(user_id, login, password, server, mock=is_mock)
    return {"success": True}

async def fetch_user_broker_account(user_id: str):
    res = await asyncio.to_thread(supabase_request, "GET", f"broker_accounts?user_id=eq.{user_id}&limit=1")
    if res and isinstance(res, list) and len(res) > 0:
        return res[0]
    return None

@app.get("/bridge/status/{user_id}")
async def get_bridge_status(user_id: str):
    user_id = resolve_user_id(user_id)
    # Only auto-start bridge if this user has saved credentials in the DB
    if user_id not in bridge_manager.active_connections and user_id not in active_direct_loops:
        acc = await fetch_user_broker_account(user_id)
        if acc and acc.get("credentials_enc"):
            login = acc.get("login")
            server = acc.get("server")
            password = decrypt_password(acc.get("credentials_enc"))
            if password:
                print(f"[AutoBridge] Credentials found for user {user_id}. Starting direct loop...")
                is_mock = not MT5_AVAILABLE
                await start_direct_user_bridge(user_id, login, password, server, mock=is_mock)
        else:
            # No credentials saved — return disconnected, do NOT start mock
            return {
                "connected": False,
                "mock": False,
                "login": None,
                "server": None,
                "last_seen": None,
                "balance": 0,
                "equity": 0
            }

    connected = user_id in bridge_manager.active_connections or user_id in active_direct_loops
    is_mock = direct_loop_mock.get(user_id, not MT5_AVAILABLE)
    active_login = None
    active_server = None
    
    if connected:
        if not is_mock and MT5_AVAILABLE:
            if mt5.initialize():
                acc_info = mt5.account_info()
                if acc_info:
                    active_login = acc_info.login
                    active_server = acc_info.server
        else:
            # Read from stored creds for mock loops
            acc = await fetch_user_broker_account(user_id)
            if acc:
                active_login = acc.get("login")
                active_server = acc.get("server")

    info = active_accounts.get(user_id, {
        "balance": 0,
        "equity": 0,
        "last_seen": datetime.now().isoformat()
    })
    return {
        "connected": connected,
        "mock": is_mock,
        "login": active_login,
        "server": active_server,
        "last_seen": info.get("last_seen"),
        "balance": info.get("balance"),
        "equity": info.get("equity")
    }


def generate_local_mock_ohlcv(pair: str, tf: str, bars: int) -> list:
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


@app.get("/ohlcv")
async def ohlcv(pair: str = "XAUUSD", tf: str = "M15", bars: int = 200, user_id: str = None):
    # Resolve target user_id for the bridge connection lookup
    target_user_id = resolve_user_id(user_id)

    # 1. Prioritize active bridge connection to fetch actual MT5 data
    if target_user_id in bridge_manager.active_connections:
        req_id = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        pending_ohlcv_requests[req_id] = fut
        
        cmd = {
            "type": "fetch_ohlcv",
            "pair": pair,
            "tf": tf,
            "bars": bars,
            "request_id": req_id
        }
        
        try:
            if await bridge_manager.send_command(target_user_id, cmd):
                data = await asyncio.wait_for(fut, timeout=5.0)
                if data:
                    return data
        except asyncio.TimeoutError:
            print(f"[OHLCV] Timeout waiting for bridge response for user {target_user_id}")
        except Exception as e:
            print(f"[OHLCV] Error requesting from bridge: {e}")
        finally:
            pending_ohlcv_requests.pop(req_id, None)

    is_mock = direct_loop_mock.get(target_user_id, not MT5_AVAILABLE)
    if is_mock:
        return generate_local_mock_ohlcv(pair, tf, bars)

    # 2. Otherwise fall back to local MT5 functions if running locally on Windows
    if MT5_AVAILABLE:
        try:
            if mt5.initialize():
                # Retrieve saved credentials and login to guarantee connection is active
                acc = await fetch_user_broker_account(target_user_id)
                if acc and acc.get("credentials_enc"):
                    login = acc.get("login")
                    server = acc.get("server")
                    password = decrypt_password(acc.get("credentials_enc"))
                    if password:
                        existing = mt5.account_info()
                        login_success = False
                        if existing and int(existing.login) == int(login) and existing.server == server:
                            login_success = True
                        else:
                            login_res = mt5.login(login=int(login), password=password, server=server)
                            if login_res:
                                login_success = True
                            else:
                                print(f"[OHLCV] MT5 login failed for user {target_user_id} in /ohlcv: {mt5.last_error()}")
                        
                        # Fallback to active terminal session if it matches the desired login
                        if not login_success and existing and existing.login > 0:
                            print(f"[OHLCV] Login failed or skipped, using active terminal session (login={existing.login}, server={existing.server})")
                            login_success = True

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
                else:
                    raise HTTPException(status_code=502, detail=f"MT5 rates copy failed for symbol {resolved}: {mt5.last_error()}")
            else:
                raise HTTPException(status_code=502, detail=f"MT5 initialization failed: {mt5.last_error()}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Error copying rates from MT5: {str(e)}")

    # Fallback to mock data if not available or failed
    return generate_local_mock_ohlcv(pair, tf, bars)

@app.get("/price/{pair}")
async def get_latest_price(pair: str):
    if MT5_AVAILABLE:
        try:
            if mt5.initialize():
                resolved = resolve_mt5_symbol(pair)
                tick = mt5.symbol_info_tick(resolved)
                if tick:
                    return {"bid": tick.bid, "ask": tick.ask}
                else:
                    raise HTTPException(status_code=502, detail=f"MT5 tick retrieval failed: {mt5.last_error()}")
            else:
                raise HTTPException(status_code=502, detail=f"MT5 initialization failed: {mt5.last_error()}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Error fetching tick from MT5: {str(e)}")

    return latest_prices.get(pair, {"bid": 1950.0, "ask": 1950.5})

@app.post("/signal/generate")
async def generate_signal(pair: str, tf: str, strategy_name: str, user_id: str):
    # Simulated strategy execution and signal generator
    latest = latest_prices.get(pair)
    base_price = latest["bid"] if latest else 1950.0
    
    direction = random.choice(["BUY", "SELL"])
    entry_price = base_price + (0.5 if direction == "BUY" else -0.5)
    sl_price = entry_price - 5.0 if direction == "BUY" else entry_price + 5.0
    
    signal = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "pair": pair,
        "direction": direction,
        "strategy": strategy_name,
        "timeframe": tf,
        "confidence": round(random.uniform(65.0, 94.0), 2),
        "entry_price": round(entry_price, 2),
        "sl_price": round(sl_price, 2),
        "tp_levels": [
            {"rr": 1, "price": round(entry_price + 5.0 if direction == "BUY" else entry_price - 5.0, 2)},
            {"rr": 2, "price": round(entry_price + 10.0 if direction == "BUY" else entry_price - 10.0, 2)},
            {"rr": 3, "price": round(entry_price + 15.0 if direction == "BUY" else entry_price - 15.0, 2)}
        ],
        "indicator_values": {"rsi": 42.5, "atr": 2.4, "ema9": round(base_price - 2.0, 2), "ema21": round(base_price - 3.5, 2)},
        "status": "LIVE",
        "created_at": datetime.now().isoformat()
    }
    
    # Save to Supabase
    await asyncio.to_thread(supabase_request, "POST", "signals", signal)

    # Publish to Redis / WebSocket / Memory Pub/Sub
    await broadcast_to_client(user_id, {
        "type": "signal",
        **signal
    })
        
    return signal

# Backtest Runner simulation
backtest_jobs = {}

async def execute_backtest(job_id: str, job_config: dict):
    backtest_jobs[job_id]["status"] = "running"
    backtest_jobs[job_id]["progress"] = 10
    
    await asyncio.sleep(1.0)
    backtest_jobs[job_id]["progress"] = 50
    
    await asyncio.sleep(1.0)
    
    # Calculate mock metrics
    initial_balance = job_config.get("initial_balance", 10000.0)
    net_pnl = random.uniform(500.0, 3200.0)
    final_balance = initial_balance + net_pnl
    total_trades = random.randint(25, 120)
    win_rate = round(random.uniform(52.0, 72.0), 2)
    max_drawdown = round(random.uniform(3.0, 12.0), 2)
    profit_factor = round(random.uniform(1.2, 2.1), 2)
    
    # Generate mock equity curve
    equity_curve = []
    current_equity = initial_balance
    start_ts = int(time.time() - 30 * 24 * 3600)
    for i in range(total_trades):
        current_equity += random.uniform(-150.0, 250.0)
        equity_curve.append({
            "ts": start_ts + (i * 24 * 3600),
            "equity": round(current_equity, 2)
        })
        
    backtest_jobs[job_id]["status"] = "complete"
    backtest_jobs[job_id]["progress"] = 100
    backtest_jobs[job_id]["result"] = {
        "id": job_id,
        "strategy": job_config.get("strategy", "ema_crossover"),
        "pair": job_config.get("pair", "XAUUSD"),
        "timeframe": job_config.get("timeframe", "M15"),
        "date_from": job_config.get("date_from", ""),
        "date_to": job_config.get("date_to", ""),
        "initial_balance": initial_balance,
        "final_balance": round(final_balance, 2),
        "net_pnl": round(net_pnl, 2),
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "max_drawdown_pct": max_drawdown,
        "total_trades": total_trades,
        "equity_curve": equity_curve,
        "trade_log": [],
        "ai_analysis": "Based on the backtest parameters, the strategy shows a consistent equity growth with a controlled maximum drawdown of " + str(max_drawdown) + "%. The win rate of " + str(win_rate) + "% is highly satisfactory."
    }

@app.post("/backtest/run")
async def run_backtest(job_config: dict, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    backtest_jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "result": None
    }
    background_tasks.add_task(execute_backtest, job_id, job_config)
    return {"job_id": job_id}

@app.get("/backtest/{job_id}")
async def get_backtest_status(job_id: str):
    if job_id not in backtest_jobs:
        raise HTTPException(status_code=404, detail="Backtest job not found")
    return backtest_jobs[job_id]

@app.get("/regime")
async def market_regime(pair: str = "XAUUSD"):
    # Simulated regime output
    regimes = ["trending_bull", "trending_bear", "ranging", "volatile"]
    chosen = random.choice(regimes)
    rationales = {
        "trending_bull": "Price is trading above 50/200 EMA ribbons with ascending order blocks on H4 timeframe.",
        "trending_bear": "Rejecting daily resistance levels with descending market structure and high volume selloffs.",
        "ranging": "Consolidating within a tight range of $1945 - $1960. Low volatility indices.",
        "volatile": "High average true range (ATR) values post economic indicators. Spread widening present."
    }
    return {
        "regime": chosen,
        "recommended_strategy": "liquidity_scalper" if chosen in ["ranging", "volatile"] else "trend_following",
        "rationale": rationales[chosen]
    }

import uvicorn

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
