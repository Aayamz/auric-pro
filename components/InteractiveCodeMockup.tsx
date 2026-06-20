'use client'

import { useState } from 'react'

const SNIPPETS = {
  'bridge.py': {
    lang: 'python',
    code: `# Connect local terminal to AURIC MT5 Bridge
python bridge.py --token <YOUR_JWT_TOKEN>

# Stream live pricing logs
> XAUUSD BID: 1955.20 ASK: 1955.70
> AI Signal: BUY (88.5% confidence)
> Zone: H4 Demand Block detected

# Auto execution thread
> MT5 Order ticket #48291034 opened
> Lots: 0.50 | SL: 1949.20 | TP: 1968.00
> Risk: 1.0% | Status: Executed`,
    highlight: (
      <>
        <span className="text-mute"># Connect local terminal to AURIC MT5 Bridge</span>{"\n"}
        <span className="text-cyan">python</span> bridge.py --token <span className="text-violet">&lt;YOUR_JWT_TOKEN&gt;</span>{"\n\n"}
        <span className="text-mute"># Stream live pricing logs</span>{"\n"}
        <span className="text-on-primary/40">&gt;</span> <span className="text-[#f5a623]">XAUUSD</span> BID: 1955.20 ASK: 1955.70{"\n"}
        <span className="text-on-primary/40">&gt;</span> AI Signal: <span className="text-link">BUY</span> (<span className="text-link">88.5%</span> confidence){"\n"}
        <span className="text-on-primary/40">&gt;</span> Zone: <span className="text-violet">H4 Demand Block</span> detected{"\n\n"}
        <span className="text-mute"># Auto execution thread</span>{"\n"}
        <span className="text-on-primary/40">&gt;</span> MT5 Order ticket <span className="text-[#f5a623]">#48291034</span> opened{"\n"}
        <span className="text-on-primary/40">&gt;</span> Lots: <span className="text-cyan">0.50</span> | SL: <span className="text-error">1949.20</span> | TP: <span className="text-link">1968.00</span>{"\n"}
        <span className="text-on-primary/40">&gt;</span> Risk: <span className="text-link">1.0%</span> | Status: <span className="text-link">Executed</span>
      </>
    )
  },
  'strategy.ts': {
    lang: 'typescript',
    code: `import { createStrategy } from '@auric/sdk'

export default createStrategy({
  name: 'Order Block Sweep',
  pair: 'XAUUSD',
  timeframe: 'M15',
  
  onTick: async (tick, { executeTrade }) => {
    if (tick.fvgDetected && tick.isDemandZone) {
      await executeTrade({
        direction: 'BUY',
        lots: 0.1,
        sl: tick.low - 5.0,
        tp: tick.high + 15.0
      })
    }
  }
})`,
    highlight: (
      <>
        <span className="text-violet">import</span> {"{ createStrategy }"} <span className="text-violet">from</span> <span className="text-link">&apos;@auric/sdk&apos;</span>{"\n\n"}
        <span className="text-violet">export default</span> <span className="text-cyan">createStrategy</span>({"{\n"}
        {"  name: "}<span className="text-link">&apos;Order Block Sweep&apos;</span>,{"\n"}
        {"  pair: "}<span className="text-link">&apos;XAUUSD&apos;</span>,{"\n"}
        {"  timeframe: "}<span className="text-link">&apos;M15&apos;</span>,{"\n\n"}
        {"  "}<span className="text-cyan">onTick</span>: <span className="text-violet">async</span> {"(tick, { executeTrade }) => {\n"}
        {"    "}<span className="text-violet">if</span> {"(tick.fvgDetected && tick.isDemandZone) {\n"}
        {"      "}<span className="text-violet">await</span> <span className="text-cyan">executeTrade</span>({"{\n"}
        {"        direction: "}<span className="text-link">&apos;BUY&apos;</span>,{"\n"}
        {"        lots: "}<span className="text-[#f5a623]">0.1</span>,{"\n"}
        {"        sl: tick.low - "}<span className="text-[#f5a623]">5.0</span>,{"\n"}
        {"        tp: tick.high + "}<span className="text-[#f5a623]">15.0</span>{"\n"}
        {"      })\n"}
        {"    }\n"}
        {"  }\n"}
        {"})"}
      </>
    )
  },
  'config.yaml': {
    lang: 'yaml',
    code: `# Platform config values
engine:
  mode: live
  pair: XAUUSD
  max_positions: 3

risk_management:
  risk_per_trade_pct: 1.0
  max_daily_drawdown_pct: 4.0
  emergency_halt_switch: false

meta_trader_5:
  bridge_port: 8000
  slippage_points: 30`,
    highlight: (
      <>
        <span className="text-mute"># Platform config values</span>{"\n"}
        <span className="text-violet">engine:</span>{"\n"}
        {"  "}mode: <span className="text-link">live</span>{"\n"}
        {"  "}pair: <span className="text-link">XAUUSD</span>{"\n"}
        {"  "}max_positions: <span className="text-[#f5a623]">3</span>{"\n\n"}
        <span className="text-violet">risk_management:</span>{"\n"}
        {"  "}risk_per_trade_pct: <span className="text-[#f5a623]">1.0</span>{"\n"}
        {"  "}max_daily_drawdown_pct: <span className="text-[#f5a623]">4.0</span>{"\n"}
        {"  "}emergency_halt_switch: <span className="text-error">false</span>{"\n\n"}
        <span className="text-violet">meta_trader_5:</span>{"\n"}
        {"  "}bridge_port: <span className="text-[#f5a623]">8000</span>{"\n"}
        {"  "}slippage_points: <span className="text-[#f5a623]">30</span>
      </>
    )
  }
}

type TabName = keyof typeof SNIPPETS

export function InteractiveCodeMockup() {
  const [activeTab, setActiveTab] = useState<TabName>('bridge.py')

  return (
    <div className="bg-primary rounded-md p-lg shadow-level-4 overflow-hidden border border-white/5 flex flex-col min-h-[340px]">
      
      {/* IDE Window Controls and Tab Header */}
      <div className="flex items-center justify-between mb-sm pb-xs border-b border-white/5 shrink-0 select-none">
        <div className="flex items-center gap-xs">
          <div className="w-[10px] h-[10px] rounded-full bg-error" />
          <div className="w-[10px] h-[10px] rounded-full bg-warning" />
          <div className="w-[10px] h-[10px] rounded-full bg-success" />
        </div>
        
        {/* Clickable tabs */}
        <div className="flex gap-xxs">
          {(Object.keys(SNIPPETS) as TabName[]).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-sm py-xxs rounded-sm font-mono text-[10px] transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-canvas-soft-2 text-ink font-semibold' 
                    : 'text-on-primary/40 hover:text-on-primary/80 hover:bg-white/5'
                }`}
              >
                {tab}
              </button>
            )
          })}
        </div>
        
        <span className="font-mono text-[9px] text-on-primary/30 hidden sm:inline">
          {SNIPPETS[activeTab].lang.toUpperCase()}
        </span>
      </div>

      {/* Editor Pane */}
      <div className="flex-1 font-mono text-code overflow-x-auto leading-relaxed select-text mt-xs">
        <pre className="text-on-primary/90 text-left">
          <code>
            {SNIPPETS[activeTab].highlight}
          </code>
        </pre>
      </div>

    </div>
  )
}
