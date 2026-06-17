'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'

export default function OnboardingPage() {
  const router = useRouter()
  const { setRiskProfile, setActiveStrategy } = useStore()
  
  const [currentStep, setCurrentStep] = useState(1)
  const [platform, setPlatform] = useState<'mt5' | 'mt4'>('mt5')
  const [token, setToken] = useState('loading-token...')
  const [bridgeConnected, setBridgeConnected] = useState(false)
  const [checkingBridge, setCheckingBridge] = useState(false)
  
  // Risk Profile States
  const [riskPct, setRiskPct] = useState(1.0)
  const [dailyLossLimitPct, setDailyLossLimitPct] = useState(4.0)
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(15.0)
  const [maxPositions, setMaxPositions] = useState(1)

  // Strategies List for Step 4
  const [selectedStrategy, setSelectedStrategy] = useState('ema_crossover')

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        if (data.session) {
          setToken(data.session.access_token)
        } else {
          // Fallback test token
          setToken('ey.auric_test_jwt_token_extracted')
        }
      })
      .catch(() => {
        // Fallback test token
        setToken('ey.auric_test_jwt_token_extracted')
      })
  }, [])

  // Poll bridge connection status in Step 2
  useEffect(() => {
    if (currentStep !== 2) return

    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/bridge/status')
        const data = await res.json()
        if (data.connected && !cancelled) {
          setBridgeConnected(true)
          setCheckingBridge(false)
          clearInterval(interval)
        }
      } catch {
        // Suppress
      }
    }, 2000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [currentStep])

  const saveRiskProfile = async () => {
    try {
      const response = {
        risk_pct: riskPct,
        daily_loss_limit_pct: dailyLossLimitPct,
        max_drawdown_pct: maxDrawdownPct,
        max_concurrent_positions: maxPositions,
        max_lot_size: 0.1,
        trailing_start_rr: 1.0,
        break_even_after_rr: 0.8,
        tp_levels: [{ rr: 1, close_pct: 30 }, { rr: 2, close_pct: 30 }, { rr: 3, close_pct: 40 }]
      }
      
      await fetch('/api/risk/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      })
      setRiskProfile(response)
    } catch {
      console.error('Failed to save risk profile')
    }
    setCurrentStep(4)
  }

  const saveStrategy = async () => {
    try {
      await fetch('/api/strategies/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_name: selectedStrategy })
      })
      setActiveStrategy(selectedStrategy)
      router.push('/app/dashboard')
    } catch {
      console.error('Failed to save strategy')
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center bg-canvas-soft px-lg py-3xl mesh-gradient-bg">
      <div className="w-full max-w-[600px] bg-canvas border border-hairline p-xl rounded-lg shadow-level-4">
        
        {/* Step Indicators */}
        <div className="flex items-center justify-between mb-xl">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex-1 flex items-center">
              <div
                className={`w-[28px] h-[28px] rounded-full flex items-center justify-center font-mono text-caption-mono border transition-all duration-300 ${
                  currentStep >= step
                    ? 'bg-primary border-primary text-on-primary font-semibold'
                    : 'border-hairline text-mute bg-canvas-soft'
                }`}
              >
                {step}
              </div>
              {step < 4 && (
                <div
                  className={`flex-1 h-[2px] mx-xs transition-colors duration-300 ${
                    currentStep > step ? 'bg-primary' : 'bg-hairline'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Choose platform */}
        {currentStep === 1 && (
          <div>
            <h3 className="font-sans text-display-sm font-semibold text-ink tracking-tight mb-xxs">
              Select Brokerage Platform
            </h3>
            <p className="font-sans text-body-sm text-body-text mb-lg">
              AURIC PRO communicates directly with your terminal instance. Choose your MT version:
            </p>
            <div className="grid grid-cols-2 gap-md">
              <button
                onClick={() => setPlatform('mt5')}
                className={`p-lg border text-left rounded-md transition-all ${
                  platform === 'mt5'
                    ? 'border-primary bg-canvas shadow-level-3'
                    : 'border-hairline bg-canvas-soft hover:bg-canvas'
                }`}
              >
                <h4 className="font-sans text-body-md font-semibold text-ink">MetaTrader 5</h4>
                <p className="font-sans text-caption text-body-text mt-xxs">
                  Recommended. Supports full ticking speeds, depth-of-market, and advanced executions.
                </p>
              </button>
              <button
                onClick={() => setPlatform('mt4')}
                className={`p-lg border text-left rounded-md transition-all ${
                  platform === 'mt4'
                    ? 'border-primary bg-canvas shadow-level-3'
                    : 'border-hairline bg-canvas-soft hover:bg-canvas'
                }`}
              >
                <h4 className="font-sans text-body-md font-semibold text-ink">MetaTrader 4</h4>
                <p className="font-sans text-caption text-body-text mt-xxs">
                  Legacy platform support. Uses poll wrappers to communicate.
                </p>
              </button>
            </div>
            <button
              onClick={() => setCurrentStep(2)}
              className="mt-xl w-full bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm shadow-level-2 hover:opacity-90 transition-opacity"
            >
              Continue to Download
            </button>
          </div>
        )}

        {/* Step 2: Download bridge */}
        {currentStep === 2 && (
          <div>
            <h3 className="font-sans text-display-sm font-semibold text-ink tracking-tight mb-xxs">
              Install AURIC Data Bridge
            </h3>
            <p className="font-sans text-body-sm text-body-text mb-md">
              The Metatrader bridge needs to run locally on your Windows terminal machine to sync charts and trades.
            </p>
            <div className="bg-canvas-soft border border-hairline p-md rounded-md mb-lg space-y-sm">
              <div className="flex justify-between items-center">
                <span className="font-sans text-body-sm text-ink font-semibold">1. Download Agent Binary</span>
                <a
                  href="/bridge/bridge.py"
                  download="bridge.py"
                  className="bg-primary text-on-primary font-sans text-caption font-medium px-xs py-xxs rounded-pill hover:opacity-90"
                >
                  bridge.py
                </a>
              </div>
              <div>
                <span className="block font-sans text-body-sm text-ink font-semibold mb-xxs">2. Execute On Windows PC</span>
                <p className="font-sans text-caption text-body-text mb-xs">
                  Run setup to save credentials, then connect the bridge to this browser page:
                </p>
                <pre className="font-mono text-code text-on-primary bg-primary p-xs rounded-sm overflow-x-auto whitespace-pre select-all">
                  python bridge.py --token {token.substring(0, 16)}...
                </pre>
              </div>
            </div>

            <div className="flex items-center gap-xs p-xs border border-hairline rounded-sm bg-canvas-soft mb-lg">
              <span className={`w-xs h-xs rounded-full inline-block ${bridgeConnected ? 'bg-success animate-pulse' : 'bg-warning animate-pulse'}`} />
              <span className="font-mono text-caption-mono text-body-text">
                {bridgeConnected 
                  ? 'Bridge validated successfully! Click continue below.' 
                  : checkingBridge 
                    ? 'Listening for local bridge.py handshake...' 
                    : 'Polling bridge connection...'}
              </span>
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => setCurrentStep(1)}
                className="flex-1 border border-hairline bg-canvas hover:bg-canvas-soft text-ink font-sans text-button-md font-medium h-[40px] rounded-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  // For development sandbox, let users bypass onboarding constraints
                  setCurrentStep(3)
                }}
                className="flex-1 bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm shadow-level-2 hover:opacity-90 transition-opacity"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Risk Profile Form */}
        {currentStep === 3 && (
          <div>
            <h3 className="font-sans text-display-sm font-semibold text-ink tracking-tight mb-xxs">
              Configure Core Risk Profile
            </h3>
            <p className="font-sans text-body-sm text-body-text mb-lg">
              These hard stops prevent drawdown. They are loaded directly by the trade sizer.
            </p>
            <div className="space-y-md mb-xl">
              <div>
                <div className="flex justify-between items-center mb-xxs">
                  <label className="font-mono text-caption-mono text-body-text">RISK PERCENT PER TRADE</label>
                  <span className="font-mono text-caption-mono font-semibold text-ink">{riskPct}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="5.0"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                  className="w-full h-xs bg-hairline rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-xxs">
                  <label className="font-mono text-caption-mono text-body-text">DAILY LOSS LIMIT PERCENT</label>
                  <span className="font-mono text-caption-mono font-semibold text-ink">{dailyLossLimitPct}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={dailyLossLimitPct}
                  onChange={(e) => setDailyLossLimitPct(parseFloat(e.target.value))}
                  className="w-full h-xs bg-hairline rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-xxs">
                  <label className="font-mono text-caption-mono text-body-text">MAX ACCOUNT DRAWDOWN LIMIT</label>
                  <span className="font-mono text-caption-mono font-semibold text-ink">{maxDrawdownPct}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="25"
                  step="1"
                  value={maxDrawdownPct}
                  onChange={(e) => setMaxDrawdownPct(parseFloat(e.target.value))}
                  className="w-full h-xs bg-hairline rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-mono text-caption-mono text-body-text mb-xxs">MAX CONCURRENT POSITIONS</label>
                <select
                  value={maxPositions}
                  onChange={(e) => setMaxPositions(parseInt(e.target.value, 10))}
                  className="w-full form-input bg-canvas focus:outline-none"
                >
                  <option value={1}>1 Position</option>
                  <option value={2}>2 Positions</option>
                  <option value={3}>3 Positions</option>
                  <option value={5}>5 Positions</option>
                </select>
              </div>
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => setCurrentStep(2)}
                className="flex-1 border border-hairline bg-canvas hover:bg-canvas-soft text-ink font-sans text-button-md font-medium h-[40px] rounded-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={saveRiskProfile}
                className="flex-1 bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm shadow-level-2 hover:opacity-90 transition-opacity"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Pick Strategy */}
        {currentStep === 4 && (
          <div>
            <h3 className="font-sans text-display-sm font-semibold text-ink tracking-tight mb-xxs">
              Select Launch Strategy
            </h3>
            <p className="font-sans text-body-sm text-body-text mb-md">
              Choose your active strategy block. You can change configurations or switch to AI Override later:
            </p>
            <div className="space-y-sm max-h-[300px] overflow-y-auto mb-lg pr-xxs">
              {[
                { id: 'ema_crossover', name: 'EMA Ribbon Crossover', rate: '62.5%', type: 'SCALP' },
                { id: 'rsi_stoch', name: 'RSI Stochastic Rebounds', rate: '58.0%', type: 'SCALP' },
                { id: 'bollinger_bounce', name: 'Bollinger Bands Bounce', rate: '60.2%', type: 'SWING' },
                { id: 'order_block_reversal', name: 'Order Block Reversals', rate: '68.4%', type: 'SWING' }
              ].map((strat) => (
                <button
                  key={strat.id}
                  onClick={() => setSelectedStrategy(strat.id)}
                  className={`w-full p-sm text-left border rounded-sm flex justify-between items-center transition-all ${
                    selectedStrategy === strat.id
                      ? 'border-primary bg-canvas shadow-level-2'
                      : 'border-hairline bg-canvas-soft hover:bg-canvas'
                  }`}
                >
                  <div>
                    <span className="font-sans text-body-sm font-semibold text-ink block">{strat.name}</span>
                    <span className="font-mono text-caption-mono text-body-text mt-xxs uppercase bg-canvas-soft border border-hairline px-xxs py-[2px] rounded-sm inline-block">
                      {strat.type}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-sans text-caption text-body-text block">Win Rate</span>
                    <span className="font-mono text-caption-mono font-semibold text-success">{strat.rate}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => setCurrentStep(3)}
                className="flex-1 border border-hairline bg-canvas hover:bg-canvas-soft text-ink font-sans text-button-md font-medium h-[40px] rounded-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={saveStrategy}
                className="flex-grow bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm shadow-level-2 hover:opacity-90 transition-opacity"
              >
                Enter Dashboard Cockpit
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
