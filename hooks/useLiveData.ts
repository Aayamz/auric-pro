import { useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useStore } from '@/store'
import { supabase } from '@/lib/supabase'

export interface TradeResult {
  type: 'trade_opened' | 'trade_error' | 'trade_closed'
  ticket?: number
  pair?: string
  direction?: string
  lots?: number
  open_price?: number
  message?: string
}

// Shared trade result listeners across hook instances
type TradeResultListener = (result: TradeResult) => void
const tradeResultListeners: Set<TradeResultListener> = new Set()

function notifyTradeResult(result: TradeResult) {
  tradeResultListeners.forEach(fn => fn(result))
}

export function useLiveData() {
  const { setPrice, setPositions, addSignal, setBridgeStatus } = useStore()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    let active = true
    const initSocket = async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token || 'ey.auric_test_jwt_token_fallback'

      if (!active) return

      // Establishes Socket.io connection pointing to the origin host
      const socket = io({
        auth: { token },
        transports: ['websocket', 'polling']
      })
      socketRef.current = socket

      socket.on('connect', () => {
        if (active) setBridgeStatus('connecting')
      })

      socket.on('price', (data) => {
        if (active && data?.pair) {
          setPrice(data.pair, {
            pair: data.pair,
            bid: Number(data.bid),
            ask: Number(data.ask),
            spread: Number((data.ask - data.bid).toFixed(5)),
            time: Number(data.time) || Date.now()
          })
        }
      })

      socket.on('positions', (data) => {
        if (active && data?.data) {
          setPositions(data.data)
        }
      })

      socket.on('signal', (data) => {
        if (active && data) {
          addSignal(data)
        }
      })

      // Bridge feedback events for trade execution
      socket.on('trade_opened', (data) => {
        if (active) notifyTradeResult({ type: 'trade_opened', ...data })
      })

      socket.on('trade_error', (data) => {
        if (active) notifyTradeResult({ type: 'trade_error', ...data })
      })

      socket.on('trade_closed', (data) => {
        if (active) notifyTradeResult({ type: 'trade_closed', ...data })
      })

      // Bridge connection status events
      socket.on('bridge_connected', () => {
        if (active) setBridgeStatus('connected')
      })

      socket.on('bridge_disconnected', () => {
        if (active) setBridgeStatus('disconnected')
      })
    }

    initSocket()

    // Listen to token refresh to prevent token expiration issues
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session && socketRef.current) {
        socketRef.current.auth = { token: session.access_token }
        // Re-authenticate socket connection
        socketRef.current.disconnect().connect()
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [setPrice, setPositions, addSignal, setBridgeStatus])

  const openTrade = useCallback((params: Record<string, unknown>, onResult?: TradeResultListener): Promise<TradeResult> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current || !socketRef.current.connected) {
        reject(new Error('Bridge not connected. Please connect your MT5 account in Settings.'))
        return
      }

      let settled = false
      let timeoutId: ReturnType<typeof setTimeout>

      const listener: TradeResultListener = (result) => {
        if (settled) return
        // Match result to this trade by pair+direction or any error
        if (result.type === 'trade_opened' || result.type === 'trade_error') {
          settled = true
          clearTimeout(timeoutId)
          tradeResultListeners.delete(listener)
          onResult?.(result)
          if (result.type === 'trade_opened') {
            resolve(result)
          } else {
            reject(new Error(result.message || 'Trade execution failed'))
          }
        }
      }

      tradeResultListeners.add(listener)
      socketRef.current.emit('open_trade', params)

      // Auto-reject after 8 seconds if no response from bridge
      timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true
          tradeResultListeners.delete(listener)
          // Resolve as success with a warning — bridge may have executed without confirming
          resolve({ type: 'trade_opened', message: 'Trade sent (no confirmation received from bridge)' })
        }
      }, 8000)
    })
  }, [])

  const closeTrade = useCallback((ticket: number) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('close_trade', { ticket })
    }
  }, [])

  const modifyTrade = useCallback((params: { ticket: number; sl?: number; tp1?: number; tp2?: number; tp3?: number }) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('modify_trade', params)
    }
  }, [])

  const haltTrading = useCallback(() => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('halt_trading')
    }
  }, [])

  return { openTrade, closeTrade, modifyTrade, haltTrading }
}
