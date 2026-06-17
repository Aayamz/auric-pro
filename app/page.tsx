import Link from 'next/link'

const FEATURES = [
  {
    title: 'AI-Powered Signals',
    description: 'Machine learning models analyse market structure, order blocks, and liquidity zones to generate high-confidence trade setups in real time.',
    icon: (
      <svg className="w-sm h-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
      </svg>
    )
  },
  {
    title: 'Live MT5 Execution',
    description: 'Connect your MetaTrader 5 terminal via an encrypted local bridge. Execute trades directly from the dashboard with sub-second latency.',
    icon: (
      <svg className="w-sm h-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    )
  },
  {
    title: 'Strategy Backtester',
    description: 'Run Monte Carlo simulations on historical tick data. Analyse equity curves, drawdown, and profit factor before deploying capital.',
    icon: (
      <svg className="w-sm h-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    )
  },
  {
    title: 'Risk Control Centre',
    description: 'Configurable stop-loss limits, daily drawdown guards, and an emergency halt switch that closes all positions instantly.',
    icon: (
      <svg className="w-sm h-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  },
  {
    title: 'Portfolio Analytics',
    description: 'Track every trade with detailed P&L, R-multiple breakdowns, calendar heatmaps, and exportable PDF reports.',
    icon: (
      <svg className="w-sm h-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    )
  },
  {
    title: 'AI Advisor',
    description: 'Chat with Claude-powered intelligence that understands your portfolio, risk profile, and current market regime.',
    icon: (
      <svg className="w-sm h-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  }
]

const STRATEGIES = [
  { name: 'Order Block Reversal', winRate: '68.4%', type: 'SWING' },
  { name: 'Liquidity Sweep', winRate: '71.0%', type: 'SCALP' },
  { name: 'EMA Crossover', winRate: '62.5%', type: 'SCALP' },
  { name: 'FVG Scalper', winRate: '64.0%', type: 'SCALP' },
]

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-canvas-soft font-sans">

      {/* Navigation */}
      <nav className="h-[64px] bg-canvas border-b border-hairline flex items-center justify-between px-xl sticky top-0 z-50">
        <div className="flex items-center gap-xs">
          <span className="font-sans text-display-sm font-semibold tracking-tight text-ink">
            AURIC PRO
          </span>
          <span className="font-mono text-[9px] text-mute border border-hairline px-xxs py-[2px] rounded-md">
            V2.0
          </span>
        </div>
        <div className="flex items-center gap-sm">
          <Link
            href="/auth/login"
            className="px-sm py-xs font-sans text-body-sm-strong text-body-text hover:text-ink rounded-sm transition-colors"
          >
            Log In
          </Link>
          <Link
            href="/auth/signup"
            className="px-sm py-xs font-sans text-body-sm-strong bg-primary text-on-primary rounded-sm hover:opacity-90 transition-opacity"
          >
            Sign Up
          </Link>
        </div>
      </nav>

      {/* Hero Section with Mesh Gradient */}
      <section className="relative overflow-hidden">
        {/* Mesh Gradient Background */}
        <div className="absolute inset-0 mesh-gradient-bg opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-canvas-soft/80 to-canvas-soft" />

        <div className="relative max-w-[1200px] mx-auto px-xl py-[128px] text-center">
          <div className="inline-block font-mono text-[10px] text-body-text uppercase tracking-widest bg-canvas border border-hairline px-sm py-xxs rounded-full mb-lg">
            Algorithmic Trading Platform
          </div>

          <h1 className="font-sans text-[48px] font-semibold leading-[48px] tracking-[-2.4px] text-ink max-w-[800px] mx-auto">
            Build and deploy on the{' '}
            <span className="mesh-gradient-text">AI Cloud.</span>
          </h1>

          <p className="font-sans text-body-lg text-body-text max-w-[560px] mx-auto mt-lg leading-relaxed">
            AURIC PRO connects MetaTrader 5 to machine learning signals, real-time risk controls, and a full analytics cockpit. Trade gold with institutional-grade infrastructure.
          </p>

          <div className="flex items-center justify-center gap-md mt-xl">
            <Link
              href="/auth/signup"
              className="px-lg py-xs font-sans text-button-lg bg-primary text-on-primary rounded-pill hover:opacity-90 transition-opacity"
            >
              Start Deploying
            </Link>
            <Link
              href="/auth/login"
              className="px-lg py-xs font-sans text-button-lg bg-canvas text-ink border border-hairline rounded-pill hover:bg-canvas-soft transition-colors"
            >
              Live Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Logo Strip */}
      <section className="border-y border-hairline bg-canvas">
        <div className="max-w-[1200px] mx-auto px-xl py-lg flex items-center justify-center gap-xl">
          {['MetaTrader 5', 'Supabase', 'Redis', 'Stripe', 'Vercel'].map((name) => (
            <span key={name} className="font-mono text-[11px] text-mute uppercase tracking-wider">
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-[1200px] mx-auto px-xl py-[96px]">
        <div className="text-center mb-xl">
          <span className="font-mono text-[10px] text-body-text uppercase tracking-widest block mb-xs">
            Platform Capabilities
          </span>
          <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">
            Your frontend, delivered.
          </h2>
          <p className="font-sans text-body-md text-body-text max-w-[480px] mx-auto mt-xs">
            Everything you need to run algorithmic gold trading from a single dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 hover:shadow-level-3 transition-shadow"
            >
              <div className="w-[36px] h-[36px] rounded-md bg-canvas-soft-2 border border-hairline flex items-center justify-center mb-sm text-ink">
                {feature.icon}
              </div>
              <h3 className="font-sans text-body-md font-semibold text-ink mb-xxs">
                {feature.title}
              </h3>
              <p className="font-sans text-body-sm text-body-text leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Strategy Showcase */}
      <section className="bg-primary text-on-primary">
        <div className="max-w-[1200px] mx-auto px-xl py-[96px]">
          <div className="text-center mb-xl">
            <span className="font-mono text-[10px] text-on-primary/60 uppercase tracking-widest block mb-xs">
              Pre-Built Strategies
            </span>
            <h2 className="font-sans text-display-lg font-semibold tracking-tight">
              A compute model for all workloads.
            </h2>
            <p className="font-sans text-body-md text-on-primary/70 max-w-[480px] mx-auto mt-xs">
              Deploy proven algorithmic strategies or build your own with natural language.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
            {STRATEGIES.map((strat) => (
              <div
                key={strat.name}
                className="bg-black/30 border border-white/10 rounded-md p-md"
              >
                <div className="flex justify-between items-start mb-sm">
                  <span className="font-mono text-[9px] text-on-primary/50 uppercase tracking-wider border border-white/10 px-xxs py-[2px] rounded-xs">
                    {strat.type}
                  </span>
                  <span className="font-mono text-caption-mono text-cyan font-semibold">
                    {strat.winRate}
                  </span>
                </div>
                <h4 className="font-sans text-body-md font-semibold text-on-primary">
                  {strat.name}
                </h4>
                <div className="mt-sm w-full bg-white/10 rounded-full h-[4px]">
                  <div
                    className="h-full bg-cyan rounded-full"
                    style={{ width: strat.winRate }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Editor Mockup */}
      <section className="max-w-[1200px] mx-auto px-xl py-[96px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl items-center">
          <div>
            <span className="font-mono text-[10px] text-body-text uppercase tracking-widest block mb-xs">
              Developer Experience
            </span>
            <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">
              Ship with confidence.
            </h2>
            <p className="font-sans text-body-md text-body-text mt-sm leading-relaxed">
              Full TypeScript stack from frontend to API routes. Zustand for state, React Query for data fetching, Socket.io for real-time streaming. Every component follows the Vercel design system.
            </p>
            <div className="flex gap-sm mt-lg">
              <Link
                href="/auth/signup"
                className="px-md py-xs font-sans text-button-md bg-primary text-on-primary rounded-pill hover:opacity-90 transition-opacity"
              >
                Get Started
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-md py-xs font-sans text-button-md bg-canvas text-ink border border-hairline rounded-pill hover:bg-canvas-soft transition-colors"
              >
                View Source
              </a>
            </div>
          </div>

          <div className="bg-primary rounded-md p-lg shadow-level-4 overflow-hidden">
            <div className="flex items-center gap-xs mb-sm">
              <div className="w-[10px] h-[10px] rounded-full bg-error" />
              <div className="w-[10px] h-[10px] rounded-full bg-warning" />
              <div className="w-[10px] h-[10px] rounded-full bg-success" />
              <span className="font-mono text-[9px] text-on-primary/40 ml-xs">bridge.py</span>
            </div>
            <pre className="font-mono text-code text-on-primary/80 overflow-x-auto">
              <code>{`# Connect to AURIC Cloud
python bridge.py --token <JWT>

# Stream live prices from MT5
> XAUUSD BID: 1955.20 ASK: 1955.70
> Signal: BUY 88.5% confidence
> Order Block: H4 Demand Zone

# Execute trade automatically
> Ticket #48291034 opened
  SL: 1949.20 | TP: 1968.00
  Risk: 1.0% | R:R 2.0`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* CTA Band */}
      <section className="bg-canvas-soft-2 border-y border-hairline">
        <div className="max-w-[1200px] mx-auto px-xl py-[96px] text-center">
          <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">
            Ready to deploy?
          </h2>
          <p className="font-sans text-body-md text-body-text max-w-[400px] mx-auto mt-xs">
            Start trading gold with AI-powered signals and institutional risk controls.
          </p>
          <div className="flex items-center justify-center gap-md mt-lg">
            <Link
              href="/auth/signup"
              className="px-lg py-xs font-sans text-button-lg bg-primary text-on-primary rounded-pill hover:opacity-90 transition-opacity"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-canvas border-t border-hairline">
        <div className="max-w-[1200px] mx-auto px-xl py-[64px]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-xl">
            <div>
              <span className="font-sans text-body-sm-strong text-ink block mb-sm">Product</span>
              {[
                { name: 'Dashboard', href: '/app/dashboard' },
                { name: 'Signals', href: '/app/signals' },
                { name: 'Backtester', href: '/app/backtester' },
                { name: 'Strategies', href: '/app/strategies' },
                { name: 'Scalper Mode', href: '/app/scalper' }
              ].map((item) => (
                <Link key={item.name} href={item.href} className="block font-sans text-body-sm text-body-text hover:text-ink transition-colors mb-xxs">
                  {item.name}
                </Link>
              ))}
            </div>
            <div>
              <span className="font-sans text-body-sm-strong text-ink block mb-sm">Configuration</span>
              {[
                { name: 'Risk Controls', href: '/app/risk' },
                { name: 'Settings & Broker', href: '/app/settings' },
                { name: 'AI Advisor', href: '/app/ai-advisor' },
                { name: 'Portfolio Overview', href: '/app/portfolio' }
              ].map((item) => (
                <Link key={item.name} href={item.href} className="block font-sans text-body-sm text-body-text hover:text-ink transition-colors mb-xxs">
                  {item.name}
                </Link>
              ))}
            </div>
            <div>
              <span className="font-sans text-body-sm-strong text-ink block mb-sm">Connect</span>
              {[
                { name: 'GitHub Source', href: 'https://github.com' },
                { name: 'Twitter / X', href: 'https://x.com' },
                { name: 'Telegram Channel', href: 'https://t.me' }
              ].map((item) => (
                <a key={item.name} href={item.href} target="_blank" rel="noopener noreferrer" className="block font-sans text-body-sm text-body-text hover:text-ink transition-colors mb-xxs">
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          <div className="border-t border-hairline mt-xl pt-lg flex flex-col md:flex-row justify-between items-center gap-sm">
            <div className="flex items-center gap-xs">
              <span className="font-sans text-body-sm font-semibold text-ink">AURIC PRO</span>
              <span className="font-mono text-[9px] text-mute">V2.0</span>
            </div>
            <span className="font-sans text-caption text-mute">
              &copy; {new Date().getFullYear()} AURIC PRO. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
