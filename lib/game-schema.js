/**
 * 游戏 Schema 规范：AI 解析/补全后必须输出此格式
 * 供确定性引擎驱动游戏，消除运行时 AI 歧义
 */

/** 阶段触发类型 */
export const PHASE_TRIGGERS = {
  ALL_ACTED: 'all_acted',
  HOST_CONFIRM: 'host_confirm',
  TIMER: 'timer',
  AUTO: 'auto',
  PLAYER_ACTION: 'player_action'
}

/** 动作目标 */
export const ACTION_TARGETS = {
  CURRENT: 'current_player',
  ALL: 'all_players',
  FIRST: 'first_player'
}

/** 胜负判定类型 */
export const WIN_TYPES = {
  LAST_STANDING: 'last_standing',
  SCORE_THRESHOLD: 'score_threshold',
  VOTE_MAJORITY: 'vote_majority',
  HAND_COMPARE: 'hand_compare',
  ROLE_ELIMINATION: 'role_elimination',
  CUSTOM: 'custom'
}

/**
 * 标准 game_schema 结构
 * @typedef {Object} GameSchema
 * @property {PhaseDef[]} phases - 阶段定义
 * @property {ActionDef[]} actions - 每阶段可执行动作
 * @property {WinCondition[]} win_conditions - 胜负条件
 * @property {Object} distribution - 发牌/发词配置
 * @property {Object} resources - 资源说明
 */
export const SCHEMA_TEMPLATE = {
  phases: [],
  actions: [],
  win_conditions: [],
  distribution: {},
  resources: {}
}

/**
 * 阶段定义
 * @typedef {Object} PhaseDef
 * @property {string} id - 阶段 ID
 * @property {string} name - 显示名称
 * @property {string[]} next - 可转移到的下一阶段 ID 列表
 * @property {string} trigger - 触发类型
 * @property {number} [deal_count] - 发牌数（翻牌/转牌/河牌等）
 */
export function createPhase(id, name, next = [], trigger = PHASE_TRIGGERS.ALL_ACTED, deal_count = 0) {
  return { id, name, next, trigger, deal_count }
}

/**
 * 动作定义
 * @typedef {Object} ActionDef
 * @property {string} phase_id - 所属阶段
 * @property {Array<{id: string, label: string, input_type?: string}>} options - 选项
 * @property {string} target - 目标玩家
 */
export function createAction(phase_id, options, target = ACTION_TARGETS.CURRENT) {
  return { phase_id, options, target }
}

/**
 * 胜负条件
 * @typedef {Object} WinCondition
 * @property {string} type - 判定类型
 * @property {Object} params - 类型相关参数
 */
export function createWinCondition(type, params = {}) {
  return { type, params }
}

/**
 * 校验 schema 是否完整可执行
 * @param {Object} schema
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(schema) {
  const errors = []
  if (!schema || typeof schema !== 'object') {
    return { valid: false, errors: ['schema 必须为对象'] }
  }
  if (!Array.isArray(schema.phases) || schema.phases.length === 0) {
    errors.push('phases 必须为非空数组')
  }
  if (!Array.isArray(schema.win_conditions) || schema.win_conditions.length === 0) {
    errors.push('win_conditions 必须为非空数组')
  }
  for (const p of schema.phases || []) {
    if (!p.id || !p.name) errors.push(`phase 缺少 id 或 name: ${JSON.stringify(p)}`)
    if (p.next && !Array.isArray(p.next)) errors.push(`phase ${p.id} 的 next 必须为数组`)
  }
  for (const w of schema.win_conditions || []) {
    if (!w.type) errors.push(`win_condition 缺少 type: ${JSON.stringify(w)}`)
  }
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 将旧版 phase_interactions 转为标准 phases + actions
 * @param {Object} gameConfig - 来自 constants 或 AI 解析
 */
export function normalizeToSchema(gameConfig) {
  const schema = gameConfig?.game_schema || {}
  const phaseInteractions = schema.phase_interactions || []
  const phases = []
  const actions = []

  for (const pi of phaseInteractions) {
    phases.push({
      id: pi.phase_id || pi.id,
      name: pi.phase_name || pi.name || pi.phase_id,
      next: pi.transition_target ? [pi.transition_target] : [],
      trigger: pi.transition_trigger === 'host_confirm' ? PHASE_TRIGGERS.HOST_CONFIRM : PHASE_TRIGGERS.ALL_ACTED,
      deal_count: pi.deal_from_deck ?? 0
    })
    if (pi.in_app_input && pi.action_options) {
      const opts = (Array.isArray(pi.action_options) ? pi.action_options : []).map((o) =>
        typeof o === 'string' ? { id: o, label: o } : { id: o?.id ?? o?.label, label: o?.label ?? o?.id }
      )
      if (opts.length > 0) {
        actions.push({
          phase_id: pi.phase_id || pi.id,
          options: opts,
          target: pi.action_target === 'all_players' ? ACTION_TARGETS.ALL : ACTION_TARGETS.CURRENT
        })
      }
    }
  }

  return {
    ...schema,
    phases: phases.length > 0 ? phases : schema.phases,
    actions: actions.length > 0 ? actions : schema.actions,
    win_conditions: schema.win_conditions || []
  }
}
