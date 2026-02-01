'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

const SAMPLES = [
  { id: 'DEEPSEA', name: 'Deep Sea Panic', tag: 'Survival', players: '1-5', description: 'Manage your dying oxygen and patch the leaks in a claustrophobic submarine, but watch your back—a saboteur hides among the crew.' },
  { id: 'NEONHEIST', gameId: 'neon-heist', name: 'Neon Heist', tag: 'Roleplay', players: '3-5', description: "Coordinate a high-tech team to infiltrate a megacorp's vault and crack the code before the security drones lock down the sector." },
  { id: 'WITCHFEAST', name: "Witch's Feast", tag: 'Party', players: '1-6', description: 'Identify the poisoner at a royal banquet through social deduction and secret ingredient trades before the third course seals your fate.' },
]

function triggerHaptic() {
  if (typeof window !== 'undefined' && window.navigator?.vibrate) {
    window.navigator.vibrate(10)
  }
}

export default function SampleGamesFlip({ isOpen, onClose }) {
  const router = useRouter()
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setIsExiting(false)
      return
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const handleEnterGame = async (sample) => {
    triggerHaptic()
    if (sample.gameId === 'neon-heist') {
      const roomCode = generateRoomCode()
      if (typeof window !== 'undefined') {
        localStorage.setItem('playmaster_host', roomCode)
        localStorage.setItem('playmaster_sample_game_' + roomCode, 'neon-heist')
      }
      setIsExiting(true)
      try {
        const res = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'enterRoom', roomCode })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setIsExiting(false)
          alert(data.error || '创建房间失败')
          return
        }
        setTimeout(() => {
          router.push(`/room/${encodeURIComponent(roomCode)}`)
        }, 380)
      } catch (e) {
        setIsExiting(false)
        alert('创建房间失败：' + (e?.message || '网络错误'))
      }
      return
    }
    setIsExiting(true)
    const roomSlug = `SAMPLE-${sample.id}`
    setTimeout(() => {
      router.push(`/room/${encodeURIComponent(roomSlug)}`)
    }, 380)
  }

  return (
    <>
      <AnimatePresence>
        {isExiting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[60] bg-emerald-950"
            aria-hidden
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            role="presentation"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-games-title"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            className="fixed inset-4 z-50 flex items-center justify-center p-4 sm:inset-6 md:inset-8"
          >
            <div
              className="relative flex w-full max-w-4xl flex-col items-center justify-center"
              style={{ perspective: '1200px' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 3D flip card container */}
              <motion.div
                initial={{ rotateY: 0 }}
                animate={{ rotateY: 180 }}
                transition={{ type: 'spring', damping: 22, stiffness: 180, delay: 0.05 }}
                className="relative h-[420px] w-full max-w-3xl sm:h-[380px] md:h-[340px]"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Front face: "SAMPLE GAMES" card look */}
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-amber-400 bg-emerald-950/90 shadow-[0_0_40px_rgba(212,168,83,0.2)] backdrop-blur-xl"
                  style={{
                    backfaceVisibility: 'hidden',
                    boxShadow: '0 0 15px rgba(251,191,36,0.4), 0 25px 50px rgba(0,0,0,0.5)',
                  }}
                >
                  <span className="text-xl font-semibold uppercase tracking-wide text-amber-400/90 sm:text-2xl">
                    SAMPLE GAMES
                  </span>
                </div>

                {/* Back face: three game cards */}
                <div
                  className="absolute inset-0 flex flex-col gap-4 overflow-y-auto rounded-2xl border-2 border-amber-400 bg-emerald-950/90 p-4 backdrop-blur-xl md:flex-row md:items-stretch md:justify-center md:overflow-hidden md:gap-5 md:p-6"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    boxShadow: '0 0 15px rgba(251,191,36,0.4), 0 25px 50px rgba(0,0,0,0.5)',
                  }}
                >
                  {SAMPLES.map((sample, i) => (
                    <motion.div
                      key={sample.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
                      className="flex min-w-0 flex-1 flex-col rounded-xl border-2 border-amber-400/80 bg-emerald-900/60 p-4 shadow-[0_0_15px_rgba(251,191,36,0.2)]"
                    >
                      <h3 className="mb-2 text-base font-bold text-amber-200 sm:text-lg">
                        {sample.name}
                      </h3>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                          {sample.tag}
                        </span>
                        <span className="inline-block rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                          {sample.players} players
                        </span>
                      </div>
                      <p className="mb-3 flex-1 text-xs leading-relaxed text-amber-100/85 sm:text-sm">
                        {sample.description}
                      </p>
                      <div className="mt-auto pt-2">
                        <button
                          type="button"
                          onClick={() => handleEnterGame(sample)}
                          className="enter-game-btn w-full rounded-lg border border-amber-400 bg-amber-500/25 px-3 py-2 text-xs font-semibold text-amber-100 transition-all hover:bg-amber-500/40 hover:shadow-[0_0_15px_rgba(251,191,36,0.4)] active:scale-[0.98] sm:text-sm"
                        >
                          ENTER GAME
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border-2 border-amber-400 bg-amber-500/20 px-5 py-2 text-sm font-semibold text-amber-100 transition-all hover:bg-amber-500/30 hover:shadow-[0_0_15px_rgba(251,191,36,0.4)] active:scale-[0.98]"
                >
                  Back
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  )
}
