/**
 * 通用胜负判定：根据 win_conditions 做确定性判定
 * 支持：last_standing, role_elimination, hand_compare, score_threshold, vote_majority
 */
import { WIN_TYPES } from './game-schema.js'
import { evaluateShowdown } from './poker-evaluator.js'

/**
 * 根据 win_conditions 判定胜负
 * @param {Object} gameState - 当前游戏状态
 * @param {Array} winConditions - win_conditions 数组
 * @param {Object} context - 额外上下文 { players, room, supabase, ... }
 * @returns {{ winner: string|string[]|null, handName?: string, message?: string } | null}
 */
export function evaluateWinner(gameState, winConditions, context = {}) {
  if (!Array.isArray(winConditions) || winConditions.length === 0) return null

  for (const wc of winConditions) {
    const result = dispatchByType(wc.type, gameState, wc.params || {}, context)
    if (result) return result
  }
  return null
}

function dispatchByType(type, gameState, params, context) {
  switch (type) {
    case WIN_TYPES.LAST_STANDING:
      return evalLastStanding(gameState, params, context)
    case WIN_TYPES.ROLE_ELIMINATION:
      return evalRoleElimination(gameState, params, context)
    case WIN_TYPES.HAND_COMPARE:
      return evalHandCompare(gameState, params, context)
    case WIN_TYPES.SCORE_THRESHOLD:
      return evalScoreThreshold(gameState, params, context)
    case WIN_TYPES.VOTE_MAJORITY:
      return evalVoteMajority(gameState, params, context)
    default:
      return null
  }
}

/** 最后存活者获胜（如扑克全弃牌） */
function evalLastStanding(gameState, params, context) {
  const playerOrder = Array.isArray(gameState.player_order) ? gameState.player_order : []
  const folded = Array.isArray(gameState.folded_players) ? gameState.folded_players : []
  const eliminated = Array.isArray(gameState.eliminated_players) ? gameState.eliminated_players : []
  const out = new Set([...folded, ...eliminated])
  const remaining = playerOrder.filter((id) => !out.has(id))
  if (remaining.length === 1) {
    return { winner: remaining[0], message: '对手弃牌，你获胜！' }
  }
  return null
}

/** 角色淘汰制（谁是卧底：平民 vs 卧底） */
function evalRoleElimination(gameState, params, context) {
  const eliminated = Array.isArray(gameState.eliminated_players) ? gameState.eliminated_players : []
  const roleMap = context.roleMap || {}
  const playerOrder = Array.isArray(gameState.player_order) ? gameState.player_order : Object.keys(roleMap)
  const remaining = playerOrder.filter((id) => !eliminated.includes(id))
  const remainingCivilians = remaining.filter((id) => roleMap[id] === 'civilian').length
  const remainingSpies = remaining.filter((id) => roleMap[id] === 'spy').length

  if (remainingSpies === 0) return { winner: 'civilians', message: '平民找出所有卧底，平民胜！' }
  if (remainingCivilians <= remainingSpies) return { winner: 'spies', message: '卧底坚持到最后，卧底胜！' }
  return null
}

/** 牌型比较（德州扑克摊牌） */
function evalHandCompare(gameState, params, context) {
  const communityCards = Array.isArray(gameState.community_cards) ? gameState.community_cards : []
  const playerOrder = Array.isArray(gameState.player_order) ? gameState.player_order : []
  const folded = Array.isArray(gameState.folded_players) ? gameState.folded_players : []
  const playersWithCards = context.playersWithCards || []
  if (playersWithCards.length < 2) return null

  const { winners, handName } = evaluateShowdown(playersWithCards, communityCards)
  if (winners.length === 0) return null
  return {
    winner: winners.length === 1 ? winners[0] : winners,
    winners,
    handName,
    message: winners.length === 1 ? `摊牌：${handName}，你获胜！` : `摊牌：${handName}，平局平分底池！`
  }
}

/** 分数阈值 */
function evalScoreThreshold(gameState, params, context) {
  const threshold = params.threshold ?? params.score
  const resourceKey = params.resource ?? 'score'
  if (threshold == null) return null
  const scores = gameState.scores || gameState.player_scores || {}
  for (const [uid, val] of Object.entries(scores)) {
    if (Number(val) >= Number(threshold)) return { winner: uid, message: `达到目标分数，获胜！` }
  }
  return null
}

/** 投票多数 */
function evalVoteMajority(gameState, params, context) {
  const votes = gameState.votes || {}
  const tally = {}
  for (const v of Object.values(votes)) {
    tally[v] = (tally[v] || 0) + 1
  }
  let maxCount = 0
  let winner = null
  for (const [uid, count] of Object.entries(tally)) {
    if (count > maxCount) {
      maxCount = count
      winner = uid
    }
  }
  if (winner && maxCount > 0) return { winner, message: '得票最多，出局/获胜。' }
  return null
}
