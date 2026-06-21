'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'
import { useStore } from '@/store'
import { useToast, ToastProvider } from '@/components/Toast'
import { Settings, Bell, Key, CreditCard, Trash2, Save, Eye, EyeOff, Loader2, CheckCircle2, X } from 'lucide-react'

type TabId = 'account' | 'broker' | 'notifications' | 'billing' | 'danger'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'account', label: 'Account', icon: Settings },
  { id: 'broker', label: 'Broker / MT5', icon: Key },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'danger', label: 'Danger Zone', icon: Trash2 }
]

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-canvas border border-hairline rounded-md p-lg shadow-level-2 space-y-md">
      <div className="flex justify-between items-center border-b border-hairline pb-xs">
        <h4 className="font-sans text-body-md font-semibold text-ink">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  )
}

function FieldRow({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div>
      <label className="block font-mono text-caption-mono text-mute mb-xxs">{label}</label>
      {children}
      {sub && <p className="font-sans text-[10px] text-mute mt-xxs">{sub}</p>}
    </div>
  )
}

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="flex items-center gap-xxs bg-primary text-on-primary font-sans text-button-md font-medium px-md h-[36px] rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
      {saving ? <Loader2 className="w-xxs h-xxs animate-spin" /> : <Save className="w-xxs h-xxs" />}
      {saving ? 'Saving…' : 'Save'}
    </button>
  )
}

export default function SettingsPage() {
  return (
    <ToastProvider>
      <SettingsContent />
    </ToastProvider>
  )
}

