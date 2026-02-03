/**
 * GM Engine: 核心大脑
 * 负责接收事件 -> 调教 Gemini -> 更新数据库 -> 弹出 UI 交互
 */
import { createClient } from '@supabase/supabase-js'
import { generateContentWithRetry } from '../gemini.js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

function getSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return null
  return createClient(supabaseUrl, supabaseAnonKey)
}

/** 核心 System Prompt：将规则书变为 AI 的行动准则 */
const SYSTEM_PROMPT_TEMPLATE = (ruleDoc, players) => `
你是一名专业的桌游主持人（Game Master, GM）。你的职责是根据游戏规则书，驱动游戏进程，管理游戏状态，并向玩家下发交互指令。

【游戏规则书】
${ruleDoc}

【玩家列表】
${JSON.stringify(players, null, 2)}

【核心职责】
1. 严格按照规则书中的规则和流程主持游戏
2. 根据当前游戏状态和玩家动作，决定下一步行动
3. 管理游戏阶段（phases）、回合顺序、资源分配等
4. 向合适的玩家下发交互指令，推进游戏进程

【交互指令类型】
你必须通过以下四种 JSON 协议与玩家互动：

1. CONFIRM - 二选一确认
   格式: {
     "type": "confirm",
     "params": {
       "label": "是否开启渗透？",
       "action_code": "START_INFILTRATION"
     },
     "target_uid": "玩家client_id"
   }

2. SELECT - 选择（单选或多选）
   格式: {
     "type": "select",
     "params": {
       "label": "选择目标玩家",
       "options": ["玩家A", "玩家B", "玩家C"],
       "min": 1,
       "max": 1
     },
     "target_uid": "玩家client_id"
   }

3. INPUT - 输入数值或文本
   格式: {
     "type": "input",
     "params": {
       "label": "输入密码（3位数字）",
       "mode": "number",
       "min": 0,
       "max": 999
     },
     "target_uid": "玩家client_id"
   }

4. VIEW - 查看私密信息
   格式: {
     "type": "view",
     "params": {
       "content": "你的秘密代码是 888"
     },
     "target_uid": "玩家client_id"
   }

【输出格式】
你必须输出一个 JSON 对象，包含以下字段：
{
  "thought": "你的思考过程，说明为什么做出这个决定",
  "state_updates": {
    // 要更新的游戏状态字段，例如：
    "phase": "infiltration",
    "current_player": "player_1",
    "status_message": "游戏开始！",
    "logs": ["玩家A开始了渗透行动"]
  },
  "next_action": {
    // 下发给玩家的交互指令（如果不需要交互，可以为null）
    "type": "confirm",
    "params": {...},
    "target_uid": "玩家client_id"
  }
}

【重要规则】
1. 如果游戏刚开始（lastEvent.type === "GAME_START"），请根据规则书的 opening_speech 和 phases 开始第一个阶段
2. 如果收到玩家动作，请根据规则书判断该动作是否合法，并推进游戏
3. 如果收到 TIMEOUT 事件，请执行默认动作（如跳过该玩家）并推进到下一个行动者
4. 确保 next_action.target_uid 必须是玩家列表中的有效 client_id
5. 根据规则书的 phases 数组，严格按照阶段流程推进游戏
6. 如果规则书中有 actions 数组，确保玩家只能执行允许的动作
7. 严禁输出任何解释性文字，只输出 JSON 对象
`

/**
 * 谁是卧底：确定性逻辑处理（投票、出局、胜负）
 */
