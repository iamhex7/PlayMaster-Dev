import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

/** 强制使用 Gemini 3 Flash（API 模型 ID：gemini-3-flash-preview） */
const GEMINI_MODEL = 'gemini-3-flash-preview'

const SYSTEM_INSTRUCTION = `你是一名顶级的游戏架构师。将非结构化的桌游规则解析为规定的 JSON。
严禁幻觉：规则书中未提及的细节不要编造。
输出：纯 JSON，无 markdown。必须包含 game_name、players_setup、resources、phases、win_condition、opening_speech（赌场发牌员风格、100字以内）。`

export function getGeminiModel() {
  if (!genAI) throw new Error('GEMINI_API_KEY is not set in .env.local')
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION
  })
}

export async function checkGeminiConnection() {
  if (!apiKey) {
    const msg = '[Gemini] GEMINI_API_KEY is not set in .env.local'
    if (typeof console !== 'undefined') console.warn(msg)
    return { ok: false, message: msg }
  }
  try {
    const model = getGeminiModel()
    const result = await model.generateContent('Reply with exactly: OK')
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

export async function generateContent(prompt) {
  const model = getGeminiModel()
  const result = await model.generateContent(prompt)
  const response = await result.response
  return response.text()
}

/** 强制返回结构：game_name, players_setup, resources, phases, win_condition, opening_speech */
const REQUIRED_KEYS = ['game_name', 'players_setup', 'resources', 'phases', 'win_condition', 'opening_speech']

function normalizeParsed(parsed) {
  const out = {
    game_name: String(parsed?.game_name ?? '未命名游戏').trim(),
    players_setup: String(parsed?.players_setup ?? '').trim() || '',
    resources: String(parsed?.resources ?? '').trim() || (parsed?.game_config?.initial_resources && typeof parsed.game_config.initial_resources === 'object' ? JSON.stringify(parsed.game_config.initial_resources, null, 2) : ''),
    phases: Array.isArray(parsed?.phases) ? parsed.phases : (typeof parsed?.phases === 'string' ? parsed.phases : (parsed?.phases ? [parsed.phases] : [])),
    win_condition: String(parsed?.win_condition ?? '').trim() || '',
    opening_speech: String(parsed?.opening_speech ?? parsed?.announcement_script ?? '').trim() ||
      `欢迎来到《${parsed?.game_name || '本游戏'}》。请仔细听规则。`
  }
  for (const key of REQUIRED_KEYS) {
    if (out[key] === undefined) out[key] = key === 'phases' ? [] : ''
  }
  return out
}

/**
 * 规则解析：多模态输入（PDF 或 rules_text），返回规定 JSON。
 * 保证包含：game_name, players_setup, resources, phases, win_condition, opening_speech
 */
export async function parseRules(rulesContent, pdfBuffer = null) {
  if (!genAI) throw new Error('GEMINI_API_KEY is not set in .env.local')

  const model = getGeminiModel()
  const textPrompt = `请将以下游戏规则解析为 JSON，严禁编造。

${(rulesContent || '').trim() || '（规则见上方 PDF。）'}

输出格式（纯 JSON，无 \`\`\`）：
{
  "game_name": "游戏名称",
  "players_setup": "玩家数量与角色配置说明",
  "resources": "初始设定、资源、道具、血量等说明",
  "phases": "阶段流程说明或数组",
  "win_condition": "获胜条件",
  "opening_speech": "赌场发牌员风格的开场白，100字以内"
}`

  const parts = []
  if (pdfBuffer && pdfBuffer.length > 0) {
    const base64 = Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('base64') : Buffer.from(pdfBuffer).toString('base64')
    parts.push({ inlineData: { mimeType: 'application/pdf', data: base64 } })
  }
  parts.push({ text: textPrompt })

  const result = await model.generateContent(parts)
  const response = result.response
  let text = response.text().trim()
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(text)
  return normalizeParsed(parsed)
}

export { genAI, GEMINI_MODEL }
