'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CONTENT = {
  intro: [
    'Welcome to Your-Turn: An AI-Powered Tabletop Pilot developed by FOMO Games.',
    'Our AI Host transforms any physical board game into a seamless digital experience using the power of Gemini 3. No more agonizing over complex rulebooks or sacrificing a player to act as the host.',
  ],
  howItWorks: [
    'Upload & Parse: Simply provide some game rule texts or upload a PDF rulebook. Our AI engine extracts roles, resources, and phases in seconds.',
    'Connect & Join: Create a private room and share the code. Friends join instantly via their mobile browsers—no registration required.',
    'AI Orchestration: The AI Game Master handles role distribution, hidden identities, and game flow. It tracks your resources and even settles rule disputes as a neutral arbiter.',
  ],
  tagline: "Focus on the play, not the paperwork -- it's YOUR TURN to enjoy the game."
}

function triggerHaptic() {
  if (typeof window !== 'undefined' && window.navigator?.vibrate) {
    window.navigator.vibrate(10)
  }
}

export default function HowToPlayModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return
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

  const handleClose = () => {
    triggerHaptic()
    onClose()
  }

  return (
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
            onClick={handleClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-to-play-title"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="fixed inset-4 z-50 flex items-center justify-center p-4 sm:inset-6 md:inset-8"
          >
            <div
              className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-amber-400 bg-emerald-950/80 shadow-2xl backdrop-blur-xl"
              style={{
                boxShadow: '0 0 40px rgba(212, 168, 83, 0.25), 0 25px 50px rgba(0, 0, 0, 0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                <h2
                  id="how-to-play-title"
                  className="mb-6 text-center text-lg font-bold tracking-wide text-amber-400 sm:text-xl"
                >
                  How to Play
                </h2>

                <div className="space-y-4 text-sm leading-relaxed text-gray-200 sm:text-base">
                  {CONTENT.intro.map((p, i) => (
                    <p key={`intro-${i}`} className="text-amber-50/95">
                      {p}
                    </p>
                  ))}

                  <p className="mt-5 font-semibold text-amber-300/90">How it works:</p>
                  <ul className="list-none space-y-3">
                    {CONTENT.howItWorks.map((item, i) => (
                      <li key={`step-${i}`} className="flex gap-3">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        <span className="text-amber-50/95">{item}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-6 font-medium italic text-amber-200/95">
                    {CONTENT.tagline}
                  </p>
                </div>
              </div>

              <div className="shrink-0 border-t border-amber-400/30 bg-emerald-950/60 px-6 py-3 sm:px-8 sm:py-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-fit rounded-lg border-2 border-amber-400 bg-amber-500/20 px-5 py-2 text-sm font-semibold text-amber-100 transition-all hover:bg-amber-500/30 hover:shadow-[0_0_20px_rgba(212,168,83,0.3)] active:scale-[0.98] sm:text-base sm:py-2.5"
                >
                  Got it!
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