async function processAmongUsTick(roomCode, lastEvent, room, gameState, players) {
  const supabase = getSupabase()
  const eliminated = Array.isArray(gameState.eliminated_players) ? gameState.eliminated_players : []
  const activePlayers = players.filter((p) => !eliminated.includes(p.client_id))
  const phase = gameState.phase || 'description'
  const votes = gameState.votes && typeof gameState.votes === 'object' ? { ...gameState.votes } : {}

  // GAME_START -> 描述阶段，CONFIRM 给第一个玩家「进入投票」
  if (lastEvent?.type === 'GAME_START' && phase === 'description') {
    const firstPlayer = activePlayers[0]?.client_id
    const updates = {
      ...gameState,
      phase: 'description',
      status_message: '现在大家开始第一轮描述。完成后请点击进入投票。',
      logs: [...(gameState.logs || []), '游戏开始，进入描述阶段。']
    }
    await supabase.from('rooms').update({ game_state: updates }).eq('room_code', roomCode)
    if (firstPlayer) {
      const action = {
        type: 'confirm',
        params: { title: '描述结束，进入投票', label: '描述结束，进入投票', action_code: 'START_VOTING' },
        target_uid: firstPlayer
      }
      await supabase.from('rooms').update({
        game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } }
      }).eq('room_code', roomCode)
    }
    return { ok: true, thought: 'Among Us: 开始描述阶段', stateUpdates: updates, nextAction: firstPlayer ? { target_uid: firstPlayer } : null }
  }

  // CONFIRM_YES + action_code START_VOTING -> 进入投票，给所有玩家下发 SELECT
  if (
    (lastEvent?.type === 'CONFIRM_YES' || (lastEvent?.type === 'PLAYER_ACTION' && lastEvent?.payload?.confirmed === true)) &&
    lastEvent?.payload?.action_code === 'START_VOTING' &&
    phase === 'description'
  ) {
    const options = activePlayers.map((p, i) => ({ id: p.client_id, label: `${i + 1}号` }))
    const pendingActions = activePlayers.map((p) => ({
      type: 'select',
      params: {
        title: '投票选出你认为的卧底（单选题）',
        label: '投票选出你认为的卧底（单选题）',
        options,
        min: 1,
        max: 1
      },
      target_uid: p.client_id
    }))
    const updates = {
      ...gameState,
      phase: 'voting',
      votes: {},
      status_message: '描述结束，请投票选出你认为的卧底。',
      logs: [...(gameState.logs || []), '进入投票阶段。']
    }
    await supabase.from('rooms').update({
      game_state: { ...updates, current_pending_actions: pendingActions, current_pending_action: null }
    }).eq('room_code', roomCode)
    return { ok: true, thought: 'Among Us: 进入投票', stateUpdates: updates, nextAction: null }
  }

  // PLAYER_ACTION 投票：收集选票
  if (phase === 'voting' && lastEvent?.type === 'PLAYER_ACTION' && Array.isArray(lastEvent?.payload?.selectedIds)) {
    const voterId = lastEvent?.uid || lastEvent?.payload?.uid
    const votedId = lastEvent.payload.selectedIds[0]
    if (voterId && votedId && !eliminated.includes(voterId)) {
      votes[voterId] = votedId
    }
    const allVoted = activePlayers.every((p) => votes[p.client_id] != null)
    const merged = { ...gameState, votes }

    if (!allVoted) {
      await supabase.from('rooms').update({ game_state: merged }).eq('room_code', roomCode)
      return { ok: true, thought: 'Among Us: 收集投票中', stateUpdates: merged, nextAction: null }
    }

    // 统计得票，平票取第一个
    const tally = {}
    for (const vid of Object.values(votes)) {
      tally[vid] = (tally[vid] || 0) + 1
    }
    let maxVotes = 0
    let eliminatedId = null
    for (const [uid, count] of Object.entries(tally)) {
      if (count > maxVotes) {
        maxVotes = count
        eliminatedId = uid
      }
    }
    const newEliminated = [...eliminated, eliminatedId].filter(Boolean)
    const remaining = activePlayers.filter((p) => !newEliminated.includes(p.client_id))
    const { data: roleData } = await supabase.from('players').select('client_id, role_info').eq('room_id', room.id)
    const roleMap = {}
    for (const r of roleData || []) {
      let ri = r.role_info
      if (typeof ri === 'string') {
        try { ri = JSON.parse(ri || '{}') } catch (_) { ri = {} }
      }
      roleMap[r.client_id] = (ri && typeof ri === 'object') ? ri.role : undefined
    }
    const eliminatedRole = roleMap[eliminatedId] || 'civilian'
    const remainingCivilians = remaining.filter((p) => roleMap[p.client_id] === 'civilian').length
    const remainingSpies = remaining.filter((p) => roleMap[p.client_id] === 'spy').length

    let winner = null
    if (remainingSpies === 0) winner = 'civilians'
    else if (remainingCivilians <= remainingSpies) winner = 'spies'

    const round = (gameState.round || 1) + 1
    const phaseNext = winner ? 'game_over' : 'description'
    const msg =
      winner === 'civilians'
        ? '平民找出所有卧底，平民胜！'
        : winner === 'spies'
          ? '卧底坚持到最后，卧底胜！'
          : `Player ${activePlayers.findIndex((p) => p.client_id === eliminatedId) + 1} 出局（${eliminatedRole === 'spy' ? '卧底' : '平民'}）。进入下一轮描述。`
    const updates = {
      ...merged,
      phase: phaseNext,
      round: phaseNext === 'game_over' ? gameState.round : round,
      eliminated_players: newEliminated,
      votes: {},
      winner,
      status_message: msg,
      logs: [...(merged.logs || []), msg],
      current_pending_actions: null,
      current_pending_action: null
    }
    await supabase.from('rooms').update({ game_state: updates }).eq('room_code', roomCode)

    if (winner) {
      return { ok: true, thought: 'Among Us: 游戏结束', stateUpdates: updates, nextAction: null }
    }
    // 下一轮：再次给第一个玩家 CONFIRM 进入投票
    const stillActive = players.filter((p) => !newEliminated.includes(p.client_id))
    const first = stillActive[0]?.client_id
    if (first) {
      const action = {
        type: 'confirm',
        params: { title: '描述结束，进入投票', label: '描述结束，进入投票', action_code: 'START_VOTING' },
        target_uid: first
      }
      await supabase.from('rooms').update({
        game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } }
      }).eq('room_code', roomCode)
    }
    return { ok: true, thought: 'Among Us: 下一轮', stateUpdates: updates, nextAction: first ? { target_uid: first } : null }
  }

  return null
}

