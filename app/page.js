'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import HowToPlayModal from '@/components/HowToPlayModal'
import SampleGamesFlip from '@/components/SampleGamesFlip'

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
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, type: 'spring', stiffness: 100 }}
      className="relative"
    >
      <motion.button
        whileHover={{ y: -5 }}
        transition={{ duration: 0.06, ease: 'easeOut' }}
        whileTap={{ scale: 0.98, transition: { duration: 0.02 } }}
        onClick={onClick}
        className="relative group w-full"
        style={{ perspective: 1000 }}
      >
      {/* Contact shadow on felt - soft, grounded on table */}
      <div
        className="absolute inset-0 rounded-xl opacity-50 transition-opacity duration-75 group-hover:opacity-65"
        style={{
          background: 'radial-gradient(ellipse 80% 40% at 50% 100%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 45%, transparent 75%)',
          transform: 'translateY(10px) scaleX(1.02)',
          zIndex: -1,
          filter: 'blur(6px)',
        }}
      />
      {/* Secondary soft shadow for depth on felt */}
      <div
        className="absolute inset-0 rounded-xl -z-10"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, transparent 65%)',
          transform: 'translateY(8px) scale(1.05)',
          filter: 'blur(10px)',
        }}
      />
      
      {/* Card thickness (edge on table) */}
      <div
        className="absolute left-0.5 right-0.5 h-full rounded-xl bg-gradient-to-b from-slate-300 to-slate-500 -z-10"
        style={{
          transform: 'translateY(3px)',
          filter: 'blur(0.5px)',
        }}
      />
      
      {/* Main card - smaller, like physical cards on table; hover = outer + inner glow */}
      <div
        className="relative rounded-xl overflow-hidden w-28 h-40 sm:w-32 sm:h-44 transition-shadow duration-75 shadow-[0_4px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] group-hover:shadow-[0_0_24px_rgba(251,191,36,0.4),0_0_48px_rgba(255,236,179,0.12),0_4px_12px_rgba(0,0,0,0.25)]"
      >
        {/* Hover: soft inner glow */}
        <div 
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-75"
          style={{
            background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(255,236,179,0.18) 0%, transparent 65%)',
            boxShadow: 'inset 0 0 25px rgba(255,228,181,0.2)',
          }}
        />
        {/* Triple gold borders */}
        <div 
          className="absolute inset-0 rounded-xl border-2 border-amber-600/60 transition-all duration-75 group-hover:border-amber-400/90 group-hover:shadow-[0_0_12px_rgba(251,191,36,0.3)]"
          style={{
            boxShadow: 'inset 0 0 20px rgba(217, 119, 6, 0.25)',
          }}
        />
        <div className="absolute inset-[4px] rounded-xl border border-amber-700/40 transition-all duration-75 group-hover:border-amber-600/60" />
        <div className="absolute inset-[7px] rounded-xl border border-slate-700/30" />
        
        {/* Inner gold frame (内圈金色边) */}
        <div 
          className="absolute inset-3 rounded-lg border border-amber-500/70 transition-all duration-75 group-hover:border-amber-400/90"
          style={{ boxShadow: 'inset 0 0 8px rgba(217, 119, 6, 0.12)' }}
        />
        
        {/* Light gold background - subtle sacred feel, not pure white */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-100/95 via-amber-50/90 to-yellow-100/90" />
        
        {/* Paper texture */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                0deg,
                transparent,
                transparent 2px,
                rgba(0,0,0,0.01) 2px,
                rgba(0,0,0,0.01) 4px
              ),
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 2px,
                rgba(0,0,0,0.01) 2px,
                rgba(0,0,0,0.01) 4px
              )
            `,
            filter: 'contrast(1.2)'
          }}
        />
        
        {/* Noise texture */}
        <div
          className="absolute inset-0 opacity-20 mix-blend-overlay"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
          }}
        />
        
        {/* Subtle corner ornament (gold) */}
        <div 
          className="absolute inset-3 rounded-lg pointer-events-none opacity-40 transition-opacity duration-75 group-hover:opacity-55"
          style={{
            backgroundImage: `
              linear-gradient(135deg, rgba(217,119,6,0.25) 0%, transparent 20%),
              linear-gradient(225deg, rgba(217,119,6,0.25) 0%, transparent 20%),
              linear-gradient(315deg, rgba(217,119,6,0.25) 0%, transparent 20%),
              linear-gradient(45deg, rgba(217,119,6,0.25) 0%, transparent 20%)
            `,
          }}
        />
        {/* Fine inner frame line (lighter gold) */}
        <div className="absolute inset-4 rounded-md border border-amber-400/30" />
        
        {/* Content */}
        <div className="relative h-full flex items-center justify-center p-2.5 sm:p-3">
          <span className="text-[9px] sm:text-[10px] font-light text-amber-900/90 tracking-widest text-center uppercase leading-tight transition-all duration-75 group-hover:text-amber-800 group-hover:drop-shadow-[0_0_8px_rgba(255,236,179,0.6)]">
            {title}
          </span>
        </div>
        
        {/* Edge highlights - subtle for tabletop feel; brighter on hover */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none transition-all duration-100"
          style={{
            boxShadow: 'inset 0 -4px 10px rgba(0,0,0,0.08), inset 0 4px 10px rgba(255,255,255,0.22)'
          }}
        />
      </div>
      </motion.button>
    </motion.div>
  )
}

export default function Home() {
  const router = useRouter()
  const [howToPlayOpen, setHowToPlayOpen] = useState(false)
  const [sampleGamesOpen, setSampleGamesOpen] = useState(false)

  const handleStartAIHost = async () => {
    const code = generateRoomCode()
    // 生成 clientId 用于标识 host
    const hostClientId = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36)
    if (typeof window !== 'undefined') {
      localStorage.setItem('yourturn_host', code)
      sessionStorage.setItem('yourturn_client_id', hostClientId)
    }
    try {
      const res = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enterRoom', roomCode: code, hostClientId })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Failed to create room')
        return
      }
      router.push(`/room/${encodeURIComponent(code)}`)
    } catch (e) {
      console.error('[Home] 房间创建失败:', e?.message || e)
      alert('Failed to create room: ' + (e?.message || 'Network error'))
    }
  }

  return (
    <main 
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ 
        backgroundImage: 'url(/game-table-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundColor: '#2d4a3e'
      }}
    >
      <div className="relative z-10 flex flex-col items-center">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-amber-100/90 mb-6 tracking-[0.25em] text-xs uppercase font-light"
        >
          Pick a Mode
        </motion.p>

        <div className="flex items-center justify-center gap-7 sm:gap-9">
          <GameCard title="PLAYER GUIDE" onClick={() => setHowToPlayOpen(true)} delay={0.1} />
          <GameCard title="START AI GAME" onClick={handleStartAIHost} delay={0.2} />
          <GameCard title="SAMPLE GAMES" onClick={() => setSampleGamesOpen(true)} delay={0.3} />
        </div>
      </div>

      <HowToPlayModal isOpen={howToPlayOpen} onClose={() => setHowToPlayOpen(false)} />
      <SampleGamesFlip isOpen={sampleGamesOpen} onClose={() => setSampleGamesOpen(false)} />
    </main>
  )
}
