import { create } from 'zustand'

export interface PriceData {
  pair: string
  bid: number
  ask: number
  spread?: number
  time: number
}

export interface MTPosition {
  ticket: number
  symbol: string
  type: 'BUY' | 'SELL' | string
  volume: number
  open_price: number
  current_price: number
  profit: number
  pips?: number
}

export interface Signal {
  id: string
  user_id: string
  pair: string
  direction: 'BUY' | 'SELL'
  strategy: string
  timeframe: string
  confidence: number
  entry_price: number
  sl_price: number
  tp_levels: { rr: number; price: number }[]
  indicator_values?: Record<string, unknown>
  ai_explanation?: string
  status: string
  created_at: string
  expires_at?: string
}

export interface Trade {
  id: string
  user_id: string
  signal_id?: string
  mt5_ticket?: number
  pair: string
  direction: string
  lots: number
  open_price: number
  close_price?: number
  sl_price?: number
  tp1_price?: number
  tp2_price?: number
  tp3_price?: number
  pnl_usd?: number
  pnl_r?: number
  commission?: number
  swap?: number
  strategy?: string
  session?: string
  status: string
  opened_at: string
  closed_at?: string
}

export interface RiskProfile {
  risk_pct: number
  daily_loss_limit_pct: number
  max_drawdown_pct: number
  max_concurrent_positions: number
  max_lot_size: number
  trailing_start_rr: number
  break_even_after_rr: number
  tp_levels: { rr: number; close_pct: number }[]
}

export interface Subscription {
  plan: 'free' | 'pro' | 'elite'
  status: string
  current_period_end: string
}

export interface BacktestResult {
  id: string
  strategy: string
  pair: string
  timeframe: string
  date_from: string
  date_to: string
  initial_balance: number
  final_balance: number
  net_pnl: number
  win_rate: number
  profit_factor: number
  max_drawdown_pct: number
  total_trades: number
  config_snapshot: Record<string, unknown>
  equity_curve: { ts: number; equity: number }[]
  trade_log: Record<string, unknown>[]
  ai_analysis?: string
}

export interface User {
  id: string
  email?: string
  platform?: 'mt5' | 'mt4'
}

interface AuricStore {
  // Live data (written by useLiveData hook)
  prices: Record<string, PriceData>
  positions: MTPosition[]
  signals: Signal[]
  bridgeStatus: 'connected' | 'disconnected' | 'connecting'
  botRunning: boolean
  activeStrategy: string

  // User data (written by React Query on fetch)
  user: User | null
  subscription: Subscription | null
  riskProfile: RiskProfile | null
  trades: Trade[]
  backtestResult: BacktestResult | null

  // UI state
  selectedPair: string
  selectedTimeframe: string
  chartOverlays: { ob: boolean; fvg: boolean; bos: boolean; tp: boolean; sl: boolean }
  theme: 'light' | 'dark'

  // Actions
  setPrice: (pair: string, data: PriceData) => void
  setPositions: (positions: MTPosition[]) => void
  addSignal: (signal: Signal) => void
  setSignals: (signals: Signal[]) => void
  setBridgeStatus: (status: 'connected' | 'disconnected' | 'connecting') => void
  setBotRunning: (running: boolean) => void
  setActiveStrategy: (strategy: string) => void
  setUser: (user: User | null) => void
  setSubscription: (sub: Subscription | null) => void
  setRiskProfile: (profile: RiskProfile | null) => void
  setTrades: (trades: Trade[]) => void
  setBacktestResult: (result: BacktestResult | null) => void
  setSelectedPair: (pair: string) => void
  setSelectedTimeframe: (tf: string) => void
  setChartOverlay: (key: 'ob' | 'fvg' | 'bos' | 'tp' | 'sl', value: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
}

export const useStore = create<AuricStore>((set) => ({
  // Live states
  prices: {},
  positions: [],
  signals: [],
  bridgeStatus: 'disconnected',
  botRunning: false,
  activeStrategy: 'ema_crossover',

  // Fetchable data
  user: null,
  subscription: { plan: 'free', status: 'active', current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() },
  riskProfile: {
    risk_pct: 1.0,
    daily_loss_limit_pct: 4.0,
    max_drawdown_pct: 15.0,
    max_concurrent_positions: 1,
    max_lot_size: 0.1,
    trailing_start_rr: 1.0,
    break_even_after_rr: 0.8,
    tp_levels: [{ rr: 1, close_pct: 30 }, { rr: 2, close_pct: 30 }, { rr: 3, close_pct: 40 }]
  },
  trades: [],
  backtestResult: null,

  // UI defaults
  selectedPair: 'XAUUSD',
  selectedTimeframe: 'M15',
  chartOverlays: { ob: true, fvg: true, bos: true, tp: true, sl: true },
  theme: 'light',

  // Actions
  setPrice: (pair, data) => set((state) => ({
    prices: { ...state.prices, [pair]: data }
  })),
  setPositions: (positions) => set({ positions }),
  addSignal: (signal) => set((state) => {
    // Keep last 50 signals
    const updated = [signal, ...state.signals.filter(s => s.id !== signal.id)]
    return { signals: updated.slice(0, 50) }
  }),
  setSignals: (signals) => set({ signals }),
  setBridgeStatus: (bridgeStatus) => set({ bridgeStatus }),
  setBotRunning: (botRunning) => set({ botRunning }),
  setActiveStrategy: (activeStrategy) => set({ activeStrategy }),
  setUser: (user) => set({ user }),
  setSubscription: (subscription) => set({ subscription }),
  setRiskProfile: (riskProfile) => set({ riskProfile }),
  setTrades: (trades) => set({ trades }),
  setBacktestResult: (backtestResult) => set({ backtestResult }),
  setSelectedPair: (selectedPair) => set({ selectedPair }),
  setSelectedTimeframe: (selectedTimeframe) => set({ selectedTimeframe }),
  setChartOverlay: (key, value) => set((state) => ({
    chartOverlays: { ...state.chartOverlays, [key]: value }
  })),
  setTheme: (theme) => set({ theme })
}))
