/**
 * GM Agent: 基于工具调用的 AI 主持人
 * AI 理解规则 → 深度推理 → 决定行动 → 调用系统工具执行
 * 不是硬编码游戏逻辑，而是让 AI 自主理解并驱动游戏
 */
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { push as debugLog } from '../debug-log.js'

const API_KEY = process.env.GEMINI_KEY_1
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro'

/** GM 工具声明：供 AI 调用的系统能力 */
export const GM_TOOL_DECLARATIONS = [
  {
    name: 'update_game_state',
    description: '更新游戏状态。用于设置阶段(phase)、底池(pot)、当前下注(current_bet)、公共牌(community_cards)、牌堆(deck)、当前玩家(current_player/active_player)、弃牌玩家(folded_players)、日志(logs)等。根据游戏规则，在玩家行动后或阶段转换时调用。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        phase: { type: SchemaType.STRING, description: '当前阶段，如 pre_flop, flop, turn, river, showdown' },
        pot: { type: SchemaType.NUMBER, description: '底池总额' },
        current_bet: { type: SchemaType.NUMBER, description: '当前轮下注额' },
        community_cards: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.OBJECT, properties: { roleName: { type: SchemaType.STRING }, skill_summary: { type: SchemaType.STRING } } },
          description: '公共牌数组，每张牌格式 { roleName: "A♠", skill_summary: "黑桃A" }'
        },
        deck: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.OBJECT },
          description: '剩余牌堆，从 deck 取牌后需更新为剩余牌'
        },
        current_player: { type: SchemaType.STRING, description: '当前行动者的 client_id' },
        active_player: { type: SchemaType.STRING, description: '同 current_player，用于前端显示' },
        folded_players: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: '已弃牌玩家的 client_id 列表'
        },
        status_message: { type: SchemaType.STRING, description: '主持语/状态提示' },
        logs: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: '游戏日志' }
      },
      required: []
    }
  },
  {
    name: 'deal_community_cards',
    description: '从牌堆发 N 张牌到公共区。德州扑克：翻牌(flop)发3张、转牌(turn)发1张、河牌(river)发1张。从 game_state.deck 数组前部取牌，加入 community_cards，deck 更新为剩余牌。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        count: { type: SchemaType.INTEGER, description: '要发的牌数，翻牌3、转牌1、河牌1' }
      },
      required: ['count']
    }
  },
  {
    name: 'deduct_player_chips',
    description: '从某玩家的 inventory.chips 扣除筹码并加入底池。玩家跟注/加注时调用。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        player_id: { type: SchemaType.STRING, description: '玩家 client_id' },
        amount: { type: SchemaType.NUMBER, description: '扣除的筹码数' },
        add_to_pot: { type: SchemaType.NUMBER, description: '加入底池的金额（通常等于 amount）' }
      },
      required: ['player_id', 'amount']
    }
  },
  {
    name: 'send_action_to_player',
    description: '向指定玩家下发交互指令。必须调用此工具才能让玩家看到操作界面（弃牌/过牌/跟注/加注等）。每次需要玩家行动时都必须调用。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        target_uid: { type: SchemaType.STRING, description: '玩家 client_id' },
        action_type: {
          type: SchemaType.STRING,
          description: 'SELECT | INPUT | CONFIRM | VIEW'
        },
        title: { type: SchemaType.STRING, description: '操作标题，如"请选择行动"' },
        options: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.OBJECT, properties: { id: { type: SchemaType.STRING }, label: { type: SchemaType.STRING } } },
          description: 'SELECT 时的选项，如 [{id:"弃牌",label:"弃牌"},{id:"过牌",label:"过牌"},{id:"跟注",label:"跟注"},{id:"加注",label:"加注"}]'
        },
        min: { type: SchemaType.INTEGER, description: '最少选择数，通常1' },
        max: { type: SchemaType.INTEGER, description: '最多选择数，通常1' }
      },
      required: ['target_uid', 'action_type']
    }
  }
]

/** 构建 Agent 系统提示 */
function buildAgentSystemPrompt(ruleDoc, players, phaseInteractions) {
  return `你是桌游 AI 主持人。理解规则→推理状态→调用工具执行。不调用 send_action_to_player 玩家看不到操作，游戏会卡住。

【规则书】${ruleDoc}

【玩家】${JSON.stringify(players.map((p, i) => ({ client_id: p.client_id, display: `Player ${i + 1}` })), null, 2)}

【阶段】${JSON.stringify(phaseInteractions, null, 2)}

【扑克流程】pre_flop 行动完毕→deal_community_cards(3)→phase=flop→send_action_to_player。flop/turn/river 同理。单人模式：1 玩家行动后即发牌或摊牌。

【工具】update_game_state(phase,pot,deck...)|deal_community_cards(count)|deduct_player_chips(player_id,amount)|send_action_to_player(target_uid,action_type,options:[{id,label}])。收到 selectedIds:["跟注"] 后：更新 pot、扣筹码→若所有人已行动则发牌→send_action_to_player。`
}

