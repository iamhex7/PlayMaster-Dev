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

/** 谁是卧底：内置规则，不依赖 ruleDoc */
const AMONG_US_SYSTEM_PROMPT = (players) => `
你是「谁是卧底」的 AI 主持人。规则已内置，无需解析规则书。

【玩家列表】（client_id 用于下发指令）
${JSON.stringify(players.map((p, i) => ({ ...p, display: `Player ${i + 1}` })), null, 2)}

【游戏阶段】
- description: 描述阶段，玩家用一句话描述自己的词
- voting: 投票阶段，所有人投票选出卧底
- eliminated: 出局阶段，宣布结果
- game_over: 游戏结束

【输出格式】仅输出 JSON：
{
  "thought": "简短思考",
  "state_updates": {
    "phase": "description|voting|eliminated|game_over",
    "round": 1,
    "status_message": "主持语，如：现在大家开始第一轮描述",
    "logs": ["日志条目"]
  },
  "next_action": {
    "type": "confirm|select|view",
    "params": { "title": "...", "options": [{ "id": "client_id", "label": "Player N" }], "min": 1, "max": 1 },
    "target_uid": "client_id"
  },
  "next_actions": [可选，投票时对多名玩家下发相同 SELECT 时使用]
}

【重要】SELECT 的 options 必须为 { id: "client_id", label: "Player N" }[]，id 必须是有效的 client_id。
`

/** 核心 System Prompt：将规则书变为 AI 的行动准则 */
const SYSTEM_PROMPT_TEMPLATE = (ruleDoc, players, phaseInteractions = []) => `
你是一名专业的桌游主持人（Game Master, GM）。你的职责是根据游戏规则书，驱动游戏进程，管理游戏状态，并向玩家下发交互指令。

【游戏规则书】
${ruleDoc}

【玩家列表】
${JSON.stringify(players, null, 2)}

【阶段与交互模式】若存在，请严格按此执行：
${JSON.stringify(phaseInteractions, null, 2)}
- in_app_input 为 false 的阶段：玩家在屏幕外完成（如口头描述），应向房主或指定玩家下发 CONFIRM，transition_prompt 作为按钮文案。
- transition_trigger 为 "host_confirm" 时：玩家点击确认后进入下一阶段。
- action_type 为 "select" 且 action_target 为 "all_players" 时：向所有未出局玩家下发 SELECT，options 格式为 [{ "id": "client_id", "label": "1号" }, ...]。
- 若 phase 有 action_options 数组（如 ["弃牌","过牌","跟注","加注"]）：向 current_player 下发 SELECT，options 为 action_options.map((o,i)=>({id:o,label:o}))。
- 若 phase 有 action_input（如下注金额）：向 current_player 下发 INPUT，params 为 { label, mode, min, max }。
- 若 phase 有 deal_from_deck（如 3 表示翻牌发 3 张）：从 game_state.deck 数组前部取 N 张牌，加入 game_state.community_cards，并更新 deck 为剩余牌。community_cards 格式为 [{ roleName, skill_summary }]。

【游戏状态管理】（通用，适用于各类游戏）
- 牌类游戏：若规则有公共牌/翻牌/转牌/河牌，state_updates 中应包含 community_cards（已发公共牌数组）、deck（剩余牌堆）。从 deck 取牌时按顺序 shift 前 N 张。
- 筹码/底池：若规则有下注，state_updates 中应包含 pot（底池总额）、current_bet（当前轮下注额）、folded_players（已弃牌玩家 client_id 列表）等。
- 回合制：state_updates 中 current_player 为当前行动者的 client_id，按规则轮换。
- GAME_START 时：根据第一个 phase 设置 phase、current_player，并立即向 current_player 下发该 phase 的 next_action（SELECT/INPUT/CONFIRM）。

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
       "options": [{ "id": "client_id", "label": "1号" }, ...],
       "min": 1,
       "max": 1
     },
     "target_uid": "玩家client_id"
   }
   支持 next_actions 数组，同时向多名玩家下发相同 SELECT。

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
  const phaseInteractions = schema?.phase_interactions || []
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE(
    JSON.stringify(gameConfig, null, 2),
    players,
    phaseInteractions
  )
  
  // 获取最近的事件历史（用于上下文）
  let recentEvents = { data: [] }
  try {
    const res = await supabase
      .from('game_events')
      .select('event_type, payload, created_at')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(5)
    recentEvents = res
  } catch (_) {}
  
  const userPrompt = `【当前状态】${JSON.stringify(gameState, null, 2)}

【刚发生的事件】${JSON.stringify(lastEvent, null, 2)}

【最近事件】${JSON.stringify((recentEvents?.data || []).reverse(), null, 2)}

按 phase_interactions 和规则书执行：GAME_START→设 phase+current_player+next_action；deal_from_deck→从 deck 取牌入 community_cards；action_options→下发 SELECT；玩家动作→更新状态并推进。next_action.target_uid 须为有效 client_id。`

  // 3. 调用 Gemini 并解析 JSON
  let parsed = null
  try {
    const result = await generateContentWithRetry(userPrompt, { systemInstruction: systemPrompt })
    const responseText = result?.response?.text?.() ?? ''
    
    if (process.env.NODE_ENV === 'development') console.log('[GM Engine] AI 响应:', responseText.slice(0, 300))
    
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
  const nextActions = Array.isArray(parsed.next_actions) ? parsed.next_actions : null

  // 更新全局状态 (Score, Phase, Logs 等)
  let mergedState = { ...gameState, ...stateUpdates }
  if (stateUpdates.status_message) {
    mergedState.logs = [...(mergedState.logs || []), stateUpdates.status_message]
  }
  if (Object.keys(stateUpdates).length > 0) {
    await supabase.from('rooms').update({ game_state: mergedState }).eq('room_code', roomCode)
  }

  // 下发交互指令：优先 next_actions（多人），否则 next_action（单人）
  if (nextActions && nextActions.length > 0) {
    const finalActions = nextActions.map((a) => ({
      ...a,
      params: { ...a.params, label: a.params?.label || a.params?.title }
    }))
    const updatedStateWithActions = {
      ...(await getLatestGameState(roomCode)),
      current_pending_actions: finalActions,
      current_pending_action: null
    }
    await supabase.from('rooms').update({ game_state: updatedStateWithActions }).eq('room_code', roomCode)
  } else if (nextAction && nextAction.target_uid) {
    const finalAction = {
      ...nextAction,
      params: { ...nextAction.params, label: nextAction.params?.label || nextAction.params?.title }
    }
    const updatedStateWithAction = {
      ...(await getLatestGameState(roomCode)),
      current_pending_action: finalAction,
      current_pending_actions: null
    }
    await supabase.from('rooms').update({ game_state: updatedStateWithAction }).eq('room_code', roomCode)
  }

  return { ok: true, thought, stateUpdates, nextAction: nextAction || (nextActions?.[0] ?? null) }
}

async function getLatestGameState(roomCode) {
  const supabase = getSupabase()
  const { data } = await supabase.from('rooms').select('game_state').eq('room_code', roomCode).single()
  return data?.game_state || {}
}