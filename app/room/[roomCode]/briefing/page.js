'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { BigActionButton, HostStartButton } from '@/components/ActionCard'

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
  const [presenceCount, setPresenceCount] = useState(0)
  const [clientId] = useState(() => (typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36)))
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

  // 初始拉取 + 实时订阅：根据 roomCode 读取 game_config，空则显示加载
  useEffect(() => {
    if (!supabase || !roomCode) return

    const fetchOnce = () => {
      supabase
        .from('rooms')
        .select('game_config, briefing_acks, status')
        .eq('room_code', roomCode)
        .single()
        .then(({ data, error }) => {
          setLoading(false)
          if (data?.game_config && (typeof data.game_config === 'object' || typeof data.game_config === 'string')) {
            const cfg = typeof data.game_config === 'string' ? JSON.parse(data.game_config) : data.game_config
            setGameConfig(cfg)
          }
          if (Array.isArray(data?.briefing_acks)) setBriefingAcks(data.briefing_acks)
          if (data?.status === 'PLAYING') router.replace(`/room/${encodeURIComponent(roomCode)}`)
        })
        .catch(() => setLoading(false))
    }

    fetchOnce()

    const channelName = `room_${roomCode}`
    const channel = supabase.channel(channelName, { config: { presence: { key: clientId } } })

    channel
      .on('presence', { event: 'sync' }, () => {
        setPresenceCount(Object.keys(channel.presenceState() || {}).length)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `room_code=eq.${roomCode}`
      }, (payload) => {
        const newConfig = payload?.new?.game_config
        const newAcks = payload?.new?.briefing_acks
        const newStatus = payload?.new?.status
        if (newConfig) {
          const cfg = typeof newConfig === 'string' ? JSON.parse(newConfig) : newConfig
          setGameConfig(cfg)
        }
        if (Array.isArray(newAcks)) setBriefingAcks(newAcks)
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

  const handleAck = async () => {
    if (acked) return
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'briefingAck', roomCode, clientId, name: `Player-${clientId.slice(0, 8)}` })
      })
      if (res.ok) setAcked(true)
    } catch (_) {}
  }

  const allAcked = presenceCount > 0 && briefingAcks.length >= presenceCount
  const handleStartGame = async () => {
    if (!isHost || !allAcked) return
    if (!supabase) return
    await supabase
      .from('rooms')
      .update({ status: 'PLAYING', updated_at: new Date().toISOString() })
      .eq('room_code', roomCode)
    router.replace(`/room/${encodeURIComponent(roomCode)}`)
  }

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
        {loading && !gameConfig && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-gray-400">
            <p className="text-lg">正在同步 AI 主持人的剧本...</p>
            <span className="mt-2 inline-block w-6 h-6 border-2 border-amber-500/50 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && gameConfig && (
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
                <BigActionButton onClick={handleAck} disabled={acked}>
                  {acked ? '✓ 我已了解' : '我已了解 (I\'m Ready)'}
                </BigActionButton>
                {isHost && (
                  <HostStartButton
                    onClick={handleStartGame}
                    readyCount={briefingAcks.length}
                    totalCount={presenceCount}
                  />
                )}
              </motion.div>
            )}
          </>
        )}

        {!loading && !gameConfig && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-gray-400">
            <p className="text-lg">暂无规则内容，请房主在 Host Console 提交规则后刷新。</p>
          </div>
        )}
      </div>
    </main>
  )
}
