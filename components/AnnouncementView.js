'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Fullscreen announcement view: dark overlay, centered typewriter text from announcement_script.
 * Looks like a separate "new page".
 */
const toStr = (v) => (v != null && typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))

export default function AnnouncementView({ announcementScript = '', gameName = '', onContinue }) {
  const [displayedText, setDisplayedText] = useState('')
  const [done, setDone] = useState(false)
  const script = toStr(announcementScript)
  const name = toStr(gameName)
  const text = script || `欢迎来到《${name}》。`

  useEffect(() => {
    setDisplayedText('')
    setDone(false)
    let i = 0
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + 1))
        i++
      } else {
        setDone(true)
        clearInterval(interval)
      }
    }, 40)
    return () => clearInterval(interval)
  }, [text])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-6"
    >
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/30" />

      <div className="relative z-10 max-w-3xl w-full text-center">
        {name && (
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl md:text-4xl font-bold text-amber-400/90 tracking-wider mb-8"
            style={{ fontFamily: 'serif' }}
          >
            {name}
          </motion.h1>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="min-h-[120px] flex items-center justify-center"
        >
          <p className="text-xl md:text-2xl text-gray-100 leading-relaxed">
            {displayedText}
            {!done && <span className="inline-block w-0.5 h-6 bg-amber-400/90 ml-0.5 animate-pulse" />}
          </p>
        </motion.div>

        {done && onContinue && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12"
          >
            <button
              onClick={onContinue}
              className="px-8 py-3 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-black font-semibold text-lg transition-colors"
            >
              CONTINUE
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
