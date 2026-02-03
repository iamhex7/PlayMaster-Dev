import { GoogleGenerativeAI, DynamicRetrievalMode } from '@google/generative-ai'

/**
 * [配置区] 仅使用 GEMINI_KEY_1，无多 Key 轮转
 */
const API_KEY = process.env.GEMINI_KEY_1

/** [模型区] gemini-2.5-flash；GEMINI_MODEL 可覆盖 */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

/** 联网搜索工具：用于 parseRules 时查询游戏规则与角色分配 */
const GOOGLE_SEARCH_TOOL = {
  googleSearchRetrieval: {
    dynamicRetrievalConfig: {
      mode: DynamicRetrievalMode.MODE_DYNAMIC,
      dynamicThreshold: 0.5
    }
  }
}

/**
 * [默认指令区] 顶级游戏架构师 Prompt
 */
const DEFAULT_SYSTEM_INSTRUCTION = `你是一名顶级的游戏架构师。将非结构化的桌游规则解析为规定的 JSON。
严禁幻觉：规则书中未提及的细节不要编造。
输出：纯 JSON，无 markdown。必须包含：
game_name、players_setup、resources、phases、win_condition、opening_speech；
以及 roles (数组 [{name, count, skill_summary}])、cards_per_player、initial_items、min_players、max_players。`

/**
 * 【核心函数】AI 调用（仅使用 GEMINI_KEY_1）
 * @param {string | null} prompt - 文本输入
 * @param {object} options - 可选参数 { parts, systemInstruction }
 */
/**
 * 打印环境变量注入情况（仅 Key 前 4 位，用于确认 Vercel/本地已正确读取）
 */
function logApiKeysDebug() {
  if (API_KEY) {
    const preview = API_KEY.length >= 4 ? `${API_KEY.slice(0, 4)}***` : '***'
    console.log(`[Gemini Debug] GEMINI_KEY_1 已配置，前4位: ${preview}`)
  } else {
    console.log('[Gemini Debug] GEMINI_KEY_1 未配置')
  }
}

export async function generateContentWithRetry(prompt, options = {}) {
  const { parts: optionsParts, systemInstruction, useSearch = false } = options
  const contentParts = optionsParts?.length ? optionsParts : [{ text: prompt || '' }]

  if (!API_KEY) {
    throw new Error('❌ 未配置 GEMINI_KEY_1，请检查环境变量')
  }

  logApiKeysDebug()
  console.log('[Gemini Debug] 模型:', GEMINI_MODEL, useSearch ? '| 联网搜索已开启' : '| 使用唯一 GEMINI_KEY_1')

  const genAI = new GoogleGenerativeAI(API_KEY)
  const modelParams = {
    model: GEMINI_MODEL,
    systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
  }
  if (useSearch) {
    modelParams.tools = [GOOGLE_SEARCH_TOOL]
  }
  const model = genAI.getGenerativeModel(modelParams)

  const maxRetries = 3
  let lastErr
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(contentParts)
      console.log(`\x1b[32m%s\x1b[0m`, '[Gemini API] 调用成功！')
      return result
    } catch (err) {
      lastErr = err
      const isRetryable = err?.status === 503 || err?.status === 429 || err?.statusText === 'Service Unavailable'
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
        console.warn(`[Gemini] ${err?.status || 503}，${delay}ms 后重试 (${attempt}/${maxRetries})`)
        await new Promise((r) => setTimeout(r, delay))
      } else {
        console.error('[Gemini Debug] 错误详情:', {
          message: err?.message,
          status: err?.status,
          statusText: err?.statusText
        })
        throw err
      }
    }
  }
  throw lastErr
}

/**
 * 快捷函数：直接获取文本响应
 */
export async function generateContent(prompt) {
  const result = await generateContentWithRetry(prompt)
  return result.response.text()
}

/**
 * 检查 Gemini 连接（用于 GET ?action=checkGemini）
 */
export async function checkGeminiConnection() {
  if (!API_KEY) {
    const msg = '[Gemini] 未配置 API Key（GEMINI_KEY_1）'
    if (typeof console !== 'undefined') console.warn(msg)
    return { ok: false, message: msg }
  }
  try {
    const result = await generateContentWithRetry('Reply with exactly: OK')
    const text = result?.response?.text()?.trim() || ''
    const msg = `[Gemini] ${GEMINI_MODEL} connection OK. Response: ${text.slice(0, 50)}`
    if (typeof console !== 'undefined') console.log(msg)
    return { ok: true, message: msg }
  } catch (err) {
    const msg = `[Gemini] Connection failed: ${err?.message || err}`
    if (typeof console !== 'undefined') console.error(msg)
    return { ok: false, message: msg }
  }
}

/** PDF 过大时 API 易超时或返回异常错误，建议单次不超过约 20MB（base64 后更大） */
const PDF_SIZE_WARN_BYTES = 10 * 1024 * 1024

