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