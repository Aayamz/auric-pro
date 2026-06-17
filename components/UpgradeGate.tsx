'use client'

import React from 'react'
import { useStore } from '@/store'
import { PLAN_LIMITS } from '@/lib/plan-limits'

interface UpgradeGateProps {
  feature: keyof typeof PLAN_LIMITS['free']
  children: React.ReactNode
}

export default function UpgradeGate({ feature, children }: UpgradeGateProps) {
  const { subscription } = useStore()
  const plan = subscription?.plan || 'free'
  
  // Resolve if feature is enabled on current plan
  const limits = PLAN_LIMITS[plan]
  const isAllowed = limits[feature] as boolean | string[] | number

  // If allowed, render children directly
  if (isAllowed) {
    return <>{children}</>
  }

  // Otherwise, render children with a blur overlay and upgrade card
  return (
    <div className="relative group overflow-hidden rounded-md border border-hairline">
      {/* Blurred Feature Content */}
      <div className="blur-[5px] select-none pointer-events-none opacity-40">
        {children}
      </div>

      {/* Upgrade Gate Overlay Card */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-canvas/80 p-lg text-center transition-all duration-300">
        <div className="max-w-[280px] bg-canvas border border-hairline p-md rounded-md shadow-level-4">
          <span className="font-mono text-xxs uppercase tracking-wider text-mute bg-canvas-soft border border-hairline px-xxs py-[2px] rounded-full">
            PRO / ELITE FEATURE
          </span>
          <h4 className="font-sans text-md font-semibold text-ink mt-xs leading-tight">
            Unlock {feature.replace('_', ' ')}
          </h4>
          <p className="font-sans text-xxs text-body-text mt-xxs">
            This module is restricted on the Free plan. Upgrade to launch auto-execution and unlimited backtesting.
          </p>
          <button
            onClick={() => window.location.href = '/app/settings'}
            className="w-full mt-sm bg-primary text-on-primary font-sans text-xxs font-medium py-xs rounded-pill shadow-level-2 hover:opacity-90 transition-opacity"
          >
            Upgrade Account
          </button>
        </div>
      </div>
    </div>
  )
}
