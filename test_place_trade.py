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

symbol = "XAUUSD-VIP"
mt5.symbol_select(symbol, True)
info = mt5.symbol_info(symbol)
tick = mt5.symbol_info_tick(symbol)

request = {
    "action": mt5.TRADE_ACTION_DEAL,
    "symbol": symbol,
    "volume": 0.01,
    "type": mt5.ORDER_TYPE_BUY,
    "price": tick.ask,
    "sl": 0.0,
    "tp": 0.0,
    "deviation": 20,
    "magic": 202400,
    "comment": "Test Trade Resolution",
    "type_time": mt5.ORDER_TIME_GTC,
}

filling_modes = [
    mt5.ORDER_FILLING_FOK,
    mt5.ORDER_FILLING_IOC,
    mt5.ORDER_FILLING_RETURN
]

for fill_mode in filling_modes:
    request["type_filling"] = fill_mode
    result = mt5.order_send(request)
    print(f"\nTrying filling mode: {fill_mode}")
    if result is None:
        print("Result is None. Last error:", mt5.last_error())
    else:
        print(f"Retcode: {result.retcode}")
        print(f"Comment: {result.comment}")
        print(f"Order: {result.order}")
        if result.retcode in [mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_PLACED]:
            print("SUCCESS!")
            # Close the trade if success
            if result.order > 0:
                print("Closing the opened trade...")
                close_tick = mt5.symbol_info_tick(symbol)
                close_request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "symbol": symbol,
                    "volume": 0.01,
                    "type": mt5.ORDER_TYPE_SELL,
                    "position": result.order,
                    "price": close_tick.bid,
                    "deviation": 20,
                    "magic": 202400,
                    "comment": "Test Trade Close",
                    "type_time": mt5.ORDER_TIME_GTC,
                    "type_filling": fill_mode
                }
                close_result = mt5.order_send(close_request)
                if close_result:
                    print(f"Close retcode: {close_result.retcode}, comment: {close_result.comment}")
            break
        else:
            print("FAILED")

mt5.shutdown()
