import Link from 'next/link'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { LandingAuth } from '@/components/LandingAuth'
import { InteractiveCodeMockup } from '@/components/InteractiveCodeMockup'
import { PricingSection } from '@/components/PricingSection'

export const dynamic = 'force-dynamic'

const FEATURES = [
  {
    title: 'AI-Powered Signals',
    description: 'Machine learning models analyse market structure, order blocks, and liquidity zones to generate high-confidence setups in real time.',
    icon: (
      <svg className="w-sm h-sm text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    )
  },
  {
    title: 'Live MT5 Execution',
    description: 'Connect your MetaTrader 5 terminal via an encrypted local bridge. Execute trades directly from the dashboard with sub-second latency.',
    icon: (
      <svg className="w-sm h-sm text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    )
  },
  {
    title: 'Strategy Backtester',
    description: 'Run Monte Carlo simulations on historical tick data. Analyse equity curves, drawdown, and profit factor before deploying capital.',
    icon: (
      <svg className="w-sm h-sm text-[#f5a623]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    )
  },
  {
    title: 'Risk Control Centre',
    description: 'Configurable stop-loss limits, daily drawdown guards, and an emergency halt switch that closes all positions instantly.',
    icon: (
      <svg className="w-sm h-sm text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  },
  {
    title: 'Portfolio Analytics',
    description: 'Track every trade with detailed P&L, R-multiple breakdowns, calendar heatmaps, and exportable PDF reports.',
    icon: (
      <svg className="w-sm h-sm text-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    )
  },
  {
    title: 'AI Advisor',
    description: 'Chat with Claude-powered intelligence that understands your portfolio, risk profile, and current market regime.',
    icon: (
      <svg className="w-sm h-sm text-highlight-pink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  }
]

const STRATEGIES = [
  { name: 'Order Block Reversal', winRate: '68.4%', type: 'SWING', sharpe: '2.4', pf: '2.14' },
  { name: 'Liquidity Sweep', winRate: '71.0%', type: 'SCALP', sharpe: '2.8', pf: '2.45' },
  { name: 'EMA Crossover', winRate: '62.5%', type: 'SCALP', sharpe: '1.9', pf: '1.78' },
  { name: 'FVG Scalper', winRate: '64.0%', type: 'SCALP', sharpe: '2.1', pf: '1.92' },
]

export default async function LandingPage() {
  let isLoggedIn = false
  try {
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
    
    const ssrClient = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )
    const { data: { user } } = await ssrClient.auth.getUser()
    isLoggedIn = !!user
  } catch (e) {
    console.error('Error fetching user for landing page:', e)
  }

  return (
    <div className="flex flex-col min-h-screen bg-canvas-soft font-sans select-none scroll-smooth">

      {/* Navigation */}
      <nav className="h-[64px] bg-canvas border-b border-hairline flex items-center justify-between px-xl sticky top-0 z-50 shadow-sm backdrop-blur-md bg-canvas/90">
        <div className="flex items-center gap-xs">
          <Link href="/" className="font-sans text-display-sm font-semibold tracking-tight text-ink hover:opacity-80 transition-opacity">
            AURIC PRO
          </Link>
          <span className="font-mono text-[9px] text-mute border border-hairline px-xxs py-[2px] rounded-md">
            V2.0
          </span>
        </div>

        {/* Center Navigation Links */}
        <div className="hidden md:flex items-center gap-xs">
          <a
            href="#features"
            className="text-body-text hover:text-ink hover:bg-canvas-soft-2 px-sm py-[6px] rounded-full text-body-sm transition-all font-sans select-none"
          >
            Features
          </a>
          <a
            href="#strategies"
            className="text-body-text hover:text-ink hover:bg-canvas-soft-2 px-sm py-[6px] rounded-full text-body-sm transition-all font-sans select-none"
          >
            Strategies
          </a>
          <a
            href="#developer"
            className="text-body-text hover:text-ink hover:bg-canvas-soft-2 px-sm py-[6px] rounded-full text-body-sm transition-all font-sans select-none"
          >
            Developer API
          </a>
          <a
            href="#pricing"
            className="text-body-text hover:text-ink hover:bg-canvas-soft-2 px-sm py-[6px] rounded-full text-body-sm transition-all font-sans select-none"
          >
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-sm">
          <LandingAuth initialLoggedIn={isLoggedIn} type="nav" />
        </div>
      </nav>

      {/* Hero Section with Mesh Gradient */}
      <section className="relative overflow-hidden border-b border-hairline bg-canvas">
        {/* Mesh Gradient Background */}
        <div className="absolute inset-0 mesh-gradient-bg opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-canvas-soft/70 to-canvas-soft" />

        <div className="relative max-w-[1200px] mx-auto px-xl py-[128px] text-center z-10">
          <div className="inline-flex items-center gap-xs font-mono text-[10px] text-body-text uppercase tracking-widest bg-canvas border border-hairline pl-xs pr-sm py-xxs rounded-full mb-lg shadow-sm hover:border-hairline-strong transition-all cursor-pointer select-none">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <span>V2.0 LIVE EXECUTION ACTIVE</span>
          </div>

          <h1 className="font-sans text-[56px] md:text-[64px] font-semibold leading-[1.05] tracking-[-2.4px] text-ink max-w-[850px] mx-auto select-none">
            Build and deploy on the{' '}
            <span className="mesh-gradient-text animate-pulse">AI Trading Cloud.</span>
          </h1>

          <p className="font-sans text-body-lg text-body-text max-w-[560px] mx-auto mt-lg leading-relaxed select-none">
            AURIC PRO connects MetaTrader 5 to machine learning signals, real-time risk controls, and a full analytics cockpit. Trade gold with institutional-grade infrastructure.
          </p>

          <div className="flex items-center justify-center gap-md mt-xl">
            <LandingAuth initialLoggedIn={isLoggedIn} type="hero" />
          </div>
        </div>
      </section>

      {/* Logo Strip */}
      <section className="border-b border-hairline bg-canvas">
        <div className="max-w-[1200px] mx-auto px-xl py-lg flex items-center justify-center gap-xl">
          {['MetaTrader 5', 'Supabase', 'Redis', 'Razorpay', 'Vercel'].map((name) => (
            <span key={name} className="font-mono text-[11px] text-mute uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity cursor-default">
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="max-w-[1200px] mx-auto px-xl py-[96px] select-none">
        <div className="text-center mb-xl">
          <span className="font-mono text-[10px] text-body-text uppercase tracking-widest block mb-xs">
            Platform Capabilities
          </span>
          <h2 className="font-sans text-[32px] font-semibold text-ink tracking-tight leading-[40px] tracking-[-1.28px]">
            Your execution cockpit, delivered.
          </h2>
          <p className="font-sans text-[16px] text-body-text max-w-[480px] mx-auto mt-xs">
            Everything you need to run algorithmic gold trading from a single dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 hover:shadow-level-3 hover:border-hairline-strong/50 hover:-translate-y-1 transition-all duration-300 group cursor-pointer"
            >
              <div className="w-[36px] h-[36px] rounded-md bg-canvas-soft-2 border border-hairline flex items-center justify-center mb-sm text-mute group-hover:bg-canvas transition-colors">
                {feature.icon}
              </div>
              <h3 className="font-sans text-[16px] font-semibold text-ink mb-xxs group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="font-sans text-[14px] text-body-text leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Strategy Showcase */}
      <section id="strategies" className="bg-primary text-on-primary relative overflow-hidden select-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-[1200px] mx-auto px-xl py-[96px] relative z-10">
          <div className="text-center mb-xl">
            <span className="font-mono text-[10px] text-on-primary/60 uppercase tracking-widest block mb-xs">
              Pre-Built Strategies
            </span>
            <h2 className="font-sans text-[32px] font-semibold tracking-tight leading-[40px] tracking-[-1.28px]">
              A compute model for all workloads.
            </h2>
            <p className="font-sans text-[16px] text-on-primary/70 max-w-[480px] mx-auto mt-xs">
              Deploy proven algorithmic strategies or build your own with natural language.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
            {STRATEGIES.map((strat) => (
              <div
                key={strat.name}
                className="bg-black/40 backdrop-blur-md border border-white/10 rounded-md p-lg hover:border-cyan/30 hover:shadow-[0_0_20px_rgba(80,227,194,0.08)] hover:-translate-y-1 transition-all duration-300 group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-sm">
                    <span className="font-mono text-[9px] text-on-primary/50 uppercase tracking-wider border border-white/10 px-xxs py-[2px] rounded-xs group-hover:border-cyan/20 transition-colors">
                      {strat.type}
                    </span>
                    <span className="font-mono text-[11px] text-cyan font-semibold">
                      {strat.winRate} Win
                    </span>
                  </div>
                  
                  <h4 className="font-sans text-[16px] font-semibold text-on-primary group-hover:text-cyan transition-colors mb-sm">
                    {strat.name}
                  </h4>

                  <div className="grid grid-cols-2 gap-xs font-mono text-[10px] text-on-primary/60 border-t border-white/5 pt-xs mt-xs">
                    <div>
                      <span className="block text-on-primary/40">SHARPE</span>
                      <span className="font-bold text-on-primary">{strat.sharpe}</span>
                    </div>
                    <div>
                      <span className="block text-on-primary/40">PROF. FACTOR</span>
                      <span className="font-bold text-on-primary">{strat.pf}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-lg w-full bg-white/10 rounded-full h-[4px]">
                  <div
                    className="h-full bg-cyan rounded-full transition-all duration-500"
                    style={{ width: strat.winRate }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Editor Mockup */}
      <section id="developer" className="max-w-[1200px] mx-auto px-xl py-[96px] select-none">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl items-center">
          <div>
            <span className="font-mono text-[10px] text-body-text uppercase tracking-widest block mb-xs">
              Developer Experience
            </span>
            <h2 className="font-sans text-[32px] font-semibold text-ink tracking-tight leading-[40px] tracking-[-1.28px]">
              Ship with confidence.
            </h2>
            <p className="font-sans text-[16px] text-body-text mt-sm leading-relaxed">
              Full TypeScript stack from frontend to API routes. Zustand for state, React Query for data fetching, Socket.io for real-time streaming. Every component follows the Vercel design system.
            </p>
            <div className="flex gap-sm mt-lg">
              <LandingAuth initialLoggedIn={isLoggedIn} type="dev" />
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-md py-xs font-sans text-button-md bg-canvas text-ink border border-hairline rounded-pill hover:bg-canvas-soft hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                View Source
              </a>
            </div>
          </div>

          <InteractiveCodeMockup />
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection isLoggedIn={isLoggedIn} />

      {/* CTA Band */}
      <section className="bg-canvas-soft-2 border-y border-hairline select-none">
        <div className="max-w-[1200px] mx-auto px-xl py-[96px] text-center">
          <h2 className="font-sans text-[32px] font-semibold text-ink tracking-tight leading-[40px] tracking-[-1.28px]">
            Ready to deploy?
          </h2>
          <p className="font-sans text-[16px] text-body-text max-w-[400px] mx-auto mt-xs">
            Start trading gold with AI-powered signals and institutional risk controls.
          </p>
          <div className="flex items-center justify-center gap-md mt-lg">
            <LandingAuth initialLoggedIn={isLoggedIn} type="cta" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-canvas border-t border-hairline select-none">
        <div className="max-w-[1200px] mx-auto px-xl py-[64px]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-xl">
            <div>
              <span className="font-sans text-[14px] font-semibold text-ink block mb-sm">Product</span>
              {[
                { name: 'Dashboard', href: '/app/dashboard' },
                { name: 'Signals', href: '/app/signals' },
                { name: 'Backtester', href: '/app/backtester' },
                { name: 'Strategies', href: '/app/strategies' },
                { name: 'Scalper Mode', href: '/app/scalper' }
              ].map((item) => (
                <Link key={item.name} href={item.href} className="block font-sans text-[14px] text-body-text hover:text-ink transition-colors mb-xxs">
                  {item.name}
                </Link>
              ))}
            </div>
            <div>
              <span className="font-sans text-[14px] font-semibold text-ink block mb-sm">Configuration</span>
              {[
                { name: 'Risk Controls', href: '/app/risk' },
                { name: 'Settings & Broker', href: '/app/settings' },
                { name: 'AI Advisor', href: '/app/ai-advisor' },
                { name: 'Portfolio Overview', href: '/app/portfolio' }
              ].map((item) => (
                <Link key={item.name} href={item.href} className="block font-sans text-[14px] text-body-text hover:text-ink transition-colors mb-xxs">
                  {item.name}
                </Link>
              ))}
            </div>
            <div>
              <span className="font-sans text-[14px] font-semibold text-ink block mb-sm">Connect</span>
              {[
                { name: 'GitHub Source', href: 'https://github.com' },
                { name: 'Twitter / X', href: 'https://x.com' },
                { name: 'Telegram Channel', href: 'https://t.me' }
              ].map((item) => (
                <a key={item.name} href={item.href} target="_blank" rel="noopener noreferrer" className="block font-sans text-[14px] text-body-text hover:text-ink transition-colors mb-xxs">
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          <div className="border-t border-hairline mt-xl pt-lg flex flex-col md:flex-row justify-between items-center gap-sm">
            <div className="flex items-center gap-xs">
              <span className="font-sans text-[14px] font-semibold text-ink">AURIC PRO</span>
              <span className="font-mono text-[9px] text-mute">V2.0</span>
            </div>
            <span className="font-sans text-[12px] text-mute">
              &copy; {new Date().getFullYear()} AURIC PRO. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
