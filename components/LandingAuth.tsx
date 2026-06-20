'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface LandingAuthProps {
  initialLoggedIn: boolean
  type: 'nav' | 'hero' | 'dev' | 'cta' | 'pricing-free' | 'pricing-pro' | 'pricing-elite'
}

export function LandingAuth({ initialLoggedIn, type }: LandingAuthProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(initialLoggedIn)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setIsLoggedIn(!!session?.user)
        setLoading(false)
      }
    }).catch(() => {
      if (mounted) setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setIsLoggedIn(!!session?.user)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const activeLoggedIn = loading ? initialLoggedIn : isLoggedIn

  if (type === 'nav') {
    if (activeLoggedIn) {
      return (
        <Link
          href="/app/dashboard"
          className="px-md py-xs font-sans text-body-sm-strong bg-primary text-on-primary rounded-sm hover:opacity-90 transition-opacity flex items-center gap-xxs"
        >
          Go to Dashboard →
        </Link>
      )
    }
    return (
      <>
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
      </>
    )
  }

  if (type === 'hero') {
    if (activeLoggedIn) {
      return (
        <Link
          href="/app/dashboard"
          className="px-lg py-xs font-sans text-button-lg bg-primary text-on-primary rounded-pill hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-level-3"
        >
          Open Trading Cockpit
        </Link>
      )
    }
    return (
      <>
        <Link
          href="/auth/signup"
          className="px-lg py-xs font-sans text-button-lg bg-primary text-on-primary rounded-pill hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-level-3"
        >
          Start Deploying
        </Link>
        <Link
          href="/auth/login"
          className="px-lg py-xs font-sans text-button-lg bg-canvas text-ink border border-hairline rounded-pill hover:bg-canvas-soft hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Live Demo
        </Link>
      </>
    )
  }

  if (type === 'dev') {
    if (activeLoggedIn) {
      return (
        <Link
          href="/app/dashboard"
          className="px-md py-xs font-sans text-button-md bg-primary text-on-primary rounded-pill hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Enter Cockpit
        </Link>
      )
    }
    return (
      <Link
        href="/auth/signup"
        className="px-md py-xs font-sans text-button-md bg-primary text-on-primary rounded-pill hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all"
      >
        Get Started
      </Link>
    )
  }

  if (type === 'cta') {
    if (activeLoggedIn) {
      return (
        <Link
          href="/app/dashboard"
          className="px-lg py-xs font-sans text-button-lg bg-primary text-on-primary rounded-pill hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Go to Dashboard
        </Link>
      )
    }
    return (
      <Link
        href="/auth/signup"
        className="px-lg py-xs font-sans text-button-lg bg-primary text-on-primary rounded-pill hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all"
      >
        Create Free Account
      </Link>
    )
  }

  // Pricing cards action triggers
  if (type === 'pricing-free') {
    return (
      <Link
        href={activeLoggedIn ? '/app/dashboard' : '/auth/signup'}
        className="block w-full text-center px-lg py-xs font-sans text-button-md bg-canvas text-ink border border-hairline rounded-pill hover:bg-canvas-soft hover:scale-[1.02] active:scale-[0.98] transition-all font-medium mt-lg"
      >
        {activeLoggedIn ? 'Go to Dashboard' : 'Sign Up Free'}
      </Link>
    )
  }

  if (type === 'pricing-pro') {
    return (
      <Link
        href={activeLoggedIn ? '/app/settings' : '/auth/signup'}
        className="block w-full text-center px-lg py-xs font-sans text-button-md bg-canvas text-ink border border-hairline rounded-pill hover:bg-canvas-soft hover:scale-[1.02] active:scale-[0.98] transition-all font-medium mt-lg"
        style={{ backgroundColor: '#ffffff', color: '#171717' }}
      >
        {activeLoggedIn ? 'Upgrade to Pro' : 'Get Started with Pro'}
      </Link>
    )
  }

  if (type === 'pricing-elite') {
    return (
      <Link
        href={activeLoggedIn ? '/app/settings' : '/auth/signup'}
        className="block w-full text-center px-lg py-xs font-sans text-button-md bg-primary text-on-primary border border-hairline rounded-pill hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all font-medium mt-lg"
      >
        {activeLoggedIn ? 'Go Elite' : 'Get Started with Elite'}
      </Link>
    )
  }

  return null
}
