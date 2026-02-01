'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = decodeURIComponent(params.password)
  const [count, setCount] = useState(0)
  const [players, setPlayers] = useState([])

  useEffect(() => {
    if (!supabase) return

    const channelName = `room_${roomCode}`
    const channel = supabase.channel(channelName)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const presenceList = Object.entries(state || {}).map(([key, value]) => ({
          id: key,
          ...value[0]
        }))
        setPlayers(presenceList)
        setCount(presenceList.length)
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({ 
          online_at: new Date().toISOString(),
          name: `Player ${Math.floor(Math.random() * 1000)}`
        })
      })

    return () => {
      channel.untrack().then(() => {
        supabase.removeChannel(channel)
      })
    }
  }, [roomCode])

  const handleLeave = () => {
    router.push('/')
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(roomCode)
  }

  return (
    <main className="casino-bg min-h-screen flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
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

        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-gray-400 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {count} Players
          </span>
          <span className="text-casino-gold-light">{count} / {count} Ready</span>
        </div>

        <div className="mt-4 max-h-48 overflow-y-auto space-y-2">
          {players.map((player, index) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center justify-between p-3 rounded-lg bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold">
                  {index === 0 ? 'H' : (index + 1)}
                </div>
                <span className="text-[#f5f0e1]">
                  {index === 0 ? 'You (Host)' : player.name || `Player ${index + 1}`}
                </span>
              </div>
              <span className="px-3 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                READY
              </span>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <button
            className="flex-1 btn-gold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            DEAL ROLES
          </button>
          <button
            className="flex-1 py-3 rounded-lg bg-white/10 text-[#f5f0e1] hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            INVITE PLAYERS
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          Waiting for all players to be ready...
        </p>

        <button
          onClick={handleLeave}
          className="mt-6 w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Leave Lobby
        </button>
      </motion.div>
    </main>
  )
}
