'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [password, setPassword] = useState('')
  const router = useRouter()

  const handleEnter = (e) => {
    e.preventDefault()
    const trimmed = password.trim()
    if (trimmed) {
      router.push(`/room/${encodeURIComponent(trimmed)}`)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-center mb-6">PlayMaster</h1>
        <form onSubmit={handleEnter} className="space-y-4">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入房间密码"
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            进入房间
          </button>
        </form>
      </div>
    </main>
  )
}
