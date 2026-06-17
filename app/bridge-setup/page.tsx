'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { 
  Terminal, 
  Download, 
  Key, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  ChevronLeft, 
  ExternalLink,
  Laptop,
  Lock,
  Cpu
} from 'lucide-react'

export default function BridgeSetupPage() {
  const router = useRouter()
  const [token, setToken] = useState('Loading session token…')
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState(false)
  const [bridgeConnected, setBridgeConnected] = useState(false)
  const [checkingBridge, setCheckingBridge] = useState(true)
  const [accountInfo, setAccountInfo] = useState<{ balance?: number; equity?: number; last_seen?: string } | null>(null)

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

  // Poll bridge connection status
  useEffect(() => {
    let cancelled = false
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/bridge/status')
        const data = await res.json()
        if (!cancelled) {
          if (data.connected) {
            setBridgeConnected(true)
            setAccountInfo({
              balance: data.balance,
              equity: data.equity,
              last_seen: data.last_seen
            })
          } else {
            setBridgeConnected(false)
          }
          setCheckingBridge(false)
        }
      } catch {
        if (!cancelled) {
          setBridgeConnected(false)
          setCheckingBridge(false)
        }
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 3000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const truncatedToken = token.length > 30 ? `${token.substring(0, 24)}…` : token

  return (
    <div className="min-h-screen bg-canvas-soft text-ink flex flex-col font-sans">
      
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-canvas/80 backdrop-blur-md border-b border-hairline h-16 px-lg flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-md">
          <button 
            onClick={() => router.push('/app/settings')}
            className="flex items-center gap-xxs font-sans text-body-sm text-body-text hover:text-ink transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-xxs h-xxs" /> Back to Settings
          </button>
          <div className="h-4 w-[1px] bg-hairline" />
          <span className="font-mono text-caption-mono text-mute tracking-wider uppercase">MT5 Data Bridge Guide</span>
        </div>
        <div className="flex items-center gap-xs">
          <span className={`w-xxs h-xxs rounded-full inline-block ${bridgeConnected ? 'bg-success animate-pulse' : 'bg-warning animate-pulse'}`} />
          <span className="font-mono text-[10px] text-mute uppercase">
            Bridge: {bridgeConnected ? 'Connected' : 'Listening'}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[800px] w-full mx-auto px-lg py-xl space-y-xl">
        
        {/* Hero Section */}
        <div className="space-y-xxs">
          <h1 className="font-sans text-display-lg font-semibold text-ink tracking-tight">
            Connecting MetaTrader 5 to AURIC PRO.
          </h1>
          <p className="font-sans text-body-lg text-body-text">
            Follow this step-by-step setup wizard to establish a high-frequency link between your local trading terminal and the cockpit dashboard.
          </p>
        </div>

        {/* Windows Warning Alert */}
        <div className="bg-warning-soft border border-warning/30 rounded-md p-md flex gap-sm items-start">
          <Laptop className="w-md h-md text-warning-deep shrink-0 mt-[2px]" />
          <div className="space-y-xxs">
            <h4 className="font-sans text-body-sm font-semibold text-warning-deep">Windows Environment Required</h4>
            <p className="font-sans text-caption text-warning-deep/80 leading-relaxed">
              MetaTrader 5 (MT5) and its official python connector integrations run natively on **Windows**. Make sure you perform these setup steps directly on the Windows machine where your MetaTrader 5 terminal is installed.
            </p>
          </div>
        </div>

        {/* Step-by-Step Instructions Container */}
        <div className="space-y-lg">
          
          {/* Step 1: Dependencies */}
          <div className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 space-y-md">
            <div className="flex items-center gap-sm">
              <span className="font-mono text-caption-mono text-mute bg-canvas-soft border border-hairline w-6 h-6 rounded-full flex items-center justify-center font-bold">1</span>
              <h3 className="font-sans text-body-md font-semibold text-ink">Install Python Dependencies</h3>
            </div>
            <p className="font-sans text-body-sm text-body-text">
              The data bridge is built in Python and requires a few lightweight libraries to communicate with MetaTrader 5 and the cloud API.
            </p>
            <div className="space-y-xxs">
              <span className="block font-mono text-caption-mono text-mute">RUN IN POWERSHELL / CMD</span>
              <div className="relative">
                <pre className="font-mono text-code text-on-primary bg-primary p-md rounded-md overflow-x-auto whitespace-pre select-all pr-12">
                  pip install websockets MetaTrader5 cryptography
                </pre>
                <button
                  onClick={() => copyToClipboard('pip install websockets MetaTrader5 cryptography', setCopiedCmd)}
                  className="absolute right-sm top-1/2 -translate-y-1/2 text-mute hover:text-on-primary bg-canvas/10 p-xxs rounded hover:bg-canvas/20 transition-all cursor-pointer"
                  title="Copy command"
                >
                  {copiedCmd ? <Check className="w-xxs h-xxs text-success" /> : <Copy className="w-xxs h-xxs" />}
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Download bridge.py */}
          <div className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 space-y-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-sm">
                <span className="font-mono text-caption-mono text-mute bg-canvas-soft border border-hairline w-6 h-6 rounded-full flex items-center justify-center font-bold">2</span>
                <h3 className="font-sans text-body-md font-semibold text-ink">Download local bridge agent</h3>
              </div>
              <a
                href="/bridge/bridge.py"
                download="bridge.py"
                className="flex items-center gap-xxs bg-primary text-on-primary font-sans text-button-md font-medium px-md h-[36px] rounded-pill hover:opacity-90 transition-opacity shadow-level-2"
              >
                <Download className="w-xxs h-xxs" /> Download bridge.py
              </a>
            </div>
            <p className="font-sans text-body-sm text-body-text">
              Download the executable bridge script and save it on your Windows local drive (e.g. in your documents or a dedicated project folder).
            </p>
            <div className="p-sm bg-canvas-soft border border-hairline rounded-sm flex gap-xs items-center">
              <Cpu className="w-xxs h-xxs text-mute shrink-0" />
              <span className="font-sans text-caption text-body-text">
                Current version: **1.0.0** • Filename: `bridge.py`
              </span>
            </div>
          </div>

          {/* Step 3: Configure credentials */}
          <div className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 space-y-md">
            <div className="flex items-center gap-sm">
              <span className="font-mono text-caption-mono text-mute bg-canvas-soft border border-hairline w-6 h-6 rounded-full flex items-center justify-center font-bold">3</span>
              <h3 className="font-sans text-body-md font-semibold text-ink">Encrypt MT5 Broker Credentials</h3>
            </div>
            <p className="font-sans text-body-sm text-body-text">
              Run the interactive configuration wizard to save and encrypt your MT5 Login ID, password, and Server name.
            </p>
            <div className="bg-canvas-soft border border-hairline p-md rounded-md space-y-sm">
              <div className="flex justify-between items-center">
                <span className="font-mono text-caption-mono text-mute uppercase">Run configuration command:</span>
              </div>
              <pre className="font-mono text-code text-on-primary bg-primary p-xs rounded-sm select-all">
                python bridge.py --setup
              </pre>
              <div className="space-y-xxs">
                <h5 className="font-sans text-caption font-semibold text-ink flex items-center gap-xxs">
                  <Lock className="w-[12px] h-[12px] text-success" /> Fully Secured & Local
                </h5>
                <p className="font-sans text-[11px] text-mute leading-relaxed">
                  Your MT5 credentials are encrypted locally on your hard drive using a symmetric **Fernet (AES-128)** key. AURIC PRO servers never receive, store, or transmit your raw password in plain text.
                </p>
              </div>
            </div>
          </div>

          {/* Step 4: Run the bridge */}
          <div className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 space-y-md">
            <div className="flex items-center gap-sm">
              <span className="font-mono text-caption-mono text-mute bg-canvas-soft border border-hairline w-6 h-6 rounded-full flex items-center justify-center font-bold">4</span>
              <h3 className="font-sans text-body-md font-semibold text-ink">Start the Data Bridge</h3>
            </div>
            <p className="font-sans text-body-sm text-body-text">
              Run the bridge by passing your secure session JWT token to establish the pipeline. This token changes occasionally and authenticates this terminal.
            </p>
            
            <div className="space-y-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono text-caption-mono text-mute">YOUR AURIC SECURITY TOKEN</span>
                <button
                  onClick={() => copyToClipboard(token, setCopiedToken)}
                  className="font-sans text-[11px] text-link hover:underline flex items-center gap-xxs cursor-pointer"
                >
                  {copiedToken ? 'Copied!' : 'Copy raw token'}
                </button>
              </div>
              <div className="p-sm bg-canvas-soft-2 border border-hairline rounded-sm font-mono text-[11px] text-body-text truncate select-all">
                {truncatedToken}
              </div>
            </div>

            <div className="space-y-xxs">
              <span className="block font-mono text-caption-mono text-mute">EXECUTION COMMAND (COPY & RUN)</span>
              <div className="relative">
                <pre className="font-mono text-code text-on-primary bg-primary p-md rounded-md overflow-x-auto whitespace-pre select-all pr-12">
                  python bridge.py --token {token.substring(0, 20)}…
                </pre>
                <button
                  onClick={() => copyToClipboard(`python bridge.py --token ${token}`, setCopiedCmd)}
                  className="absolute right-sm top-1/2 -translate-y-1/2 text-mute hover:text-on-primary bg-canvas/10 p-xxs rounded hover:bg-canvas/20 transition-all cursor-pointer"
                  title="Copy command"
                >
                  {copiedCmd ? <Check className="w-xxs h-xxs text-success" /> : <Copy className="w-xxs h-xxs" />}
                </button>
              </div>
            </div>
          </div>

          {/* Step 5: Verification */}
          <div className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 space-y-md">
            <div className="flex items-center gap-sm">
              <span className="font-mono text-caption-mono text-mute bg-canvas-soft border border-hairline w-6 h-6 rounded-full flex items-center justify-center font-bold">5</span>
              <h3 className="font-sans text-body-md font-semibold text-ink">Verify Connection</h3>
            </div>
            <p className="font-sans text-body-sm text-body-text">
              Once you execute the script, it should connect within seconds. Check the live bridge pipeline status indicator below.
            </p>

            <div className={`p-md border rounded-md flex items-center gap-sm justify-between ${
              bridgeConnected ? 'bg-success-soft border-success/30' : 'bg-canvas-soft border-hairline'
            }`}>
              <div className="flex items-center gap-sm">
                <span className={`w-xs h-xs rounded-full inline-block ${bridgeConnected ? 'bg-success animate-pulse' : 'bg-warning animate-pulse'}`} />
                <div>
                  <span className="font-sans text-body-sm font-semibold text-ink block">
                    {bridgeConnected ? 'Connection Active' : 'Waiting for local bridge.py handshake…'}
                  </span>
                  <span className="font-sans text-caption text-mute block mt-xxs">
                    {bridgeConnected ? 'Live streaming prices and executing order commands.' : 'Start the python bridge script to begin syncing.'}
                  </span>
                </div>
              </div>
              {bridgeConnected && accountInfo && (
                <div className="text-right font-mono text-caption-mono text-body-text hidden sm:block">
                  <div>Bal: ${accountInfo.balance?.toFixed(2)}</div>
                  <div>Equ: ${accountInfo.equity?.toFixed(2)}</div>
                </div>
              )}
            </div>

            {bridgeConnected && (
              <div className="flex justify-end pt-xs">
                <button
                  onClick={() => router.push('/app/dashboard')}
                  className="bg-primary text-on-primary font-sans text-button-md font-semibold px-lg h-[40px] rounded-pill hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Proceed to Dashboard
                </button>
              </div>
            )}
          </div>

        </div>

      </main>

      {/* Subtle Footer */}
      <footer className="py-lg border-t border-hairline text-center bg-canvas">
        <p className="font-sans text-caption text-mute">
          AURIC PRO Algorithmic Ecosystem • Local cryptography Fernet standard AES-128
        </p>
      </footer>

    </div>
  )
}
