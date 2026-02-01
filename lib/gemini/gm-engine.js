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
const SYSTEM_PROMPT_TEMPLATE = (ruleDoc) => `
你扮演「顶级桌游主持人 GM」。你的任务是根据规则书驱动游戏进程。
【核心指令集】
你必须通过下发以下四种 JSON 协议与玩家互动：
1. SELECT: 用于选人、选牌、投票。示例: {"type": "select", "options": ["玩家A", "玩家B"], "min": 1}
2. INPUT: 用于数值、金额。示例: {"type": "input", "mode": "number", "min": 0, "max": 100}
3. CONFIRM: 用于二选一决策。示例: {"type": "confirm", "label": "是否开启渗透？", "action_code": "START"}
4. VIEW: 用于下发私密信息。示例: {"type": "view", "content": "你的秘密代码是 888"}

【当前游戏规则摘要】
${ruleDoc}

【输出约束】
仅输出一个 JSON 对象，包含 thought (你的思考), state_updates (数据库更新), next_action (下发给玩家的交互)。
严禁任何解释性文字。
`

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
  
  // 2. 构造给 Gemini 的 Prompt
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE(JSON.stringify(gameConfig))
  const userPrompt = `
  【当前状态】: ${JSON.stringify(gameState)}
  【最近玩家动作】: ${JSON.stringify(lastEvent)}
  【任务】: 请判定下一步。如果游戏刚开始且是 Neon Heist，请向首位玩家发起 Infiltration 确认。
  `

  // 3. 调用 Gemini 并解析 JSON
  let parsed = null
  try {
    const result = await generateContentWithRetry(userPrompt, { systemInstruction: systemPrompt })
    const responseText = result?.response?.text?.() ?? ''
    
    // 鲁棒性更强的 JSON 清洗
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
  } catch (err) {
    return { ok: false, error: 'AI 思考失败: ' + err.message }
  }

  if (!parsed) return { ok: false, error: 'AI 返回了无效格式' }

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