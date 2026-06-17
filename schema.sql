-- AURIC PRO Schema SQL migration
-- All tables: user_id references auth.users, RLS policy: user_id = auth.uid()

-- 1. Broker Accounts
CREATE TABLE broker_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL UNIQUE,
  platform      TEXT NOT NULL CHECK (platform IN ('mt5', 'mt4')),
  server        TEXT NOT NULL,
  login         INTEGER NOT NULL,
  credentials_enc TEXT NOT NULL,    -- Fernet encrypted
  is_connected  BOOLEAN DEFAULT FALSE,
  balance       DECIMAL(12,2),
  equity        DECIMAL(12,2),
  currency      TEXT DEFAULT 'USD',
  leverage      INTEGER,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broker_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON broker_accounts USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON broker_accounts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON broker_accounts FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON broker_accounts FOR DELETE USING (user_id = auth.uid());

-- 2. Risk Profiles
CREATE TABLE risk_profiles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES auth.users NOT NULL UNIQUE,
  risk_pct                 DECIMAL(4,2) DEFAULT 1.0,
  daily_loss_limit_pct     DECIMAL(4,2) DEFAULT 4.0,
  max_drawdown_pct         DECIMAL(4,2) DEFAULT 15.0,
  max_concurrent_positions INTEGER DEFAULT 1,
  max_lot_size             DECIMAL(8,2) DEFAULT 0.1,
  trailing_start_rr        DECIMAL(4,2) DEFAULT 1.0,
  break_even_after_rr      DECIMAL(4,2) DEFAULT 0.8,
  tp_levels                JSONB DEFAULT '[{"rr":1,"close_pct":30},{"rr":2,"close_pct":30},{"rr":3,"close_pct":40}]',
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE risk_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON risk_profiles USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON risk_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON risk_profiles FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON risk_profiles FOR DELETE USING (user_id = auth.uid());

-- 3. User Strategies
CREATE TABLE user_strategies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  strategy_name TEXT NOT NULL,
  config        JSONB NOT NULL,
  is_active     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, strategy_name)
);

ALTER TABLE user_strategies ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON user_strategies USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON user_strategies FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON user_strategies FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON user_strategies FOR DELETE USING (user_id = auth.uid());

-- 4. Signals
CREATE TABLE signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users NOT NULL,
  pair              TEXT NOT NULL,
  direction         TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  strategy          TEXT NOT NULL,
  timeframe         TEXT NOT NULL,
  confidence        DECIMAL(5,2),
  entry_price       DECIMAL(10,5),
  sl_price          DECIMAL(10,5),
  tp_levels         JSONB,           -- [{rr, price}]
  indicator_values  JSONB,           -- snapshot: {rsi, atr, ema9, ema21, ...}
  ai_explanation    TEXT,            -- populated lazily on first view
  status            TEXT DEFAULT 'LIVE',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ
);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON signals USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON signals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON signals FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON signals FOR DELETE USING (user_id = auth.uid());

-- 5. Trades
CREATE TABLE trades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users NOT NULL,
  signal_id     UUID REFERENCES signals,
  mt5_ticket    BIGINT,
  pair          TEXT NOT NULL,
  direction     TEXT NOT NULL,
  lots          DECIMAL(8,2),
  open_price    DECIMAL(10,5),
  close_price   DECIMAL(10,5),
  sl_price      DECIMAL(10,5),
  tp1_price     DECIMAL(10,5),
  tp2_price     DECIMAL(10,5),
  tp3_price     DECIMAL(10,5),
  pnl_usd       DECIMAL(10,2),
  pnl_r         DECIMAL(6,2),
  commission    DECIMAL(8,4),
  swap          DECIMAL(8,4),
  strategy      TEXT,
  session       TEXT,
  status        TEXT DEFAULT 'OPEN',
  opened_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_at     TIMESTAMPTZ
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON trades USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON trades FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON trades FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON trades FOR DELETE USING (user_id = auth.uid());

-- 6. Backtest Results
CREATE TABLE backtest_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  strategy        TEXT NOT NULL,
  pair            TEXT,
  timeframe       TEXT,
  date_from       DATE,
  date_to         DATE,
  initial_balance DECIMAL(12,2),
  final_balance   DECIMAL(12,2),
  net_pnl         DECIMAL(12,2),
  win_rate        DECIMAL(5,2),
  profit_factor   DECIMAL(6,2),
  max_drawdown_pct DECIMAL(5,2),
  total_trades    INTEGER,
  config_snapshot JSONB,
  equity_curve    JSONB,      -- [{ts, equity}]
  trade_log       JSONB,      -- [{...trade fields}]
  ai_analysis     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON backtest_results USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON backtest_results FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON backtest_results FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON backtest_results FOR DELETE USING (user_id = auth.uid());

-- 7. AI Conversations
CREATE TABLE ai_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL,
  messages        JSONB NOT NULL DEFAULT '[]',
  context_snapshot JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON ai_conversations USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON ai_conversations FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON ai_conversations FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON ai_conversations FOR DELETE USING (user_id = auth.uid());

-- 8. Subscriptions
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan            TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'elite')),
  status          TEXT DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON subscriptions USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON subscriptions FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON subscriptions FOR DELETE USING (user_id = auth.uid());

-- 9. Notification Preferences
CREATE TABLE notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL UNIQUE,
  telegram_bot_token TEXT,
  telegram_chat_id   TEXT,
  telegram_enabled   BOOLEAN DEFAULT FALSE,
  email_enabled      BOOLEAN DEFAULT FALSE,
  events          JSONB DEFAULT '{
    "new_signal": true,
    "trade_opened": true,
    "tp_hit": true,
    "sl_hit": true,
    "daily_limit_warning": true,
    "regime_change": false
  }'
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON notification_preferences USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON notification_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON notification_preferences FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON notification_preferences FOR DELETE USING (user_id = auth.uid());

-- 10. User Settings
CREATE TABLE user_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users NOT NULL UNIQUE,
  display_name    TEXT,
  timezone        TEXT DEFAULT 'UTC',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON user_settings USING (user_id = auth.uid());
CREATE POLICY user_isolation_insert ON user_settings FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_update ON user_settings FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_isolation_delete ON user_settings FOR DELETE USING (user_id = auth.uid());
