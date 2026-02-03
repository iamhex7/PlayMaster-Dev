import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * [配置区] 仅使用 GEMINI_KEY_1，无多 Key 轮转
 */
const API_KEY = process.env.GEMINI_KEY_1

/** * [模型区] 统一使用 gemini-2.0-flash */
const GEMINI_MODEL = 'gemini-3-flash-preview'

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
  const { parts: optionsParts, systemInstruction } = options
  const contentParts = optionsParts?.length ? optionsParts : [{ text: prompt || '' }]

  if (!API_KEY) {
    throw new Error('❌ 未配置 GEMINI_KEY_1，请检查环境变量')
  }

  logApiKeysDebug()
  console.log('[Gemini Debug] 模型:', GEMINI_MODEL, '| 使用唯一 GEMINI_KEY_1')

  const genAI = new GoogleGenerativeAI(API_KEY)
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
  })

  try {
    const result = await model.generateContent(contentParts)
    console.log(`\x1b[32m%s\x1b[0m`, '[Gemini API] 调用成功！')
    return result
  } catch (err) {
    console.error('[Gemini Debug] 错误详情:', {
      message: err?.message,
      status: err?.status,
      statusText: err?.statusText,
      errorDetails: err?.errorDetails,
      response: err?.response != null ? '[present]' : undefined
    })
    if (err?.response != null) {
      try {
        console.error('[Gemini Debug] err.response 完整:', JSON.stringify(err.response, null, 2))
      } catch (_) {
        console.error('[Gemini Debug] err.response 无法序列化:', err.response)
      }
    }
    throw err
  }
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
 * 规则解析专用函数
 */
export async function parseRules(rulesContent, pdfBuffer = null) {
  const textPrompt = `你是一名专业的桌游规则解析专家。请仔细阅读以下游戏规则，并将其解析为结构化的 JSON 格式。

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
   - cards_per_player: 每人发牌数
   - win_condition: 胜利条件
   - opening_speech: 开场白
   - game_rules: 详细游戏规则（可选，用于 GM 参考）
   - actions: 玩家可执行的动作列表（可选，如 ["move", "attack", "trade"]）
   - turn_structure: 回合结构说明（可选）

【重要】
- 如果规则书中有详细的阶段流程，请完整提取到 phases 数组中
- 如果规则书中有玩家可执行的动作，请提取到 actions 数组中
- 确保 phases 描述足够详细，以便 GM 能够根据这些信息主持游戏
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

  const result = await generateContentWithRetry(null, { parts })
  let text = result.response.text().trim()
  
  // 清洗 Markdown 的代码块标签
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error("JSON 解析失败，原始文本内容为:", text)
    throw new Error("AI 返回的格式不是有效的 JSON")
  }
}