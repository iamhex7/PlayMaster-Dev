'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Users, Play, Upload, RotateCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AnnouncementView from '@/components/AnnouncementView'

const ACCEPTED_FILE_TYPES = '.docx,.pdf,.png'
const ACCEPTED_EXTENSIONS = ['docx', 'pdf', 'png']

async function syncRulesToSupabase(roomCode, rulesText, rulesFileName) {
  if (!supabase) return
  try {
    await supabase.from('rooms').upsert(
      {
        room_code: roomCode,
        rules_text: rulesText || null,
        rules_file_name: rulesFileName || null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'room_code' }
    )
  } catch (_) {}
}

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = decodeURIComponent(params.roomCode ?? '')
  const [count, setCount] = useState(0)
  const [players, setPlayers] = useState([])
  const [copied, setCopied] = useState(false)
  const [inputCode, setInputCode] = useState('')
  const [showHostConsole, setShowHostConsole] = useState(false)
  const [rulesText, setRulesText] = useState('')
  const [rulesFileName, setRulesFileName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [roomStatus, setRoomStatus] = useState('LOBBY')
  const [gameConfig, setGameConfig] = useState(null)
  const [briefingAcks, setBriefingAcks] = useState([])
  const [playerCount, setPlayerCount] = useState(0)
  const roleAssignmentTriggeredRef = useRef(false)
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

  useEffect(() => {
    if (!supabase || !roomCode || !clientId) return
    fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'enterRoom', roomCode })
    })
      .then((res) => res.json().catch(() => ({})))
      .then(() => {})
      .catch(() => {})
    fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'registerPlayer', roomCode, clientId })
    }).catch(() => {})
  }, [roomCode, clientId])

  useEffect(() => {
    if (!supabase) return
    const channelName = `room_${roomCode}`
    const channel = supabase.channel(channelName, { config: { presence: { key: clientId } } })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const presenceList = Object.entries(state || {}).map(([key, value]) => ({
          id: key,
          isSelf: key === clientId,
          ...value[0]
        }))
        setPlayers(presenceList)
        setCount(presenceList.length)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `room_code=eq.${roomCode}`
      }, (payload) => {
        const newStatus = payload?.new?.status
        const newConfig = payload?.new?.game_config
        const newAcks = Array.isArray(payload?.new?.briefing_acks) ? payload.new.briefing_acks : []
        const newPlayerCount = typeof payload?.new?.player_count === 'number' ? payload.new.player_count : 0
        setBriefingAcks(newAcks)
        setPlayerCount(newPlayerCount)
        if (newConfig) setGameConfig(newConfig)
        setRoomStatus(newStatus || roomStatus)

        if (newStatus === 'BRIEFING') {
          if (newAcks.length >= newPlayerCount && newPlayerCount > 0 && isHost && !roleAssignmentTriggeredRef.current) {
            roleAssignmentTriggeredRef.current = true
            fetch('/api/game', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'initializeGame', roomCode, clientId, isHost: true })
            })
              .then((res) => {
                if (!res.ok) roleAssignmentTriggeredRef.current = false
                return res.json().catch(() => ({}))
              })
              .catch(() => { roleAssignmentTriggeredRef.current = false })
          }
          router.push(`/room/${encodeURIComponent(roomCode)}/briefing`)
        }
        if (newStatus === 'ASSIGNING_ROLES') {
          setRoomStatus('ASSIGNING_ROLES')
          router.push(`/room/${encodeURIComponent(roomCode)}/briefing`)
        }
        if (newStatus === 'ROLE_REVEAL') {
          setRoomStatus('ROLE_REVEAL')
          router.push(`/room/${encodeURIComponent(roomCode)}/role`)
        }
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

  useEffect(() => {
    if (!supabase || !roomCode) return
    supabase
      .from('rooms')
      .select('status, game_config, briefing_acks, player_count')
      .eq('room_code', roomCode)
      .single()
      .then(({ data }) => {
        if (data?.status === 'ROLE_REVEAL') {
          setRoomStatus('ROLE_REVEAL')
          router.push(`/room/${encodeURIComponent(roomCode)}/role`)
          return
        }
        if (data?.status === 'ASSIGNING_ROLES') {
          setRoomStatus('ASSIGNING_ROLES')
          router.push(`/room/${encodeURIComponent(roomCode)}/briefing`)
          return
        }
        if (data?.status === 'BRIEFING' && data?.game_config) {
          setRoomStatus('BRIEFING')
          setGameConfig(data.game_config)
          const acks = Array.isArray(data?.briefing_acks) ? data.briefing_acks : []
          const pCount = typeof data?.player_count === 'number' ? data.player_count : 0
          if (Array.isArray(data?.briefing_acks)) setBriefingAcks(data.briefing_acks)
          if (typeof data?.player_count === 'number') setPlayerCount(data.player_count)
          if (acks.length >= pCount && pCount > 0 && typeof isHost !== 'undefined' && isHost && !roleAssignmentTriggeredRef.current) {
            roleAssignmentTriggeredRef.current = true
            fetch('/api/game', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'initializeGame', roomCode, clientId, isHost: true })
            }).then((res) => { if (!res.ok) roleAssignmentTriggeredRef.current = false }).catch(() => { roleAssignmentTriggeredRef.current = false })
          }
          router.push(`/room/${encodeURIComponent(roomCode)}/briefing`)
        }
      })
      .catch(() => {})
  }, [roomCode, router, isHost, clientId])

  const handleLeave = () => {
    if (typeof window !== 'undefined' && localStorage.getItem('playmaster_host') === roomCode) {
      localStorage.removeItem('playmaster_host')
    }
    router.push('/')
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleJoinAnotherRoom = (e) => {
    e.preventDefault()
    const code = inputCode.trim().toUpperCase()
    if (code.length === 6 && code !== roomCode) {
      if (typeof window !== 'undefined' && localStorage.getItem('playmaster_host') === roomCode) {
        localStorage.removeItem('playmaster_host')
      }
      router.push(`/room/${encodeURIComponent(code)}`)
    }
  }

  const handleGameStart = () => {
    if (isHost) setShowHostConsole(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext && ACCEPTED_EXTENSIONS.includes(ext)) {
      setRulesFileName(file.name)
      syncRulesToSupabase(roomCode, rulesText, file.name)
    }
    e.target.value = ''
  }

  const handleRulesTextChange = (e) => {
    const val = e.target.value
    setRulesText(val)
    if (val.trim()) syncRulesToSupabase(roomCode, val, rulesFileName)
  }

  const handleYourTurn = async () => {
    const hasText = rulesText.trim().length > 0
    if (!hasText) {
      alert('请先输入或粘贴游戏规则，或上传 PDF')
      return
    }

    setIsProcessing(true)
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parseRules', roomCode, rulesText: rulesText.trim() })
      })
      const data = await res.json().catch(() => {})

      if (!res.ok) {
        alert(data.error || '规则解析失败')
        return
      }

      setRoomStatus('BRIEFING')
      setGameConfig(data.game_config ?? null)
      setShowHostConsole(false)
      router.push(`/room/${encodeURIComponent(roomCode)}/briefing`)
    } catch (e) {
      console.error('[Room] 规则解析失败:', e?.message || e)
      alert('规则解析失败：' + (e?.message || '网络错误'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAnnouncementContinue = () => {
    setRoomStatus('LOBBY')
    setGameConfig(null)
  }

  const formattedCode = roomCode.split('').join(' ')
  const showAnnouncement = roomStatus === 'BRIEFING' && gameConfig

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{
        backgroundImage: 'linear-gradient(135deg, #1a2f24 0%, #2d4a3e 40%, #1e3a2e 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#2d4a3e'
      }}
    >
      <button
        onClick={handleLeave}
        className="absolute top-6 left-6 px-4 py-2 rounded-lg bg-black/30 text-gray-300 hover:bg-black/50 transition-colors text-sm border border-white/10 z-40"
      >
        Leave Lobby
      </button>

      <AnimatePresence mode="wait">
        {showAnnouncement ? (
          <AnnouncementView
            key="announcement"
            announcementScript={gameConfig.opening_speech ?? gameConfig.announcement_script}
            gameName={gameConfig.game_name}
            onContinue={handleAnnouncementContinue}
          />
        ) : !showHostConsole ? (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="lobby-panel w-full max-w-lg p-8"
          >
            <h2 className="text-2xl font-light text-casino-gold-light text-center mb-6 tracking-[0.3em] uppercase">
              Game Lobby
            </h2>

            <div className="room-code-box p-6 mb-6">
              <p className="text-xs text-gray-400 uppercase tracking-widest text-center mb-3">Room Code</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl font-bold text-white tracking-[0.4em] font-mono">
                  {formattedCode}
                </span>
                <button
                  onClick={copyToClipboard}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                  title="Copy code"
                >
                  <Copy className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                {copied ? 'Copied!' : 'Share this code with other players'}
              </p>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Users className="w-4 h-4" />
                <span>{count} Players</span>
              </div>
              <span className="text-sm text-gray-500">{count} / {count} Ready</span>
            </div>

            <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
              {players.map((player, index) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        index === 0 ? 'bg-gradient-to-br from-orange-400 to-orange-600' : 'bg-gradient-to-br from-blue-400 to-blue-600'
                      }`}
                    >
                      <span className="text-white text-xs font-bold">{index === 0 ? 'H' : index + 1}</span>
                    </div>
                    <span className="text-gray-200">
                      {player.isSelf ? (isHost ? 'You (Host)' : 'You') : (player.name || `Player ${index + 1}`)}
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
                    JOINED
                  </span>
                </motion.div>
              ))}
            </div>

            <form onSubmit={handleJoinAnotherRoom} className="mb-6">
              <p className="text-xs text-gray-500 text-center mb-3">Or join another room</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ENTER CODE"
                  className="casino-input flex-1 text-sm py-2"
                  maxLength={6}
                />
                <button
                  type="submit"
                  disabled={inputCode.length !== 6}
                  className="btn-gold px-6 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  JOIN
                </button>
              </div>
            </form>

            <button
              onClick={handleGameStart}
              className="w-full btn-gold py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <Play className="w-4 h-4" />
              GAME START
            </button>

            <p className="mt-4 text-xs text-gray-500 text-center">Waiting for all players to be ready...</p>
          </motion.div>
        ) : (
          <motion.div
            key="host-console"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="lobby-panel w-full max-w-lg p-8"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-white tracking-wider">HOST CONSOLE</h2>
                <p className="text-sm text-gray-500 mt-1">Dealing Roles</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <Users className="w-4 h-4" />
                  <span>{count}/{count}</span>
                </div>
                <div className="live-badge flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                  <span className="live-dot" />
                  <span className="text-emerald-400 text-xs font-medium">LIVE</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-6 max-h-40 overflow-y-auto">
              {players.map((player, index) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-500/30 flex items-center justify-center text-gray-400 text-xs font-medium">
                      {index + 1}
                    </div>
                    <span className="text-gray-200 text-sm">
                      {player.isSelf ? (isHost ? 'You (Host)' : 'You') : (player.name || `Player ${index + 1}`)}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">
                    DEALT
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="mb-6 space-y-3">
              <p className="text-xs text-gray-500">请上传或输入游戏规则，让 AI 主持人开始学习</p>
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/5 border border-dashed border-gray-500/30 cursor-pointer hover:bg-white/10 transition-colors">
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-400">{rulesFileName || '上传 .docx / .pdf / .png'}</span>
                  <input
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <textarea
                  value={rulesText}
                  onChange={handleRulesTextChange}
                  placeholder="或直接输入游戏规则..."
                  className="w-full min-h-[80px] px-4 py-3 rounded-lg bg-white/5 border border-gray-500/20 text-gray-200 text-sm placeholder-gray-500 resize-none focus:outline-none focus:border-amber-500/50"
                  rows={3}
                />
              </div>
            </div>

            <button
              onClick={handleYourTurn}
              disabled={isProcessing}
              className="w-full btn-gold py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-wait"
            >
              {isProcessing ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  解析规则中...
                </>
              ) : (
                <>YOUR TURN</>
              )}
            </button>

            <button
              onClick={() => setShowHostConsole(false)}
              className="mt-3 w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Back to Lobby
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
