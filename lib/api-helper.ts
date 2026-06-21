export const getBaseApiUrl = (): string => {
  // Use Vercel env variable if defined, otherwise default to local FastAPI endpoint
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/client'
  
  return wsUrl
    .replace(/^ws:\/\//i, 'http://')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/\/ws\/client\/?$/i, '')
}