/**
 * 扑克 GAME_START：确定性下发首轮下注指令。单人时该玩家即为小盲/当前行动者。
 */
async function processPokerStart(roomCode, room, gameState, players) {
  const supabase = getSupabase()
  if (!supabase) return null

  const activePlayers = players.filter((p) => p.client_id)
  if (activePlayers.length === 0) return null

  const firstPlayer = activePlayers[0].client_id
  const smallBlind = 10
  const bigBlind = 20
  const n = activePlayers.length

  let pot = typeof gameState.pot === 'number' ? gameState.pot : 0
  let updates = {
    ...gameState,
    phase: 'pre_flop',
    current_player: firstPlayer,
    active_player: firstPlayer,
    pot,
    current_bet: 0,
    folded_players: [],
    status_message: n === 1 ? '单人模式：你是小盲，请选择行动。' : '翻牌前，请选择行动。',
    logs: [...(gameState.logs || []), '游戏开始，进入翻牌前下注。']
  }

  const deductBlind = async (clientId, amount) => {
    const { data: pRow } = await supabase
      .from('players')
      .select('inventory')
      .eq('room_id', room.id)
      .eq('client_id', clientId)
      .single()
    const inv = (pRow?.inventory && typeof pRow.inventory === 'object') ? { ...pRow.inventory } : {}
    const chips = typeof inv.chips === 'number' ? inv.chips : 500
    inv.chips = Math.max(0, chips - amount)
    await supabase.from('players').update({ inventory: inv }).eq('room_id', room.id).eq('client_id', clientId)
  }

  if (n === 1) {
    pot += smallBlind
    updates.pot = pot
    updates.current_bet = smallBlind
    updates.status_message = '单人模式：你已自动下小盲，请选择行动（过牌/加注等）。'
    await deductBlind(firstPlayer, smallBlind)
  } else if (n >= 2) {
    pot += smallBlind + bigBlind
    updates.pot = pot
    updates.current_bet = bigBlind
    const smallBlindPlayer = activePlayers[0].client_id
    const bigBlindPlayer = activePlayers[1].client_id
    await deductBlind(smallBlindPlayer, smallBlind)
    await deductBlind(bigBlindPlayer, bigBlind)
  }

  updates.player_order = activePlayers.map((p) => p.client_id)
  updates.last_raiser = null
  updates.pending_raise_player = null

  const action = {
    type: 'select',
    params: {
      title: '请选择行动',
      label: '请选择行动',
      options: [
        { id: '弃牌', label: '弃牌' },
        { id: '过牌', label: '过牌' },
        { id: '跟注', label: '跟注' },
        { id: '加注', label: '加注' }
      ],
      min: 1,
      max: 1
    },
    target_uid: firstPlayer
  }

  await supabase
    .from('rooms')
    .update({
      game_state: {
        ...updates,
        current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } },
        current_pending_actions: null
      },
      updated_at: new Date().toISOString()
    })
    .eq('room_code', roomCode)

  return {
    ok: true,
    thought: 'Poker: GAME_START，下发翻牌前下注指令',
    stateUpdates: updates,
    nextAction: { target_uid: firstPlayer }
  }
}

