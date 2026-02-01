'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function GameCard({ title, onClick, isCenter, delay = 0 }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ 
        y: -15, 
        scale: 1.05,
        boxShadow: '0 0 30px rgba(212, 168, 83, 0.5), 0 20px 40px rgba(0, 0, 0, 0.4)'
      }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`game-card relative w-48 h-72 flex items-center justify-center cursor-pointer transition-all ${isCenter ? 'z-10' : ''}`}
    >
      <span className="text-lg font-semibold text-[#5a4a3a] tracking-wide text-center px-4">
        {title}
      </span>
    </motion.button>
  )
}

function LobbyPanel({ roomCode, onJoin, onClose, onlineCount }) {
  const [inputCode, setInputCode] = useState('')

  const handleJoin = () => {
    const code = inputCode.trim().toUpperCase()
    if (code.length === 6) {
      onJoin(code)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(roomCode)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotateY: 90 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.8, rotateY: -90 }}
      transition={{ duration: 0.5 }}
      className="glass-panel w-full max-w-md p-8"
    >
      <h2 className="text-2xl font-bold text-casino-gold-light text-center mb-2 tracking-widest">
        GAME LOBBY
      </h2>
      
      <div className="mt-6 text-center">
        <p className="text-sm text-gray-400 uppercase tracking-wider mb-2">Room Code</p>
        <div className="flex items-center justify-center gap-3">
          <span className="room-code">{roomCode}</span>
          <button 
            onClick={copyToClipboard}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Copy code"
          >
            <svg className="w-5 h-5 text-casino-gold-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Share this code with other players</p>
      </div>

      <div className="mt-6 flex items-center justify-between text-sm text-gray-400">
        <span>Players in Lobby</span>
        <span className="text-casino-gold-light font-semibold">{onlineCount}</span>
      </div>

      <div className="mt-8 pt-6 border-t border-white/10">
        <p className="text-sm text-gray-400 text-center mb-3">Or join another room</p>
        <input
          type="text"
          value={inputCode}
          onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="ENTER CODE"
          className="casino-input w-full mb-4"
          maxLength={6}
        />
        <div className="flex gap-3">
          <button
            onClick={handleJoin}
            disabled={inputCode.length !== 6}
            className="flex-1 btn-gold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            JOIN ROOM
          </button>
          <button
            onClick={() => onJoin(roomCode)}
            className="flex-1 py-3 rounded-lg bg-white/10 text-[#f5f0e1] hover:bg-white/20 transition-colors"
          >
            START GAME
          </button>
        </div>
      </div>

      <button
        onClick={onClose}
        className="mt-6 w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        Back to Menu
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
    <main className="casino-bg min-h-screen flex flex-col items-center justify-center p-4">
      <motion.h1
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-bold text-casino-gold-light mb-4 tracking-widest"
      >
        PLAYMASTER
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-gray-400 mb-12 tracking-wider"
      >
        PICK A MODE
      </motion.p>

      <AnimatePresence mode="wait">
        {!showLobby ? (
          <motion.div
            key="cards"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center justify-center gap-6"
          >
            <GameCard 
              title="HOW TO PLAY" 
              onClick={() => {}} 
              delay={0.1}
            />
            <GameCard 
              title="START AI HOST" 
              onClick={handleStartAIHost} 
              isCenter 
              delay={0.2}
            />
            <GameCard 
              title="VIEW PAST GAMES" 
              onClick={() => {}} 
              delay={0.3}
            />
          </motion.div>
        ) : (
          <LobbyPanel
            key="lobby"
            roomCode={roomCode}
            onJoin={handleJoinRoom}
            onClose={handleCloseLobby}
            onlineCount={onlineCount}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
