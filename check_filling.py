import MetaTrader5 as mt5

if not mt5.initialize():
    print("Failed to initialize MT5")
    exit(1)

symbol = "XAUUSD-VIP"
mt5.symbol_select(symbol, True)
info = mt5.symbol_info(symbol)
if info:
    print(f"Symbol: {info.name}")
    print(f"  filling_mode: {info.filling_mode}")
    print(f"  trade_mode: {info.trade_mode}")
    print(f"  execution_mode: {info.trade_execution}")
    
    # Let's map the filling mode flags:
    # SYMBOL_FILLING_FOK = 1
    # SYMBOL_FILLING_IOC = 2
    # SYMBOL_FILLING_RETURN = 0 (or is it a combination?)
    print("  Supported filling modes:")
    if info.filling_mode & mt5.SYMBOL_FILLING_FOK:
        print("    ORDER_FILLING_FOK (1)")
    if info.filling_mode & mt5.SYMBOL_FILLING_IOC:
        print("    ORDER_FILLING_IOC (2)")
    # Wait, if neither FOK nor IOC is set, it might be RETURN or another mode.
    # In python mt5:
    # SYMBOL_FILLING_FOK is 1
    # SYMBOL_FILLING_IOC is 2
    # If both are 0, it means RETURN or execution is by default/any.
else:
    print(f"Symbol {symbol} not found")

mt5.shutdown()