const SMALL_BLIND = 10
const BIG_BLIND = 20
const MIN_RAISE = BIG_BLIND

/** 获取下一个行动玩家（跳过已弃牌者） */
function getNextPokerPlayer(playerOrder, folded, currentId) {
  const active = playerOrder.filter((id) => !folded.includes(id))
  if (active.length <= 1) return null
  const idx = active.indexOf(currentId)
  if (idx < 0) return active[0]
  return active[(idx + 1) % active.length]
}

/** 扑克 PLAYER_ACTION：确定性处理 fold/check/call/raise，严格阶段流转，永不回退到 GAME_START */
async function processPokerTick(roomCode, lastEvent, room, gameState, players, gameConfig, supabase) {
  const phase = gameState.phase || 'pre_flop'
  const pokerPhases = ['pre_flop', 'flop', 'turn', 'river']
  if (!pokerPhases.includes(phase)) return null

  const uid = lastEvent?.uid || lastEvent?.payload?.uid
  const payload = lastEvent?.payload || {}
  const selectedIds = Array.isArray(payload?.selectedIds) ? payload.selectedIds : []
  const value = typeof payload?.value === 'number' ? payload.value : null

  const playerOrder = Array.isArray(gameState.player_order) ? gameState.player_order : players.map((p) => p.client_id).filter(Boolean)
  const folded = Array.isArray(gameState.folded_players) ? gameState.folded_players : []
  const activePlayers = playerOrder.filter((id) => !folded.includes(id))
  if (activePlayers.length <= 1) return null

  const currentBet = typeof gameState.current_bet === 'number' ? gameState.current_bet : 0
  let pot = typeof gameState.pot === 'number' ? gameState.pot : 0
  const deck = Array.isArray(gameState.deck) ? gameState.deck : []
  const communityCards = Array.isArray(gameState.community_cards) ? gameState.community_cards : []
  const logs = Array.isArray(gameState.logs) ? gameState.logs : []
  let lastRaiser = gameState.last_raiser ?? null
  const pendingRaise = gameState.pending_raise_player

  // 1. 加注金额输入：玩家选了「加注」后，先下发 INPUT 让输入筹码数
  if (pendingRaise === uid && value != null && value > 0) {
    const minRaise = currentBet + MIN_RAISE
    const { data: pRow } = await supabase
      .from('players')
      .select('inventory')
      .eq('room_id', room.id)
      .eq('client_id', uid)
      .single()
    const chips = typeof (pRow?.inventory?.chips) === 'number' ? pRow.inventory.chips : 500
    const amount = Math.max(minRaise, Math.min(chips, value))
    pot += amount
    lastRaiser = uid
    const updates = {
      ...gameState,
      pot,
      current_bet: amount,
      last_raiser: uid,
      pending_raise_player: null,
      current_player: getNextPokerPlayer(playerOrder, folded, uid),
      active_player: null,
      status_message: `Player 加注 ${amount}。`,
      logs: [...logs, `Player 加注 ${amount}。`]
    }
    updates.active_player = updates.current_player
    await supabase.from('players').update({
      inventory: { ...(pRow?.inventory || {}), chips: Math.max(0, chips - amount) }
    }).eq('room_id', room.id).eq('client_id', uid)
    const nextId = updates.current_player
    if (!nextId) {
      return await advancePokerPhase(roomCode, room, updates, players, supabase)
    }
    const nextIsLastRaiser = nextId === lastRaiser
    if (nextIsLastRaiser) {
      return await advancePokerPhase(roomCode, room, updates, players, supabase)
    }
    const action = buildPokerSelectAction(nextId)
    await supabase.from('rooms').update({
      game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } },
      updated_at: new Date().toISOString()
    }).eq('room_code', roomCode)
    return { ok: true, thought: 'Poker: 处理加注金额', stateUpdates: updates, nextAction: { target_uid: nextId } }
  }

  // 2. 处理选择类动作
  const actionId = selectedIds[0]
  if (!actionId || !uid) return null

  if (actionId === '弃牌') {
    const newFolded = folded.includes(uid) ? folded : [...folded, uid]
    const updates = {
      ...gameState,
      folded_players: newFolded,
      current_player: getNextPokerPlayer(playerOrder, newFolded, uid),
      status_message: 'Player 弃牌。',
      logs: [...logs, 'Player 弃牌。']
    }
    updates.active_player = updates.current_player
    const remaining = playerOrder.filter((id) => !newFolded.includes(id))
    if (remaining.length <= 1) {
      return await advancePokerPhase(roomCode, room, updates, players, supabase)
    }
    const nextId = updates.current_player
    if (!nextId) return await advancePokerPhase(roomCode, room, updates, players, supabase)
    const action = buildPokerSelectAction(nextId)
    await supabase.from('rooms').update({
      game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } },
      updated_at: new Date().toISOString()
    }).eq('room_code', roomCode)
    return { ok: true, thought: 'Poker: 弃牌', stateUpdates: updates, nextAction: { target_uid: nextId } }
  }

  if (actionId === '过牌') {
    if (currentBet > 0) {
      const updates = {
        ...gameState,
        status_message: '过牌仅在无人加注时可用，请跟注或加注。',
        logs: [...logs, 'Player 尝试过牌但当前有下注。']
      }
      const action = buildPokerSelectAction(uid)
      await supabase.from('rooms').update({
        game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } },
        updated_at: new Date().toISOString()
      }).eq('room_code', roomCode)
      return { ok: true, thought: 'Poker: 过牌无效', stateUpdates: updates, nextAction: { target_uid: uid } }
    }
    const nextId = getNextPokerPlayer(playerOrder, folded, uid)
    const nextIsLastRaiser = nextId === lastRaiser
    const updates = {
      ...gameState,
      current_player: nextId,
      active_player: nextId,
      status_message: 'Player 过牌。',
      logs: [...logs, 'Player 过牌。']
    }
    if (!nextId || nextIsLastRaiser) {
      return await advancePokerPhase(roomCode, room, updates, players, supabase)
    }
    const action = buildPokerSelectAction(nextId)
    await supabase.from('rooms').update({
      game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } },
      updated_at: new Date().toISOString()
    }).eq('room_code', roomCode)
    return { ok: true, thought: 'Poker: 过牌', stateUpdates: updates, nextAction: { target_uid: nextId } }
  }

  if (actionId === '跟注') {
    const { data: pRow } = await supabase
      .from('players')
      .select('inventory')
      .eq('room_id', room.id)
      .eq('client_id', uid)
      .single()
    const chips = typeof (pRow?.inventory?.chips) === 'number' ? pRow.inventory.chips : 500
    const toCall = Math.min(currentBet, chips)
    pot += toCall
    const updates = {
      ...gameState,
      pot,
      current_player: getNextPokerPlayer(playerOrder, folded, uid),
      status_message: `Player 跟注 ${toCall}。`,
      logs: [...logs, `Player 跟注 ${toCall}。`]
    }
    updates.active_player = updates.current_player
    await supabase.from('players').update({
      inventory: { ...(pRow?.inventory || {}), chips: Math.max(0, chips - toCall) }
    }).eq('room_id', room.id).eq('client_id', uid)
    const nextId = updates.current_player
    if (!nextId) return await advancePokerPhase(roomCode, room, updates, players, supabase)
    const nextIsLastRaiser = nextId === lastRaiser
    if (nextIsLastRaiser) return await advancePokerPhase(roomCode, room, updates, players, supabase)
    const action = buildPokerSelectAction(nextId)
    await supabase.from('rooms').update({
      game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } },
      updated_at: new Date().toISOString()
    }).eq('room_code', roomCode)
    return { ok: true, thought: 'Poker: 跟注', stateUpdates: updates, nextAction: { target_uid: nextId } }
  }

  if (actionId === '加注') {
    const updates = {
      ...gameState,
      pending_raise_player: uid,
      status_message: '请输入加注金额。',
      logs: [...logs, 'Player 选择加注。']
    }
    const { data: pRow } = await supabase
      .from('players')
      .select('inventory')
      .eq('room_id', room.id)
      .eq('client_id', uid)
      .single()
    const chips = typeof (pRow?.inventory?.chips) === 'number' ? pRow.inventory.chips : 500
    const minRaise = currentBet + MIN_RAISE
    const inputAction = {
      type: 'input',
      params: {
        title: '请输入加注金额（筹码）',
        label: '请输入加注金额（筹码）',
        min: Math.min(minRaise, chips),
        max: chips,
        value: minRaise,
        step: 10
      },
      target_uid: uid
    }
    await supabase.from('rooms').update({
      game_state: { ...updates, current_pending_action: { ...inputAction, params: { ...inputAction.params, label: inputAction.params?.title } } },
      updated_at: new Date().toISOString()
    }).eq('room_code', roomCode)
    return { ok: true, thought: 'Poker: 下发加注输入', stateUpdates: updates, nextAction: { target_uid: uid } }
  }

  return null
}

