import MetaTrader5 as mt5

if not mt5.initialize():
    print("Failed to initialize MT5")
    exit(1)

# Login
login = 1110885
server = "VTMarkets-Demo"
password = "A65y97m@"
if mt5.login(login=login, password=password, server=server):
    print("Login successful")
else:
    print("Login failed:", mt5.last_error())
    exit(1)

symbol = "XAUUSD"
direction = "BUY"

terminal_symbol = symbol
if mt5.symbol_select(terminal_symbol, True):
    print("Found symbol directly:", terminal_symbol)
else:
    print("Symbol not found directly. Searching...")
    symbols = mt5.symbols_get()
    if symbols:
        matches = [s for s in symbols if symbol.upper() in s.name.upper()]
        print(f"Matches for {symbol}: {[s.name for s in matches]}")
        for s in matches:
            trade_mode = getattr(s, 'trade_mode', 4)
            print(f"Symbol: {s.name}, trade_mode: {trade_mode}")
            if trade_mode != 0:
                if mt5.symbol_select(s.name, True):
                    terminal_symbol = s.name
                    print("Resolved to:", terminal_symbol)
                    break

info = mt5.symbol_info(terminal_symbol)
if not info:
    print(f"Error: Symbol {terminal_symbol} not found on server.")
else:
    print("Symbol info found for:", terminal_symbol)
    tick = mt5.symbol_info_tick(terminal_symbol)
    if not tick:
        print("Error: Could not retrieve tick")
    else:
        print(f"Tick retrieved: bid={tick.bid}, ask={tick.ask}")

mt5.shutdown()
