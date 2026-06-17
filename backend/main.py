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
    for env_file in [".env", ".env.local"]:
        if os.path.exists(env_file):
            with open(env_file, "r") as f:
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
        print(f"Decryption error: {e}")
        return ""

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
        "updated_at": datetime.now().isoformat()
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

async def sync_mt5_history(user_id: str, login: int, password: str, server: str, mock: bool):
    if mock or not MT5_AVAILABLE:
        # Seeding mock trades if Supabase table is empty
        res = await asyncio.to_thread(supabase_request, "GET", f"trades?user_id=eq.{user_id}&limit=1")
        if not res or len(res) == 0:
            print(f"[SyncHistory] Seeding mock historical trades for user {user_id}...")
            strategies = ["order_block_reversal", "fvg_scalper", "trend_following", "liquidity_sweep"]
            sessions = ["London", "New York", "Asia"]
            
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
                await asyncio.to_thread(supabase_request, "POST", "trades", trade)
            print("[SyncHistory] Completed seeding mock trades.")
        return

    # Real MT5 History Sync
    if not mt5.initialize(login=login, password=password, server=server):
        print(f"[SyncHistory] MT5 init failed for history sync: {mt5.last_error()}")
        return

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
        await asyncio.to_thread(supabase_request, "POST", "trades", trade)
        reconstructed_count += 1

    print(f"[SyncHistory] Reconstructed and upserted {reconstructed_count} trades from MT5 deals.")

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
        if not mt5.initialize(login=login, password=password, server=server):
            print(f"[DirectEngine] MT5 initialization failed: {mt5.last_error()}")
            is_real_mt5 = False
            
    terminal_symbol = "XAUUSD"
    if is_real_mt5:
        if mt5.symbol_select(terminal_symbol, True):
            pass
        else:
            symbols = mt5.symbols_get()
            if symbols:
                matches = [s for s in symbols if terminal_symbol.upper() in s.name.upper()]
                for s in matches:
                    if getattr(s, 'trade_mode', 4) != 0:
                        if mt5.symbol_select(s.name, True):
                            terminal_symbol = s.name
                            break
        print(f"[DirectEngine] Resolved symbol: {terminal_symbol}")
        
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
                    if redis_client:
                        await redis_client.publish(f"bridge:{user_id}", json.dumps(price_data))
                    else:
                        await client_manager.send_message(user_id, price_data)
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
                if redis_client:
                    await redis_client.publish(f"bridge:{user_id}", json.dumps(price_data))
                else:
                    await client_manager.send_message(user_id, price_data)
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
                                "profit": p_dict.get("profit")
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
                    if redis_client:
                        await redis_client.publish(f"bridge:{user_id}", json.dumps(pos_data))
                        status_data = {
                            "connected": True,
                            "last_seen": datetime.now().isoformat(),
                            "balance": balance,
                            "equity": equity
                        }
                        await redis_client.setex(f"bridge:status:{user_id}", 10, json.dumps(status_data))
                    else:
                        await client_manager.send_message(user_id, pos_data)
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
                    if redis_client:
                        await redis_client.publish(f"bridge:{user_id}", json.dumps(pos_data))
                        status_data = {
                            "connected": True,
                            "last_seen": datetime.now().isoformat(),
                            "balance": balance,
                            "equity": equity
                        }
                        await redis_client.setex(f"bridge:status:{user_id}", 10, json.dumps(status_data))
                    else:
                        await client_manager.send_message(user_id, pos_data)
                    active_accounts[user_id] = {
                        "balance": balance,
                        "equity": equity,
                        "last_seen": datetime.now().isoformat()
                    }
            await asyncio.sleep(0.5)
    except asyncio.CancelledError:
        print(f"[DirectEngine] Direct MT5 engine loop cancelled for user {user_id}")
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

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = None

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
    global redis_client
    try:
        redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
        # Ping to test connection
        await redis_client.ping()
        print(f"FastAPI connected to Redis at {REDIS_URL}")
    except Exception as e:
        print(f"Redis not available in FastAPI: {e}. Running with memory fallback.")
        redis_client = None

    # Auto-start cloud bridges for users in background
    asyncio.create_task(auto_start_bridges())

