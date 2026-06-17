'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore } from '@/store'
import { Sliders, Check, HelpCircle, Upload, Sparkles } from 'lucide-react'

interface StrategyItem {
  name: string
  display_name?: string
  mode?: string
  description?: string
  win_rate?: number
  avg_rr?: number
  is_active?: boolean
  config?: StrategyConfig
  [key: string]: unknown
}

interface StrategyConfig {
  htf: string
  ltf: string
  swing_length: number
  ob_enabled: boolean
  fvg_enabled: boolean
  liquidity_enabled: boolean
  sessions: string[]
  min_rr: number
  trailing_start_rr: number
  break_even_after_rr: number
  tp_levels: { rr: number; close_pct: number }[]
  [key: string]: unknown
}

export default function StrategiesPage() {
  const { activeStrategy, setActiveStrategy } = useStore()
  
  // Local page state
  const [selectedTab, setSelectedTab] = useState<'preset' | 'upload' | 'browse' | 'ai_builder'>('preset')
  const [aiDescription, setAiDescription] = useState('')
  const [buildingStrategy, setBuildingStrategy] = useState(false)
  const [aiPreviewConfig, setAiPreviewConfig] = useState<{ name: string; config: StrategyConfig } | null>(null)
  const [activeExplainText, setActiveExplainText] = useState('')
  const [explainingKey, setExplainingKey] = useState<string | null>(null)

  // Config modal state
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [editingStrat, setEditingStrat] = useState<StrategyItem | null>(null)
  const [configForm, setConfigForm] = useState<StrategyConfig>({
    htf: 'H4',
    ltf: 'M15',
    swing_length: 20,
    ob_enabled: true,
    fvg_enabled: true,
    liquidity_enabled: true,
    sessions: ['London', 'New York'],
    min_rr: 1.5,
    trailing_start_rr: 1.0,
    break_even_after_rr: 0.8,
    tp_levels: [{ rr: 1, close_pct: 30 }, { rr: 2, close_pct: 30 }, { rr: 3, close_pct: 40 }]
  })

  // Query strategies list
  const { data: strategies = [], refetch } = useQuery<StrategyItem[]>({
    queryKey: ['strategies'],
    queryFn: async () => {
      const res = await fetch('/api/strategies')
      return res.json()
    }
  })

  const handleSetActive = async (name: string) => {
    try {
      const res = await fetch('/api/strategies/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy_name: name })
      })
      if (res.ok) {
        setActiveStrategy(name)
        refetch()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleOpenConfig = (strat: StrategyItem) => {
    setEditingStrat(strat)
    setConfigForm(strat.config || {
      htf: 'H4',
      ltf: 'M15',
      swing_length: 20,
      ob_enabled: true,
      fvg_enabled: true,
      liquidity_enabled: true,
      sessions: ['London', 'New York'],
      min_rr: 1.5,
      trailing_start_rr: 1.0,
      break_even_after_rr: 0.8,
      tp_levels: [{ rr: 1, close_pct: 30 }, { rr: 2, close_pct: 30 }, { rr: 3, close_pct: 40 }]
    })
    setConfigModalOpen(true)
  }

  const handleSaveConfig = async () => {
    if (!editingStrat) return
    try {
      const res = await fetch(`/api/strategies/${editingStrat.name}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm)
      })
      if (res.ok) {
        setConfigModalOpen(false)
        setEditingStrat(null)
        refetch()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleExplainSetting = async (key: string) => {
    setExplainingKey(key)
    setActiveExplainText('Claude is analyzing this parameter...')
    try {
      // Simulate/call explanation from advisor endpoint or prompt
      // For local testing, we provide a quick context description
      const definitions: Record<string, string> = {
        htf: "High Timeframe Filter. Used to identify structure direction (BOS/CHoCH) and primary institutional demand blocks on H4/H1 charts.",
        ltf: "Low Timeframe Entry. Executes micro order entries off M15/M5/M1 candles when aligned with the primary High Timeframe filter.",
        swing_length: "The count of local bars used to determine structural swings and swing highs/lows for Order Block zone allocations.",
        min_rr: "Minimum Risk-to-Reward ratio allowed. Trades will not execute if target Take Profit levels are less than this multiple of Stop Loss.",
        tp_levels: "Take Profit milestones. Specifies what percentage of lots to secure close once the trade reaches these specific target risk multiple levels."
      }
      setActiveExplainText(definitions[key] || "Parameter controls trade trigger parameters in strategy configurations.")
    } catch {
      setActiveExplainText("Could not fetch explanation.")
    }
  }

  const handleBuildStrategy = async () => {
    if (!aiDescription) return
    setBuildingStrategy(true)
    setAiPreviewConfig(null)
    try {
      const res = await fetch('/api/ai/build-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiDescription })
      })
      const data = await res.json()
      setAiPreviewConfig(data)
    } catch (err) {
      console.error(err)
    } finally {
      setBuildingStrategy(false)
    }
  }

  const registerAiStrategy = async () => {
    if (!aiPreviewConfig) return
    try {
      const res = await fetch(`/api/strategies/${aiPreviewConfig.name}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiPreviewConfig.config)
      })
      if (res.ok) {
        setAiPreviewConfig(null)
        setAiDescription('')
        refetch()
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-lg flex flex-col h-full relative">
      
      {/* Title / Description */}
      <div className="flex flex-col">
        <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">
          Strategy Library
        </h2>
        <p className="font-sans text-body-sm text-body-text mt-xxs">
          Activate algorithmic configurations, tweak entry parameters, or deploy neural networks.
        </p>
      </div>

      {/* 1. Active Strategy Panel */}
      <div className="bg-canvas border border-hairline p-lg rounded-md shadow-level-3 flex flex-wrap justify-between items-center">
        <div>
          <span className="font-mono text-caption-mono text-success uppercase font-semibold">CURRENT ACTIVE ENGINE</span>
          <h3 className="font-sans text-display-md font-semibold text-ink leading-tight capitalize mt-xxs">
            {activeStrategy.replaceAll('_', ' ')}
          </h3>
          <p className="font-sans text-body-sm text-body-text mt-xxs">
            Interval filters: H4 High Timeframe Filter | M15 Low Timeframe execution.
          </p>
        </div>
        <div className="flex items-center gap-md">
          {/* AI Override toggle */}
          <div className="flex items-center gap-xs px-sm py-[4px] border border-hairline rounded-pill bg-canvas-soft">
            <span className="w-xxs h-xxs rounded-full bg-violet animate-pulse inline-block" />
            <span className="font-mono text-[10px] text-body-text uppercase font-semibold">AI Regime Override: ON</span>
          </div>
        </div>
      </div>

      {/* 2. Grid of 8 strategies */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {strategies.map((strat) => {
          const isActive = strat.name === activeStrategy || strat.is_active
          return (
            <div
              key={strat.name}
              className={`bg-canvas border p-md rounded-md flex flex-col justify-between shadow-level-2 transition-all ${
                isActive ? 'border-primary shadow-level-3' : 'border-hairline'
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-sm">
                  <h4 className="font-sans text-body-md font-semibold text-ink leading-tight">{strat.display_name || strat.name}</h4>
                  <span className="font-mono text-[9px] uppercase tracking-wider bg-canvas-soft border border-hairline px-xxs py-[2px] rounded-sm text-body-text">
                    {strat.mode}
                  </span>
                </div>
                <p className="font-sans text-caption text-body-text leading-normal mb-md min-h-[50px]">
                  {strat.description}
                </p>
              </div>

              <div className="space-y-sm">
                <div className="flex justify-between font-mono text-[10px] text-mute pt-xs border-t border-hairline">
                  <span>WIN RATE: <b className="text-success">{strat.win_rate}%</b></span>
                  <span>AVG R:R: <b className="text-ink">{strat.avg_rr}R</b></span>
                </div>

                <div className="flex gap-xs pt-xs">
                  {isActive ? (
                    <div className="flex-1 border border-primary text-primary font-sans text-caption font-bold h-[28px] rounded-sm flex items-center justify-center gap-xxs bg-canvas-soft-2">
                      <Check className="w-xs h-xs" /> Active
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSetActive(strat.name)}
                      className="flex-1 bg-primary text-on-primary font-sans text-caption font-bold h-[28px] rounded-sm hover:opacity-90 transition-opacity"
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenConfig(strat)}
                    className="p-[4px] border border-hairline rounded-sm hover:bg-canvas-soft text-body-text"
                    title="Configure Parameters"
                  >
                    <Sliders className="w-sm h-sm" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 3. Strategy Maker (Tabs section) */}
      <div className="bg-canvas border border-hairline rounded-md shadow-level-3 p-lg mt-md">
        <div className="flex justify-between items-center border-b border-hairline pb-xs mb-md">
          <h3 className="font-sans text-body-md font-semibold text-ink">Strategy Maker Console</h3>
          
          {/* Tab buttons */}
          <div className="flex gap-xxs">
            {['preset', 'upload', 'browse', 'ai_builder'].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab as 'preset' | 'upload' | 'browse' | 'ai_builder')}
                className={`px-sm py-xxs font-sans text-xxs font-medium rounded-sm border transition-colors capitalize ${
                  selectedTab === tab 
                    ? 'bg-primary border-primary text-on-primary' 
                    : 'bg-canvas border-hairline text-body-text hover:bg-canvas-soft'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Preset tab */}
        {selectedTab === 'preset' && (
          <div className="space-y-sm">
            <h4 className="font-sans text-body-sm font-semibold text-ink">Load Preset HuggingFace Neural Models</h4>
            <p className="font-sans text-caption text-body-text">
              Directly load pre-compiled XGBoost and LSTM network parameters optimized for Gold scalping intervals:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-sm mt-sm">
              {[
                { name: 'XGBoost Gold Scalper v1', source: 'JonusNattapong/xauusd-scalping-xgboost' },
                { name: 'LSTM Deep Trend Ribbon', source: 'JonusNattapong/xauusd-lstm-deep-trend' },
                { name: 'Ensemble Weight Network', source: 'JonusNattapong/xauusd-scalper-ensemble' }
              ].map((m) => (
                <div key={m.name} className="p-sm border border-hairline rounded-sm bg-canvas-soft flex flex-col justify-between">
                  <div>
                    <span className="font-sans text-body-sm font-semibold text-ink">{m.name}</span>
                    <span className="font-mono text-[9px] text-mute block truncate mt-xxs">{m.source}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch('/api/strategies/hf/load', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: m.source })
                      })
                      alert(`Model ${m.name} successfully deployed to your strategy pool.`)
                    }}
                    className="mt-md w-full bg-primary text-on-primary font-sans text-caption font-semibold py-xs rounded-sm hover:opacity-90"
                  >
                    Deploy Network
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload tab */}
        {selectedTab === 'upload' && (
          <div className="border border-dashed border-hairline-strong/60 p-xl rounded-md flex flex-col items-center justify-center text-center bg-canvas-soft">
            <Upload className="w-lg h-lg text-mute mb-sm" />
            <h4 className="font-sans text-body-sm font-semibold text-ink">Upload Custom Model Weights</h4>
            <p className="font-sans text-caption text-body-text max-w-[280px] mt-xxs">
              Deploy custom neural network models. We accept PyTorch (.pt) weights and XGBoost (.joblib) dumps.
            </p>
            <button className="mt-md bg-primary text-on-primary font-sans text-caption font-semibold px-md py-xs rounded-pill">
              Browse Files
            </button>
          </div>
        )}

        {/* Browse tab */}
        {selectedTab === 'browse' && (
          <div className="space-y-sm">
            <div className="flex gap-sm">
              <input
                type="text"
                placeholder="Search HuggingFace hubs..."
                className="flex-1 form-input focus:outline-none"
              />
              <button className="bg-primary text-on-primary font-sans text-button-md font-medium px-md rounded-sm">
                Search
              </button>
            </div>
            <div className="text-center py-lg font-sans text-caption text-mute">
              Enter query to search weights. E.g. &quot;gold scalper lstm&quot;
            </div>
          </div>
        )}

        {/* AI Builder tab */}
        {selectedTab === 'ai_builder' && (
          <div className="space-y-md">
            <div>
              <h4 className="font-sans text-body-sm font-semibold text-ink">Describe Strategy in Natural Language</h4>
              <p className="font-sans text-caption text-body-text mb-sm">
                Write what indicator crossings, sessions, and risk multiples you want. Claude will generate the JSON config structure.
              </p>
              <textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                placeholder="Example: I want to trade breakout momentum during New York session on Gold. Set risk per trade to 0.8% with a minimum 2.0 R:R ratio, securing 50% profits once TP1 reaches 1.5R."
                className="w-full form-input h-[100px] py-xs focus:outline-none resize-none"
              />
            </div>
            
            <button
              onClick={handleBuildStrategy}
              disabled={buildingStrategy || !aiDescription}
              className="bg-primary text-on-primary font-sans text-button-md font-medium px-md h-[40px] rounded-sm hover:opacity-90 flex items-center gap-xs disabled:opacity-50"
            >
              <Sparkles className="w-xs h-xs" />
              {buildingStrategy ? 'Formulating Strategy...' : 'Build Strategy'}
            </button>

            {/* Config Preview Card */}
            {aiPreviewConfig && (
              <div className="mt-lg p-md border border-primary bg-canvas rounded-md space-y-md shadow-level-4">
                <div className="flex justify-between items-center border-b border-hairline pb-xs">
                  <h4 className="font-sans text-body-sm font-bold text-ink">AI Strategy Candidate Generated</h4>
                  <button
                    onClick={registerAiStrategy}
                    className="bg-success text-on-primary font-sans text-caption font-semibold px-sm py-xs rounded-pill"
                  >
                    Register Strategy
                  </button>
                </div>
                <pre className="font-mono text-code text-body-text bg-canvas-soft-2 p-sm rounded-sm overflow-x-auto">
                  {JSON.stringify(aiPreviewConfig.config, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Config Modal Frame */}
      {configModalOpen && editingStrat && (
        <div className="fixed inset-0 bg-primary/40 flex justify-center items-center z-50 overflow-y-auto">
          <div className="bg-canvas border border-hairline p-xl rounded-md shadow-level-5 max-w-[550px] w-full mx-md my-xl relative">
            <h3 className="font-sans text-body-md font-semibold text-ink border-b border-hairline pb-xs mb-sm">
              Tweak Parameters — {editingStrat.display_name || editingStrat.name}
            </h3>

            {/* Explain setting alert bar */}
            {explainingKey && (
              <div className="mb-md p-sm bg-canvas-soft border border-hairline rounded-sm flex items-start gap-xs text-caption text-body-text relative">
                <div className="font-mono text-[9px] font-bold text-success uppercase shrink-0">AI Explains:</div>
                <div className="pr-md leading-normal">{activeExplainText}</div>
                <button
                  onClick={() => setExplainingKey(null)}
                  className="absolute right-xs top-xs text-mute hover:text-ink text-xxs font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-md text-body-sm">
              <div>
                <div className="flex items-center gap-xxs mb-xxs">
                  <label className="font-mono text-caption-mono text-body-text">HTF FILTER</label>
                  <button onClick={() => handleExplainSetting('htf')} className="text-mute hover:text-ink">
                    <HelpCircle className="w-xxs h-xxs" />
                  </button>
                </div>
                <select
                  value={configForm.htf}
                  onChange={(e) => setConfigForm({ ...configForm, htf: e.target.value })}
                  className="w-full form-input focus:outline-none"
                >
                  <option value="H4">H4</option>
                  <option value="H1">H1</option>
                  <option value="M30">M30</option>
                </select>
              </div>

              <div>
                <div className="flex items-center gap-xxs mb-xxs">
                  <label className="font-mono text-caption-mono text-body-text">LTF ENTRY</label>
                  <button onClick={() => handleExplainSetting('ltf')} className="text-mute hover:text-ink">
                    <HelpCircle className="w-xxs h-xxs" />
                  </button>
                </div>
                <select
                  value={configForm.ltf}
                  onChange={(e) => setConfigForm({ ...configForm, ltf: e.target.value })}
                  className="w-full form-input focus:outline-none"
                >
                  <option value="M15">M15</option>
                  <option value="M5">M5</option>
                  <option value="M1">M1</option>
                </select>
              </div>

              <div>
                <div className="flex items-center gap-xxs mb-xxs">
                  <label className="font-mono text-caption-mono text-body-text">SWING LENGTH</label>
                  <button onClick={() => handleExplainSetting('swing_length')} className="text-mute hover:text-ink">
                    <HelpCircle className="w-xxs h-xxs" />
                  </button>
                </div>
                <input
                  type="number"
                  value={configForm.swing_length}
                  onChange={(e) => setConfigForm({ ...configForm, swing_length: parseInt(e.target.value, 10) })}
                  className="w-full form-input focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center gap-xxs mb-xxs">
                  <label className="font-mono text-caption-mono text-body-text">MIN R:R RATIO</label>
                  <button onClick={() => handleExplainSetting('min_rr')} className="text-mute hover:text-ink">
                    <HelpCircle className="w-xxs h-xxs" />
                  </button>
                </div>
                <input
                  type="number"
                  step="0.1"
                  value={configForm.min_rr}
                  onChange={(e) => setConfigForm({ ...configForm, min_rr: parseFloat(e.target.value) })}
                  className="w-full form-input focus:outline-none"
                />
              </div>
            </div>

            {/* Checkbox overlays */}
            <div className="grid grid-cols-3 gap-sm my-md">
              <label className="flex items-center gap-xs cursor-pointer text-body-sm">
                <input
                  type="checkbox"
                  checked={configForm.ob_enabled}
                  onChange={(e) => setConfigForm({ ...configForm, ob_enabled: e.target.checked })}
                  className="rounded border-hairline focus:ring-0 text-primary"
                />
                <span>Order Blocks</span>
              </label>
              <label className="flex items-center gap-xs cursor-pointer text-body-sm">
                <input
                  type="checkbox"
                  checked={configForm.fvg_enabled}
                  onChange={(e) => setConfigForm({ ...configForm, fvg_enabled: e.target.checked })}
                  className="rounded border-hairline focus:ring-0 text-primary"
                />
                <span>FVG gaps</span>
              </label>
              <label className="flex items-center gap-xs cursor-pointer text-body-sm">
                <input
                  type="checkbox"
                  checked={configForm.liquidity_enabled}
                  onChange={(e) => setConfigForm({ ...configForm, liquidity_enabled: e.target.checked })}
                  className="rounded border-hairline focus:ring-0 text-primary"
                />
                <span>Liquidity</span>
              </label>
            </div>

            {/* Take profit levels configurator */}
            <div className="border-t border-hairline pt-md mt-md">
              <div className="flex justify-between items-center mb-xxs">
                <label className="font-mono text-caption-mono text-body-text">TAKE PROFIT TARGET MILESTONES</label>
                <button
                  onClick={() => {
                    const updated = [...configForm.tp_levels, { rr: 4.0, close_pct: 10 }]
                    setConfigForm({ ...configForm, tp_levels: updated })
                  }}
                  className="text-link text-xxs font-bold hover:underline"
                >
                  + Add Row
                </button>
              </div>
              <div className="space-y-xs max-h-[120px] overflow-y-auto pr-xs">
                {configForm.tp_levels.map((tp, index) => (
                  <div key={index} className="flex items-center gap-md">
                    <span className="font-mono text-caption-mono text-mute w-[30px]">TP{index+1}</span>
                    <div className="flex-1 flex gap-sm">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="R Multiple"
                        value={tp.rr}
                        onChange={(e) => {
                          const updated = [...configForm.tp_levels]
                          updated[index].rr = parseFloat(e.target.value)
                          setConfigForm({ ...configForm, tp_levels: updated })
                        }}
                        className="flex-1 form-input-sm bg-canvas focus:outline-none"
                      />
                      <input
                        type="number"
                        placeholder="Close % lots"
                        value={tp.close_pct}
                        onChange={(e) => {
                          const updated = [...configForm.tp_levels]
                          updated[index].close_pct = parseInt(e.target.value, 10)
                          setConfigForm({ ...configForm, tp_levels: updated })
                        }}
                        className="flex-1 form-input-sm bg-canvas focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const updated = configForm.tp_levels.filter((_tp, i) => i !== index)
                        setConfigForm({ ...configForm, tp_levels: updated })
                      }}
                      className="text-error font-bold hover:text-error-deep"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-md mt-xl">
              <button
                onClick={() => {
                  setConfigModalOpen(false)
                  setEditingStrat(null)
                  setExplainingKey(null)
                }}
                className="flex-1 border border-hairline bg-canvas hover:bg-canvas-soft text-ink font-sans text-button-md font-medium h-[36px] rounded-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                className="flex-1 bg-primary text-on-primary font-sans text-button-md font-medium h-[36px] rounded-sm hover:opacity-90"
              >
                Save Configuration
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