/** 执行工具调用 */
async function executeTool(name, args, ctx) {
  const { supabase, roomCode, room, gameState, players } = ctx
  const activePlayers = players.filter((p) => p.client_id)
  const folded = Array.isArray(gameState.folded_players) ? gameState.folded_players : []

  switch (name) {
    case 'update_game_state': {
      const updates = { ...args }
      delete updates.undefined
      const merged = { ...gameState, ...updates }
      if (updates.status_message) {
        merged.logs = [...(merged.logs || []), updates.status_message]
      }
      await supabase.from('rooms').update({ game_state: merged }).eq('room_code', roomCode)
      return { success: true, state: merged }
    }

    case 'deal_community_cards': {
      const count = Math.min(args.count || 1, (gameState.deck || []).length)
      const deck = [...(gameState.deck || [])]
      const dealt = deck.splice(0, count)
      const community = [...(gameState.community_cards || []), ...dealt]
      const merged = { ...gameState, deck, community_cards: community }
      await supabase.from('rooms').update({ game_state: merged }).eq('room_code', roomCode)
      return { success: true, dealt: dealt.length, community_cards: community }
    }

    case 'deduct_player_chips': {
      const { player_id, amount, add_to_pot } = args
      const amt = Math.max(0, Number(amount) || 0)
      if (!player_id || amt <= 0) return { success: false, error: 'Invalid args' }
      const { data: row } = await supabase
        .from('players')
        .select('inventory')
        .eq('room_id', room.id)
        .eq('client_id', player_id)
        .single()
      const inv = (row?.inventory && typeof row.inventory === 'object') ? { ...row.inventory } : {}
      const chips = typeof inv.chips === 'number' ? inv.chips : 2000
      inv.chips = Math.max(0, chips - amt)
      await supabase.from('players').update({ inventory: inv }).eq('room_id', room.id).eq('client_id', player_id)
      const potAdd = Number(add_to_pot ?? amt) || amt
      const gs = await getGameState(supabase, roomCode)
      const newPot = (gs.pot || 0) + potAdd
      await supabase.from('rooms').update({ game_state: { ...gs, pot: newPot } }).eq('room_code', roomCode)
      return { success: true, deducted: amt, new_chips: inv.chips }
    }

    case 'send_action_to_player': {
      const { target_uid, action_type, title, options, min, max } = args
      if (!target_uid) return { success: false, error: 'Missing target_uid' }
      const type = (action_type || 'SELECT').toLowerCase()
      const action = {
        type,
        params: {
          title: title || 'Choose your action',
          label: title || 'Choose your action',
          options: Array.isArray(options) && options.length > 0
            ? options.map((o) => ({ id: o.id ?? o.label, label: o.label ?? o.id }))
            : [{ id: 'Fold', label: 'Fold' }, { id: 'Check', label: 'Check' }, { id: 'Call', label: 'Call' }, { id: 'Raise', label: 'Raise' }],
          min: min ?? 1,
          max: max ?? 1
        },
        target_uid
      }
      const gs = await getGameState(supabase, roomCode)
      await supabase.from('rooms').update({
        game_state: {
          ...gs,
          current_pending_action: { ...action, params: { ...action.params, label: action.params.title } },
          current_pending_actions: null
        }
      }).eq('room_code', roomCode)
      return { success: true, action_sent: true }
    }

    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

async function getGameState(supabase, roomCode) {
  const { data } = await supabase.from('rooms').select('game_state').eq('room_code', roomCode).single()
  return data?.game_state || {}
}

/**
 * 运行 GM Agent：让 AI 理解规则、推理、调用工具驱动游戏
 * @param {object} supabase - Supabase 客户端（由 gm-engine 传入）
 */
export async function runGMAgent(roomCode, lastEvent, room, gameState, players, gameConfig, supabase) {
  if (!supabase) throw new Error('runGMAgent 需要 supabase 客户端')

  const schema = gameConfig?.game_schema || {}
  const phaseInteractions = schema?.phase_interactions || []
  const ruleDoc = JSON.stringify(gameConfig, null, 2)
  const systemPrompt = buildAgentSystemPrompt(ruleDoc, players, phaseInteractions)

  const userPrompt = `
【当前游戏状态】
${JSON.stringify(gameState, null, 2)}

【刚发生的玩家动作/事件】
${JSON.stringify(lastEvent, null, 2)}

【任务】
根据游戏规则和当前状态，决定下一步。你必须：
1. 理解玩家刚做了什么（如 跟注/弃牌/过牌/加注）
2. 更新游戏状态（pot、current_bet、phase 等）
3. 若进入新阶段需发牌：调用 deal_community_cards
4. 若需要玩家行动：**必须**调用 send_action_to_player，否则玩家界面会卡住

立即调用相应工具执行。可连续调用多个工具。
`

  if (!API_KEY) throw new Error('未配置 GEMINI_KEY_1')

  const genAI = new GoogleGenerativeAI(API_KEY)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: GM_TOOL_DECLARATIONS }]
  })

  const contents = [{ role: 'user', parts: [{ text: userPrompt }] }]
  const ctx = { supabase, roomCode, room, gameState, players }
  let lastAction = null
  let maxTurns = 5
  let turn = 0

  while (turn < maxTurns) {
    turn++
    const result = await model.generateContent({ contents })
    const response = result.response
    const functionCalls = response.functionCalls?.() || []

    if (functionCalls.length === 0) {
      break
    }

    const modelContent = response.candidates?.[0]?.content
    if (modelContent) contents.push(modelContent)

    const functionResponseParts = []
    for (const fc of functionCalls) {
      const { name, args } = fc
      if (process.env.NODE_ENV === 'development') console.log('[GM Agent]', name, JSON.stringify(args).slice(0, 150))
      debugLog('GM Agent', `${name}`, args)
      const toolResult = await executeTool(name, args || {}, ctx)
      if (name === 'send_action_to_player') lastAction = args
      ctx.gameState = await getGameState(ctx.supabase, roomCode)
      functionResponseParts.push({ functionResponse: { name, response: { result: toolResult } } })
    }
    if (functionResponseParts.length > 0) {
      contents.push({ role: 'user', parts: functionResponseParts })
    }
  }

  return {
    ok: true,
    thought: 'GM Agent 完成工具调用',
    stateUpdates: ctx.gameState,
    nextAction: lastAction ? { target_uid: lastAction.target_uid, ...lastAction } : null,
    gameState: ctx.gameState
  }
}
