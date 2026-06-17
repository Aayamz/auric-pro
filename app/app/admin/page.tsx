'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/store'
import { createSupabaseClient } from '@/lib/supabase'
import { 
  Users, 
  Activity, 
  Database, 
  Play, 
  Square, 
  RefreshCw, 
  ShieldCheck, 
  Loader2, 
  AlertCircle 
} from 'lucide-react'

interface AdminUser {
  userId: string
  displayName: string
  plan: 'free' | 'pro' | 'elite'
  status: string
  login: number
  server: string
  credentialsStored: boolean
  connected: boolean
  balance: number
  equity: number
}

export default function AdminPage() {
  const router = useRouter()
  const { user: storeUser } = useStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [activeBridges, setActiveBridges] = useState(0)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const fetchAdminData = async () => {
    try {
      const res = await fetch('/api/admin/status')
      if (!res.ok) {
        if (res.status === 403) {
          setError('Access Denied. You do not have permission to view this page.')
        } else {
          setError('Failed to fetch administrative telemetry.')
        }
        setLoading(false)
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
      setTotalUsers(data.totalUsers || 0)
      setActiveBridges(data.activeBridges || 0)
      setError('')
    } catch (err: any) {
      setError(`Telemetry connection error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Authenticate and fetch data
    const supabase = createSupabaseClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        const email = data.user?.email || storeUser?.email || ''
        const isAdmin = email === 'demo@auricpro.com' || email === 'admin@auricpro.com' || email === 'admin@auric.pro'
        
        if (!isAdmin) {
          router.replace('/app/dashboard')
          return
        }
        fetchAdminData()
      })
      .catch(() => {
        router.replace('/app/dashboard')
      })
  }, [router, storeUser])

  const handleAction = async (userId: string, action: 'start' | 'stop' | 'sync') => {
    setActionInProgress(`${userId}-${action}`)
    try {
      const res = await fetch(`/api/admin/bridge/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      })
      if (!res.ok) {
        const errData = await res.json()
        alert(`Action failed: ${errData.error || 'Unknown error'}`)
      } else {
        alert(`Action completed successfully: ${action.toUpperCase()}`)
        await fetchAdminData()
      }
    } catch (err: any) {
      alert(`Network error executing action: ${err.message}`)
    } finally {
      setActionInProgress(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-sm">
        <Loader2 className="w-md h-md animate-spin text-primary" />
        <span className="font-mono text-caption-mono text-mute">Loading Admin Telemetry…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-error-soft border border-error/20 p-lg rounded-md flex gap-sm items-start max-w-[500px] mx-auto mt-xl">
        <AlertCircle className="w-md h-md text-error shrink-0 mt-[2px]" />
        <div className="space-y-xxs">
          <h4 className="font-sans text-body-sm font-semibold text-error">Administrative Exception</h4>
          <p className="font-sans text-caption text-error/80 leading-relaxed">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-lg">
      <div>
        <div className="flex items-center gap-sm">
          <h2 className="font-sans text-display-lg font-semibold text-ink tracking-tight">Admin Console</h2>
          <span className="flex items-center gap-xxs px-sm py-[2px] rounded-pill bg-success-soft text-success-deep font-mono text-[9px] font-bold border border-success/30">
            <ShieldCheck className="w-[10px] h-[10px]" /> ADMIN MODE
          </span>
        </div>
        <p className="font-sans text-body-sm text-body-text mt-xxs">Manage user cloud engine connections, sync history, and monitor terminal connectivity.</p>
      </div>

      {/* Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
        <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2 flex items-center justify-between">
          <div>
            <span className="font-mono text-caption-mono text-mute uppercase block">Total Clients</span>
            <span className="font-sans text-display-sm font-semibold text-ink mt-xxs block">{totalUsers}</span>
          </div>
          <div className="p-xs bg-canvas-soft-2 rounded-sm border border-hairline">
            <Users className="w-sm h-sm text-body-text" />
          </div>
        </div>

        <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2 flex items-center justify-between">
          <div>
            <span className="font-mono text-caption-mono text-mute uppercase block">Active Cloud Engines</span>
            <span className="font-sans text-display-sm font-semibold text-success mt-xxs block">{activeBridges}</span>
          </div>
          <div className="p-xs bg-canvas-soft-2 rounded-sm border border-hairline">
            <Activity className="w-sm h-sm text-success" />
          </div>
        </div>

        <div className="bg-canvas border border-hairline rounded-md p-md shadow-level-2 flex items-center justify-between">
          <div>
            <span className="font-mono text-caption-mono text-mute uppercase block">Engine Host</span>
            <span className="font-sans text-display-sm font-semibold text-link mt-xxs block">In-Process</span>
          </div>
          <div className="p-xs bg-canvas-soft-2 rounded-sm border border-hairline">
            <Database className="w-sm h-sm text-link" />
          </div>
        </div>
      </div>

      {/* Client List Table */}
      <div className="bg-canvas border border-hairline rounded-md shadow-level-3">
        <div className="p-md border-b border-hairline flex items-center justify-between">
          <h4 className="font-sans text-body-md font-semibold text-ink">User Connection Telemetry</h4>
          <button onClick={fetchAdminData} className="flex items-center gap-xxs px-sm h-[32px] border border-hairline rounded-sm bg-canvas hover:bg-canvas-soft text-body-text font-sans text-caption transition-colors">
            <RefreshCw className="w-xxs h-xxs" /> Refresh Status
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-canvas-soft-2 font-mono text-caption-mono text-mute border-b border-hairline">
                {['USER', 'PLAN', 'MT5 LOGIN', 'MT5 SERVER', 'TELEMETRY', 'ENGINE STATE', 'ACTIONS'].map(h => (
                  <th key={h} className="p-sm whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {users.map(u => {
                const busyStart = actionInProgress === `${u.userId}-start`
                const busyStop = actionInProgress === `${u.userId}-stop`
                const busySync = actionInProgress === `${u.userId}-sync`
                const isBusy = !!actionInProgress
                
                return (
                  <tr key={u.userId} className="hover:bg-canvas-soft text-body-sm text-body-text transition-colors">
                    <td className="p-sm">
                      <div className="font-semibold text-ink">{u.displayName}</div>
                      <div className="font-mono text-[9px] text-mute">{u.userId}</div>
                    </td>
                    <td className="p-sm">
                      <span className={`font-mono text-[9px] font-bold px-xxs py-[2px] rounded-xs uppercase ${
                        u.plan === 'elite' ? 'bg-primary text-on-primary' : u.plan === 'pro' ? 'bg-link/15 text-link' : 'bg-canvas-soft-2 text-mute'
                      }`}>{u.plan}</span>
                    </td>
                    <td className="p-sm font-mono text-caption-mono">{u.login}</td>
                    <td className="p-sm font-sans text-body-sm text-mute">{u.server}</td>
                    <td className="p-sm font-mono text-caption-mono">
                      {u.connected ? (
                        <div>
                          <span className="text-success font-semibold">Bal: ${u.balance?.toFixed(2)}</span>
                          <div className="text-[9px] text-mute">Equ: ${u.equity?.toFixed(2)}</div>
                        </div>
                      ) : (
                        <span className="text-mute">—</span>
                      )}
                    </td>
                    <td className="p-sm">
                      <span className={`inline-flex items-center gap-xs px-xs py-[2px] rounded-full font-mono text-[9px] font-bold ${
                        u.connected ? 'bg-success-soft text-success-deep border border-success/30' : 'bg-canvas-soft border border-hairline text-mute'
                      }`}>
                        <span className={`w-xs h-xs rounded-full inline-block ${u.connected ? 'bg-success animate-pulse' : 'bg-mute'}`} />
                        {u.connected ? 'CONNECTED' : 'IDLE'}
                      </span>
                    </td>
                    <td className="p-sm">
                      <div className="flex gap-xs">
                        {u.connected ? (
                          <button 
                            onClick={() => handleAction(u.userId, 'stop')}
                            disabled={isBusy}
                            className="flex items-center gap-xxs px-sm h-[28px] bg-error text-on-primary font-sans text-caption font-medium rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                          >
                            {busyStop ? <Loader2 className="w-[12px] h-[12px] animate-spin" /> : <Square className="w-[10px] h-[10px]" />} Stop Engine
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleAction(u.userId, 'start')}
                            disabled={isBusy}
                            className="flex items-center gap-xxs px-sm h-[28px] bg-success text-on-primary font-sans text-caption font-medium rounded-sm hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                          >
                            {busyStart ? <Loader2 className="w-[12px] h-[12px] animate-spin" /> : <Play className="w-[10px] h-[10px]" />} Start Engine
                          </button>
                        )}
                        <button 
                          onClick={() => handleAction(u.userId, 'sync')}
                          disabled={isBusy || !u.credentialsStored}
                          title="Fetch historical trades from MT5"
                          className="flex items-center gap-xxs px-sm h-[28px] border border-hairline bg-canvas hover:bg-canvas-soft text-body-text font-sans text-caption font-medium rounded-sm disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {busySync ? <Loader2 className="w-[12px] h-[12px] animate-spin" /> : <RefreshCw className="w-[10px] h-[10px]" />} Sync History
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-xl font-sans text-body-sm text-mute">
                    No connected cloud accounts found. Users must save credentials in Settings.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