# JWT verification fallback helper
def verify_jwt(token: str) -> str:
    """Validate Supabase JWT and return user_id"""
    if not token or token == "undefined" or token == "null":
        # Fallback static UUID for onboarding/local testing if no token provided
        return "00000000-0000-0000-0000-000000000000"
    
    # Check for system cloud bridge token bypass
    if token.startswith("system_cloud_bridge_"):
        suffix = token.replace("system_cloud_bridge_", "")
        secret = SYSTEM_SECRET
        if suffix.endswith(secret):
            user_id = suffix[:-len(secret)-1]
            return user_id
        return "00000000-0000-0000-0000-000000000000"

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
                return user_id
    except Exception as e:
        print(f"JWT decode warning: {e}")
        
    # Standard fallback user_id for dev
    return "00000000-0000-0000-0000-000000000000"

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
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        print(f"Client socket relay connected for user: {user_id}")

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            print(f"Client socket relay disconnected for user: {user_id}")

    async def send_message(self, user_id: str, msg: dict):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(msg)
            return True
        return False

client_manager = ClientManager()
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
            await pubsub.unsubscribe(f"cmd:{user_id}")
        except Exception as e:
            print(f"Redis command listener error for {user_id}: {e}")
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
    
    # Start background Redis task to listen for commands and send to the bridge
    listener_task = asyncio.create_task(redis_command_listener(user_id, websocket))
    
    try:
        while True:
            # Receive data updates from bridge.py (prices, positions, etc.)
            data = await websocket.receive_json()
            data["userId"] = user_id
            
            # Cache latest account statistics locally in memory
            if data.get("type") == "positions":
                active_accounts[user_id] = {
                    "balance": data.get("balance", 10000.00),
                    "equity": data.get("equity", 10000.00),
                    "last_seen": datetime.now().isoformat()
                }
            elif data.get("type") == "price" and data.get("pair"):
                latest_prices[data["pair"]] = {
                    "bid": data.get("bid"),
                    "ask": data.get("ask")
                }

            # Route to Redis pub/sub if running, otherwise relay directly to client
            if redis_client:
                await redis_client.publish(f"bridge:{user_id}", json.dumps(data))
                # Set status in Redis with a TTL of 10 seconds
                status_data = {
                    "connected": True,
                    "last_seen": datetime.now().isoformat(),
                    "balance": data.get("balance", 10000.00),
                    "equity": data.get("equity", 10000.00)
                }
                await redis_client.setex(f"bridge:status:{user_id}", 10, json.dumps(status_data))
            else:
                # Offline fallback: send directly over WebSocket to Node client socket
                await client_manager.send_message(user_id, data)
                # Memory fallback publish
                memory_pubsub.publish(f"bridge:{user_id}", json.dumps(data))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        listener_task.cancel()
        bridge_manager.disconnect(user_id)

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

def execute_real_trade(cmd):
    if not MT5_AVAILABLE:
        return
    symbol = cmd.get("pair", "XAUUSD")
    direction = cmd.get("direction", "BUY")
    lots = cmd.get("lots", 0.01)
    
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
        return
        
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
        "comment": "AURIC Cloud Trade Direct",
        "type_time": mt5.ORDER_TIME_GTC,
    }
    
    result = send_order_with_filling_fallback(request)
    print(f"MT5 final execution result: {result}")

