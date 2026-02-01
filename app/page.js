'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

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

export default function Home() {
  const router = useRouter()

  const handleStartAIHost = () => {
    const code = generateRoomCode()
    if (typeof window !== 'undefined') {
      localStorage.setItem('playmaster_host', code)
    }
    router.push(`/room/${encodeURIComponent(code)}`)
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
      <div className="relative z-10 flex flex-col items-center">
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
            <GameCard title="HOW TO PLAY" onClick={() => {}} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <GameCard title="START AI HOST" onClick={handleStartAIHost} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <GameCard title="VIEW PAST GAMES" onClick={() => {}} />
          </motion.div>
        </div>
      </div>
    </main>
  )
}
