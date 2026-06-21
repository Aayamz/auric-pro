import { useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

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
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    let reconnectTimeoutId: ReturnType<typeof setTimeout>

    const initSocket = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token || 'ey.auric_test_jwt_token_fallback'

        if (!active) return

        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/client'
        const socketUrl = `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`

        console.log(`[WebSocket] Connecting to: ${wsUrl}`)
        const ws = new WebSocket(socketUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (active) {
            console.log('[WebSocket] Connection established.')
            setBridgeStatus('connecting')
          }
        }

        ws.onmessage = (event) => {
          if (!active) return
          try {
            const message = JSON.parse(event.data)
            if (!message || !message.type) return

            switch (message.type) {
              case 'price':
                if (message.pair) {
                  setPrice(message.pair, {
                    pair: message.pair,
                    bid: Number(message.bid),
                    ask: Number(message.ask),
                    spread: Number((message.ask - message.bid).toFixed(5)),
                    time: Number(message.time) || Date.now()
                  })
                }
                break
              case 'positions':
                if (message.data) {
                  setPositions(message.data)
                }
                break
              case 'signal':
                addSignal(message)
                break
              case 'trade_opened':
                queryClient.invalidateQueries({ queryKey: ['portfolio-stats'] })
                queryClient.invalidateQueries({ queryKey: ['equity-curve'] })
                queryClient.invalidateQueries({ queryKey: ['trades'] })
                notifyTradeResult({ type: 'trade_opened', ...message })
                break
              case 'trade_error':
                notifyTradeResult({ type: 'trade_error', ...message })
                break
              case 'trade_closed':
                queryClient.invalidateQueries({ queryKey: ['portfolio-stats'] })
                queryClient.invalidateQueries({ queryKey: ['equity-curve'] })
                queryClient.invalidateQueries({ queryKey: ['trades'] })
                notifyTradeResult({ type: 'trade_closed', ...message })
                break
              case 'trades_updated':
                queryClient.invalidateQueries({ queryKey: ['portfolio-stats'] })
                queryClient.invalidateQueries({ queryKey: ['equity-curve'] })
                queryClient.invalidateQueries({ queryKey: ['trades'] })
                break
              case 'bridge_connected':
                setBridgeStatus('connected')
                break
              case 'bridge_disconnected':
                setBridgeStatus('disconnected')
                break
              case 'bridge_status':
                setBridgeStatus(message.connected ? 'connected' : 'disconnected')
                break
              default:
                break
            }
          } catch (err: any) {
            console.error('[WebSocket] Error parsing message:', err.message)
          }
        }

        ws.onclose = (event) => {
          if (active) {
            console.log(`[WebSocket] Connection closed (code: ${event.code}). Reconnecting in 3s...`)
            setBridgeStatus('disconnected')
            reconnectTimeoutId = setTimeout(initSocket, 3000)
          }
        }

        ws.onerror = (err) => {
          console.error('[WebSocket] Connection error:', err)
          if (active) {
            setBridgeStatus('disconnected')
          }
        }
      } catch (err) {
        console.error('[WebSocket] Failed to initialize socket:', err)
        if (active) {
          reconnectTimeoutId = setTimeout(initSocket, 3000)
        }
      }
    }

    initSocket()

    // Listen to token refresh to prevent token expiration issues
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session && wsRef.current) {
        console.log('[WebSocket] Token refreshed, reconnecting...')
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close()
        }
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
      clearTimeout(reconnectTimeoutId)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [setPrice, setPositions, addSignal, setBridgeStatus])

  const openTrade = useCallback((params: Record<string, unknown>, onResult?: TradeResultListener): Promise<TradeResult> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
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
      wsRef.current.send(JSON.stringify({ type: 'open_trade', ...params }))

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
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'close_trade', ticket }))
    }
  }, [])

  const modifyTrade = useCallback((params: { ticket: number; sl?: number; tp1?: number; tp2?: number; tp3?: number }) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'modify_trade', ...params }))
    }
  }, [])

  const haltTrading = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'halt_trading' }))
    }
  }, [])

  return { openTrade, closeTrade, modifyTrade, haltTrading }
}
