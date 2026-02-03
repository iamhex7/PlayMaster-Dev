/**
 * AI 驱动初始化：根据 game_config + playerCount 生成 assignments + game_state_extras
 * 用于 word_based、mixed 等无法用 deal/dealAmongUs 覆盖的游戏
 */
import { generateContentWithRetry } from '../gemini.js'

function extractJson(text) {
  const cleaned = text.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0].replace(/,(\s*[}\]])/g, '$1'))
  } catch (_) {
    return null
  }
}

/**
 * 生成词对（当 word_generation 为 ai_generate 时调用）
 */
export async function generateWordPairs(gameConfig, count = 5) {
  const systemPrompt = '你是游戏词库专家。根据规则生成语义相近、易混淆的词对。只输出纯 JSON，无 markdown。'
  const userPrompt = `
根据以下规则，生成 ${count} 组词对（平民词/卧底词），要求语义相近、易混淆。
规则：${(gameConfig.game_rules || gameConfig.win_condition || '').slice(0, 500)}

输出 JSON 格式：{ "word_pairs": [{ "civilian": "胡萝卜", "spy": "白萝卜" }, ...] }
`
  const result = await generateContentWithRetry(userPrompt, { systemInstruction: systemPrompt })
  const text = result?.response?.text?.() ?? ''
  const parsed = extractJson(text)
  return Array.isArray(parsed?.word_pairs) ? parsed.word_pairs : []
}

/**
 * AI 驱动初始化
 * @param {object} gameConfig - 解析后的游戏配置（含 game_schema）
 * @param {string[]} playerClientIds - 玩家 client_id 列表
 * @param {string} dealSeed - 确定性随机种子
 * @param {Array} presetWordPairs - 预置词库（word_based 且 preset_pairs 时使用）
 * @returns {Promise<{ assignments, game_state_extras, inventory_default }>}
 */
export async function initializeByAI(gameConfig, playerClientIds, dealSeed, presetWordPairs = []) {
  const schema = gameConfig?.game_schema || {}
  const dist = schema.distribution || {}
  const n = playerClientIds.length

  let wordPairs = presetWordPairs
  if (dist.word_generation === 'ai_generate' && wordPairs.length === 0) {
    wordPairs = await generateWordPairs(gameConfig, 8)
  }
  if (wordPairs.length === 0 && dist.type === 'words') {
    wordPairs = [{ civilian: '胡萝卜', spy: '白萝卜' }, { civilian: '玫瑰', spy: '月季' }]
  }

  const systemPrompt = `你是游戏初始化专家。根据规则和玩家数量，输出 JSON 格式的初始化结果。
严禁编造规则中未提及的内容。只输出纯 JSON，无 markdown。

【关键】角色类游戏（roles）：每个玩家只拿到 cards_per_player 张角色牌（通常 1 张），绝不把 roles 数组里的所有角色都发给每个玩家。`
  const roles = Array.isArray(gameConfig?.roles) ? gameConfig.roles : []
  const cardsPerPlayer = typeof gameConfig?.cards_per_player === 'number' ? gameConfig.cards_per_player : 1
  const totalRoleCards = roles.reduce((s, r) => s + (typeof r?.count === 'number' ? r.count : 1), 0)

  const userPrompt = `
【游戏配置】
${JSON.stringify(gameConfig, null, 2)}

【玩家数量】${n}
【玩家 client_id 列表】${JSON.stringify(playerClientIds)}
【随机种子】${dealSeed}（用于确定性随机，同一房间结果需可复现）
【预置词对】${JSON.stringify(wordPairs)}

【任务】
根据 game_schema.distribution 和规则，输出初始化结果。格式：

{
  "assignments": {
    "client_id_1": { "role": "civilian", "word": "胡萝卜" },
    "client_id_2": { "role": "spy", "word": "白萝卜" }
  },
  "game_state_extras": { "phase": "...", "round": 1, "logs": [] },
  "inventory_default": {}
}

【规则】
- assignments 的 key 必须为 playerClientIds 中的每个 client_id，不能遗漏
- 若 distribution.type 为 "words"：每人有 word，role 为 civilian/spy/blank 之一，白板 word 为空
- 若 distribution.type 为 "roles"：每人有 cards: [{ roleName, skill_summary }]，且每人只有 ${cardsPerPlayer} 张牌。roles 数组中的 count 表示该角色牌在牌堆中的总张数，你需要从牌堆中随机发 ${cardsPerPlayer} 张给每人，绝不把 roles 里所有角色都发给每个人。牌堆共 ${totalRoleCards} 张，${n} 人各拿 ${cardsPerPlayer} 张。
- 若 distribution.type 为 "cards"：每人有 cards 数组，同样每人只拿 cards_per_player 张
- 若含筹码：inventory_default 为 { chips: N } 或 initial_items
- 从预置词对中随机选一组分配（words 类型），保证平民多数、卧底少数、白板可选
- 只输出 JSON
`

  const result = await generateContentWithRetry(userPrompt, { systemInstruction: systemPrompt })
  const text = result?.response?.text?.() ?? ''
  const parsed = extractJson(text)
  if (!parsed || !parsed.assignments) {
    throw new Error('AI 初始化未返回有效 assignments')
  }

  const assignments = parsed.assignments
  for (const cid of playerClientIds) {
    if (!assignments[cid]) {
      assignments[cid] = { role: 'civilian', word: wordPairs[0]?.civilian || '未知' }
    }
  }

  return {
    assignments,
    game_state_extras: parsed.game_state_extras || { phase: 'description', round: 1, logs: [] },
    inventory_default: parsed.inventory_default || {}
  }
}
