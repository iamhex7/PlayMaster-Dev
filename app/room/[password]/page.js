'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Copy, Users, UserPlus, Play } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomCode = decodeURIComponent(params.password)
  const [count, setCount] = useState(0)
  const [players, setPlayers] = useState([])
  const [copied, setCopied] = useState(false)

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
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Format room code with spaces
  const formattedCode = roomCode.split('').join(' ')

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
      {/* Leave Lobby Button */}
      <button
        onClick={handleLeave}
        className="absolute top-6 left-6 px-4 py-2 rounded-lg bg-black/30 text-gray-300 hover:bg-black/50 transition-colors text-sm border border-white/10"
      >
        Leave Lobby
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
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
            <span>{count} Players</span>
          </div>
          <span className="text-sm text-gray-500">{count} / {count} Ready</span>
        </div>

        {/* Player List */}
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
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  index === 0 
                    ? 'bg-gradient-to-br from-orange-400 to-orange-600' 
                    : index % 2 === 0 
                      ? 'bg-gradient-to-br from-orange-400 to-orange-600'
                      : 'bg-gradient-to-br from-blue-400 to-blue-600'
                }`}>
                  <span className="text-white text-xs font-bold">
                    {index === 0 ? 'H' : (index + 1)}
                  </span>
                </div>
                <span className="text-gray-200">
                  {index === 0 ? 'You (Host)' : player.name || `Player ${index + 1}`}
                </span>
              </div>
              <span className={`px-3 py-1 rounded text-xs font-medium ${
                index % 2 === 0
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
              }`}>
                {index % 2 === 0 ? 'READY' : 'JOINED'}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-4">
          <button
            className="flex-1 btn-gold py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold"
          >
            <Play className="w-4 h-4" />
            DEAL ROLES
          </button>
          <button
            className="flex-1 py-3 rounded-lg bg-slate-700/50 text-gray-300 hover:bg-slate-600/50 transition-colors flex items-center justify-center gap-2 text-sm border border-slate-600/50"
          >
            <UserPlus className="w-4 h-4" />
            INVITE PLAYERS
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Waiting for all players to be ready...
        </p>
      </motion.div>
    </main>
  )
}
