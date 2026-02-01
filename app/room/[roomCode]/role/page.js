'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import InGameView from '@/components/game/InGameView'
import ActionCard from '@/components/game/ActionCard'
import DebugPanel from '@/components/game/DebugPanel'
import { supabase } from '@/lib/supabase'

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
  const [showInGame, setShowInGame] = useState(false)
  const [realGameState, setRealGameState] = useState(null)
  const [gameStateLoading, setGameStateLoading] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = sessionStorage.getItem('playmaster_client_id') || ''
    setClientId(id)
  }, [])

  const [retryCount, setRetryCount] = useState(0)

  const fetchGameState = useCallback(async () => {
    if (!roomCode) return null
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getGameState', roomCode })
    })
    const data = await res.json().catch(() => ({}))
    if (data.error) return null
    setRealGameState(data.game_state ?? {})
    return data.game_state
  }, [roomCode])

  useEffect(() => {
    if (!showInGame || !roomCode) return
    setGameStateLoading(true)
    fetchGameState().then((gs) => {
      setGameStateLoading(false)
      if (!gs) return
      const initialized = gs.initialized === true
      const hasPending = gs.current_pending_action && gs.current_pending_action.target_uid
      if (initialized && !hasPending && !bootstrapped) {
        setBootstrapped(true)
        fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submitEvent', roomCode, lastEvent: { type: 'GAME_START' } })
        })
          .then((r) => r.json())
          .then(() => {
            let pollCount = 0
            const poll = () => {
              pollCount++
              fetchGameState()
              if (pollCount < 5) setTimeout(poll, 2000)
            }
            setTimeout(poll, 1500)
          })
      }
    })
  }, [showInGame, roomCode, fetchGameState, bootstrapped])

  useEffect(() => {
    if (!showInGame || !roomCode || !supabase) return
    const channel = supabase
      .channel(`room_game_state_${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `room_code=eq.${roomCode}`
        },
        (payload) => {
          const gs = payload?.new?.game_state
          if (gs && typeof gs === 'object') setRealGameState(gs)
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [showInGame, roomCode])

  const gameStateForView = realGameState
    ? {
        game_name: realGameState.game_name ?? '霓虹劫案',
        current_phase: realGameState.phase ?? realGameState.current_phase ?? '—',
        current_day_round: realGameState.current_day_round ?? 1,
        in_game_time: realGameState.in_game_time ?? '深夜 02:00',
        active_player: realGameState.active_player ?? '',
        game_logs: Array.isArray(realGameState.logs) ? realGameState.logs : (Array.isArray(realGameState.game_logs) ? realGameState.game_logs : [])
      }
    : null

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

  const pendingAction = realGameState?.current_pending_action
  const pendingForMe =
    pendingAction &&
    String(pendingAction.target_uid) === String(clientId)
      ? { type: pendingAction.type, ...(pendingAction.params || {}) }
      : null

  const handleActionComplete = (payload) => {
    const isConfirm = pendingForMe?.type === 'CONFIRM'
    const eventType = isConfirm && payload?.confirmed === true ? 'CONFIRM_YES' : isConfirm && payload?.confirmed === false ? 'CONFIRM_NO' : 'PLAYER_ACTION'
    const eventPayload = { ...payload, action_code: pendingForMe?.action_code }
    fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submitEvent',
        roomCode,
        lastEvent: { type: eventType, uid: clientId, payload: eventPayload }
      })
    })
      .then((r) => r.json())
      .then(() => {
        setTimeout(() => fetchGameState(), 800)
      })
  }

  if (showInGame && clientId) {
    return (
      <>
        <InGameView
          gameState={gameStateForView ?? {}}
          myRole={roleInfo ?? {}}
          myInventory={inventory ?? {}}
          clientId={clientId}
          onBack={() => setShowInGame(false)}
        >
          {pendingForMe && (
            <AnimatePresence>
              <ActionCard
                key={pendingForMe.type + (pendingForMe.title || '')}
                pending_action={pendingForMe}
                onComplete={handleActionComplete}
                onClose={() => fetchGameState()}
              />
            </AnimatePresence>
          )}
        </InGameView>
        <DebugPanel roomCode={roomCode} clientId={clientId} />
      </>
    )
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
            {hasRevealed && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={() => setShowInGame(true)}
                className="mt-6 px-10 py-3.5 rounded-xl font-semibold text-black tracking-wide border-2 border-amber-400 bg-[#D4AF37] hover:bg-amber-300 shadow-[0_0_25px_rgba(212,168,83,0.4)] hover:shadow-[0_0_35px_rgba(212,168,83,0.5)] transition-all"
              >
                继续 (Continue)
              </motion.button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
