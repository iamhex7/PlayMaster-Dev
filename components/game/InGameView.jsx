'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

function CaliforniaTime() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const fmt = () => {
      try {
        return new Date().toLocaleTimeString('zh-CN', {
          timeZone: 'America/Los_Angeles',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      } catch {
        return new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    }
    setTime(fmt())
    const id = setInterval(() => setTime(fmt()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span>加州 {time} PT</span>
}

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
  HP: '❤️',
  hp: '❤️',
  罐头: '🥫',
  木材: '🪵',
  信用点: '💰',
  行动力: '⚡',
  篝火等级: '🔥'
}

function getPropIcon(key) {
  return PROP_ICONS[key] ?? '📦'
}

const toStr = (v) => (v != null && typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))

/**
 * InGameView：Dashboard 布局，左/右信息面板 + 中央交互/等待区
 * @param {object} gameState
 * @param {object} myRole
 * @param {object} myInventory
 * @param {string} clientId
 * @param {function} onBack
 * @param {React.ReactNode} children - 可选，渲染在中央（如 ActionCard 或自定义操作区）
 */
function safeNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export default function InGameView({ gameState = {}, myRole = {}, myInventory = {}, clientId = '', onBack, children, submitBusy = false, submitError = null }) {
  const gameName = toStr(gameState.game_name) || '游戏进行中'
  const currentPhase = toStr(gameState.current_phase) || '—'
  const dayRound = gameState.current_day_round ?? 1
  const inGameTime = gameState.in_game_time ?? '深夜 02:00'
  const activePlayer = gameState.active_player ?? ''
  const gameLogs = Array.isArray(gameState.game_logs) ? gameState.game_logs : []
  const allLogs = [...gameLogs].reverse()
  const isGameOver = gameState.phase === 'game_over' || currentPhase === '游戏结束'
  const winner = gameState.winner
  const statusMessage = gameState.status_message
  const communityCards = Array.isArray(gameState.community_cards) ? gameState.community_cards : []
  const pot = safeNum(gameState.pot)
  const currentBet = safeNum(gameState.current_bet)

  const isMyTurn = activePlayer && String(activePlayer) === String(clientId)
  const cards = Array.isArray(myRole?.cards) ? myRole.cards : []
  const myWord = myRole?.word
  const isWordGame = myWord != null && String(myWord).trim() !== ''

  return (
    <main
      className="min-h-screen w-full flex flex-col items-stretch relative overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #050805 0%, #0a0f0a 25%, #080c08 50%, #0a0f0a 75%, #050805 100%)',
        color: GOLD
      }}
    >
      <div className="flex-1 w-full flex flex-col min-h-0">
        {submitError && (
          <div className="px-4 py-2 bg-red-500/20 border-b border-red-400/30 text-red-200 text-sm text-center">
            {submitError}
          </div>
        )}
        <header className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-amber-400/15 bg-black/30 shrink-0">
          <div className="text-xs md:text-sm font-medium text-amber-400/80 tracking-widest">
            {submitBusy ? 'AI Host Processing, please wait...' : `第 ${dayRound} 天 / 轮`}
          </div>
          <h1 className="text-lg md:text-xl font-bold text-amber-300/95 tracking-wider">
            {gameName}
          </h1>
          <div className="text-xs md:text-sm font-medium text-emerald-400/80 tracking-widest">
            <CaliforniaTime />
          </div>
        </header>

        <div className="grid grid-cols-[1fr] md:grid-cols-[280px_1fr_280px] lg:grid-cols-[320px_1fr_320px] flex-1 min-h-0">
          {/* 左侧：我的角色 + 剩余物资 */}
          <aside className="flex flex-col gap-3 p-3 md:p-4 border-r border-amber-400/10 bg-black/20 order-2 md:order-1">
            <section className={`p-3 rounded-xl ${PANEL}`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">
                {isWordGame ? '我的词语' : cards.length > 0 ? '我的手牌' : '我的角色'}
              </p>
              {isWordGame ? (
                <p className="text-sm font-bold text-amber-300 truncate">{myWord}</p>
              ) : cards.length === 0 ? (
                <p className="text-gray-500 text-xs">—</p>
              ) : (
                <p className="text-xs text-amber-200/90">
                  {cards.map((c) => c.roleName ?? '未知').join(' · ')}
                </p>
              )}
              <p className="text-[10px] text-amber-500/50 mt-1">卡牌详见中央区域</p>
            </section>
            <section className={`p-3 rounded-xl ${PANEL}`}>
              <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">剩余物资</p>
              {!myInventory || Object.keys(myInventory).length === 0 ? (
                <p className="text-gray-500 text-xs">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {Object.entries(myInventory).map(([key, val]) => {
                    const n = safeNum(val)
                    const display = n != null ? `×${n}` : (typeof val === 'string' ? val : '—')
                    return (
                      <li key={key} className="flex items-center gap-2 text-xs text-amber-200/90">
                        <span className="text-base">{getPropIcon(key)}</span>
                        <span className="truncate flex-1">{key}</span>
                        <span className="font-semibold text-amber-300">{display}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </aside>

          <div className="flex flex-col min-h-0 order-1 md:order-2 border-b md:border-b-0 md:border-r border-amber-400/10 flex-1">
            {/* 上半部分：所有卡牌（抽到的牌 + 我的手牌） */}
            <section className="flex-shrink-0 p-4 md:p-6 border-b border-amber-400/10 bg-gradient-to-b from-amber-950/15 to-transparent overflow-y-auto">
              <div className="w-full max-w-2xl mx-auto space-y-4">
                {communityCards.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">抽到的牌 / 公共牌</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {communityCards.map((c, i) => (
                        <div
                          key={i}
                          className="px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-950/30 text-amber-200 font-medium"
                        >
                          {c.roleName ?? c.skill_summary ?? '?'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {cards.length > 0 && !isWordGame && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">我的手牌</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {cards.map((card, i) => (
                        <div
                          key={i}
                          className="px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-950/30 text-amber-200 font-medium"
                        >
                          {card.roleName ?? '?'}
                          {card.skill_summary && <span className="text-amber-200/70 text-xs ml-1">({card.skill_summary})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isWordGame && myWord && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-2">我的词语</p>
                    <p className="text-lg font-bold text-amber-300 text-center">{myWord}</p>
                  </div>
                )}
                {(pot != null || currentBet != null) && (
                  <div className="flex justify-center gap-4 text-sm text-amber-300/90">
                    {pot != null && <span>底池: {pot}</span>}
                    {currentBet != null && <span>当前下注: {currentBet}</span>}
                  </div>
                )}
                {communityCards.length === 0 && cards.length === 0 && !isWordGame && !pot && currentBet == null && (
                  <p className="text-gray-500 text-xs text-center py-4">暂无卡牌</p>
                )}
              </div>
            </section>
            {/* 下半部分：交互区（选择、用户行为） */}
            <section className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 min-h-[200px] overflow-y-auto">
            {children}
            {!children && isGameOver && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center max-w-md"
              >
                <p className="text-2xl md:text-3xl font-bold text-amber-300 mb-4">游戏结束</p>
                <p className="text-xl font-semibold text-amber-200/95">
                  {toStr(statusMessage) || (winner === 'civilians' ? '平民找出所有卧底，平民胜！' : winner === 'spies' ? '卧底坚持到最后，卧底胜！' : '')}
                </p>
              </motion.div>
            )}
            {!children && !isGameOver && isMyTurn && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <p className="text-2xl md:text-3xl font-bold text-amber-300 mb-1">轮到你了</p>
                <p className="text-sm text-amber-500/80">请在此处完成操作</p>
              </motion.div>
            )}
            {!children && !isGameOver && !isMyTurn && (
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
            </section>
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
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5 bg-black/20 min-h-[120px]">
                {allLogs.length === 0 ? (
                  <p className="text-gray-500 text-xs">暂无</p>
                ) : (
                  allLogs.map((line, i) => (
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
