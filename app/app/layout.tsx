'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useStore } from '@/store'
import { useLiveData } from '@/hooks/useLiveData'
import { supabase } from '@/lib/supabase'
import { ToastProvider } from '@/components/Toast'
import { BrokerLinkModal } from '@/components/BrokerLinkModal'
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
  Zap,
  Loader2,
  Menu,
  X,
  Sun,
  Moon
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
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
  
  // Activate live websocket listener at layout level
  useLiveData()

  const [health, setHealth] = React.useState<any>(null)
  const [checkingHealth, setCheckingHealth] = React.useState(true)
  const [showBrokerModal, setShowBrokerModal] = React.useState(false)
  const [brokerChecked, setBrokerChecked] = React.useState(false)
  const brokerCheckedRef = React.useRef(false)

  const checkHealth = React.useCallback(async () => {
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      if (res.ok && data.ok) {
        setHealth(null)
      } else {
        setHealth(data)
      }
    } catch (err: any) {
      setHealth({
        supabase: { connected: false, message: 'Could not contact health check service.' },
        redis: { connected: false, message: 'Network offline.' },
        pythonApi: { connected: false, message: 'Network offline.' },
        razorpay: { configured: false, message: 'Network offline.' },
        ok: false
      })
    } finally {
      setCheckingHealth(false)
    }
  }, [])
  
  const { 
    bridgeStatus, 
    botRunning, 
    activeStrategy,
    user: storeUser,
    subscription,
    setUser,
    setBotRunning,
    setBridgeStatus,
    setSubscription,
    theme,
    setTheme
  } = useStore()

  useEffect(() => {
    const savedTheme = (localStorage.getItem('theme') || 'light') as 'light' | 'dark'
    setTheme(savedTheme)
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [setTheme])

  const email = storeUser?.email || ''
  const isAdmin = email === 'demo@auricpro.com' || 
                  email === 'admin@auricpro.com' || 
                  email === 'admin@auric.pro' || 
                  email === 'aayamsoni@gmail.com' || 
                  email === 'aayamsss@gmail.com' ||
                  !!(process.env.NEXT_PUBLIC_ADMIN_EMAIL && email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)

  const navList = React.useMemo(() => {
    const list = [...NAV_ITEMS]
    if (isAdmin) {
      list.splice(8, 0, { href: '/app/admin', label: 'Admin Panel', icon: ShieldAlert })
    }
    return list
  }, [isAdmin])

  // Polling AI Commentary
  const [commentary, setCommentary] = React.useState<string[]>([
    "XAUUSD consolidation patterns suggest a short-term liquidity sweep above $1965 remains highly probable.",
    "ATR expansion indicates key breakout volatility building near the M15 order blocks."
  ])

  useEffect(() => {
    checkHealth()
    const healthInterval = setInterval(checkHealth, 5000)

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

    // Poll bridge connection status + broker link check
    const checkBridge = async () => {
      try {
        const res = await fetch('/api/bridge/status')
        const data = await res.json()
        
        const currentStatus = useStore.getState().bridgeStatus
        if (data.connected) {
          setBridgeStatus('connected')
        } else if (currentStatus !== 'connected' && currentStatus !== 'connecting') {
          setBridgeStatus('disconnected')
        }

        // Show broker link modal on first check if not connected
        if (!brokerCheckedRef.current) {
          brokerCheckedRef.current = true
          setBrokerChecked(true)
          const updatedStatus = useStore.getState().bridgeStatus
          if (!data.connected && updatedStatus !== 'connected' && updatedStatus !== 'connecting') {
            setShowBrokerModal(true)
          }
        }
      } catch {
        const currentStatus = useStore.getState().bridgeStatus
        if (currentStatus !== 'connected' && currentStatus !== 'connecting') {
          setBridgeStatus('disconnected')
        }
      }
    }
    checkBridge()
    const bridgeInterval = setInterval(checkBridge, 5000)

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
      clearInterval(healthInterval)
    }
  }, [setUser, setBotRunning, setBridgeStatus, checkHealth])

  const handleBrokerConnected = (info: any) => {
    setShowBrokerModal(false)
    setBridgeStatus('connected')
  }

  const handleBrokerSkip = () => {
    setShowBrokerModal(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push('/auth/login')
  }

  if (health) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-canvas-soft p-lg overflow-y-auto text-ink">
        {/* Ambient mesh gradient background spotlight */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-gradient-to-r from-[#007cf0] via-[#7928ca] to-[#ff4d4d] opacity-[0.08] blur-[80px] rounded-full pointer-events-none" />

        <div className="bg-canvas border border-hairline rounded-md p-xl shadow-level-5 max-w-[640px] w-full space-y-lg relative overflow-hidden flex flex-col">
          <div className="space-y-xxs">
            <div className="flex items-center gap-xs">
              <span className="font-mono text-caption-mono text-mute border border-hairline px-xxs py-[2px] rounded-md uppercase font-semibold">Connection Guard</span>
              <span className="font-mono text-[9px] bg-error-soft text-error px-xxs py-[2px] rounded-sm font-semibold uppercase">Live Mode Enforced</span>
            </div>
            <h1 className="font-sans text-display-md font-semibold text-ink mt-xs">Connection Diagnostic Required</h1>
            <p className="font-sans text-body-sm text-body-text">
              AURIC PRO is running in strictly live data mode. We detected that one or more core cloud/local services are disconnected. Please verify your environment configurations in <code className="font-mono text-xs text-ink bg-canvas-soft-2 px-xxs rounded-xs border border-hairline">.env.local</code>.
            </p>
          </div>

          <div className="border-t border-hairline pt-md space-y-md">
            {/* Supabase status row */}
            <div className="p-sm bg-canvas-soft border border-hairline rounded-sm flex flex-col gap-xxs">
              <div className="flex justify-between items-center">
                <span className="font-sans text-body-sm font-semibold text-ink">Database & Auth (Supabase)</span>
                <span className="flex items-center gap-xs">
                  <span className={`w-xs h-xs rounded-full inline-block ${health.supabase.connected ? 'bg-success' : 'bg-error animate-pulse'}`} />
                  <span className="font-mono text-[10px] text-mute font-bold uppercase">{health.supabase.connected ? 'Connected' : 'Offline'}</span>
                </span>
              </div>
              {!health.supabase.connected && (
                <p className="font-mono text-[11px] text-error-deep leading-relaxed mt-xxs border-l border-error/30 pl-xs">
                  {health.supabase.message || 'Verification query failed. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'}
                </p>
              )}
            </div>

            {/* Redis status row */}
            <div className="p-sm bg-canvas-soft border border-hairline rounded-sm flex flex-col gap-xxs">
              <div className="flex justify-between items-center">
                <span className="font-sans text-body-sm font-semibold text-ink">Cache & Event Broker (Redis)</span>
                <span className="flex items-center gap-xs">
                  <span className={`w-xs h-xs rounded-full inline-block ${health.redis.connected ? 'bg-success' : 'bg-error animate-pulse'}`} />
                  <span className="font-mono text-[10px] text-mute font-bold uppercase">{health.redis.connected ? 'Connected' : 'Offline'}</span>
                </span>
              </div>
              {!health.redis.connected && (
                <p className="font-mono text-[11px] text-error-deep leading-relaxed mt-xxs border-l border-error/30 pl-xs">
                  {health.redis.message || 'Unable to ping Redis server. Make sure Redis service is running locally on port 6379 or configured in REDIS_URL.'}
                </p>
              )}
            </div>

            {/* FastAPI status row */}
            <div className="p-sm bg-canvas-soft border border-hairline rounded-sm flex flex-col gap-xxs">
              <div className="flex justify-between items-center">
                <span className="font-sans text-body-sm font-semibold text-ink">Execution Engine (FastAPI)</span>
                <span className="flex items-center gap-xs">
                  <span className={`w-xs h-xs rounded-full inline-block ${health.pythonApi.connected ? 'bg-success' : 'bg-error animate-pulse'}`} />
                  <span className="font-mono text-[10px] text-mute font-bold uppercase">{health.pythonApi.connected ? 'Connected' : 'Offline'}</span>
                </span>
              </div>
              {!health.pythonApi.connected && (
                <p className="font-mono text-[11px] text-error-deep leading-relaxed mt-xxs border-l border-error/30 pl-xs">
                  {health.pythonApi.message || 'FastAPI backend is offline. Start the Python server inside /backend (python main.py) on Port 8000.'}
                </p>
              )}
            </div>

            {/* Razorpay status row */}
            <div className="p-sm bg-canvas-soft border border-hairline rounded-sm flex flex-col gap-xxs">
              <div className="flex justify-between items-center">
                <span className="font-sans text-body-sm font-semibold text-ink">Payment Gateway (Razorpay API Keys)</span>
                <span className="flex items-center gap-xs">
                  <span className={`w-xs h-xs rounded-full inline-block ${health.razorpay.configured ? 'bg-success' : 'bg-warning animate-pulse'}`} />
                  <span className="font-mono text-[10px] text-mute font-bold uppercase">{health.razorpay.configured ? 'Configured' : 'Missing'}</span>
                </span>
              </div>
              {!health.razorpay.configured && (
                <p className="font-mono text-[11px] text-warning-deep leading-relaxed mt-xxs border-l border-warning/40 pl-xs">
                  {health.razorpay.message || 'Razorpay keys or plans are missing or set to placeholder templates. Populate them in .env.local.'}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-hairline pt-md flex justify-between items-center">
            <span className="font-mono text-[10px] text-mute uppercase">Enforced since v2.0 • live mode</span>
            <button
              onClick={() => {
                setCheckingHealth(true)
                checkHealth()
              }}
              disabled={checkingHealth}
              className="bg-primary text-on-primary font-sans text-button-md font-semibold px-lg h-[40px] rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-xxs"
            >
              {checkingHealth ? (
                <>
                  <Loader2 className="w-xxs h-xxs animate-spin" /> Verifying Connection...
                </>
              ) : (
                'Retry Connection'
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Minimal layout for full-screen scalper page (no sidebar/header/commentary)
  const isScalperPage = pathname === '/app/scalper'

  if (isScalperPage) {
    return <div className="flex-1 flex flex-col bg-canvas-soft-2">{children}</div>
  }

  return (
    <ToastProvider>
    {showBrokerModal && (
      <BrokerLinkModal
        onConnected={handleBrokerConnected}
        onSkip={handleBrokerSkip}
      />
    )}
    
    {/* Sidebar mobile overlay backdrop */}
    {sidebarOpen && (
      <div 
        onClick={() => setSidebarOpen(false)} 
        className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 md:hidden" 
      />
    )}

    <div className="flex-1 flex min-h-screen bg-canvas-soft relative">
      
      {/* 1. Left Sidebar Navigation */}
      <aside className={`w-[240px] bg-canvas border-r border-hairline flex flex-col justify-between shrink-0 fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div>
          {/* Logo Brand Header */}
          <div className="h-[64px] border-b border-hairline flex items-center justify-between px-lg">
            <div className="flex items-center">
              <span className="font-sans text-display-sm font-semibold tracking-tight text-ink">
                AURIC PRO
              </span>
              <span className="ml-xxs font-mono text-[9px] text-mute border border-hairline px-xxs py-[2px] rounded-md">
                V2.0
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-xs text-body-text hover:text-ink md:hidden"
              title="Close menu"
            >
              <X className="w-sm h-sm" />
            </button>
          </div>
 
          {/* Navigation Links */}
          <nav className="p-sm space-y-[2px]">
            {navList.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
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
        <header className="h-[64px] bg-canvas border-b border-hairline flex items-center justify-between px-md md:px-xl shrink-0">
          
          {/* Left section: Hamburger Toggle + Real-time Status Pills */}
          <div className="flex items-center gap-sm min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-xs -ml-xs mr-xxs md:hidden text-body-text hover:text-ink shrink-0"
              title="Open menu"
            >
              <Menu className="w-sm h-sm" />
            </button>

            {/* Real-time Status Pills (horizontal scroll on narrow screens) */}
            <div className="flex items-center gap-xs overflow-x-auto no-scrollbar py-xxs">
              {/* Bridge Connection Status — click to connect when offline */}
              <button
                onClick={() => bridgeStatus !== 'connected' && setShowBrokerModal(true)}
                className={`flex items-center gap-xs px-xs sm:px-sm py-[4px] border rounded-pill bg-canvas-soft shadow-level-2 transition-colors shrink-0 ${
                  bridgeStatus !== 'connected'
                    ? 'border-error/40 hover:bg-error-soft cursor-pointer'
                    : 'border-hairline cursor-default'
                }`}
                title={bridgeStatus !== 'connected' ? 'Click to connect MT5 broker account' : 'MT5 bridge connected'}
              >
                <span className={`w-xs h-xs rounded-full inline-block ${
                  bridgeStatus === 'connected' ? 'bg-success animate-pulse' : 'bg-error animate-pulse'
                }`} />
                <span className={`font-mono text-[10px] uppercase font-semibold ${
                  bridgeStatus === 'connected' ? 'text-body-text' : 'text-error'
                }`}>
                  {bridgeStatus === 'connected' ? 'BRIDGE: LIVE' : 'CONNECT MT5 ↗'}
                </span>
              </button>
 
              {/* Trading Loop Auto-execution status */}
              <div className="flex items-center gap-xs px-xs sm:px-sm py-[4px] border border-hairline rounded-pill bg-canvas-soft shadow-level-2 shrink-0">
                <span className={`w-xs h-xs rounded-full inline-block ${
                  botRunning ? 'bg-success animate-pulse' : 'bg-mute'
                }`} />
                <span className="font-mono text-[10px] text-body-text uppercase font-semibold">
                  ALGO: {botRunning ? 'ACTIVE' : 'IDLE'}
                </span>
              </div>
 
              {/* Current Active Trading Strategy (hidden on mobile, shown on tablet/desktop) */}
              <div className="flex items-center gap-xs px-xs sm:px-sm py-[4px] border border-hairline rounded-pill bg-canvas-soft shadow-level-2 shrink-0 hidden sm:flex">
                <span className="font-mono text-[10px] text-body-text uppercase font-semibold">
                  STRAT: {activeStrategy.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
 
          {/* Quick Actions */}
          <div className="flex items-center gap-sm shrink-0">
            <button
              onClick={toggleTheme}
              className="p-[6px] text-body-text hover:text-ink rounded-sm border border-hairline bg-canvas hover:bg-canvas-soft-2 transition-colors shrink-0 cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-sm h-sm" /> : <Moon className="w-sm h-sm" />}
            </button>
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
 
        {/* Inner Content Area (added responsive padding classes) */}
        <main className="flex-1 overflow-y-auto p-md md:p-xl relative">
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
    </ToastProvider>
  )
}
