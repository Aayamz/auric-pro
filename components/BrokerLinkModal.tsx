'use client'

import React, { useState } from 'react'
import { Zap, Eye, EyeOff, Loader2, CheckCircle2, X, ExternalLink } from 'lucide-react'

interface BrokerLinkModalProps {
  onConnected: (info: { login: string | number; server: string; balance: number; equity: number; mock: boolean }) => void
  onSkip: () => void
}

const POPULAR_SERVERS = [
  'ICMarkets-Live01',
  'ICMarkets-Demo01',
  'MetaQuotes-Demo',
  'Pepperstone-Live01',
  'Pepperstone-Demo01',
  'Exness-Real',
  'Exness-Trial',
  'XM.COM-Real 3',
  'XM.COM-Demo 3',
  'FXTM-MT5-Real2',
  'Alpari-MT5-ECN',
]

export function BrokerLinkModal({ onConnected, onSkip }: BrokerLinkModalProps) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServer] = useState('')
  const [serverInput, setServerInput] = useState('')
  const [showServerList, setShowServerList] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [accountInfo, setAccountInfo] = useState<any>(null)

  const filteredServers = POPULAR_SERVERS.filter(s =>
    s.toLowerCase().includes(serverInput.toLowerCase())
  )

  const handleConnect = async () => {
    if (!login || !password || !server) {
      setError('Please fill in all fields.')
      return
    }
    if (!/^\d+$/.test(login)) {
      setError('MT5 Login must be a numeric account number (e.g. 12345678), not an email.')
      return
    }
    setError('')
    setLoading(true)

    try {
      // Save broker credentials
      const res = await fetch('/api/settings/broker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password, server, cloud_mode: true })
      })

      if (!res.ok) {
        setError('Failed to save broker credentials. Please check your details.')
        setLoading(false)
        return
      }

      // Wait briefly then poll bridge status (retry up to 6 times over ~20s)
      let finalStatus = null
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 2500 : 3000))
        try {
          const statusRes = await fetch('/api/bridge/status')
          const status = statusRes.ok ? await statusRes.json() : null
          if (status?.connected && (status.balance ?? 0) > 0) {
            finalStatus = status
            break
          }
          if (status?.connected && !finalStatus) {
            finalStatus = status
          }
        } catch {}
      }

      if (finalStatus?.connected) {
        setAccountInfo({
          login: finalStatus.login ?? login,
          server: finalStatus.server ?? server,
          balance: finalStatus.balance ?? 0,
          equity: finalStatus.equity ?? 0,
          mock: finalStatus.mock ?? false
        })
      } else {
        setAccountInfo({
          login,
          server,
          balance: 0,
          equity: 0,
          mock: false
        })
      }
      setStep('success')
    } catch (err: any) {
      setError(err.message || 'Connection failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleDone = () => {
    if (accountInfo) onConnected(accountInfo)
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-md">
      <div className="bg-canvas border border-hairline rounded-md shadow-level-5 w-full max-w-[460px] overflow-hidden">

        {step === 'form' ? (
          <>
            {/* Header */}
            <div className="p-xl border-b border-hairline">
              <div className="flex items-center gap-sm mb-sm">
                <div className="w-[36px] h-[36px] rounded-md bg-primary flex items-center justify-center shrink-0">
                  <Zap className="w-sm h-sm text-on-primary" />
                </div>
                <div>
                  <h2 className="font-sans text-body-md font-semibold text-ink">Link your MT5 Broker Account</h2>
                  <p className="font-mono text-[10px] text-mute uppercase">Required to start trading</p>
                </div>
              </div>
              <p className="font-sans text-body-sm text-body-text leading-relaxed">
                Connect your MetaTrader 5 account to enable live price feeds, position monitoring, and trade execution.
              </p>
            </div>

            {/* Form */}
            <div className="p-xl space-y-md">
              {/* Login */}
              <div>
                <label className="block font-mono text-caption-mono text-mute uppercase mb-xxs">
                  MT5 Account Number
                </label>
                <input
                  type="number"
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                  placeholder="e.g. 12345678"
                  className="w-full form-input focus:outline-none focus:border-hairline-strong"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block font-mono text-caption-mono text-mute uppercase mb-xxs">
                  MT5 Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your MT5 investor or master password"
                    className="w-full form-input pr-xl focus:outline-none focus:border-hairline-strong"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-sm top-1/2 -translate-y-1/2 text-mute hover:text-ink transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-xs h-xs" /> : <Eye className="w-xs h-xs" />}
                  </button>
                </div>
              </div>

              {/* Server */}
              <div className="relative">
                <label className="block font-mono text-caption-mono text-mute uppercase mb-xxs">
                  Broker Server
                </label>
                <input
                  type="text"
                  value={server || serverInput}
                  onChange={e => {
                    setServerInput(e.target.value)
                    setServer(e.target.value)
                    setShowServerList(true)
                  }}
                  onFocus={() => setShowServerList(true)}
                  onBlur={() => setTimeout(() => setShowServerList(false), 150)}
                  placeholder="e.g. ICMarkets-Live01"
                  className="w-full form-input focus:outline-none focus:border-hairline-strong"
                />
                {showServerList && filteredServers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-xxs bg-canvas border border-hairline rounded-sm shadow-level-4 z-10 max-h-[160px] overflow-y-auto">
                    {filteredServers.map(s => (
                      <button
                        key={s}
                        onMouseDown={() => { setServer(s); setServerInput(s); setShowServerList(false) }}
                        className="w-full text-left px-sm py-xs font-mono text-caption-mono text-body-text hover:bg-canvas-soft transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <p className="font-mono text-[10px] text-mute mt-xxs">
                  Find your server in MT5 → Tools → Options → Server tab
                </p>
              </div>

              {error && (
                <div className="bg-error-soft border border-error/30 text-error font-sans text-caption px-sm py-xs rounded-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={loading}
                className="w-full bg-primary text-on-primary font-sans text-button-md font-semibold h-[42px] rounded-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-xs"
              >
                {loading ? (
                  <><Loader2 className="w-xs h-xs animate-spin" /> Connecting to MT5…</>
                ) : (
                  <><Zap className="w-xs h-xs" /> Connect Broker Account</>
                )}
              </button>

              <div className="flex items-center justify-between">
                <button
                  onClick={onSkip}
                  className="font-sans text-caption text-mute hover:text-body-text transition-colors"
                >
                  Skip for now →
                </button>
                <a
                  href="https://www.metatrader5.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-sans text-caption text-link hover:underline flex items-center gap-xxs"
                >
                  <ExternalLink className="w-[10px] h-[10px]" />
                  Get MT5
                </a>
              </div>
            </div>
          </>
        ) : (
          /* Success Screen */
          <div className="p-xl space-y-lg text-center">
            <div className="flex justify-center">
              <div className="w-[56px] h-[56px] rounded-full bg-success/10 border border-success/30 flex items-center justify-center">
                <CheckCircle2 className="w-lg h-lg text-success" />
              </div>
            </div>

            <div>
              <h3 className="font-sans text-body-md font-semibold text-ink">
                {accountInfo?.mock ? 'MT5 Sandbox Connected' : 'MT5 Account Connected'}
              </h3>
              <p className="font-sans text-caption text-body-text mt-xxs">
                {accountInfo?.mock
                  ? 'Running in simulation mode — no real trades will be placed.'
                  : 'Live bridge active. Your data is now streaming from MT5.'}
              </p>
            </div>

            <div className="border border-hairline rounded-md divide-y divide-hairline text-left">
              <div className="flex justify-between px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Login</span>
                <span className="font-sans text-body-sm font-semibold text-ink">{accountInfo?.login}</span>
              </div>
              <div className="flex justify-between px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Server</span>
                <span className="font-sans text-body-sm font-semibold text-ink">{accountInfo?.server}</span>
              </div>
              <div className="flex justify-between px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Balance</span>
                <span className="font-sans text-body-sm font-semibold text-success">${(accountInfo?.balance ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Mode</span>
                <span className={`font-mono text-[10px] font-bold px-xs py-[2px] rounded-xs border ${
                  accountInfo?.mock ? 'text-mute border-hairline' : 'text-success border-success/30 bg-success/5'
                }`}>
                  {accountInfo?.mock ? 'SANDBOX' : 'LIVE'}
                </span>
              </div>
            </div>

            <button
              onClick={handleDone}
              className="w-full bg-primary text-on-primary font-sans text-button-md font-semibold h-[42px] rounded-sm hover:opacity-90 transition-opacity"
            >
              Go to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
