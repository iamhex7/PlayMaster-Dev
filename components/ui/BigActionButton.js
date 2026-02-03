'use client'

import { motion } from 'framer-motion'

/** 大号主操作按钮（如「我已了解」），用于宣讲页等 */
export function BigActionButton({ children, onClick, disabled, className = '' }) {
  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`px-12 py-4 rounded-xl text-lg font-semibold bg-amber-500/95 hover:bg-amber-400 text-black disabled:opacity-70 disabled:cursor-default transition-all shadow-lg hover:shadow-amber-500/30 ${className}`}
    >
      {children}
    </motion.button>
  )
}
