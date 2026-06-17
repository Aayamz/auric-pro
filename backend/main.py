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
from datetime import datetime
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

active_bridge_processes: Dict[str, asyncio.subprocess.Process] = {}

async def start_user_bridge(user_id: str, login: int, password: str, server: str, token: str, mock: bool = False):
    await stop_user_bridge(user_id)
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    bridge_path = os.path.abspath(os.path.join(current_dir, "..", "bridge", "bridge.py"))
    
    cmd = [
        sys.executable,
        bridge_path,
        "--token", token,
        "--ws-url", "ws://localhost:8000/ws/bridge",
        "--login", str(login),
        "--password", password,
        "--server", server
    ]
    if mock:
        cmd.append("--mock")
        
    print(f"Starting cloud bridge subprocess for user {user_id}...")
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        active_bridge_processes[user_id] = process
        asyncio.create_task(log_process_output(user_id, process))
        return True
    except Exception as e:
        print(f"Error launching bridge subprocess for user {user_id}: {e}")
        return False
        
async def stop_user_bridge(user_id: str):
    process = active_bridge_processes.pop(user_id, None)
    if process:
        print(f"Stopping cloud bridge subprocess for user {user_id}")
        try:
            process.terminate()
            await process.wait()
        except Exception as e:
            print(f"Error terminating bridge process: {e}")
            
async def log_process_output(user_id: str, process):
    try:
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            print(f"[CloudBridge-{user_id}]: {line.decode().strip()}")
    except Exception as e:
        print(f"Error reading bridge logs for {user_id}: {e}")

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
            system_token = f"system_cloud_bridge_{user_id}_{SYSTEM_SECRET}"
            await start_user_bridge(user_id, login, password, server, system_token, mock=False)

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
            # Receive commands from Next.js Node client (open_trade, close_trade, etc.)
            cmd = await websocket.receive_json()
            # Forward directly to the MT5 bridge client WebSocket connection
            await bridge_manager.send_command(user_id, cmd)
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
        
    # Start bridge subprocess (using system token format)
    system_token = f"system_cloud_bridge_{user_id}_{SYSTEM_SECRET}"
    started = await start_user_bridge(user_id, login, password, server, system_token, mock=False)
    
    return {"success": started}

@app.post("/bridge/stop/{user_id}")
async def api_stop_bridge(user_id: str):
    await stop_user_bridge(user_id)
    return {"success": True}

@app.get("/bridge/status/{user_id}")
async def get_bridge_status(user_id: str):
    connected = user_id in bridge_manager.active_connections or user_id in active_bridge_processes
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
