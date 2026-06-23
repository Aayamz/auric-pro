'use client'

import React, { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore, RiskProfile } from '@/store'
import { AlertTriangle, ShieldOff, ShieldCheck } from 'lucide-react'

interface RiskForm {
  risk_pct: number; daily_loss_limit_pct: number; max_drawdown_pct: number;
  max_concurrent_positions: number; trailing_start_rr: number; break_even_after_rr: number;
  tp_levels: { rr: number; close_pct: number }[];
}

function SliderRow({ label, field, min, max, step, suffix = '%', form, setForm }: {
  label: string; field: keyof RiskForm; min: number; max: number; step: number; suffix?: string;
  form: RiskForm; setForm: React.Dispatch<React.SetStateAction<RiskForm>>
}) {
  const val = form[field] as number
  return (
    <div className="space-y-xxs">
      <div className="flex justify-between items-center">
        <label className="font-mono text-caption-mono text-mute uppercase">{label}</label>
        <span className="font-mono text-caption-mono font-semibold text-ink">{val}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val}
        onChange={e => setForm(prev => ({ ...prev, [field]: parseFloat(e.target.value) }))}
        className="w-full h-[4px] bg-hairline rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary" />
      <div className="flex justify-between font-mono text-[9px] text-mute">
        <span>{min}{suffix}</span><span>{max}{suffix}</span>
      </div>
    </div>
  )
}

