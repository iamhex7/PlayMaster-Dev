'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function countPresenceUsers(presenceState) {
  return Object.keys(presenceState || {}).length
}

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const password = decodeURIComponent(params.password)
  const [onlineCount, setOnlineCount] = useState(0)
  const [userId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (!supabase) return
    const channelName = `room:${password}`
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId,
        },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setOnlineCount(countPresenceUsers(state))
      })
      .on('presence', { event: 'join' }, () => {
        const state = channel.presenceState()
        setOnlineCount(countPresenceUsers(state))
      })
      .on('presence', { event: 'leave' }, () => {
        const state = channel.presenceState()
        setOnlineCount(countPresenceUsers(state))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            joined_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase?.removeChannel(channel)
    }
  }, [password, userId])

  const handleBack = () => {
    router.push('/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-center mb-2">房间</h1>
        <p className="text-gray-600 text-center mb-6">密码: {password}</p>
        <div className="text-center py-4 mb-6 bg-gray-100 rounded">
          <p className="text-3xl font-bold text-blue-600">{onlineCount}</p>
          <p className="text-sm text-gray-500 mt-1">人在线</p>
        </div>
        <button
          onClick={handleBack}
          className="w-full py-2 border border-gray-300 rounded hover:bg-gray-50 focus:outline-none"
        >
          返回主页
        </button>
      </div>
    </main>
  )
}
