'use client'

import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-sm h-sm text-success shrink-0" />,
  error: <XCircle className="w-sm h-sm text-error shrink-0" />,
  info: <Info className="w-sm h-sm text-link shrink-0" />,
  warning: <Info className="w-sm h-sm text-warning shrink-0" />
}

const BORDER_COLORS: Record<ToastType, string> = {
  success: 'border-success/40',
  error: 'border-error/40',
  info: 'border-link/40',
  warning: 'border-warning/40'
}

const BG_COLORS: Record<ToastType, string> = {
  success: 'bg-success/5',
  error: 'bg-error/5',
  info: 'bg-link/5',
  warning: 'bg-warning/5'
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  return (
    <div
      className={`
        flex items-start gap-sm p-md rounded-md border shadow-level-5
        bg-canvas ${BORDER_COLORS[toast.type]} ${BG_COLORS[toast.type]}
        animate-slide-in-right min-w-[320px] max-w-[420px]
        font-sans text-ink
      `}
      role="alert"
    >
      {ICONS[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="text-body-sm font-semibold leading-snug">{toast.title}</p>
        {toast.message && (
          <p className="text-caption text-body-text mt-xxs leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-mute hover:text-ink transition-colors shrink-0 mt-[1px]"
        aria-label="Dismiss"
      >
        <X className="w-xxs h-xxs" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    setMounted(true)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const duration = toast.duration ?? 5000

    setToasts(prev => [...prev, { ...toast, id }])

    if (duration > 0) {
      const timer = setTimeout(() => removeToast(id), duration)
      timers.current.set(id, timer)
    }
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {mounted && createPortal(
        <div className="fixed top-lg right-lg z-[9999] flex flex-col gap-sm pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onRemove={removeToast} />
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

// Convenience alias
export const Toaster = ToastProvider
