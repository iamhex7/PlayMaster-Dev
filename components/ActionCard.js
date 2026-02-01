'use client'

import { motion } from 'framer-motion'

/**
 * 动态交互组件集中存放。
 * 用于规则宣讲页、游戏内操作等需要大按钮/卡片交互的场景。
 */

/** 大号主操作按钮（如「我已了解」） */
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

