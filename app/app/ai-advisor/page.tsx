'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, Bot, User, Brain, Loader2 } from 'lucide-react'

interface Message { id: string; role: 'user' | 'assistant'; content: string; ts: number }

let msgCounter = 0

export default function AiAdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState('live_market')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    setMessages([{
      id: '1',
      role: 'assistant',
      content: `I'm AURIC AI — your intelligent trading co-pilot specialising in gold markets. I can analyse current price action, explain setups from the signals dashboard, critique your risk configuration, and help you refine strategies.\n\nAsk me anything: *"What's the current market structure for XAUUSD?"*, *"Review my last 5 trades"*, or *"Should I scale in here?"*`,
      ts: Date.now()
    }])
  }, [])

  const { data: contextData } = useQuery({
    queryKey: ['ai-context'],
    queryFn: async () => {
      const res = await fetch('/api/ai/context')
      return res.json()
    }
  })

  const { data: quickActions = [] } = useQuery<string[]>({
    queryKey: ['ai-quick-actions'],
    queryFn: async () => {
      const r = await fetch('/api/ai/quick-actions')
      return r.json()
    }
  })

  const sendMessage = async (msgText?: string) => {
    const text = msgText ?? input.trim()
    if (!text || loading) return
    setInput('')

    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    const userMsg: Message = { id: `user-${++msgCounter}`, role: 'user', content: text, ts: now }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, context, context_data: contextData })
      })
      const data = await res.json()
      // eslint-disable-next-line react-hooks/purity
      const asstMsg: Message = { id: `asst-${++msgCounter}`, role: 'assistant', content: data.reply, ts: Date.now() }
      setMessages(prev => [...prev, asstMsg])
    } catch {
      setMessages(prev => [...prev, { id: `err-${++msgCounter}`, role: 'assistant', content: 'An error occurred. Please try again.', ts: Date.now() }])
    } finally {
      setLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const defaultActions = [
    'Analyse current XAUUSD market structure',
    'What is the highest-confidence setup right now?',
    'Review my risk configuration and suggest improvements',
    'Summarise recent signal performance',
    'Should I be trading during the current session?'
  ]
  const actions = quickActions.length > 0 ? quickActions : defaultActions

  const renderMessageContent = (content: string) => {
    const parts = content.split(/(\*[^*]+\*|`[^`]+`|\n)/g)
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
        return <em key={i} className="not-italic text-ink font-semibold">{part.slice(1, -1)}</em>
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
        return <code key={i} className="bg-canvas-soft-2 px-xxs rounded-xs font-mono text-xs text-ink">{part.slice(1, -1)}</code>
      if (part === '\n') return <br key={i} />
      return part
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-132px)]">
      <div className="flex flex-col h-full bg-canvas border border-hairline rounded-md shadow-level-3 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-sm justify-between items-start sm:items-center p-md border-b border-hairline shrink-0">
          <div className="flex items-center gap-sm">
            <div className="w-[32px] h-[32px] rounded-full bg-primary flex items-center justify-center shrink-0">
              <Brain className="w-sm h-sm text-on-primary" />
            </div>
            <div>
              <h3 className="font-sans text-body-sm font-semibold text-ink leading-none">AURIC AI</h3>
              <span className="font-mono text-[9px] text-success uppercase">Online • Claude 3.5 Sonnet</span>
            </div>
          </div>
          <div className="flex items-center gap-sm w-full sm:w-auto justify-between sm:justify-end">
            <label className="font-mono text-caption-mono text-mute mr-xxs">Context:</label>
            <select value={context} onChange={e => setContext(e.target.value)} className="form-input-sm focus:outline-none">
              <option value="live_market">Live Market</option>
              <option value="recent_trades">Recent Trades</option>
              <option value="strategy_review">Strategy Review</option>
              <option value="risk_assessment">Risk Assessment</option>
            </select>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-md py-xs border-b border-hairline flex gap-xs overflow-x-auto shrink-0 bg-canvas-soft">
          {actions.slice(0, 5).map((action, i) => (
            <button key={i} onClick={() => sendMessage(action)}
              className="shrink-0 px-sm py-xxs bg-canvas border border-hairline rounded-pill text-caption text-body-text hover:bg-primary hover:text-on-primary hover:border-primary transition-all font-sans whitespace-nowrap">
              {action}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-md space-y-md">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-sm ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'assistant' ? 'bg-primary' : 'bg-canvas-soft-2 border border-hairline'
              }`}>
                {msg.role === 'assistant' ? <Bot className="w-xxs h-xxs text-on-primary" /> : <User className="w-xxs h-xxs text-body-text" />}
              </div>
              <div className={`max-w-[75%] rounded-md px-sm py-xs shadow-level-1 font-sans text-body-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-on-primary rounded-tr-none'
                  : 'bg-canvas-soft border border-hairline text-body-text rounded-tl-none'
              }`}>
                {renderMessageContent(msg.content)}
                <div className={`font-mono text-[9px] mt-xxs ${msg.role === 'user' ? 'text-on-primary/60 text-right' : 'text-mute'}`}>
                  {new Date(msg.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-sm">
              <div className="w-[28px] h-[28px] rounded-full bg-primary flex items-center justify-center shrink-0">
                <Bot className="w-xxs h-xxs text-on-primary" />
              </div>
              <div className="bg-canvas-soft border border-hairline rounded-md rounded-tl-none px-sm py-xs shadow-level-1 flex items-center gap-xs">
                <Loader2 className="w-xs h-xs text-mute animate-spin" />
                <span className="font-sans text-caption text-mute">Analysing…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-md border-t border-hairline shrink-0">
          <div className="flex gap-sm items-end border border-hairline rounded-md p-xs bg-canvas-soft focus-within:border-primary transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask AURIC AI… (Shift+Enter for new line)"
              className="flex-1 bg-transparent resize-none font-sans text-body-sm text-ink placeholder:text-mute focus:outline-none min-h-[24px]"
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              className="w-[36px] h-[36px] rounded-sm bg-primary text-on-primary flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0">
              <Send className="w-xs h-xs" />
            </button>
          </div>
          <p className="font-mono text-[9px] text-mute mt-xxs text-center">AI responses are for informational purposes. Not financial advice.</p>
        </div>
      </div>
    </div>
  )
}
