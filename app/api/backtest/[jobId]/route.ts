import { NextRequest, NextResponse } from 'next/server'

// Shared in-memory job store — in production, replace with Redis
// This module is imported by the run route too. For now we re-export from the same module.
// The job store needs to be persistent across requests in the same Node.js process.
// Next.js App Router keeps module-level state for the server process lifetime.
declare global {
  var __backtestJobs: Record<string, { status: string; progress: number; result: Record<string, unknown> | null }> | undefined
}
const jobs = (global.__backtestJobs ??= {})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const job = jobs[jobId]
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json(job)
}
