import MetaTrader5 as mt5

if not mt5.initialize():
    print("Failed to initialize MT5")
    exit(1)

symbol = "XAUUSD-VIP"
selected = mt5.symbol_select(symbol, True)
print(f"Symbol select status for {symbol}: {selected}")

tick = mt5.symbol_info_tick(symbol)
if tick:
    print(f"Tick: bid={tick.bid}, ask={tick.ask}, spread={tick.ask - tick.bid}")
else:
    print(f"Failed to get tick for {symbol}")
    print("Last error:", mt5.last_error())

mt5.shutdown()
