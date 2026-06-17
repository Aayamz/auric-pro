'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useStore } from '@/store'
import { useLiveData } from '@/hooks/useLiveData'
import { supabase } from '@/lib/supabase'
import { 
  LayoutDashboard, 
  Radio, 
  Sliders, 
  TrendingUp, 
  History, 
  HelpCircle, 
  ShieldAlert, 
  Settings, 
  LogOut,
  Zap
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/signals', label: 'Signals', icon: Radio },
  { href: '/app/strategies', label: 'Strategies', icon: Sliders },
  { href: '/app/scalper', label: 'Scalper Mode', icon: Zap },
  { href: '/app/portfolio', label: 'Portfolio', icon: History },
  { href: '/app/backtester', label: 'Backtester', icon: TrendingUp },
  { href: '/app/ai-advisor', label: 'AI Advisor', icon: HelpCircle },
  { href: '/app/risk', label: 'Risk Controls', icon: ShieldAlert },
  { href: '/app/settings', label: 'Settings', icon: Settings }
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  
  // Activate live websocket listener at layout level
  useLiveData()
  
  const { 
    bridgeStatus, 
    botRunning, 
    activeStrategy,
    user: storeUser,
    subscription,
    setUser,
    setBotRunning,
    setBridgeStatus,
    setSubscription
  } = useStore()

  // Polling AI Commentary
  const [commentary, setCommentary] = React.useState<string[]>([
    "XAUUSD consolidation patterns suggest a short-term liquidity sweep above $1965 remains highly probable.",
    "ATR expansion indicates key breakout volatility building near the M15 order blocks."
  ])

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        if (user) {
          setUser({ id: user.id, email: user.email })
        } else if (!storeUser) {
          // Fallback user for demo if supabase token is omitted
          setUser({ id: '00000000-0000-0000-0000-000000000000', email: 'demo@auricpro.com' })
        }
      })
      .catch(() => {
        // Fallback user if supabase connection fails/offline
        if (!storeUser) {
          setUser({ id: '00000000-0000-0000-0000-000000000000', email: 'demo@auricpro.com' })
        }
      })

    // Fetch initial bot and bridge status
    fetch('/api/trading/status')
      .then(res => res.json())
      .then(data => {
        setBotRunning(data.running)
      }).catch(() => {})

    // Fetch dynamic subscription status
    fetch('/api/subscription')
      .then(res => res.json())
      .then(data => {
        setSubscription(data)
      }).catch(() => {})

    // Poll bridge connection status
    const checkBridge = () => {
      fetch('/api/bridge/status')
        .then(res => res.json())
        .then(data => {
          setBridgeStatus(data.connected ? 'connected' : 'disconnected')
        })
        .catch(() => setBridgeStatus('disconnected'))
    }
    checkBridge()
    const bridgeInterval = setInterval(checkBridge, 3000)

    // Poll AI Commentary every 5 mins
    const fetchCommentary = () => {
      fetch('/api/ai/commentary')
        .then(res => res.json())
        .then(data => {
          if (data.commentary) setCommentary(data.commentary)
        }).catch(() => {})
    }
    
    fetchCommentary()
    const interval = setInterval(fetchCommentary, 5 * 60 * 1000)
    return () => {
      clearInterval(interval)
      clearInterval(bridgeInterval)
    }
  }, [setUser, setBotRunning, setBridgeStatus])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push('/auth/login')
  }

  // Minimal layout for full-screen scalper page (no sidebar/header/commentary)
  const isScalperPage = pathname === '/app/scalper'

  if (isScalperPage) {
    return <div className="flex-1 flex flex-col bg-canvas-soft-2">{children}</div>
  }

  return (
    <div className="flex-1 flex min-h-screen bg-canvas-soft">
      
      {/* 1. Left Sidebar Navigation */}
      <aside className="w-[240px] bg-canvas border-r border-hairline flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Brand Header */}
          <div className="h-[64px] border-b border-hairline flex items-center px-lg">
            <span className="font-sans text-display-sm font-semibold tracking-tight text-ink">
              AURIC PRO
            </span>
            <span className="ml-xxs font-mono text-[9px] text-mute border border-hairline px-xxs py-[2px] rounded-md">
              V2.0
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="p-sm space-y-[2px]">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-sm px-md py-xs rounded-sm transition-colors text-body-sm relative ${
                    isActive
                      ? 'bg-canvas-soft-2 text-ink font-medium'
                      : 'text-body-text hover:bg-canvas-soft-2 hover:text-ink'
                  }`}
                >
                  {/* Left-edge brand primary indicator bar for active route */}
                  {isActive && (
                    <div className="absolute left-0 top-[6px] bottom-[6px] w-[3px] bg-primary rounded-r-sm" />
                  )}
                  <Icon className="w-sm h-sm shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-sm border-t border-hairline space-y-xs">
          <div className="px-md py-xs">
            <span className="block text-caption text-mute truncate">{storeUser?.email || 'demo@auricpro.com'}</span>
            <span className="font-mono text-[9px] text-success uppercase tracking-wider mt-xxs inline-block">
              {subscription?.plan ? `${subscription.plan.toUpperCase()} PLAN` : 'FREE PLAN'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-sm px-md py-xs rounded-sm text-body-text hover:bg-error-soft hover:text-error text-body-sm transition-colors"
          >
            <LogOut className="w-sm h-sm shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* 2. Main Content & Top Header Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Upper Dashboard Header */}
        <header className="h-[64px] bg-canvas border-b border-hairline flex items-center justify-between px-xl shrink-0">
          
          {/* Real-time Status Pills */}
          <div className="flex items-center gap-sm">
            {/* Bridge Connection Status */}
            <div className="flex items-center gap-xs px-sm py-[4px] border border-hairline rounded-pill bg-canvas-soft shadow-level-2">
              <span className={`w-xs h-xs rounded-full inline-block ${
                bridgeStatus === 'connected' ? 'bg-success animate-pulse' : 'bg-error animate-pulse'
              }`} />
              <span className="font-mono text-[10px] text-body-text uppercase font-semibold">
                BRIDGE: {bridgeStatus}
              </span>
            </div>

            {/* Trading Loop Auto-execution status */}
            <div className="flex items-center gap-xs px-sm py-[4px] border border-hairline rounded-pill bg-canvas-soft shadow-level-2">
              <span className={`w-xs h-xs rounded-full inline-block ${
                botRunning ? 'bg-success animate-pulse' : 'bg-mute'
              }`} />
              <span className="font-mono text-[10px] text-body-text uppercase font-semibold">
                ALGO: {botRunning ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>

            {/* Current Active Trading Strategy */}
            <div className="flex items-center gap-xs px-sm py-[4px] border border-hairline rounded-pill bg-canvas-soft shadow-level-2">
              <span className="font-mono text-[10px] text-body-text uppercase font-semibold">
                STRAT: {activeStrategy.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-sm">
            <button
              onClick={async () => {
                const action = botRunning ? 'stop' : 'start'
                const res = await fetch(`/api/trading/${action}`, { method: 'POST' })
                if (res.ok) {
                  setBotRunning(!botRunning)
                }
              }}
              className={`px-sm py-xs font-sans text-button-md font-medium rounded-sm border transition-colors ${
                botRunning 
                  ? 'bg-canvas border-hairline text-ink hover:bg-canvas-soft'
                  : 'bg-primary border-primary text-on-primary hover:opacity-90'
              }`}
            >
              {botRunning ? 'Stop Algo' : 'Start Algo'}
            </button>
          </div>
        </header>

        {/* Inner Content Area */}
        <main className="flex-1 overflow-y-auto p-xl relative">
          {children}
        </main>

        {/* 3. Bottom Scrolling AI Commentary Ticker */}
        <footer className="h-[36px] bg-primary text-on-primary border-t border-hairline flex items-center overflow-hidden shrink-0">
          <div className="font-mono text-caption-mono text-on-primary px-lg bg-black border-r border-hairline shrink-0 h-full flex items-center uppercase tracking-wider font-semibold">
            AI Commentary
          </div>
          <div className="flex-1 relative overflow-hidden flex items-center">
            <div className="animate-marquee whitespace-nowrap text-caption-mono font-mono pl-md text-on-primary/90">
              {commentary.join(" | ")}
            </div>
          </div>
        </footer>

      </div>
    </div>
  )
}
