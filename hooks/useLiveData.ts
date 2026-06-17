import { useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useStore } from '@/store'
import { supabase } from '@/lib/supabase'

let socket: Socket | null = null

export function useLiveData() {
  const { setPrice, setPositions, addSignal, setBridgeStatus } = useStore()

  useEffect(() => {
    let active = true
    const initSocket = async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token || 'ey.auric_test_jwt_token_fallback'

      if (!active) return

      // Establishes Socket.io connection pointing to the origin host
      socket = io({
        auth: { token },
        transports: ['websocket', 'polling']
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
    }

    initSocket()

    // Listen to token refresh as well to prevent token expiration issues
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && session && socket) {
        socket.auth = { token: session.access_token }
        // Re-authenticate socket connection
        socket.disconnect().connect()
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
      if (socket) {
        socket.disconnect()
        socket = null
      }
    }
  }, [setPrice, setPositions, addSignal, setBridgeStatus])

  const openTrade = useCallback((params: Record<string, unknown>) => {
    if (socket) {
      socket.emit('open_trade', params)
    }
  }, [])

  const closeTrade = useCallback((ticket: number) => {
    if (socket) {
      socket.emit('close_trade', { ticket })
    }
  }, [])

  const modifyTrade = useCallback((params: { ticket: number; sl?: number; tp1?: number; tp2?: number; tp3?: number }) => {
    if (socket) {
      socket.emit('modify_trade', params)
    }
  }, [])

  const haltTrading = useCallback(() => {
    if (socket) {
      socket.emit('halt_trading')
    }
  }, [])

  return { openTrade, closeTrade, modifyTrade, haltTrading }
}
