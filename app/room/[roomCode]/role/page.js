'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

export default function RoleRevealPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = decodeURIComponent(params.roomCode ?? '')
  const [roleInfo, setRoleInfo] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [clientId, setClientId] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = sessionStorage.getItem('playmaster_client_id') || ''
    setClientId(id)
  }, [])

  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!roomCode) return
    if (!clientId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getMyRole', roomCode, clientId })
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return
        setLoading(false)
        if (data.error) {
          setError(data.error)
          if (data.error === 'Player data not found' && retryCount < 3) {
            setTimeout(() => setRetryCount((c) => c + 1), 2000)
          }
          return
        }
        setError(null)
        setRoleInfo(data.role_info ?? {})
        setInventory(data.inventory ?? {})
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false)
          setError('无法加载身份')
        }
      })
    return () => { cancelled = true }
  }, [roomCode, clientId, retryCount])

  const cards = Array.isArray(roleInfo?.cards) ? roleInfo.cards : []
  const hasRevealed = flipped

  const fetchMyRole = () => {
    if (!roomCode || !clientId) return
    setLoading(true)
    setError(null)
    fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getMyRole', roomCode, clientId })
    })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => {
        setLoading(false)
        if (data.error) {
          setError(data.error)
          return
        }
        setError(null)
        setRoleInfo(data.role_info ?? {})
        setInventory(data.inventory ?? {})
      })
      .catch(() => { setLoading(false); setError('无法加载身份') })
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6 relative"
      style={{
        background: 'linear-gradient(135deg, #0f1419 0%, #1a2f24 40%, #0f1419 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center">
        {loading && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-400">
            <p className="text-lg">正在获取你的身份...</p>
            <span className="mt-4 inline-block w-8 h-8 border-2 border-amber-500/50 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && !clientId && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-6 text-center">
            <p className="text-amber-200/90">请先进入简报页确认身份后再查看手牌。</p>
            <button
              onClick={() => router.push(`/room/${encodeURIComponent(roomCode)}/briefing`)}
              className="mt-4 px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm"
            >
              前往简报
            </button>
          </div>
        )}

        {error && !loading && clientId && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-6 text-center">
            <p className="text-red-300">{error}</p>
            <p className="text-sm text-gray-500 mt-2">
              请从宣讲页进入并完成「我已了解」；若刚完成确认，请稍候几秒（页面会自动重试）。
            </p>
            <button
              onClick={() => { setRetryCount((c) => c + 1); setLoading(true); setError(null) }}
              className="mt-4 px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm"
            >
              重试获取身份
            </button>
            <button
              onClick={() => router.push(`/room/${encodeURIComponent(roomCode)}/briefing`)}
              className="mt-2 block w-full py-2 text-gray-400 hover:text-gray-300 text-sm"
            >
              返回宣讲页
            </button>
          </div>
        )}

        {!loading && !error && clientId && roleInfo !== null && (
          <>
            <h1 className="text-2xl font-semibold text-amber-400/95 tracking-wider mb-8 text-center">
              你的身份
            </h1>
            <motion.div
              className="w-full max-w-sm cursor-pointer perspective-1000"
              style={{ perspective: '1000px' }}
              onClick={() => !hasRevealed && setFlipped(true)}
            >
              <AnimatePresence mode="wait">
                {!hasRevealed ? (
                  <motion.div
                    key="back"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, rotateY: -90 }}
                    transition={{ duration: 0.25 }}
                    className="game-card rounded-2xl p-8 flex flex-col items-center justify-center min-h-[280px] border-2 border-amber-500/50 shadow-xl"
                  >
                    <div className="text-amber-600/80 text-sm uppercase tracking-[0.3em] mb-4">
                      Secret
                    </div>
                    <p className="text-amber-500/90 text-lg font-medium mb-2">点击翻牌</p>
                    <p className="text-gray-500 text-sm">揭开你的身份</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="front"
                    initial={{ opacity: 0, scale: 0.9, rotateY: 90 }}
                    animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                    transition={{ duration: 0.35 }}
                    className="rounded-2xl p-8 min-h-[280px] border-2 border-amber-500/50 bg-gradient-to-b from-amber-950/80 to-amber-900/60 shadow-xl"
                  >
                    {cards.length === 0 ? (
                      <div className="space-y-4">
                        <p className="text-amber-200/90 text-center">暂无手牌数据</p>
                        {Object.keys(inventory || {}).length > 0 && (
                          <div className="pt-2 border-t border-amber-500/20">
                            <p className="text-amber-500/80 text-xs uppercase tracking-wider mb-1">初始资源</p>
                            <p className="text-amber-200/80 text-sm">
                              {Object.entries(inventory)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {cards.map((card, i) => (
                          <div key={i} className="border-b border-amber-500/20 pb-4 last:border-0 last:pb-0">
                            <h2 className="text-xl font-bold text-amber-300 tracking-wide">
                              {card.roleName ?? '未知角色'}
                            </h2>
                            {card.skill_summary && (
                              <p className="text-amber-200/80 text-sm mt-2 leading-relaxed">
                                {card.skill_summary}
                              </p>
                            )}
                          </div>
                        ))}
                        {Object.keys(inventory || {}).length > 0 && (
                          <div className="pt-2">
                            <p className="text-amber-500/80 text-xs uppercase tracking-wider mb-1">初始资源</p>
                            <p className="text-amber-200/80 text-sm">
                              {Object.entries(inventory)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={fetchMyRole}
                disabled={loading}
                className="px-5 py-2 rounded-lg border border-amber-500/50 text-amber-300 hover:bg-amber-500/20 text-sm disabled:opacity-50"
              >
                刷新身份
              </button>
              {hasRevealed && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  onClick={() => router.push(`/room/${encodeURIComponent(roomCode)}`)}
                  className="px-8 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium"
                >
                  返回房间
                </motion.button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