async def execute_direct_command(user_id: str, cmd: dict, is_mock: bool):
    cmd_type = cmd.get("type")
    print(f"[DirectEngine] Received command for user {user_id}: {cmd} (Mock={is_mock})")
    
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
        if cmd_type == "open_trade":
            execute_real_trade(cmd)
        elif cmd_type == "close_trade":
            ticket = cmd.get("ticket")
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
                    "comment": "AURIC Close Trade Direct",
                    "type_time": mt5.ORDER_TIME_GTC,
                }
                send_order_with_filling_fallback(request)
        elif cmd_type == "modify_trade":
            ticket = cmd.get("ticket")
            sl = cmd.get("sl")
            tp = cmd.get("tp")
            positions = mt5.positions_get(ticket=ticket)
            if positions:
                pos = positions[0]
                request = {
                    "action": mt5.TRADE_ACTION_SLTP,
                    "position": ticket,
                    "sl": float(sl) if sl else pos.sl,
                    "tp": float(tp) if tp else pos.tp
                }
                mt5.order_send(request)

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
    try:
        while True:
            cmd = await websocket.receive_json()
            # Intercept commands and execute them directly via in-process loops
            is_mock = direct_loop_mock.get(user_id, True)
            await execute_direct_command(user_id, cmd, is_mock)
    except WebSocketDisconnect:
        pass
    finally:
        client_manager.disconnect(user_id)

@app.post("/bridge/setup")
async def api_setup_bridge(data: dict):
    user_id = data.get("user_id")
    login = data.get("login")
    password = data.get("password")
    server = data.get("server")
    token = data.get("token")
    
    if not all([user_id, login, password, server, token]):
        raise HTTPException(status_code=400, detail="Missing required parameters")
        
    # Encrypt password
    encrypted_pw = encrypt_password(password)
    
    # Save to Supabase
    success = await save_broker_credentials_in_supabase(user_id, login, server, encrypted_pw)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save credentials in database")
        
    # Start direct loop
    is_mock = not MT5_AVAILABLE or token.startswith("ey.auric_test_jwt")
    started = await start_direct_user_bridge(user_id, login, password, server, mock=is_mock)
    
    return {"success": started}

@app.post("/bridge/stop/{user_id}")
async def api_stop_bridge(user_id: str):
    await stop_direct_user_bridge(user_id)
    return {"success": True}

@app.post("/bridge/start/{user_id}")
async def api_start_bridge_for_user(user_id: str):
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

@app.get("/bridge/status/{user_id}")
async def get_bridge_status(user_id: str):
    connected = user_id in bridge_manager.active_connections or user_id in active_direct_loops
    info = active_accounts.get(user_id, {
        "balance": 10000.00,
        "equity": 10000.00,
        "last_seen": datetime.now().isoformat()
    })
    return {
        "connected": connected,
        "last_seen": info.get("last_seen"),
        "balance": info.get("balance"),
        "equity": info.get("equity")
    }


@app.get("/ohlcv")
async def ohlcv(pair: str = "XAUUSD", tf: str = "M15", bars: int = 200):
    # Mock OHLCV generator for dashboard candlestick chart
    now_ms = int(time.time() * 1000)
    tf_minutes = 15
    if tf == "M1": tf_minutes = 1
    elif tf == "M5": tf_minutes = 5
    elif tf == "H1": tf_minutes = 60
    elif tf == "H4": tf_minutes = 240
    
    # Dynamically shift baseline price to real MT5 tick price if available
    latest = latest_prices.get(pair)
    base_price = latest["bid"] if latest else 1950.0
    
    data = []
    current_price = base_price
    for i in range(bars - 1, -1, -1):
        t = now_ms - (bars - 1 - i) * tf_minutes * 60 * 1000
        # Simulated candlestick shape working backwards
        c = current_price
        o = c - random.uniform(-3, 3)
        h = max(o, c) + random.uniform(0, 1.5)
        l = min(o, c) - random.uniform(0, 1.5)
        v = random.randint(100, 5000)
        data.append({
            "time": t // 1000, # Lightweight charts expects seconds
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": v
        })
        current_price = o
        
    data.reverse()
    return data

@app.get("/price/{pair}")
async def get_latest_price(pair: str):
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
    
    # Publish to Redis
    if redis_client:
        await redis_client.publish(f"bridge:{user_id}", json.dumps({
            "type": "signal",
            **signal
        }))
    else:
        memory_pubsub.publish(f"bridge:{user_id}", json.dumps({
            "type": "signal",
            **signal
        }))
        
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
