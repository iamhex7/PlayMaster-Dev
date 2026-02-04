/**
 * 确定性引擎：根据 schema 驱动游戏，消除运行时 AI 歧义
 * - 已知游戏（扑克、卧底）：委托给专用 handler
 * - 自定义游戏：若 schema 完整则按 schema 驱动，否则回退 GM Agent
 */
import { normalizeToSchema, validateSchema } from './game-schema.js'
import { evaluateWinner } from './win-evaluator.js'

/** 判断是否可由确定性引擎处理（不依赖运行时 AI） */
export function canUseDeterministicEngine(gameConfig) {
  const schema = gameConfig?.game_schema || {}
  const gameId = gameConfig?.gameId || ''
  if (['texas-holdem', 'among-us'].includes(gameId)) return true
  const normalized = normalizeToSchema(gameConfig)
  const { valid } = validateSchema(normalized)
  return valid && (normalized.phases?.length > 0 || schema.phase_interactions?.length > 0)
}

/**
 * 根据 schema 获取当前阶段应下发的动作定义
 * @param {Object} schema - 标准化后的 game_schema
 * @param {string} phaseId - 当前阶段 ID
 * @param {string} targetUid - 目标玩家
 */
export function getActionsForPhase(schema, phaseId, targetUid) {
  const actions = schema.actions || []
  const phaseActions = actions.filter((a) => a.phase_id === phaseId)
  if (phaseActions.length === 0) return null
  const act = phaseActions[0]
  const options = act.options || []
  const hasInput = options.some((o) => o.input_type === 'number')
  if (hasInput) {
    const inputOpt = options.find((o) => o.input_type === 'number')
    return {
      type: 'input',
      params: {
        title: inputOpt?.label || '请输入',
        min: inputOpt?.min ?? 0,
        max: inputOpt?.max ?? 9999,
        value: inputOpt?.min ?? 0,
        step: inputOpt?.step ?? 1
      },
      target_uid: targetUid
    }
  }
  return {
    type: 'select',
    params: {
      title: '请选择行动',
      label: '请选择行动',
      options: options.map((o) => ({ id: o.id ?? o.label, label: o.label ?? o.id })),
      min: 1,
      max: 1
    },
    target_uid: targetUid
  }
}

/**
 * 根据 schema 获取 phase 的下一阶段
 * @param {Object} schema
 * @param {string} currentPhaseId
 * @param {Object} gameState
 * @returns {string|null} 下一阶段 ID
 */
export function getNextPhaseFromSchema(schema, currentPhaseId, gameState) {
  const phases = schema.phases || []
  const current = phases.find((p) => p.id === currentPhaseId)
  if (!current || !Array.isArray(current.next) || current.next.length === 0) return null
  return current.next[0]
}

/**
 * 检查胜负条件（确定性）
 * @param {Object} gameState
 * @param {Array} winConditions
 * @param {Object} context
 */
export function checkWinCondition(gameState, winConditions, context) {
  return evaluateWinner(gameState, winConditions, context)
}