export default function RiskPage() {
  const { setRiskProfile } = useStore()
  const [form, setForm] = useState({
    risk_pct: 1.0,
    daily_loss_limit_pct: 4.0,
    max_drawdown_pct: 15.0,
    max_concurrent_positions: 1,
    trailing_start_rr: 1.0,
    break_even_after_rr: 0.8,
    tp_levels: [{ rr: 1, close_pct: 30 }, { rr: 2, close_pct: 30 }, { rr: 3, close_pct: 40 }]
  })
  const [saving, setSaving] = useState(false)
  const [halted, setHalted] = useState(false)
  const [confirmHalt, setConfirmHalt] = useState(false)

  const { data: exposure } = useQuery({
    queryKey: ['exposure'],
    queryFn: async () => { const r = await fetch('/api/risk/exposure'); return r.json() },
    refetchInterval: 5000
  })

  useEffect(() => {
    fetch('/api/risk/profile').then(r => r.json()).then(d => {
      setForm(prev => ({ ...prev, ...d }))
    })
  }, [])

  const score = exposure?.score ?? 22
  const gaugeColor = score <= 33 ? '#0070f3' : score <= 66 ? '#f5a623' : '#ee0000'
  const gaugeLabel = score <= 33 ? 'LOW' : score <= 66 ? 'MODERATE' : 'HIGH'

  // SVG circular gauge math
  const radius = 60
  const circumference = Math.PI * radius // half circle
  const filled = (score / 100) * circumference

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/risk/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      setRiskProfile(form as RiskProfile)
    } finally {
      setSaving(false)
    }
  }

  const handleHalt = async () => {
    await fetch('/api/trading/halt', { method: 'POST' })
    setHalted(true)
    setConfirmHalt(false)
  }

  return (
    <div className="space-y-lg">
      <div>
        <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">Risk Control Centre</h2>
        <p className="font-sans text-body-sm text-body-text mt-xxs">Monitor exposure, configure protective limits, and halt execution instantly.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">

        {/* LEFT: Gauge + Halt */}
        <div className="space-y-md">
          {/* SVG Risk Gauge */}
          <div className="bg-canvas border border-hairline rounded-md p-lg shadow-level-3 flex flex-col items-center">
            <h4 className="font-sans text-body-md font-semibold text-ink mb-md self-start">Risk Exposure</h4>
            <svg viewBox="0 0 160 100" width="180" height="110">
              {/* Track */}
              <path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke="#ebebeb" strokeWidth="12" strokeLinecap="round" />
              {/* Filled arc */}
              <path d="M 20 90 A 60 60 0 0 1 140 90" fill="none" stroke={gaugeColor}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${filled} ${circumference}`} />
              {/* Score text */}
              <text x="80" y="80" textAnchor="middle" fontSize="24" fontWeight="600" fill="#171717" fontFamily="monospace">{score}</text>
              <text x="80" y="95" textAnchor="middle" fontSize="9" fill={gaugeColor} fontFamily="monospace">{gaugeLabel} RISK</text>
            </svg>
            <div className="grid grid-cols-2 gap-sm w-full mt-md text-center">
              <div className="bg-canvas-soft-2 rounded-sm p-xs border border-hairline">
                <span className="font-mono text-[9px] text-mute uppercase block">Daily P&L</span>
                <span className={`font-mono text-caption-mono font-semibold ${(exposure?.daily_pnl ?? 0) < 0 ? 'text-error' : 'text-success'}`}>
                  {(exposure?.daily_pnl ?? 0) < 0 ? '-' : '+'}${(Math.abs(exposure?.daily_pnl ?? 0)).toFixed(2)}
                </span>
              </div>
              <div className="bg-canvas-soft-2 rounded-sm p-xs border border-hairline">
                <span className="font-mono text-[9px] text-mute uppercase block">Drawdown</span>
                <span className={`font-mono text-caption-mono font-semibold ${(exposure?.drawdown ?? 0) > 0 ? 'text-warning' : 'text-mute'}`}>
                  {(exposure?.drawdown ?? 0).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Kill Switch */}
          {halted ? (
            <div className="bg-warning-soft border border-warning rounded-md p-md shadow-level-2 space-y-sm">
              <div className="flex items-center gap-xs text-warning-deep">
                <ShieldOff className="w-sm h-sm shrink-0" />
                <span className="font-sans text-body-sm font-semibold">Trading Halted</span>
              </div>
              <p className="font-sans text-caption text-warning-deep">All positions closed. Algorithm paused.</p>
              <button onClick={async () => { await fetch('/api/trading/start', { method: 'POST' }); setHalted(false) }}
                className="w-full border border-warning-deep text-warning-deep font-sans text-body-sm font-semibold h-[36px] rounded-sm hover:bg-warning/10 transition-colors">
                Restart Trading
              </button>
            </div>
          ) : !confirmHalt ? (
            <button onClick={() => setConfirmHalt(true)}
              className="w-full bg-error text-on-primary font-sans text-button-md font-bold h-[48px] rounded-sm hover:bg-error-deep transition-colors flex items-center justify-center gap-xs shadow-level-3">
              <AlertTriangle className="w-sm h-sm" /> HALT ALL TRADING
            </button>
          ) : (
            <div className="bg-error-soft border border-error rounded-md p-md shadow-level-3 space-y-sm">
              <div className="flex items-center gap-xs text-error">
                <AlertTriangle className="w-sm h-sm shrink-0" />
                <span className="font-sans text-body-sm font-semibold">Confirm Emergency Halt</span>
              </div>
              <p className="font-sans text-caption text-error-deep">This will close all open positions and stop the algorithm immediately.</p>
              <div className="flex gap-sm">
                <button onClick={() => setConfirmHalt(false)} className="flex-1 border border-hairline bg-canvas text-ink font-sans text-caption font-semibold h-[36px] rounded-sm">Cancel</button>
                <button onClick={handleHalt} className="flex-1 bg-error text-on-primary font-sans text-caption font-bold h-[36px] rounded-sm hover:bg-error-deep">Confirm Halt</button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Risk Controls */}
        <div className="lg:col-span-2 bg-canvas border border-hairline rounded-md p-lg shadow-level-3 space-y-lg">
          <h4 className="font-sans text-body-md font-semibold text-ink border-b border-hairline pb-xs">Protective Limits Configuration</h4>

          <SliderRow label="Risk per Trade" field="risk_pct" min={0.1} max={5.0} step={0.1} form={form} setForm={setForm} />
          <SliderRow label="Daily Loss Limit" field="daily_loss_limit_pct" min={1} max={10} step={0.5} form={form} setForm={setForm} />
          <SliderRow label="Max Account Drawdown" field="max_drawdown_pct" min={5} max={25} step={1} form={form} setForm={setForm} />

          <div>
            <label className="block font-mono text-caption-mono text-mute uppercase mb-xxs">MAX CONCURRENT POSITIONS</label>
            <select value={form.max_concurrent_positions}
              onChange={e => setForm(prev => ({ ...prev, max_concurrent_positions: parseInt(e.target.value) }))}
              className="form-input focus:outline-none">
              {[1, 2, 3, 5].map(v => <option key={v} value={v}>{v} Position{v > 1 ? 's' : ''}</option>)}
            </select>
          </div>

          <SliderRow label="Trailing Start R:R" field="trailing_start_rr" min={0.5} max={3.0} step={0.1} suffix="R" form={form} setForm={setForm} />
          <SliderRow label="Breakeven Trigger R:R" field="break_even_after_rr" min={0.5} max={2.0} step={0.1} suffix="R" form={form} setForm={setForm} />

          {/* TP Levels Configurator */}
          <div>
            <div className="flex justify-between items-center mb-xs">
              <label className="font-mono text-caption-mono text-mute uppercase">Take Profit Milestones</label>
              <button onClick={() => setForm(prev => ({ ...prev, tp_levels: [...prev.tp_levels, { rr: 4.0, close_pct: 10 }] }))}
                className="text-link text-xxs font-bold hover:underline">+ Add Level</button>
            </div>
            <div className="space-y-xs">
              {form.tp_levels.map((tp, i) => (
                <div key={i} className="flex items-center gap-sm bg-canvas-soft border border-hairline rounded-sm p-xs">
                  <span className="font-mono text-caption-mono text-mute w-[30px]">TP{i+1}</span>
                  <div className="flex-1 flex gap-sm">
                    <div className="flex-1">
                      <label className="font-mono text-[9px] text-mute block">R Multiple</label>
                      <input type="number" step={0.5} value={tp.rr} onChange={e => {
                        const u = [...form.tp_levels]; u[i].rr = parseFloat(e.target.value); setForm(prev => ({ ...prev, tp_levels: u }))
                      }} className="w-full form-input-sm focus:outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="font-mono text-[9px] text-mute block">Close %</label>
                      <input type="number" value={tp.close_pct} onChange={e => {
                        const u = [...form.tp_levels]; u[i].close_pct = parseInt(e.target.value); setForm(prev => ({ ...prev, tp_levels: u }))
                      }} className="w-full form-input-sm focus:outline-none" />
                    </div>
                  </div>
                  <button onClick={() => setForm(prev => ({ ...prev, tp_levels: prev.tp_levels.filter((_, idx) => idx !== i) }))}
                    className="text-error font-bold hover:text-error-deep text-sm">✕</button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-xs">
            <ShieldCheck className="w-xs h-xs" />
            {saving ? 'Saving…' : 'Save Risk Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}
