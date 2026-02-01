'use client'

import { motion } from 'framer-motion'

const GOLD = '#D4AF37'
const PANEL =
  'bg-black/40 backdrop-blur-xl border border-amber-400/25 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(212,168,83,0.08)]'

const PROP_ICONS = {
  credits: '💰',
  coins: '🪙',
  neural_link: '🧠',
  action_points: '⚡',
  cans: '🥫',
  wood: '🪵',
  罐头: '🥫',
  木材: '🪵',
  信用点: '💰',
  行动力: '⚡'
}

function getPropIcon(key) {
  return PROP_ICONS[key] ?? '📦'
}

/**
 * InGameView：Dashboard 布局，左/右信息面板 + 中央交互/等待区
 * @param {object} gameState
 * @param {object} myRole
 * @param {object} myInventory
 * @param {string} clientId
 * @param {function} onBack
 * @param {React.ReactNode} children - 可选，渲染在中央（如 ActionCard 或自定义操作区）
 */
export default function InGameView({ gameState = {}, myRole = {}, myInventory = {}, clientId = '', onBack, children }) {
  const gameName = gameState.game_name ?? '游戏进行中'
  const currentPhase = gameState.current_phase ?? '—'
  const dayRound = gameState.current_day_round ?? 1
  const inGameTime = gameState.in_game_time ?? '深夜 02:00'
  const activePlayer = gameState.active_player ?? ''
  const gameLogs = Array.isArray(gameState.game_logs) ? gameState.game_logs : []
  const recentLogs = gameLogs.slice(-3).reverse()

  const isMyTurn = activePlayer && String(activePlayer) === String(clientId)
  const cards = Array.isArray(myRole?.cards) ? myRole.cards : []

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #050805 0%, #0a0f0a 25%, #080c08 50%, #0a0f0a 75%, #050805 100%)',
        color: GOLD
      }}
    >
      {/* iPad 风格外框：圆角 + 深色描边 + 柔和阴影 */}
      <div className="w-full max-w-5xl rounded-[2rem] overflow-hidden border-2 border-amber-500/20 shadow-[0_0_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(212,168,83,0.1)] bg-black/20">
        {/* 顶部状态栏：紧凑 */}
        <header className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-amber-400/15 bg-black/30">
          <div className="text-xs md:text-sm font-medium text-amber-400/80 tracking-widest">
            第 {dayRound} 天 / 轮
          </div>
          <h1 className="text-lg md:text-xl font-bold text-amber-300/95 tracking-wider">
            {gameName}
          </h1>
          <div className="text-xs md:text-sm font-medium text-emerald-400/80 tracking-widest">
            {inGameTime}
          </div>
        </header>

        {/* 三栏 Dashboard：左 | 中 | 右 */}
        <div className="grid grid-cols-[1fr] md:grid-cols-[200px_1fr_200px] lg:grid-cols-[220px_1fr_220px] min-h-[480px]">
          {/* 左侧：我的角色 + 剩余物资 */}
          <aside className="flex flex-col gap-3 p-3 md:p-4 border-r border-amber-400/10 bg-black/20 order-2 md:order-1">
            <section className={`p-3 rounded-xl ${PANEL}`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">我的角色</p>
              {cards.length === 0 ? (
                <p className="text-gray-500 text-xs">—</p>
              ) : (
                <div className="space-y-2">
                  {cards.map((card, i) => (
                    <div key={i} className="rounded-lg border border-amber-400/15 bg-amber-950/20 p-2">
                      <p className="text-xs font-semibold text-amber-200/95 truncate">{card.roleName ?? '未知'}</p>
                      {card.skill_summary && (
                        <p className="text-[10px] text-amber-200/60 mt-0.5 line-clamp-2">{card.skill_summary}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className={`p-3 rounded-xl ${PANEL}`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">剩余物资</p>
              {!myInventory || Object.keys(myInventory).length === 0 ? (
                <p className="text-gray-500 text-xs">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {Object.entries(myInventory).map(([key, val]) => (
                    <li key={key} className="flex items-center gap-2 text-xs text-amber-200/90">
                      <span className="text-base">{getPropIcon(key)}</span>
                      <span className="truncate flex-1">{key}</span>
                      <span className="font-semibold text-amber-300">×{Number(val)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {/* 中央：有事情做 → 显示 children / 操作区；没事情 → 等待动画 */}
          <div className="flex flex-col items-center justify-center p-6 md:p-8 min-h-[320px] order-1 md:order-2 border-b md:border-b-0 md:border-r border-amber-400/10 bg-gradient-to-b from-amber-950/10 to-transparent">
            {children}
            {!children && isMyTurn && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <p className="text-2xl md:text-3xl font-bold text-amber-300 mb-1">轮到你了</p>
                <p className="text-sm text-amber-500/80">请在此处完成操作</p>
              </motion.div>
            )}
            {!children && !isMyTurn && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center gap-4"
              >
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-16 h-16 rounded-full border-2 border-amber-400/40 flex items-center justify-center"
                >
                  <span className="text-2xl text-amber-400/60">⏳</span>
                </motion.div>
                <p className="text-lg font-semibold text-amber-200/90">等待中</p>
                <p className="text-xs text-gray-500">其他玩家操作后将更新</p>
              </motion.div>
            )}
          </div>

          {/* 右侧：阶段 + 行动提醒 + 系统公告 */}
          <aside className="flex flex-col gap-3 p-3 md:p-4 bg-black/20 order-3">
            <motion.section
              animate={{ boxShadow: ['0 0 12px rgba(212,168,83,0.15)', '0 0 24px rgba(212,168,83,0.25)', '0 0 12px rgba(212,168,83,0.15)'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className={`p-3 rounded-xl border border-amber-400/30 ${PANEL}`}
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-1">当前阶段</p>
              <p className="text-sm font-bold text-amber-300 truncate">{currentPhase}</p>
            </motion.section>
            <section className={`p-3 rounded-xl border-2 ${PANEL} ${isMyTurn ? 'border-amber-400/50 ring-1 ring-amber-400/30' : ''}`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-1">行动提醒</p>
              {isMyTurn ? (
                <p className="text-sm font-bold text-amber-300">轮到你了！</p>
              ) : (
                <p className="text-xs text-amber-200/80 truncate">{activePlayer ? `UID: ${String(activePlayer).slice(0, 8)}…` : '—'}</p>
              )}
            </section>
            <section className={`flex-1 min-h-[140px] flex flex-col rounded-xl overflow-hidden ${PANEL}`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 px-3 py-2 border-b border-amber-400/10">
                系统公告
              </p>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-black/20">
                {recentLogs.length === 0 ? (
                  <p className="text-gray-500 text-xs">暂无</p>
                ) : (
                  recentLogs.map((line, i) => (
                    <p key={i} className="text-[11px] text-amber-100/80 leading-snug">
                      {typeof line === 'string' ? line : JSON.stringify(line)}
                    </p>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>

        {onBack && (
          <div className="px-4 py-2 border-t border-amber-400/10 bg-black/20 flex justify-center">
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
            >
              返回身份页
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
