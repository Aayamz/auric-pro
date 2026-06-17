// lib/plan-limits.ts
export const PLAN_LIMITS = {
  free: {
    broker_accounts: 1,
    strategies: ['ema_crossover', 'rsi_stoch', 'bollinger_bounce'],
    auto_trading: false,
    signals_per_day: 10,
    backtest_days: 30,
    ai_messages_per_day: 0,
    api_access: false,
  },
  pro: {
    broker_accounts: 2,
    strategies: 'all',
    auto_trading: true,
    signals_per_day: Infinity,
    backtest_days: 730,
    ai_messages_per_day: 100,
    api_access: false,
  },
  elite: {
    broker_accounts: 5,
    strategies: 'all',
    auto_trading: true,
    signals_per_day: Infinity,
    backtest_days: 3650,
    ai_messages_per_day: Infinity,
    api_access: true,
  },
} as const

export type PlanName = 'free' | 'pro' | 'elite'
export type PlanFeature = keyof typeof PLAN_LIMITS['free']
