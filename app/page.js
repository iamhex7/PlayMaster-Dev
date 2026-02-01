'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Users, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function GameCard({ title, onClick, delay = 0 }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ 
        y: -12, 
        scale: 1.03,
        boxShadow: '0 0 40px rgba(212, 168, 83, 0.6), 0 25px 50px rgba(0, 0, 0, 0.5)'
      }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="game-card w-44 h-64 flex items-center justify-center cursor-pointer"
    >
      <span className="text-base font-semibold text-[#5a4a3a] tracking-wide text-center px-4 leading-tight uppercase">
        {title}
      </span>
    </motion.button>
  )
}

function LobbyPanel({ roomCode, onJoin, onClose, onlineCount, onStartGame }) {
  const [inputCode, setInputCode] = useState('')
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleJoin = () => {
    const code = inputCode.trim().toUpperCase()
    if (code.length === 6) {
      onJoin(code)
    }
  }

  // Format room code with spaces
  const formattedCode = roomCode.split('').join(' ')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotateY: -90 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5 }}
      className="lobby-panel w-full max-w-lg p-8"
    >
      <h2 className="text-2xl font-light text-casino-gold-light text-center mb-6 tracking-[0.3em] uppercase">
        Game Lobby
      </h2>
      
      {/* Room Code Section */}
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

      {/* Players Section */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Users className="w-4 h-4" />
          <span>{onlineCount} Players</span>
        </div>
        <span className="text-sm text-gray-500">{onlineCount} / {onlineCount} Ready</span>
      </div>

      {/* Player List */}
      <div className="space-y-2 mb-6 max-h-40 overflow-y-auto">
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">H</span>
            </div>
            <span className="text-gray-200">You (Host)</span>
          </div>
          <span className="px-3 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            READY
          </span>
        </div>
      </div>

      {/* Join Another Room */}
      <div className="border-t border-white/10 pt-6">
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
            onClick={handleJoin}
            disabled={inputCode.length !== 6}
            className="btn-gold px-6 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            JOIN
          </button>
        </div>
      </div>

      {/* Start Game Button */}
      <button
        className="mt-6 w-full btn-gold py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold"
      >
        <Play className="w-4 h-4" />
        START GAME
      </button>

      <button
        onClick={onClose}
        className="mt-4 w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        ← Back to Menu
      </button>
    </motion.div>
  )
}

export default function Home() {
  const router = useRouter()
  const [showLobby, setShowLobby] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [onlineCount, setOnlineCount] = useState(1)

  useEffect(() => {
    if (!showLobby || !roomCode || !supabase) return

    const channelName = `lobby_${roomCode}`
    const channel = supabase.channel(channelName)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setOnlineCount(Object.keys(state || {}).length)
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({ online_at: new Date().toISOString() })
      })

    return () => {
      channel.untrack().then(() => {
        supabase.removeChannel(channel)
      })
    }
  }, [showLobby, roomCode])

  const handleStartAIHost = () => {
    const code = generateRoomCode()
    setRoomCode(code)
    setShowLobby(true)
  }

  const handleJoinRoom = (code) => {
    router.push(`/room/${encodeURIComponent(code)}`)
  }

  const handleCloseLobby = () => {
    setShowLobby(false)
    setRoomCode('')
  }

  return (
    <main 
      className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{ 
        backgroundImage: 'url(/casino-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#2d4a3e'
      }}
    >
      {/* Fallback gradient if no image */}
      <div className="absolute inset-0 casino-bg opacity-50" style={{ display: 'none' }} />

      <div className="relative z-10 flex flex-col items-center">
        {!showLobby && (
          <>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-gray-300/80 mb-10 tracking-[0.3em] text-sm uppercase"
            >
              Pick a Mode
            </motion.p>

            <div className="flex items-center justify-center gap-6">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <GameCard 
                  title="HOW TO PLAY" 
                  onClick={() => {}} 
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <GameCard 
                  title="START AI HOST" 
                  onClick={handleStartAIHost}
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <GameCard 
                  title="VIEW PAST GAMES" 
                  onClick={() => {}} 
                />
              </motion.div>
            </div>
          </>
        )}

        <AnimatePresence>
          {showLobby && (
            <LobbyPanel
              roomCode={roomCode}
              onJoin={handleJoinRoom}
              onClose={handleCloseLobby}
              onlineCount={onlineCount}
              onStartGame={handleJoinRoom}
            />
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
