'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { BigActionButton } from '@/components/ActionCard'

/** 规则卡片：Card 风格，用于 Resources / Phases / Win Condition */
function RuleCard({ title, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="rounded-xl border border-amber-500/30 bg-black/30 backdrop-blur-sm p-5 text-left"
    >
      <h3 className="text-amber-400/95 font-semibold text-sm uppercase tracking-wider mb-3">{title}</h3>
      <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
    </motion.div>
  )
}

export default function BriefingPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = decodeURIComponent(params.roomCode ?? '')
  const [gameConfig, setGameConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openingDisplayed, setOpeningDisplayed] = useState('')
  const [typewriterDone, setTypewriterDone] = useState(false)
  const [acked, setAcked] = useState(false)
  const [briefingAcks, setBriefingAcks] = useState([])
  const [roomId, setRoomId] = useState(null)
  const [playersCount, setPlayersCount] = useState(0)
  const [roomStatus, setRoomStatus] = useState('BRIEFING')
  const [clientId] = useState(() => {
    if (typeof window === 'undefined') return ''
    const key = 'playmaster_client_id'
    const stored = sessionStorage.getItem(key)
    if (stored) return stored
    const id = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36)
    sessionStorage.setItem(key, id)
    return id
  })
  const isHost = typeof window !== 'undefined' && localStorage.getItem('playmaster_host') === roomCode

  const openingSpeech = gameConfig?.opening_speech ?? gameConfig?.announcement_script ?? ''

  // 打字机效果：仅对 opening_speech
  useEffect(() => {
    setOpeningDisplayed('')
    setTypewriterDone(false)
    if (!openingSpeech) return
    let i = 0
    const interval = setInterval(() => {
      if (i < openingSpeech.length) {
        setOpeningDisplayed(openingSpeech.slice(0, i + 1))
        i++
      } else {
        setTypewriterDone(true)
        clearInterval(interval)
      }
    }, 40)
    return () => clearInterval(interval)
  }, [openingSpeech])

  // 进入宣讲页时注册到 players 表（若直接链接到宣讲页）
  useEffect(() => {
    if (!roomCode || !clientId) return
    fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'registerPlayer', roomCode, clientId })
    }).catch(() => {})
  }, [roomCode, clientId])

  // 初始拉取 + 实时订阅：room（game_config, briefing_acks, status, id）+ players 数量
  useEffect(() => {
    if (!supabase || !roomCode) return

    const fetchRoom = () => {
      supabase
        .from('rooms')
        .select('id, game_config, briefing_acks, status, player_count')
        .eq('room_code', roomCode)
        .single()
        .then(({ data, error }) => {
          setLoading(false)
          if (data?.id) setRoomId(data.id)
          if (data?.status) setRoomStatus(data.status)
          if (typeof data?.player_count === 'number') setPlayersCount(data.player_count)
          if (data?.game_config && (typeof data.game_config === 'object' || typeof data.game_config === 'string')) {
            const cfg = typeof data.game_config === 'string' ? JSON.parse(data.game_config) : data.game_config
            setGameConfig(cfg)
          }
          if (Array.isArray(data?.briefing_acks)) setBriefingAcks(data.briefing_acks)
          if (data?.status === 'ROLE_REVEAL') router.replace(`/room/${encodeURIComponent(roomCode)}/role`)
          if (data?.status === 'PLAYING') router.replace(`/room/${encodeURIComponent(roomCode)}`)
        })
        .catch(() => setLoading(false))
    }

    fetchRoom()

    const channelName = `room_${roomCode}`
    const channel = supabase.channel(channelName, { config: { presence: { key: clientId } } })

    channel
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `room_code=eq.${roomCode}`
      }, (payload) => {
        const newConfig = payload?.new?.game_config
        const newAcks = payload?.new?.briefing_acks
        const newStatus = payload?.new?.status
        const newPlayerCount = typeof payload?.new?.player_count === 'number' ? payload.new.player_count : null
        if (newConfig) {
          const cfg = typeof newConfig === 'string' ? JSON.parse(newConfig) : newConfig
          setGameConfig(cfg)
        }
        if (Array.isArray(newAcks)) setBriefingAcks(newAcks)
        if (newStatus) setRoomStatus(newStatus)
        if (newPlayerCount !== null) setPlayersCount(newPlayerCount)
        if (newStatus === 'ROLE_REVEAL') router.replace(`/room/${encodeURIComponent(roomCode)}/role`)
        if (newStatus === 'PLAYING') router.replace(`/room/${encodeURIComponent(roomCode)}`)
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({
          online_at: new Date().toISOString(),
          name: `Player ${Math.floor(Math.random() * 1000)}`,
          isHost
        })
      })

    return () => {
      channel.untrack().then(() => supabase.removeChannel(channel))
    }
  }, [roomCode, clientId, isHost, router])

  // 根据 room_id 拉取并订阅 players 表，实时更新 playersCount
  useEffect(() => {
    if (!supabase || !roomId) return

    const fetchCount = () => {
      supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .then(({ count }) => {
          if (typeof count === 'number') setPlayersCount(count)
        })
    }

    fetchCount()

    const channel = supabase
      .channel(`players_${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => fetchCount()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, roomId])

  const handleAck = async () => {
    if (acked) return
    const name = `Player-${clientId.slice(0, 8)}`
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'briefingAck', roomCode, clientId, name })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setAcked(true)
        // 乐观更新：立即把当前用户加入确认列表，不依赖 Realtime 推送（解决「已确认 0/1 人」不跳动）
        if (Array.isArray(data?.briefing_acks)) {
          setBriefingAcks(data.briefing_acks)
        } else {
          setBriefingAcks((prev) => {
            if (prev.some((a) => a?.clientId === clientId || a?.playerId === clientId)) return prev
            return [...prev, { playerId: clientId, clientId, name, at: new Date().toISOString() }]
          })
        }
      }
    } catch (_) {}
  }

  const allAcked = playersCount > 0 && briefingAcks.length >= playersCount
  const [initializing, setInitializing] = useState(false)
  const [initError, setInitError] = useState(null)
  const autoTriggeredRef = useRef(false)

  const runInitializeGame = async () => {
    if (initializing || autoTriggeredRef.current) return
    setInitializing(true)
    setInitError(null)
    autoTriggeredRef.current = true
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initializeGame', roomCode, clientId, isHost: true })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInitError(data.error || '初始化失败')
        autoTriggeredRef.current = false
        return
      }
      router.replace(`/room/${encodeURIComponent(roomCode)}/role`)
    } catch (_) {
      setInitError('网络错误')
      autoTriggeredRef.current = false
    } finally {
      setInitializing(false)
    }
  }

  // 全员就绪时由房主端自动调用 initializeGame（不依赖按钮点击）
  useEffect(() => {
    if (!isHost || !roomCode || !clientId) return
    if (allAcked && !initializing && !autoTriggeredRef.current) {
      runInitializeGame()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger when allAcked flips true
  }, [allAcked, isHost, roomCode, clientId])

  // 轮询后备：全员确认或已进入分发中时定期拉取 status，确保每个人在 status 变为 ROLE_REVEAL 时都能自动跳转
  useEffect(() => {
    if (!supabase || !roomCode) return
    if (!allAcked && roomStatus !== 'ASSIGNING_ROLES') return
    const poll = () => {
      supabase
        .from('rooms')
        .select('status, briefing_acks, player_count')
        .eq('room_code', roomCode)
        .single()
        .then(({ data }) => {
          if (data?.status === 'ROLE_REVEAL') {
            router.replace(`/room/${encodeURIComponent(roomCode)}/role`)
            return
          }
          if (data?.status === 'ASSIGNING_ROLES') setRoomStatus('ASSIGNING_ROLES')
          if (Array.isArray(data?.briefing_acks)) setBriefingAcks(data.briefing_acks)
          if (typeof data?.player_count === 'number') setPlayersCount(data.player_count)
          if (isHost && !autoTriggeredRef.current) {
            const acks = Array.isArray(data?.briefing_acks) ? data.briefing_acks : []
            const pCount = typeof data?.player_count === 'number' ? data.player_count : 0
            if (acks.length >= pCount && pCount > 0) runInitializeGame()
          }
        })
        .catch(() => {})
    }
    const t = setInterval(poll, 1500)
    poll()
    return () => clearInterval(t)
  }, [supabase, roomCode, allAcked, roomStatus, isHost, router])

  const resourcesText = gameConfig?.resources ?? ''
  const phasesContent = gameConfig?.phases
  const phasesText = Array.isArray(phasesContent)
    ? phasesContent.map((p, i) => (typeof p === 'string' ? p : `阶段 ${i + 1}: ${JSON.stringify(p)}`)).join('\n\n')
    : (typeof phasesContent === 'string' ? phasesContent : '')
  const winConditionText = gameConfig?.win_condition ?? ''

  return (
    <main
      className="min-h-screen flex flex-col items-center p-6 pb-20 relative overflow-x-hidden overflow-y-auto"
      style={{
        background: 'linear-gradient(135deg, #0f1419 0%, #1a2f24 40%, #0f1419 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="relative z-10 w-full max-w-2xl mx-auto">
        {(roomStatus === 'ASSIGNING_ROLES' || initializing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[70vh] gap-6"
          >
            <span className="inline-block w-12 h-12 border-4 border-amber-500/60 border-t-transparent rounded-full animate-spin" />
            <h2 className="text-xl font-semibold text-amber-400/95">角色分发中</h2>
            <p className="text-sm text-gray-400">AI 正在分配身份卡，请稍候...</p>
          </motion.div>
        )}

        {!loading && !gameConfig && !(roomStatus === 'ASSIGNING_ROLES' || initializing) && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-gray-400">
            <p className="text-lg">暂无规则内容，请房主在 Host Console 提交规则后刷新。</p>
          </div>
        )}

        {loading && !gameConfig && !(roomStatus === 'ASSIGNING_ROLES' || initializing) && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-gray-400">
            <p className="text-lg">正在同步 AI 主持人的剧本...</p>
            <span className="mt-2 inline-block w-6 h-6 border-2 border-amber-500/50 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && gameConfig && roomStatus !== 'ASSIGNING_ROLES' && !initializing && (
          <>
            <h1
              className="text-3xl md:text-4xl font-bold text-amber-400 tracking-wider mb-6 text-center"
              style={{ fontFamily: 'serif' }}
            >
              {gameConfig.game_name || '游戏规则'}
            </h1>

            <section className="mb-8">
              <h2 className="text-amber-400/90 font-semibold text-sm uppercase tracking-wider mb-3">开场白</h2>
              <p className="text-xl text-gray-100 leading-relaxed">
                {openingDisplayed}
                {!typewriterDone && <span className="inline-block w-0.5 h-6 bg-amber-400/90 ml-0.5 animate-pulse align-middle" />}
              </p>
            </section>

            <div className="grid gap-4 mb-10">
              {resourcesText && (
                <RuleCard title="初始设定 (Resources)" delay={0.1}>
                  {resourcesText}
                </RuleCard>
              )}
              {phasesText && (
                <RuleCard title="阶段流程 (Phases)" delay={0.2}>
                  {phasesText}
                </RuleCard>
              )}
              {winConditionText && (
                <RuleCard title="获胜条件 (Win Condition)" delay={0.3}>
                  {winConditionText}
                </RuleCard>
              )}
            </div>

            {typewriterDone && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-col items-center gap-6 fixed bottom-6 left-0 right-0"
              >
                <BigActionButton onClick={handleAck} disabled={acked || initializing}>
                  {acked ? '✓ 我已了解' : '我已了解 (I\'m Ready)'}
                </BigActionButton>
                {/* 实时确认计数：Supabase Realtime 订阅 rooms.briefing_acks 与 players 表数量 */}
                <p className="text-sm text-gray-400">
                  已确认 {briefingAcks.length} / {Math.max(playersCount, briefingAcks.length, 1)} 人
                </p>
                {initError && (
                  <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-center">
                    <p className="text-red-300 text-sm">{initError}</p>
                    <p className="text-gray-500 text-xs mt-1">请检查人数是否在规则范围内，或稍后重试。</p>
                  </div>
                )}
                {initializing && (
                  <div className="flex flex-col items-center gap-2 text-amber-400/90">
                    <span className="inline-block w-6 h-6 border-2 border-amber-500/50 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">AI 正在分发身份卡...</span>
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
