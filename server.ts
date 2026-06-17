// server.ts — custom Next.js server, enables Socket.io
// Subscribes to Redis pub/sub and fans out to browser clients
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import { createClient } from 'redis'
import next from 'next'
import { EventEmitter } from 'events'


const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Local in-memory pub-sub fallback if Redis is not running
const localPubSub = new EventEmitter()
let isRedisConnected = false

let redisPublisher: ReturnType<typeof createClient> | null = null
let redisSubscriber: ReturnType<typeof createClient> | null = null

async function initRedis() {
  if (!REDIS_URL || REDIS_URL === 'redis://localhost:6379') {
    // Check if Redis is actually running before trying to connect
    try {
      const testClient = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000, reconnectStrategy: false } })
      testClient.on('error', () => {})
      await testClient.connect()
      await testClient.disconnect()
    } catch {
      console.log('Redis not available. Using local in-memory pub/sub.')
      return
    }
  }

  try {
    redisPublisher = createClient({ url: REDIS_URL })
    redisSubscriber = createClient({ url: REDIS_URL })
    redisPublisher.on('error', (err) => console.warn('Redis Publisher Warning:', err.message))
    redisSubscriber.on('error', (err) => console.warn('Redis Subscriber Warning:', err.message))
    await redisPublisher.connect()
    await redisSubscriber.connect()
    isRedisConnected = true
    console.log('Redis connected successfully.')
  } catch {
    console.log('Redis not available. Using local in-memory pub/sub.')
  }
}

// Supabase Socket Authentication Middleware
const supabaseSocketAuthMiddleware = async (socket: Socket, nextFn: (err?: Error) => void) => {
  const token = socket.handshake.auth?.token

  // Local development / mock token bypass
  if (!token || token.startsWith('ey.auric_test_jwt_token_') || token === 'placeholder-token') {
    socket.data.userId = '00000000-0000-0000-0000-000000000000'
    return nextFn()
  }

  try {
    const { getSupabaseServerClient } = await import('./lib/supabase-server')
    const supabaseServer = getSupabaseServerClient()
    const { data: { user }, error } = await supabaseServer.auth.getUser(token)
    
    if (error || !user) {
      // Fallback to demo user if supabase config is placeholder/offline
      if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder') || error?.message?.includes('fetch')) {
        socket.data.userId = '00000000-0000-0000-0000-000000000000'
        return nextFn()
      }
      return nextFn(new Error('Authentication error: Invalid session'))
    }

    // Attach userId to socket session
    socket.data.userId = user.id
    nextFn()
  } catch {
    // Fallback to demo user on connection/network errors
    socket.data.userId = '00000000-0000-0000-0000-000000000000'
    nextFn()
  }
}

app.prepare().then(async () => {
  await initRedis()

  const server = createServer((req, res) => {
    return handle(req, res)
  })

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  io.use(supabaseSocketAuthMiddleware)

  io.on('connection', async (socket) => {
    const userId = socket.data.userId
    console.log(`Browser socket connected: ${socket.id} (User: ${userId})`)

    // Subscribe to this user's bridge data
    const subHandler = (channel: string, message: string) => {
      try {
        const event = JSON.parse(message)
        socket.emit(event.type, event)
      } catch {
        console.error('Failed to parse event message:', message)
      }
    }

    const localHandler = (event: Record<string, unknown>) => {
      socket.emit(event.type as string, event)
    }

    if (isRedisConnected && redisSubscriber && redisPublisher) {
      const userSubClient = redisSubscriber.duplicate()
      await userSubClient.connect()
      await userSubClient.subscribe(`bridge:${userId}`, (message) => {
        subHandler(`bridge:${userId}`, message)
      })

      socket.on('disconnect', async () => {
        console.log(`Browser socket disconnected: ${socket.id}`)
        await userSubClient.unsubscribe()
        await userSubClient.disconnect()
      })

      // Browser → bridge commands (trades)
      socket.on('open_trade', (cmd) => {
        const payload = JSON.stringify({ type: 'open_trade', userId, ...cmd })
        redisPublisher!.publish(`cmd:${userId}`, payload)
      })

      socket.on('close_trade', (cmd) => {
        const payload = JSON.stringify({ type: 'close_trade', userId, ...cmd })
        redisPublisher!.publish(`cmd:${userId}`, payload)
      })

      socket.on('modify_trade', (cmd) => {
        const payload = JSON.stringify({ type: 'modify_trade', userId, ...cmd })
        redisPublisher!.publish(`cmd:${userId}`, payload)
      })

      socket.on('halt_trading', () => {
        const payload = JSON.stringify({ type: 'halt_trading', userId })
        redisPublisher!.publish(`cmd:${userId}`, payload)
      })
    } else {
      // Connect directly to the FastAPI client websocket relay as fallback
      const fastapiWsUrl = `ws://localhost:8000/ws/client?token=${socket.handshake.auth?.token || ''}`
      console.log(`[OFFLINE] Next.js relay connecting to FastAPI WS: ${fastapiWsUrl}`)
      
      const fastapiWs = new (globalThis as any).WebSocket(fastapiWsUrl)

      fastapiWs.onmessage = (event: any) => {
        try {
          const message = JSON.parse(event.data.toString())
          socket.emit(message.type, message)
        } catch (err: any) {
          console.error('[OFFLINE] Failed to parse relayed message:', err.message)
        }
      }

      fastapiWs.onerror = (err: any) => {
        console.error('[OFFLINE] Relay socket error:', err)
      }

      socket.on('disconnect', () => {
        console.log(`Browser socket disconnected: ${socket.id}`)
        fastapiWs.close()
      })

      // Browser → bridge commands (relay over WebSocket directly)
      socket.on('open_trade', (cmd) => {
        if (fastapiWs.readyState === (globalThis as any).WebSocket.OPEN) {
          fastapiWs.send(JSON.stringify({ type: 'open_trade', userId, ...cmd }))
        }
      })

      socket.on('close_trade', (cmd) => {
        if (fastapiWs.readyState === (globalThis as any).WebSocket.OPEN) {
          fastapiWs.send(JSON.stringify({ type: 'close_trade', userId, ...cmd }))
        }
      })

      socket.on('modify_trade', (cmd) => {
        if (fastapiWs.readyState === (globalThis as any).WebSocket.OPEN) {
          fastapiWs.send(JSON.stringify({ type: 'modify_trade', userId, ...cmd }))
        }
      })

      socket.on('halt_trading', () => {
        if (fastapiWs.readyState === (globalThis as any).WebSocket.OPEN) {
          fastapiWs.send(JSON.stringify({ type: 'halt_trading', userId }))
        }
      })
    }
  })

  // Listen for local pub/sub messages to bridge-server directly in mock setups
  if (!isRedisConnected) {
    // Expose memory bridge publish helper globally or intercept it
    (global as unknown as Record<string, unknown>).localPubSub = localPubSub
  }

  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`)
  })
})
