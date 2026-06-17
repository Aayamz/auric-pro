'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'

export default function SignupPage() {
  const router = useRouter()
  const { setUser } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) throw error

      if (data?.user) {
        setUser({ id: data.user.id, email: data.user.email })
        router.push('/auth/onboarding')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed. Please try again.'
      setErrorMsg(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center bg-canvas-soft px-lg py-3xl mesh-gradient-bg">
      <div className="w-full max-w-[400px] bg-canvas border border-hairline p-xl rounded-lg shadow-level-4">
        
        {/* Logo / Header */}
        <div className="text-center mb-lg">
          <h2 className="font-sans text-display-md font-semibold text-ink tracking-tight">
            AURIC PRO
          </h2>
          <p className="font-sans text-body-sm text-body-text mt-xxs">
            Create your algorithmic account
          </p>
        </div>

        {/* Windows Requirement Notice */}
        <div className="mb-md p-sm bg-warning-soft border border-warning/20 rounded-sm text-[11px] text-warning-deep flex items-start gap-xs">
          <span className="w-xs h-xs shrink-0 mt-[2px] rounded-full bg-warning-deep flex items-center justify-center text-white text-[9px] font-bold">!</span>
          <p className="font-sans leading-normal">
            <strong>Windows PC required:</strong> The local MetaTrader 5 (MT5) bridge client currently runs natively on **Windows OS** only.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-md p-sm bg-error-soft text-error text-caption border border-error/20 rounded-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-md">
          <div>
            <label className="block font-mono text-caption-mono text-body-text mb-xxs" htmlFor="email">
              EMAIL ADDRESS
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full form-input focus:outline-none focus:border-hairline-strong transition-colors"
              placeholder="name@company.com"
              required
            />
          </div>

          <div>
            <label className="block font-mono text-caption-mono text-body-text mb-xxs" htmlFor="password">
              PASSWORD (MIN 6 CHARS)
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full form-input focus:outline-none focus:border-hairline-strong transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block font-mono text-caption-mono text-body-text mb-xxs" htmlFor="confirm-password">
              CONFIRM PASSWORD
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full form-input focus:outline-none focus:border-hairline-strong transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm shadow-level-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Registering...' : 'Get Started'}
          </button>
        </form>

        <p className="text-center font-sans text-caption text-body-text mt-lg">
          Already have an account?{' '}
          <a href="/auth/login" className="text-link font-medium hover:underline">
            Sign in
          </a>
        </p>

      </div>
    </div>
  )
}
