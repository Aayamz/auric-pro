'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data?.user) {
        setUser({ id: data.user.id, email: data.user.email })
        router.push('/app/dashboard')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please check your credentials.'
      setErrorMsg(message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/onboarding` }
    })
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
            Enter your credentials to access the cockpit
          </p>
        </div>

        {errorMsg && (
          <div className="mb-md p-sm bg-error-soft text-error text-caption border border-error/20 rounded-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-md">
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
            <div className="flex justify-between items-center mb-xxs">
              <label className="font-mono text-caption-mono text-body-text" htmlFor="password">
                PASSWORD
              </label>
              <a href="#" className="font-sans text-caption text-link hover:underline">
                Forgot?
              </a>
            </div>
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

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-sans text-button-md font-medium h-[40px] rounded-sm shadow-level-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="relative flex py-md items-center">
          <div className="flex-grow border-t border-hairline"></div>
          <span className="flex-shrink mx-xs font-mono text-caption-mono text-mute">OR CONTINUE WITH</span>
          <div className="flex-grow border-t border-hairline"></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full border border-hairline bg-canvas hover:bg-canvas-soft text-ink font-sans text-button-md font-medium h-[40px] rounded-sm flex items-center justify-center gap-xs transition-colors"
        >
          <svg className="w-xs h-xs" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Google OAuth
        </button>

        <p className="text-center font-sans text-caption text-body-text mt-lg">
          Don&apos;t have an account?{' '}
          <a href="/auth/signup" className="text-link font-medium hover:underline">
            Sign up
          </a>
        </p>

      </div>
    </div>
  )
}