/**
 * 规则解析专用函数（支持联网搜索补充知名游戏规则）
 */
export async function parseRules(rulesContent, pdfBuffer = null) {
  const textPrompt = `你是一名专业的桌游规则解析专家。请仔细阅读以下游戏规则，并将其解析为结构化的 JSON 格式。

【重要】若这是知名游戏（如狼人杀、谁是卧底、政变、德州扑克等），请联网搜索该游戏的官方规则与角色分配，以补充和验证用户上传的规则。确保角色分配逻辑正确。

【规则内容】
${rulesContent || '（见 PDF 内容）'}

【输出要求】
1. 必须输出纯 JSON 格式，不要包含任何 markdown 代码块标记
2. 严禁编造规则书中未提及的内容
3. 必须包含以下字段：
   - game_name: 游戏名称
   - min_players: 最少玩家数
   - max_players: 最多玩家数
   - players_setup: 玩家设置说明
   - roles: 角色数组，每个角色包含 {name, count, skill_summary}
   - phases: 游戏阶段数组，详细描述每个阶段的规则和流程
   - resources: 资源说明（初始资源、可获得的资源等）
   - initial_items: 初始物品对象（如 {credits: 1000, action_points: 2}）
   - cards_per_player: 每人发到的角色牌数量（通常为 1，如狼人杀每人发 1 张身份牌）
   - win_condition: 胜利条件
   - opening_speech: 开场白
   - game_rules: 详细游戏规则（可选，用于 GM 参考）
   - actions: 玩家可执行的动作列表（可选）
   - turn_structure: 回合结构说明（可选）

4. **roles 关键语义**（极易出错，务必理解）：
   - roles 描述的是「牌堆」中的角色牌，不是「每个玩家」拥有的角色
   - count = 该角色牌在牌堆中的总张数。例如狼人杀 8 人局：狼人 2 张、村民 4 张、预言家 1 张、女巫 1 张，共 8 张
   - sum(roles[].count) 应等于 玩家数 × cards_per_player（可有余牌放入牌堆）
   - 每个玩家只会收到 cards_per_player 张牌（通常 1 张），不会每人拿到所有角色
   - 正确示例：狼人杀 8 人 → roles: [{name:"狼人",count:2},{name:"村民",count:4},{name:"预言家",count:1},{name:"女巫",count:1}], cards_per_player:1

5. **必须包含 game_schema**，用于 AI 主持与初始化：
   - game_type: "role_based" | "word_based" | "card_based" | "resource_based" | "mixed"
   - distribution: {
       type: "roles"|"words"|"cards"|"chips"|"mixed",
       cards_per_player?, initial_chips?, word_generation?, role_distribution_rules?,
       deck_type?: "standard_52"|"from_roles"|"custom",
       deck_cards?: [{name, count, skill_summary}]
     }
   - deck_type 由规则决定：标准52张扑克牌（德州扑克、21点等）用 "standard_52"；角色身份牌（狼人杀、政变等）用 "from_roles"（此时用 roles 数组）；其他自定义牌堆用 "custom" 并填写 deck_cards
   - phase_interactions: 数组，每项 {
       phase_id, phase_name, in_app_input,
       transition_trigger?, transition_prompt?, action_type?, action_target?,
       action_options?: ["选项A","选项B"],  // SELECT 时用，如扑克下注 ["弃牌","过牌","跟注","加注"]
       action_input?: { label?, mode?: "number", min?, max? },  // INPUT 时用，如加注金额
       deal_from_deck?: number  // 本阶段从 deck 发几张公共牌（如翻牌3、转牌1、河牌1）
     }
   - 牌类游戏（德州扑克等）：phase_interactions 需包含 pre_flop/flop/turn/river/showdown，每下注阶段填 action_options，每发牌阶段填 deal_from_deck
   - 资源类游戏（含筹码）：initial_items 中 chips/credits 等必须为数字，如 2000，勿用 "根据房间设定" 等字符串

【重要】
- 若规则书中有详细的阶段流程，请完整提取到 phases 数组中
- phase_interactions 必须覆盖所有主要阶段
- 输出必须是有效的 JSON，可以直接被 JSON.parse() 解析`

  const parts = []
  if (pdfBuffer) {
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)
    const sizeBytes = buf.length
    if (sizeBytes > PDF_SIZE_WARN_BYTES) {
      console.warn(`[Gemini Debug] PDF 较大: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB，可能增加超时或 429 风险`)
    }
    const base64 = buf.toString('base64')
    parts.push({ inlineData: { mimeType: 'application/pdf', data: base64 } })
  }
  parts.push({ text: textPrompt })

  const textLen = (rulesContent || '').length
  const pdfBytes = pdfBuffer ? (Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)).length : 0
  console.log('[Gemini Debug] Payload: rulesText 长度', textLen, '|', pdfBytes ? `PDF ${pdfBytes} bytes` : '仅文本')

  let result
  try {
    result = await generateContentWithRetry(null, { parts, useSearch: true })
  } catch (searchErr) {
    if (searchErr?.message?.includes('tool') || searchErr?.message?.includes('search') || searchErr?.status === 400) {
      console.warn('[parseRules] 联网搜索失败，回退至纯规则解析:', searchErr?.message?.slice(0, 80))
      result = await generateContentWithRetry(null, { parts, useSearch: false })
    } else {
      throw searchErr
    }
  }
  let text = result.response.text().trim()
  
  // 清洗 Markdown 的代码块标签
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    console.error("JSON 解析失败，原始文本内容为:", text)
    throw new Error("AI 返回的格式不是有效的 JSON")
  }

  if (!parsed.game_schema) {
    const hasRoles = Array.isArray(parsed.roles) && parsed.roles.length > 0
    const dist = parsed.game_schema?.distribution || {}
    let deckType = dist.deck_type || (hasRoles ? 'from_roles' : 'from_roles')
    const name = (parsed.game_name || '').toLowerCase()
    if (!hasRoles && (name.includes('扑克') || name.includes('poker') || name.includes('德州') || name.includes('texas'))) {
      deckType = 'standard_52'
    }
    parsed.game_schema = {
      game_type: hasRoles ? 'role_based' : 'card_based',
      distribution: {
        ...dist,
        type: dist.type || (hasRoles ? 'roles' : 'cards'),
        deck_type: deckType,
        cards_per_player: dist.cards_per_player ?? parsed.cards_per_player ?? 1,
        initial_chips: dist.initial_chips ?? parsed.initial_items?.chips ?? parsed.initial_items?.credits ?? 0
      },
      phase_interactions: Array.isArray(parsed.phases)
        ? parsed.phases.map((p, i) => ({
            phase_id: `phase_${i}`,
            phase_name: typeof p === 'string' ? p : p?.name ?? `阶段${i + 1}`,
            in_app_input: true,
            transition_trigger: null,
            action_type: 'confirm',
            action_target: 'current_player'
          }))
        : []
    }
  }
  const schema = parsed.game_schema
  if (schema?.distribution && !schema.distribution.deck_type) {
    const hasRoles = Array.isArray(parsed.roles) && parsed.roles.length > 0
    const hasDeckCards = Array.isArray(schema.distribution.deck_cards) && schema.distribution.deck_cards.length > 0
    const name = (parsed.game_name || '').toLowerCase()
    if (!hasRoles && !hasDeckCards && (name.includes('扑克') || name.includes('poker') || name.includes('德州') || name.includes('texas'))) {
      schema.distribution.deck_type = 'standard_52'
    } else if (hasRoles) {
      schema.distribution.deck_type = schema.distribution.deck_type || 'from_roles'
    } else if (hasDeckCards) {
      schema.distribution.deck_type = schema.distribution.deck_type || 'custom'
    }
  }
  const items = parsed.initial_items && typeof parsed.initial_items === 'object' ? parsed.initial_items : {}
  for (const k of ['chips', 'credits', 'coins']) {
    if (k in items && (typeof items[k] !== 'number' || !Number.isFinite(items[k]))) {
      items[k] = 2000
    }
  }
  parsed.initial_items = items

  if (schema?.distribution?.deck_type === 'standard_52' && (!Array.isArray(schema.phase_interactions) || schema.phase_interactions.length < 5)) {
    const name = (parsed.game_name || '').toLowerCase()
    if (name.includes('扑克') || name.includes('poker') || name.includes('德州') || name.includes('texas')) {
      schema.phase_interactions = [
        { phase_id: 'pre_flop', phase_name: '翻牌前', in_app_input: true, action_type: 'select', action_target: 'current_player', action_options: ['弃牌', '过牌', '跟注', '加注'] },
        { phase_id: 'flop', phase_name: '翻牌', in_app_input: true, deal_from_deck: 3 },
        { phase_id: 'flop_bet', phase_name: '翻牌后下注', in_app_input: true, action_type: 'select', action_target: 'current_player', action_options: ['弃牌', '过牌', '跟注', '加注'] },
        { phase_id: 'turn', phase_name: '转牌', in_app_input: true, deal_from_deck: 1 },
        { phase_id: 'turn_bet', phase_name: '转牌后下注', in_app_input: true, action_type: 'select', action_target: 'current_player', action_options: ['弃牌', '过牌', '跟注', '加注'] },
        { phase_id: 'river', phase_name: '河牌', in_app_input: true, deal_from_deck: 1 },
        { phase_id: 'river_bet', phase_name: '河牌后下注', in_app_input: true, action_type: 'select', action_target: 'current_player', action_options: ['弃牌', '过牌', '跟注', '加注'] },
        { phase_id: 'showdown', phase_name: '摊牌', in_app_input: false, transition_trigger: 'host_confirm', transition_prompt: '查看结果' }
      ]
    }
  }
  return parsed
}