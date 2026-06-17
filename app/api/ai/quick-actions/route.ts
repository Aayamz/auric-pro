import { NextResponse } from 'next/server'

export async function GET() {
  // Quick actions tailored to gold trading context
  return NextResponse.json([
    'Analyse current XAUUSD market structure',
    'What is the highest-confidence setup right now?',
    'Review my risk configuration and suggest improvements',
    'Summarise recent signal performance',
    'Should I be trading during the current session?'
  ])
}
