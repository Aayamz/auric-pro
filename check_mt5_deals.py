import MetaTrader5 as mt5
from datetime import datetime
import pandas as pd

if not mt5.initialize():
    print("MT5 initialize failed")
    exit(1)

acc = mt5.account_info()
if acc:
    print(f"Logged in as: {acc.login} on {acc.server}")
    print(f"Balance: {acc.balance}, Equity: {acc.equity}")
else:
    print("Failed to get account info")
    exit(1)

from_date = datetime(2020, 1, 1)
to_date = datetime.now()
deals = mt5.history_deals_get(from_date, to_date)
if deals is None:
    print("Failed to get deals history")
    exit(1)

print(f"Total deals in history: {len(deals)}")

# Group deals by position_id
positions = {}
for deal in deals:
    deal_dict = deal._asdict()
    pos_id = deal_dict.get("position_id")
    if not pos_id:
        continue
    positions.setdefault(pos_id, []).append(deal_dict)

print(f"Total reconstructed positions: {len(positions)}")

# Let's look at the last 15 positions in MT5
reconstructed = []
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
    profit = 0.0
    commission = 0.0
    swap = 0.0

    # Sum up commission and swap from all deals in this position
    for d in pos_deals:
        commission += d.get("commission", 0.0)
        swap += d.get("swap", 0.0)
        if d.get("entry") == 1:
            profit += d.get("profit", 0.0)

    if exit_deal:
        close_price = exit_deal.get("price")
        closed_at = datetime.fromtimestamp(exit_deal.get("time")).isoformat()

    pnl_usd = profit + commission + swap

    reconstructed.append({
        "ticket": pos_id,
        "symbol": entry_deal.get("symbol"),
        "direction": direction,
        "lots": lots,
        "open_price": open_price,
        "close_price": close_price,
        "profit_raw": profit,
        "pnl_usd": pnl_usd,
        "opened_at": opened_at,
        "closed_at": closed_at
    })

df = pd.DataFrame(reconstructed)
df['opened_at'] = pd.to_datetime(df['opened_at'])
df = df.sort_values(by='opened_at', ascending=False)

print("\nLast 15 reconstructed positions from MT5:")
print(df.head(15).to_string())

print(f"\nSum of reconstructed pnl_usd: {df['pnl_usd'].sum():.2f}")
print(f"Number of closed trades: {df['close_price'].notnull().sum()}")
mt5.shutdown()
