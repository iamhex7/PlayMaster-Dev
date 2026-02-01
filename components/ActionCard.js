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

/** 房主专用：进入游戏按钮（所有人已确认后显示） */
export function HostStartButton({ onClick, disabled, readyCount, totalCount }) {
  return (
    <div className="text-sm text-gray-400">
      {totalCount > 0 && readyCount >= totalCount
        ? (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={onClick}
            className="px-8 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            所有人已了解 · 进入游戏
          </motion.button>
          )
        : (
          <span>已确认 {readyCount} / {totalCount} 人</span>
          )}
    </div>
  )
}
