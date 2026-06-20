'use client'

import { LandingAuth } from './LandingAuth'

interface PricingTier {
  id: string
  name: string
  price: string
  period: string
  description: string
  features: string[]
  type: 'pricing-free' | 'pricing-pro' | 'pricing-elite'
  featured: boolean
}

const TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Basic access to AURIC market analysis and backtester.',
    features: [
      'Basic AI signals feed',
      'MT5 Demo Bridge connection',
      '1 active running strategy',
      'Standard backtester (1-year depth)',
      'Community support channels'
    ],
    type: 'pricing-free',
    featured: false
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: 'monthly',
    description: 'The complete cockpit for active algorithmic gold traders.',
    features: [
      'Real-time neural network signals',
      'MT5 Live Bridge connection (1 account)',
      'Unlimited running strategies',
      'Advanced backtester (5-year tick depth)',
      'Emergency halt & drawdown guards',
      'Priority email & Discord support'
    ],
    type: 'pricing-pro',
    featured: true
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$99',
    period: 'monthly',
    description: 'Dedicated resources and custom integrations for institutions.',
    features: [
      'Dedicated low-latency VPS execution node',
      'Multi-account MT5 bridge support',
      'Custom strategy deployment API',
      'Custom AI Advisor model integrations',
      '1-on-1 setup with dev engineer',
      'Direct WhatsApp / Telegram support'
    ],
    type: 'pricing-elite',
    featured: false
  }
]

interface PricingSectionProps {
  isLoggedIn: boolean
}

export function PricingSection({ isLoggedIn }: PricingSectionProps) {
  return (
    <section id="pricing" className="border-t border-hairline bg-canvas-soft py-[96px] select-none relative overflow-hidden">
      
      {/* Background spotlights */}
      <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-gradient-to-r from-cyan/10 to-transparent blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-gradient-to-r from-violet/10 to-transparent blur-[80px] rounded-full pointer-events-none" />

      <div className="max-w-[1200px] mx-auto px-xl">
        
        {/* Section Header */}
        <div className="text-center mb-[64px]">
          <span className="font-mono text-[10px] text-body-text uppercase tracking-widest block mb-xs">
            PRICING TIERS
          </span>
          <h2 className="font-sans text-[32px] font-semibold text-ink tracking-tight leading-[40px] tracking-[-1.28px]">
            Transparent pricing for any size.
          </h2>
          <p className="font-sans text-[16px] text-body-text max-w-[480px] mx-auto mt-xs">
            Start free and upgrade as your trading volume and strategy execution needs scale.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-lg items-stretch">
          {TIERS.map((tier) => {
            return (
              <div
                key={tier.id}
                className={`relative flex flex-col justify-between rounded-lg p-xl transition-all duration-300 ${
                  tier.featured
                    ? 'bg-primary text-on-primary shadow-level-4 border border-primary z-10 hover:scale-[1.01]'
                    : 'bg-canvas text-ink border border-hairline shadow-level-2 hover:border-hairline-strong/40 hover:scale-[1.01]'
                }`}
              >
                {/* Featured Badge */}
                {tier.featured && (
                  <span className="absolute -top-[12px] left-1/2 -translate-x-1/2 font-mono text-[9px] bg-cyan text-primary px-sm py-[4px] rounded-full font-bold uppercase tracking-wider shadow-sm">
                    MOST POPULAR
                  </span>
                )}

                <div>
                  {/* Tier Title */}
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${tier.featured ? 'text-on-primary/60' : 'text-body-text/80'}`}>
                    {tier.name}
                  </span>

                  {/* Pricing Details */}
                  <div className="flex items-baseline gap-xxs mt-sm mb-md">
                    <span className="font-sans text-[48px] font-semibold leading-[48px] tracking-[-2.4px]">
                      {tier.price}
                    </span>
                    <span className={`font-sans text-[14px] ${tier.featured ? 'text-on-primary/60' : 'text-mute'}`}>
                      / {tier.period}
                    </span>
                  </div>

                  {/* Tier Description */}
                  <p className={`font-sans text-[14px] leading-relaxed mb-lg ${tier.featured ? 'text-on-primary/80' : 'text-body-text'}`}>
                    {tier.description}
                  </p>

                  <div className={`border-t mb-lg ${tier.featured ? 'border-white/10' : 'border-hairline'}`} />

                  {/* Feature Checklist */}
                  <ul className="space-y-sm">
                    {tier.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-xs text-[13px] font-sans">
                        <svg
                          className={`w-sm h-sm mt-[2px] shrink-0 ${tier.featured ? 'text-cyan' : 'text-link'}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span className={tier.featured ? 'text-on-primary/90' : 'text-body-text'}>
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Dynamically Hydrated Action Button */}
                <LandingAuth initialLoggedIn={isLoggedIn} type={tier.type} />
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}