function buildPokerSelectAction(targetUid) {
  return {
    type: 'select',
    params: {
      title: '请选择行动',
      label: '请选择行动',
      options: [
        { id: '弃牌', label: '弃牌' },
        { id: '过牌', label: '过牌' },
        { id: '跟注', label: '跟注' },
        { id: '加注', label: '加注' }
      ],
      min: 1,
      max: 1
    },
    target_uid: targetUid
  }
}

/** 下注轮结束：发牌并进入下一阶段，或摊牌 */
async function advancePokerPhase(roomCode, room, gameState, players, supabase) {
  const phase = gameState.phase || 'pre_flop'
  const deck = Array.isArray(gameState.deck) ? gameState.deck : []
  const communityCards = Array.isArray(gameState.community_cards) ? gameState.community_cards : []
  const logs = [...(gameState.logs || [])]
  const playerOrder = Array.isArray(gameState.player_order) ? gameState.player_order : players.map((p) => p.client_id).filter(Boolean)
  const folded = Array.isArray(gameState.folded_players) ? gameState.folded_players : []
  const activePlayers = playerOrder.filter((id) => !folded.includes(id))

  const phaseOrder = ['pre_flop', 'flop', 'turn', 'river', 'showdown']
  const idx = phaseOrder.indexOf(phase)
  if (idx < 0 || idx >= phaseOrder.length - 1) return null

  const nextPhase = phaseOrder[idx + 1]
  let newDeck = [...deck]
  let newCommunity = [...communityCards]
  let dealCount = 0

  if (phase === 'pre_flop') {
    dealCount = 3
  } else if (phase === 'flop' || phase === 'turn') {
    dealCount = 1
  }

  if (dealCount > 0 && newDeck.length >= dealCount) {
    const dealt = newDeck.splice(0, dealCount)
    newCommunity = [...newCommunity, ...dealt]
    logs.push(`${phase === 'pre_flop' ? '翻牌' : phase === 'flop' ? '转牌' : '河牌'}阶段，揭示 ${dealCount} 张公共牌。`)
  }

  const updates = {
    ...gameState,
    phase: nextPhase,
    deck: newDeck,
    community_cards: newCommunity,
    current_bet: 0,
    last_raiser: null,
    pending_raise_player: null,
    logs
  }

  if (nextPhase === 'showdown' || activePlayers.length <= 1) {
    updates.status_message = '摊牌比牌，游戏结束。'
    updates.logs = [...logs, '摊牌比牌，游戏结束。']
    await supabase.from('rooms').update({ game_state: updates, updated_at: new Date().toISOString() }).eq('room_code', roomCode)
    return { ok: true, thought: 'Poker: 摊牌', stateUpdates: updates, nextAction: null }
  }

  const firstToAct = activePlayers[0]
  updates.current_player = firstToAct
  updates.active_player = firstToAct
  updates.status_message = `${nextPhase === 'flop' ? '翻牌' : nextPhase === 'turn' ? '转牌' : '河牌'}阶段，请选择行动。`
  updates.logs = [...logs, `${nextPhase === 'flop' ? '翻牌' : nextPhase === 'turn' ? '转牌' : '河牌'}阶段，请选择行动。`]

  const action = buildPokerSelectAction(firstToAct)
  await supabase.from('rooms').update({
    game_state: { ...updates, current_pending_action: { ...action, params: { ...action.params, label: action.params?.title } } },
    updated_at: new Date().toISOString()
  }).eq('room_code', roomCode)

  return {
    ok: true,
    thought: `Poker: 进入 ${nextPhase}`,
    stateUpdates: updates,
    nextAction: { target_uid: firstToAct }
  }
}

