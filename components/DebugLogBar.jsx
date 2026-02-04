'use client'

import { useState, useEffect, useRef } from 'react'

/** 全局底部调试字幕条：轮询 /api/debug-logs 展示 terminal 信息 */
export default function DebugLogBar() {
  const [logs, setLogs] = useState([])
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    const fetchLogs = () => {
      fetch('/api/debug-logs?n=80')
        .then((r) => r.json().catch(() => ({ logs: [] })))
        .then((data) => {
          if (Array.isArray(data.logs)) setLogs(data.logs)
        })
        .catch(() => {})
    }
    fetchLogs()
    const id = setInterval(fetchLogs, 800)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (scrollRef.current && expanded) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [logs, expanded])

  if (logs.length === 0) return null

  const latest = logs[logs.length - 1]
  const preview = latest ? `[${latest.tag}] ${String(latest.message).slice(0, 80)}` : ''

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-500/30 bg-black/95 backdrop-blur">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 py-1.5 text-left text-[10px] font-mono text-amber-400/90 hover:bg-amber-500/10 truncate"
      >
        [Terminal] {preview || 'No logs'}
      </button>
      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-40 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-0.5 font-mono text-[10px] text-amber-200/80 bg-black/80"
        >
          {logs.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-amber-600/80 shrink-0">{l.ts?.slice(11, 23)}</span>
              <span className="text-amber-500/90 shrink-0">[{l.tag}]</span>
              <span className="break-all">{l.message}</span>
              {l.meta && <span className="text-amber-700/70">{JSON.stringify(l.meta).slice(0, 60)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