function SettingsContent() {
  const router = useRouter()
  const { user: storeUser, subscription, setSubscription, bridgeStatus } = useStore()
  const { addToast } = useToast()
  const [tab, setTab] = useState<TabId>('account')
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<{ email?: string; user_metadata?: Record<string, unknown> } | null>(null)

  // Account fields
  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  // Broker fields
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServer] = useState('')
  const [cloudMode, setCloudMode] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [brokerSaved, setBrokerSaved] = useState(false)
  const [activeAccount, setActiveAccount] = useState<{ connected: boolean; login: string | number | null; server: string | null; mock: boolean; balance: number; equity: number } | null>(null)

  // Broker connection confirmation dialog
  const [brokerDialogOpen, setBrokerDialogOpen] = useState(false)
  const [confirmedAccount, setConfirmedAccount] = useState<{ login: string | number | null; server: string | null; balance: number; equity: number; mock: boolean } | null>(null)

  // Notifications
  const [notifSettings, setNotifSettings] = useState({
    signal_generated: true, trade_executed: true, daily_pnl: true, halt_triggered: true, ai_insights: false
  })

  // Billing
  const [plan, setPlan] = useState<'free' | 'pro' | 'elite'>('pro')

  const isAdmin = user?.email === 'demo@auricpro.com' || 
                  user?.email === 'admin@auricpro.com' || 
                  user?.email === 'admin@auric.pro' || 
                  user?.email === 'aayamsoni@gmail.com' || 
                  user?.email === 'aayamsss@gmail.com' ||
                  !!(process.env.NEXT_PUBLIC_ADMIN_EMAIL && user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL)

  useEffect(() => {
    if (subscription?.plan) {
      setPlan(subscription.plan)
    }
  }, [subscription])

  useEffect(() => {
    const supabase = createSupabaseClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          setUser(data.user)
          setDisplayName(data.user.user_metadata?.display_name ?? '')
        } else if (storeUser) {
          setUser({ email: storeUser.email, user_metadata: { display_name: 'Demo User' } })
          setDisplayName('Demo User')
        } else {
          router.replace('/auth/login')
          return
        }
      })
      .catch(() => {
        if (storeUser) {
          setUser({ email: storeUser.email, user_metadata: { display_name: 'Demo User' } })
          setDisplayName('Demo User')
        } else {
          router.replace('/auth/login')
        }
      })

    fetch('/api/settings/profile').then(r => r.json()).then(d => {
      setDisplayName(d.display_name ?? '')
      setTimezone(d.timezone ?? 'UTC')
    }).catch(() => {})

    fetch('/api/settings/broker').then(r => r.json()).then(d => {
      setLogin(d.login ?? '')
      setServer(d.server ?? '')
      setCloudMode(d.cloud_mode ?? true)
    }).catch(() => {})
  }, [router, storeUser])

  useEffect(() => {
    if (tab === 'broker') {
      const checkStatus = () => {
        fetch('/api/bridge/status')
          .then(r => r.json())
          .then(d => {
            setActiveAccount({
              connected: d.connected,
              login: d.login,
              server: d.server,
              mock: d.mock,
              balance: d.balance ?? 0,
              equity: d.equity ?? 0
            })
          })
          .catch(() => {})
      }
      checkStatus()
      const interval = setInterval(checkStatus, 3000)
      return () => clearInterval(interval)
    }
  }, [tab])

  const saveAccount = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: displayName, timezone }) })
    } finally { setSaving(false) }
  }

  const saveBroker = async () => {
    if (!login || !password || !server) {
      addToast({ type: 'error', title: 'Missing fields', message: 'Please fill in MT5 login, password, and server.', duration: 4000 })
      return
    }
    if (!/^\d+$/.test(login)) {
      addToast({ type: 'error', title: 'Invalid Login', message: 'MT5 Login must be a numeric account number (e.g. 12345678), not an email.', duration: 5000 })
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/settings/broker', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ login, password, server, cloud_mode: cloudMode }) 
      })
      if (response.ok) {
        setBrokerSaved(true)
        setPassword('')
        addToast({ type: 'info', title: 'Broker credentials saved', message: 'Waiting for bridge connection…', duration: 3000 })
        // Poll bridge status after 2s to get confirmed account info
        setTimeout(async () => {
          try {
            const statusRes = await fetch('/api/bridge/status')
            if (statusRes.ok) {
              const d = await statusRes.json()
              if (d.connected) {
                setConfirmedAccount({
                  login: d.login ?? login,
                  server: d.server ?? server,
                  balance: d.balance ?? 0,
                  equity: d.equity ?? 0,
                  mock: d.mock ?? false
                })
                setBrokerDialogOpen(true)
              } else {
                addToast({
                  type: 'warning',
                  title: 'Credentials saved, bridge not yet connected',
                  message: 'The bridge will connect automatically. Check bridge status in a few seconds.',
                  duration: 6000
                })
              }
            }
          } catch {
            addToast({ type: 'info', title: 'Credentials saved', message: 'Bridge status could not be verified yet.', duration: 4000 })
          }
        }, 2500)
      } else {
        addToast({ type: 'error', title: 'Failed to save broker connection', message: 'Please check your credentials and try again.', duration: 5000 })
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save Error', message: err.message, duration: 5000 })
    } finally { setSaving(false) }
  }

  const saveNotifications = async () => {
    setSaving(true)
    try {
      await fetch('/api/settings/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notifSettings) })
    } finally { setSaving(false) }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('Permanently delete your account? This cannot be undone.')) return
    await fetch('/api/settings/account', { method: 'DELETE' })
    router.push('/')
  }

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const handleUpgrade = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      })
      const data = await res.json()
      
      if (data.mock) {
        const mockRes = await fetch('/api/settings/mock-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan })
        })
        const mockData = await mockRes.json()
        if (mockData.success) {
          addToast({ type: 'success', title: `Upgraded to ${plan.toUpperCase()} (Sandbox)`, message: 'Mock plan activated successfully.', duration: 5000 })
          window.location.reload()
        } else {
          addToast({ type: 'error', title: 'Mock upgrade failed', message: mockData.error, duration: 5000 })
        }
        return
      }

      if (data.error) {
        addToast({ type: 'error', title: 'Checkout Error', message: data.error, duration: 5000 })
        return
      }

      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded) {
        addToast({ type: 'error', title: 'Payment SDK Error', message: 'Failed to load Razorpay Checkout SDK.', duration: 5000 })
        return
      }

      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'AURIC PRO',
        description: `${plan.toUpperCase()} Plan Subscription`,
        handler: async function (response: any) {
          addToast({ type: 'success', title: 'Payment Successful', message: 'Upgrading your subscription...', duration: 5000 })
          window.location.reload()
        },
        prefill: {
          email: user?.email || '',
        },
        theme: {
          color: '#0f172a'
        }
      }

      const rzp = new (window as any).Razorpay(options)
      rzp.open()
    } catch (err: any) {
      addToast({ type: 'error', title: 'Upgrade Error', message: err.message, duration: 5000 })
    } finally {
      setSaving(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!window.confirm("Are you sure you want to cancel your subscription?")) return
    setSaving(true)
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addToast({ type: 'success', title: 'Subscription cancelled', message: 'Your plan has been reverted to free.', duration: 5000 })
        window.location.reload()
      } else {
        addToast({ type: 'error', title: 'Cancellation failed', message: data.error, duration: 5000 })
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message, duration: 5000 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-lg">
      {/* Broker Connection Confirmation Dialog */}
      {brokerDialogOpen && confirmedAccount && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-canvas border border-hairline rounded-md shadow-level-5 w-full max-w-[480px] p-xl space-y-lg relative">
            {/* Close button */}
            <button
              onClick={() => setBrokerDialogOpen(false)}
              className="absolute top-md right-md text-mute hover:text-ink transition-colors"
            >
              <X className="w-sm h-sm" />
            </button>

            <div className="flex items-center gap-sm">
              <div className="w-[40px] h-[40px] rounded-full bg-success/10 flex items-center justify-center border border-success/30">
                <CheckCircle2 className="w-sm h-sm text-success" />
              </div>
              <div>
                <h3 className="font-sans text-body-md font-semibold text-ink">
                  {confirmedAccount.mock ? 'Connected to MT5 Sandbox' : 'MT5 Account Connected'}
                </h3>
                <p className="font-mono text-[10px] text-mute uppercase">
                  {confirmedAccount.mock ? 'DEMO / SANDBOX MODE' : 'LIVE TRADING ENABLED'}
                </p>
              </div>
            </div>

            <div className="border border-hairline rounded-md divide-y divide-hairline">
              <div className="flex justify-between items-center px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Account Login</span>
                <span className="font-sans text-body-sm font-semibold text-ink">{confirmedAccount.login || '—'}</span>
              </div>
              <div className="flex justify-between items-center px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Server</span>
                <span className="font-sans text-body-sm font-semibold text-ink">{confirmedAccount.server || '—'}</span>
              </div>
              <div className="flex justify-between items-center px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Balance</span>
                <span className="font-sans text-body-sm font-semibold text-success">${confirmedAccount.balance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Equity</span>
                <span className="font-sans text-body-sm font-semibold text-ink">${confirmedAccount.equity.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center px-md py-sm">
                <span className="font-mono text-caption-mono text-mute uppercase">Mode</span>
                <span className={`font-mono text-[10px] font-bold px-xs py-[2px] rounded-xs border ${
                  confirmedAccount.mock
                    ? 'text-mute border-hairline'
                    : 'text-success border-success/30 bg-success/5'
                }`}>
                  {confirmedAccount.mock ? 'SANDBOX' : 'LIVE'}
                </span>
              </div>
            </div>

            <p className="font-sans text-caption text-mute">
              Your broker account is now active. All executed trades will be routed to this MT5 account.
            </p>

            <button
              onClick={() => setBrokerDialogOpen(false)}
              className="w-full bg-primary text-on-primary font-sans text-button-md font-semibold h-[40px] rounded-sm hover:opacity-90 transition-opacity"
            >
              Got it, Start Trading
            </button>
          </div>
        </div>
      )}
      <div>
        <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">Settings</h2>
        <p className="font-sans text-body-sm text-body-text mt-xxs">Manage account, broker connection, notifications and billing.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-lg">
        {/* Sidebar */}
        <aside className="w-full lg:w-[200px] shrink-0">
          <nav className="bg-canvas border border-hairline rounded-md shadow-level-2 overflow-hidden">
            {TABS.map(t => {
              const Icon = t.icon
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-sm px-md py-sm font-sans text-body-sm transition-colors border-b last:border-b-0 border-hairline ${
                    tab === t.id ? 'bg-canvas-soft-2 text-ink font-semibold border-l-2 border-l-primary' : 'text-body-text hover:bg-canvas-soft'
                  }`}>
                  <Icon className="w-xxs h-xxs shrink-0" /> {t.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 space-y-md">
          {tab === 'account' && (
            <SectionCard title="Account Details" action={<SaveButton onClick={saveAccount} saving={saving} />}>
              <FieldRow label="EMAIL">
                <input value={String(user?.email ?? '')} readOnly className="form-input bg-canvas-soft-2 text-mute cursor-not-allowed" />
              </FieldRow>
              <FieldRow label="DISPLAY NAME">
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="form-input focus:outline-none" />
              </FieldRow>
              <FieldRow label="TIMEZONE">
                <select value={timezone} onChange={e => setTimezone(e.target.value)} className="form-input focus:outline-none">
                  {['UTC', 'US/Eastern', 'US/Pacific', 'Europe/London', 'Asia/Singapore', 'Australia/Sydney'].map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </FieldRow>
            </SectionCard>
          )}

          {tab === 'broker' && (
            <SectionCard title="MT5 Broker Connection" action={<SaveButton onClick={saveBroker} saving={saving} />}>
              {activeAccount?.connected ? (
                <div className="mb-md p-md bg-[#d3e5ff]/20 border border-[#0070f3]/30 rounded-md flex items-center justify-between">
                  <div className="flex items-center gap-sm">
                    <span className="w-xxs h-xxs rounded-full bg-[#0070f3] animate-pulse shrink-0" />
                    <div>
                      <span className="font-sans text-body-sm font-semibold text-ink block">
                        {activeAccount.mock ? 'Connected to MT5 Sandbox' : 'Actively Connected to Live MT5'}
                      </span>
                      <span className="font-mono text-[10px] text-mute uppercase block">
                        Account: {activeAccount.login || 'Default'} • Server: {activeAccount.server || 'Demo-Server'}
                      </span>
                      <span className="font-mono text-[10px] text-mute block mt-xxs">
                        Balance: <span className="text-success font-semibold">${(activeAccount.balance ?? 0).toFixed(2)}</span>
                        {' • Equity: '}<span className="font-semibold">${(activeAccount.equity ?? 0).toFixed(2)}</span>
                      </span>
                    </div>
                  </div>
                  <span className={`font-mono text-[10px] border px-xxs py-[2px] rounded-md font-bold uppercase ${
                    activeAccount.mock 
                      ? 'text-mute border-hairline' 
                      : 'text-[#0070f3] border-[#0070f3]/30'
                  }`}>
                    {activeAccount.mock ? 'Mock' : 'Live'}
                  </span>
                </div>
              ) : (
                <div className="mb-md p-md bg-canvas-soft border border-hairline rounded-md flex items-center gap-sm">
                  <span className="w-xxs h-xxs rounded-full bg-[#ee0000] shrink-0" />
                  <div>
                    <span className="font-sans text-body-sm font-semibold text-ink block">Execution Bridge Disconnected</span>
                    <span className="font-sans text-[10px] text-mute">Your credentials must be saved below to connect the live bridge.</span>
                  </div>
                </div>
              )}
              {cloudMode ? (
                <div className="p-sm bg-canvas-soft border border-hairline rounded-sm font-sans text-caption text-body-text mb-sm">
                  <strong className="text-ink">Cloud Execution:</strong> Your credentials are encrypted on the server. The data bridge runs continuously on our Windows EC2 server. You do not need to download or run anything locally.
                </div>
              ) : (
                <div className="p-sm bg-canvas-soft border border-hairline rounded-sm font-sans text-caption text-body-text mb-sm">
                  <strong className="text-ink">Local Execution:</strong> Credentials are encrypted locally using Fernet by <code className="font-mono text-xs">bridge.py</code>. We never store your password on our servers.
                </div>
              )}

              {isAdmin && (
                <div className="flex items-center justify-between p-xs bg-canvas-soft-2 border border-hairline rounded-sm mb-sm">
                  <div>
                    <span className="font-sans text-body-sm font-medium text-ink block">Run bridge in the Cloud</span>
                    <span className="font-sans text-[10px] text-mute">Highly recommended for normal users to execute automated trades.</span>
                  </div>
                  <button type="button" onClick={() => setCloudMode(!cloudMode)}
                    className={`w-[40px] h-[22px] rounded-full relative transition-colors ${cloudMode ? 'bg-primary' : 'bg-hairline'}`}>
                    <span className={`absolute top-[3px] w-[16px] h-[16px] rounded-full bg-white shadow transition-all ${cloudMode ? 'left-[21px]' : 'left-[3px]'}`} />
                  </button>
                </div>
              )}

              {brokerSaved && (
                <div className="p-xs bg-success-soft border border-success rounded-xs font-sans text-caption text-success-deep">
                  ✓ Broker credentials updated.
                </div>
              )}
              <FieldRow label="MT5 LOGIN (ACCOUNT NUMBER)">
                <input value={login} onChange={e => setLogin(e.target.value)} className="form-input focus:outline-none" placeholder="12345678" />
              </FieldRow>
              <FieldRow label="MT5 PASSWORD" sub={cloudMode ? "Stored securely encrypted in the cloud." : "Encrypted locally. We never see your password."}>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    className="form-input pr-lg focus:outline-none w-full" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-xs top-1/2 -translate-y-1/2 text-mute hover:text-ink">
                    {showPassword ? <EyeOff className="w-xxs h-xxs" /> : <Eye className="w-xxs h-xxs" />}
                  </button>
                </div>
              </FieldRow>
              <FieldRow label="MT5 SERVER NAME">
                <input value={server} onChange={e => setServer(e.target.value)} className="form-input focus:outline-none" placeholder="ICMarkets-Live01" />
              </FieldRow>
              {isAdmin && (
                <a href="/bridge-setup" className="inline-block font-sans text-caption text-link hover:underline mt-xs">
                  → Bridge setup instructions & connection guide (Admin Only)
                </a>
              )}
            </SectionCard>
          )}

          {tab === 'notifications' && (
            <SectionCard title="Notification Preferences" action={<SaveButton onClick={saveNotifications} saving={saving} />}>
              {Object.entries(notifSettings).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between py-xs border-b border-hairline last:border-b-0">
                  <div>
                    <span className="font-sans text-body-sm font-medium text-ink block capitalize">{key.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-[9px] text-mute">Receive alert when this event occurs</span>
                  </div>
                  <button onClick={() => setNotifSettings(prev => ({ ...prev, [key]: !val }))}
                    className={`w-[40px] h-[22px] rounded-full relative transition-colors ${val ? 'bg-primary' : 'bg-hairline'}`}>
                    <span className={`absolute top-[3px] w-[16px] h-[16px] rounded-full bg-white shadow transition-all ${val ? 'left-[21px]' : 'left-[3px]'}`} />
                  </button>
                </div>
              ))}
            </SectionCard>
          )}

          {tab === 'billing' && (
            <SectionCard title="Billing & Subscription">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                {(['free', 'pro', 'elite'] as const).map(p => (
                  <div key={p} className={`border rounded-md p-md cursor-pointer transition-all ${plan === p ? 'border-primary shadow-level-3' : 'border-hairline hover:border-primary/40'}`}
                    onClick={() => setPlan(p)}>
                    <span className="font-mono text-[9px] text-mute uppercase block">{p}</span>
                    <span className="font-sans text-display-sm font-semibold text-ink block mt-xxs">
                      {p === 'free' ? '$0' : p === 'pro' ? '$49' : '$149'}
                      <span className="font-sans text-caption text-mute font-normal">/mo</span>
                    </span>
                    <ul className="mt-xs space-y-xxs font-sans text-caption text-body-text">
                      {p === 'free' && ['Dashboard', '5 signals/day', 'No live trading'].map(f => <li key={f}>• {f}</li>)}
                      {p === 'pro' && ['All Free features', 'Live MT5 trading', 'Full backtester', 'AI Advisor'].map(f => <li key={f}>• {f}</li>)}
                      {p === 'elite' && ['All Pro features', 'Priority AI', 'Direct broker API', 'Dedicated support'].map(f => <li key={f}>• {f}</li>)}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="flex gap-sm pt-md">
                {subscription?.plan !== 'free' && (
                  <button onClick={handleCancelSubscription} disabled={saving}
                    className="bg-error/10 text-error border border-error/20 font-sans text-button-md font-semibold h-[40px] px-lg rounded-sm hover:bg-error/20 disabled:opacity-50 transition-all">
                    Cancel Subscription
                  </button>
                )}

                {plan !== subscription?.plan && plan !== 'free' && (
                  <button onClick={handleUpgrade} disabled={saving}
                    className="bg-primary text-on-primary font-sans text-button-md font-semibold h-[40px] px-lg rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                    Upgrade to {plan.toUpperCase()} via Razorpay
                  </button>
                )}
              </div>
            </SectionCard>
          )}

          {tab === 'danger' && (
            <div className="bg-canvas border border-error rounded-md p-lg shadow-level-2 space-y-md">
              <h4 className="font-sans text-body-md font-semibold text-error">Danger Zone</h4>
              <p className="font-sans text-body-sm text-body-text">
                Actions here are permanent and cannot be undone. Deleting your account will remove all trades, signals, strategies and settings.
              </p>
              <button onClick={handleDeleteAccount}
                className="flex items-center gap-xs bg-error text-on-primary font-sans text-button-md font-bold h-[40px] px-md rounded-sm hover:bg-error-deep transition-colors">
                <Trash2 className="w-xs h-xs" /> Delete My Account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