/**
 * 核心：处理游戏逻辑的一跳 (Tick)
 */
export async function processGameTick(roomCode, lastEvent) {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, error: 'Supabase 配置缺失' }

  // 1. 获取当前房间所有上下文
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_code', roomCode)
    .single()
  
  if (roomErr || !room) return { ok: false, error: '找不到房间' }

  const gameState = room.game_state || {}
  const gameConfig = room.game_config || {}
  
  // 获取玩家列表
  const { data: playersData } = await supabase
    .from('players')
    .select('client_id, role_info, inventory')
    .eq('room_id', room.id)
  
  const players = (playersData || []).map(p => ({
    client_id: p.client_id,
    role: p.role_info,
    inventory: p.inventory || {}
  }))

  const schema = gameConfig?.game_schema || {}

  // 分支 1：词类+投票游戏（谁是卧底）→ 确定性逻辑
  const isWordBasedVoting =
    (schema?.game_type === 'word_based' || gameState.gameId === 'among-us') &&
    (gameState.phase === 'description' || gameState.phase === 'voting' || !gameState.phase)
  if (isWordBasedVoting) {
    const result = await processAmongUsTick(roomCode, lastEvent, room, gameState, players)
    if (result) return result
  }

  // 分支 2：扑克 GAME_START → 确定性下发首轮下注（单人=小盲）
  const isPoker =
    schema?.distribution?.deck_type === 'standard_52' ||
    (gameConfig?.game_name || '').toLowerCase().includes('扑克') ||
    (gameConfig?.game_name || '').toLowerCase().includes('poker')
  if (isPoker && lastEvent?.type === 'GAME_START' && !gameState.phase) {
    const result = await processPokerStart(roomCode, room, gameState, players)
    if (result) return result
  }

  // 分支 2b：扑克 PLAYER_ACTION → 确定性处理 fold/check/call/raise，严格阶段流转，永不回退
  if (isPoker && lastEvent?.type === 'PLAYER_ACTION' && gameState.initialized) {
    const result = await processPokerTick(roomCode, lastEvent, room, gameState, players, gameConfig, supabase)
    if (result) return result
  }

  // 分支 3：PLAYER_ACTION/CONFIRM_YES → GM Agent 工具调用（支持牌类及余烬堡垒等通用游戏）
  const needsAgent =
    (lastEvent?.type === 'PLAYER_ACTION' || lastEvent?.type === 'CONFIRM_YES') &&
    (gameState.phase || gameState.initialized)
  if (needsAgent) {
    try {
      const { runGMAgent } = await import('./gm-agent.js')
      const result = await runGMAgent(
        roomCode,
        lastEvent,
        room,
        gameState,
        players,
        gameConfig,
        supabase
      )
      if (result?.ok) return result
    } catch (agentErr) {
      console.error('[GM Engine] Agent 执行失败，回退至通用 Gemini:', agentErr?.message)
    }
  }

  // 分支 4：通用回退 → Gemini JSON 输出
  // 2. 构造给 Gemini 的 Prompt
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE(JSON.stringify(gameConfig, null, 2), players)
  
  // 获取最近的事件历史（用于上下文）
  const { data: recentEvents } = await supabase
    .from('game_events')
    .select('event_type, payload, created_at')
    .eq('room_id', room.id)
    .order('created_at', { ascending: false })
    .limit(5)
    .catch(() => ({ data: [] }))
  
  const userPrompt = `
【当前游戏状态】
${JSON.stringify(gameState, null, 2)}

【最近玩家动作】
${JSON.stringify(lastEvent, null, 2)}

【最近事件历史】（最近5条）
${JSON.stringify((recentEvents?.data || []).reverse(), null, 2)}

【任务】
请根据游戏规则书，分析当前状态和玩家动作，决定下一步行动：
1. 如果 lastEvent.type === "GAME_START"，请根据规则书的 opening_speech 和第一个 phase 开始游戏
2. 如果收到玩家动作，请判断动作合法性，更新状态，并推进到下一步
3. 如果游戏处于某个阶段，请根据该阶段的规则推进游戏
4. 确保向合适的玩家下发交互指令（next_action），如果没有需要交互的情况，next_action 可以为 null

请严格按照规则书中的 phases、actions、win_condition 等规则执行。
  `

  // 3. 调用 Gemini 并解析 JSON
  let parsed = null
  try {
    const result = await generateContentWithRetry(userPrompt, { systemInstruction: systemPrompt })
    const responseText = result?.response?.text?.() ?? ''
    
    console.log('[GM Engine] AI 原始响应:', responseText.slice(0, 500))
    
    // 鲁棒性更强的 JSON 清洗
    // 先尝试直接解析
    let cleanedText = responseText.trim()
    
    // 移除 markdown 代码块
    cleanedText = cleanedText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
    
    // 尝试找到第一个完整的 JSON 对象
    let jsonMatch = cleanedText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // 如果没找到，尝试找最后一个
      const matches = cleanedText.match(/\{[\s\S]*\}/g)
      if (matches && matches.length > 0) {
        jsonMatch = [matches[matches.length - 1]]
      }
    }
    
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch (parseErr) {
        console.error('[GM Engine] JSON 解析失败:', parseErr.message)
        console.error('[GM Engine] 尝试解析的文本:', jsonMatch[0].slice(0, 500))
        // 尝试修复常见的 JSON 问题
        let fixedJson = jsonMatch[0]
          .replace(/,(\s*[}\]])/g, '$1') // 移除尾随逗号
          .replace(/'/g, '"') // 单引号转双引号
        try {
          parsed = JSON.parse(fixedJson)
        } catch (e2) {
          throw new Error(`JSON 解析失败: ${parseErr.message}. 原始响应: ${responseText.slice(0, 200)}`)
        }
      }
    } else {
      throw new Error(`无法从响应中提取 JSON. 原始响应: ${responseText.slice(0, 200)}`)
    }
  } catch (err) {
    console.error('[GM Engine] AI 调用失败:', err)
    return { ok: false, error: 'AI 思考失败: ' + err.message }
  }

  if (!parsed || typeof parsed !== 'object') {
    console.error('[GM Engine] 解析结果无效:', parsed)
    return { ok: false, error: 'AI 返回了无效格式' }
  }
  
  // 验证必要字段
  if (!parsed.state_updates && !parsed.next_action) {
    console.warn('[GM Engine] AI 返回的对象缺少 state_updates 和 next_action')
  }

  // 4. 执行“手脚”：更新数据库并分发交互
  const thought = parsed.thought
  const stateUpdates = parsed.state_updates || parsed.game_updates || {}
  const nextAction = parsed.next_action || parsed.interactive_action || null

  // 更新全局状态 (Score, Phase, Logs 等)
  if (Object.keys(stateUpdates).length > 0) {
    const mergedState = { ...gameState, ...stateUpdates }
    // 如果 AI 返回了 status_message，自动追加到 logs 中
    if (stateUpdates.status_message) {
      mergedState.logs = [...(mergedState.logs || []), stateUpdates.status_message]
    }
    
    await supabase.from('rooms').update({ game_state: mergedState }).eq('room_code', roomCode)
  }

  // 下发交互指令 (SELECT/INPUT/CONFIRM/VIEW)
  if (nextAction && nextAction.target_uid) {
    const finalAction = {
      ...nextAction,
      // 兼容处理：确保前端 ActionCard 能读到 label
      params: { ...nextAction.params, label: nextAction.params?.label || nextAction.params?.title }
    }
    
    const updatedStateWithAction = { 
      ...(await getLatestGameState(roomCode)), 
      current_pending_action: finalAction 
    }

    await supabase.from('rooms')
      .update({ game_state: updatedStateWithAction })
      .eq('room_code', roomCode)
  }

  return { ok: true, thought, stateUpdates, nextAction }
}

async function getLatestGameState(roomCode) {
  const supabase = getSupabase()
  const { data } = await supabase.from('rooms').select('game_state').eq('room_code', roomCode).single()
  return data?.game_state || {}
}