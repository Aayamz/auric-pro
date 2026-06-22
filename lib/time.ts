/**
 * AURIC PRO — Indian Standard Time (IST) Utility
 * IST = UTC+5:30
 */

const IST_LOCALE = 'en-IN'
const IST_TZ = 'Asia/Kolkata'

/**
 * Format a date to IST time string (e.g., "03:45 AM IST")
 */
export function formatIST(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return d.toLocaleString(IST_LOCALE, {
    timeZone: IST_TZ,
    ...options,
  })
}

/**
 * Format just the time in IST (e.g., "03:45 AM")
 */
export function formatISTTime(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return d.toLocaleTimeString(IST_LOCALE, {
    timeZone: IST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  })
}

/**
 * Format just the date in IST (e.g., "22 Jun")
 */
export function formatISTDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return d.toLocaleDateString(IST_LOCALE, {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'short',
    ...options,
  })
}

/**
 * Format date + time in IST (e.g., "22 Jun, 03:45 AM")
 */
export function formatISTDateTime(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return d.toLocaleString(IST_LOCALE, {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  })
}

/**
 * Get current IST time as a Date object
 */
export function nowIST(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }))
}

/**
 * Get current IST time as an ISO string
 */
export function nowISOIST(): string {
  return new Date().toISOString()
}

/**
 * Format a unix timestamp (seconds or ms) to IST time
 */
export function formatUnixIST(ts: number): string {
  // Auto-detect if in seconds or ms
  const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
  return formatISTTime(d)
}

export { IST_LOCALE, IST_TZ }
