import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

/** 强制使用 Gemini 3 Flash（API 模型 ID：gemini-3-flash-preview） */
const GEMINI_MODEL = 'gemini-3-flash-preview'

const SYSTEM_INSTRUCTION = `你是一名顶级的游戏架构师。将非结构化的桌游规则解析为规定的 JSON。
严禁幻觉：规则书中未提及的细节不要编造。
输出：纯 JSON，无 markdown。必须包含：
game_name、players_setup（文字说明）、resources、phases、win_condition、opening_speech（赌场发牌员风格、100字以内）；
以及发牌所需的结构化字段：roles（数组，每项 { name, count, skill_summary 一句话技能摘要 }）、cards_per_player（每人手牌数）、initial_items（对象）、min_players、max_players。
重要：只要规则中出现「角色分配」「身份」「职业」「角色」等字样，或明确列出职业/身份（如警卫、技工、平民、医生等），必须将其全部提取为 roles 数组，格式为 [{ "name": "角色名", "count": 数量, "skill_summary": "一句话技能" }]。例如《末日避难所》须包含警卫、技工等；Coup 为公爵*3、刺客*3 等。roles 不可为空数组（至少根据玩家数量生成等量身份卡）。`

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

/** 强制返回结构：game_name, players_setup, resources, phases, win_condition, opening_speech + 发牌用 roles, cards_per_player, initial_items, min_players, max_players */
const REQUIRED_KEYS = ['game_name', 'players_setup', 'resources', 'phases', 'win_condition', 'opening_speech']

/** 当 roles 为空时，从 players_setup 文本中尝试提取角色名并生成兜底 roles（如《末日避难所》警卫、技工） */
function fallbackRolesFromPlayersSetup(playersSetupStr, maxPlayers = 6) {
  if (!playersSetupStr || typeof playersSetupStr !== 'string') return null
  const text = playersSetupStr.trim()
  const knownRoles = [
    { name: '警卫', pattern: /警卫/, skill: '维持秩序与安全' },
    { name: '技工', pattern: /技工/, skill: '维修设施与建造' },
    { name: '医生', pattern: /医生|医护/, skill: '治疗与救护' },
    { name: '工程师', pattern: /工程师/, skill: '技术支援' },
    { name: '平民', pattern: /平民|幸存者/, skill: '幸存者' }
  ]
  const found = []
  for (const r of knownRoles) {
    if (r.pattern.test(text)) found.push({ name: r.name, count: Math.max(2, Math.ceil(maxPlayers / 2)), skill_summary: r.skill })
  }
  if (found.length > 0) return found
  return [{ name: '平民 (Civilian)', count: Math.max(maxPlayers, 6), skill_summary: '幸存者' }]
}

function normalizeParsed(parsed) {
  const maxPlayers = typeof parsed?.max_players === 'number' ? parsed.max_players : 6
  let roles = Array.isArray(parsed?.roles) ? parsed.roles : []
  const playersSetup = String(parsed?.players_setup ?? '').trim() || ''
  if (roles.length === 0 && playersSetup) {
    const fallback = fallbackRolesFromPlayersSetup(playersSetup, maxPlayers)
    if (fallback) roles = fallback
  }
  if (roles.length === 0) roles = [{ name: '平民 (Civilian)', count: Math.max(maxPlayers, 6), skill_summary: '幸存者' }]

  const out = {
    game_name: String(parsed?.game_name ?? '未命名游戏').trim(),
    players_setup: playersSetup,
    resources: String(parsed?.resources ?? '').trim() || (parsed?.game_config?.initial_resources && typeof parsed.game_config.initial_resources === 'object' ? JSON.stringify(parsed.game_config.initial_resources, null, 2) : ''),
    phases: Array.isArray(parsed?.phases) ? parsed.phases : (typeof parsed?.phases === 'string' ? parsed.phases : (parsed?.phases ? [parsed.phases] : [])),
    win_condition: String(parsed?.win_condition ?? '').trim() || '',
    opening_speech: String(parsed?.opening_speech ?? parsed?.announcement_script ?? '').trim() ||
      `欢迎来到《${parsed?.game_name || '本游戏'}》。请仔细听规则。`,
    roles,
    cards_per_player: typeof parsed?.cards_per_player === 'number' ? parsed.cards_per_player : 1,
    initial_items: parsed?.initial_items && typeof parsed.initial_items === 'object' ? parsed.initial_items : { coins: 2 },
    min_players: typeof parsed?.min_players === 'number' ? parsed.min_players : 1,
    max_players: maxPlayers
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
  "opening_speech": "赌场发牌员风格的开场白，100字以内",
  "roles": [{"name": "角色名", "count": 3, "skill_summary": "一句话技能"}],
  "cards_per_player": 1,
  "initial_items": {"coins": 2},
  "min_players": 2,
  "max_players": 6
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
