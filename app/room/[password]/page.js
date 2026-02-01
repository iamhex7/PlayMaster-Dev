'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const password = decodeURIComponent(params.password)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!supabase) return

    const channelName = `room:${password}`
    const channel = supabase.channel(channelName)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const onlineCount = Object.keys(state || {}).length
        setCount(onlineCount)
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({
          user_id: crypto.randomUUID(),
          joined_at: new Date().toISOString(),
        })
      })

    return () => {
      channel.untrack().then(() => {
        supabase.removeChannel(channel)
      })
    }
  }, [password])

  const handleBack = () => {
    router.push('/')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-8">
        <p className="text-gray-600">当前房间密码：{password}</p>
        <div>
          <p className="text-6xl font-bold text-blue-600">{count}</p>
          <p className="text-xl text-gray-700 mt-2">当前在线人数</p>
        </div>
        <button
          onClick={handleBack}
          className="mt-8 px-6 py-2 border border-gray-300 rounded hover:bg-gray-50 focus:outline-none"
        >
          返回主页
        </button>
      </div>
    </main>
  )
}
