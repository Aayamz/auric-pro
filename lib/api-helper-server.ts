import { createClient } from 'redis'

export async function getPythonApiUrl(userId?: string): Promise<string> {
  const defaultUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000'
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    return defaultUrl
  }

  try {
    const client = createClient({
      url: redisUrl,
      socket: { connectTimeout: 2000, reconnectStrategy: false }
    })
    client.on('error', () => {})
    await client.connect()
    
    let dynamicUrl = null
    if (userId) {
      dynamicUrl = await client.get(`bridge:url:${userId}`)
    }
    if (!dynamicUrl) {
      dynamicUrl = await client.get('bridge:url:default')
    }
    
    await client.disconnect()
    
    if (dynamicUrl) {
      return dynamicUrl
    }
  } catch (err) {
    console.warn(`[getPythonApiUrl] Redis lookup failed:`, err)
  }

  return defaultUrl
}
