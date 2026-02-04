/**
 * Deterministic dealer logic: build deck from game_config, shuffle with seed, deal to players.
 * Used only server-side for initializeGame. Ensures no re-deal on refresh.
 * Supports: standard_52 (扑克), from_roles (狼人杀/政变), custom (deck_cards)
 */

/** 标准 52 张扑克牌：4 花色 × 13 点数 */
const STANDARD_52_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2']
const STANDARD_52_SUITS = [
  { sym: '♠', name: 'Spades' },
  { sym: '♥', name: 'Hearts' },
  { sym: '♦', name: 'Diamonds' },
  { sym: '♣', name: 'Clubs' }
]

function buildStandard52Deck() {
  const deck = []
  for (const s of STANDARD_52_SUITS) {
    for (const r of STANDARD_52_RANKS) {
      deck.push({
        roleName: `${r}${s.sym}`,
        skill_summary: `${s.name}${r}`
      })
    }
  }
  return deck
}

/** Seeded PRNG (Mulberry32) for deterministic shuffle */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic shuffle: same seed => same order. Uses Fisher–Yates. */
function seededShuffle(array, seed) {
  const rng = mulberry32(seed)
  const out = [...array]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 根据 game_config 构建牌堆。支持三种模式（由 AI 解析规则时决定）：
 * - standard_52: 标准 52 张扑克牌（德州扑克、21 点等）
 * - from_roles: 从 roles 数组构建（狼人杀、政变等）
 * - custom: 从 deck_cards 构建（其他自定义牌堆）
 */
function buildDeck(gameConfig) {
  const schema = gameConfig?.game_schema || {}
  const dist = schema?.distribution || {}
  const deckType = dist.deck_type || 'from_roles'

  if (deckType === 'standard_52') {
    return buildStandard52Deck()
  }

  if (deckType === 'custom') {
    const cards = Array.isArray(dist.deck_cards) ? dist.deck_cards : Array.isArray(gameConfig?.deck_cards) ? gameConfig.deck_cards : []
    const deck = []
    for (const c of cards) {
      const name = c?.name ?? c?.roleName ?? 'Unknown'
      const count = typeof c?.count === 'number' ? c.count : 1
      const skill_summary = c?.skill_summary ?? ''
      for (let i = 0; i < count; i++) {
        deck.push({ roleName: name, skill_summary })
      }
    }
    if (deck.length > 0) return deck
  }

  const roles = Array.isArray(gameConfig?.roles) ? gameConfig.roles : []
  const deck = []
  for (const r of roles) {
    const name = r?.name ?? r?.roleName ?? 'Unknown'
    const count = typeof r?.count === 'number' ? r.count : 1
    const skill_summary = r?.skill_summary ?? ''
    for (let i = 0; i < count; i++) {
      deck.push({ roleName: name, skill_summary })
    }
  }
  if (deck.length === 0) {
    const fallbackCount = Math.max(6, typeof gameConfig?.max_players === 'number' ? gameConfig.max_players : 6)
    for (let i = 0; i < fallbackCount; i++) {
      deck.push({ roleName: '平民 (Civilian)', skill_summary: '幸存者' })
    }
  }
  return deck
}

/** 判断 gameConfig 是否可构建牌堆并发牌（不依赖 initializeByAI） */
function canBuildDeck(gameConfig) {
  const schema = gameConfig?.game_schema || {}
  const dist = schema?.distribution || {}
  const deckType = dist.deck_type || 'from_roles'
  if (deckType === 'standard_52') return true
  if (deckType === 'custom') {
    const cards = dist.deck_cards || gameConfig?.deck_cards
    return Array.isArray(cards) && cards.length > 0
  }
  return Array.isArray(gameConfig?.roles) && gameConfig.roles.length > 0
}

/**
 * Deal cards: pop from shuffled deck to each player. Deterministic per (roomId + dealSeed).
 * Physical consistency: total cards = sum(roles.count) = cards in hands + deck remainder (e.g. Coup 15 = 3×5 roles).
 * @param {object} gameConfig - has roles, cards_per_player
 * @param {string[]} playerClientIds - list of client IDs (from briefing_acks)
 * @param {string} dealSeed - e.g. roomId + initialized_at, so same room never re-deals
 * @returns {{ assignments: Record<string, { roleName: string, skill_summary: string }[]>, remainder: { roleName: string, skill_summary: string }[] }}
 */
function deal(gameConfig, playerClientIds, dealSeed) {
  const deck = buildDeck(gameConfig)
  const expectedTotal = deck.length
  const cardsPerPlayer = typeof gameConfig?.cards_per_player === 'number' ? gameConfig.cards_per_player : 1
  const seedNum = hashStringToNumber(dealSeed)
  const shuffled = seededShuffle(deck, seedNum)

  const assignments = {}
  for (const id of playerClientIds) {
    assignments[id] = []
  }
  let idx = 0
  for (const clientId of playerClientIds) {
    for (let c = 0; c < cardsPerPlayer && idx < shuffled.length; c++, idx++) {
      assignments[clientId].push(shuffled[idx])
    }
  }
  const remainder = shuffled.slice(idx)
  const inHands = idx
  const inDeck = remainder.length
  if (inHands + inDeck !== expectedTotal) {
    throw new Error(
      `Dealer consistency failed: hands ${inHands} + deck ${inDeck} !== total ${expectedTotal}`
    )
  }
  return { assignments, remainder }
}

/** Simple string hash to a 32-bit number for seed */
function hashStringToNumber(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i)
    h = h | 0
  }
  return Math.abs(h) || 1
}

/** Get expected total card count from game_config.roles (e.g. Coup = 15). */
function getExpectedDeckSize(gameConfig) {
  return buildDeck(gameConfig).length
}

/**
 * 谁是卧底：根据在线人数决定角色配置，分配词汇
 * @param {object} gameConfig - SAMPLE_GAMES['among-us']
 * @param {string[]} playerClientIds - 确认的玩家 client_id 列表
 * @param {string} dealSeed - 如 roomId + timestamp
 * @param {Array} wordPairs - [{ civilian, spy }, ...]
 * @returns {{ assignments: Record<string, { role, word }>, gameStateExtras: object }}
 */
function dealAmongUs(gameConfig, playerClientIds, dealSeed, wordPairs) {
  const n = playerClientIds.length
  const rules = Array.isArray(gameConfig?.role_distribution_rules) ? gameConfig.role_distribution_rules : []
  let civilianCount = n - 1
  let spyCount = 1
  let blankCount = 0

  for (const r of rules) {
    if (n >= r.min && n <= r.max) {
      const civArr = Array.isArray(r.civilian) ? r.civilian : [r.civilian]
      const spyArr = Array.isArray(r.spy) ? r.spy : [r.spy]
      const blankArr = Array.isArray(r.blank) ? r.blank : [r.blank]
      const civShuffled = seededShuffle(civArr.map((_, i) => i), hashStringToNumber(dealSeed + 'c'))
      const spyShuffled = seededShuffle(spyArr.map((_, i) => i), hashStringToNumber(dealSeed + 's'))
      const blankShuffled = seededShuffle(blankArr.map((_, i) => i), hashStringToNumber(dealSeed + 'b'))
      civilianCount = civArr[civShuffled[0]] ?? civArr[0]
      spyCount = spyArr[spyShuffled[0]] ?? spyArr[0]
      blankCount = blankArr[blankShuffled[0]] ?? blankArr[0]
      civilianCount = Math.min(civilianCount, n - 1)
      spyCount = Math.min(spyCount, n - civilianCount)
      civilianCount = Math.min(civilianCount, n - spyCount)
      blankCount = n - civilianCount - spyCount
      break
    }
  }

  const seedNum = hashStringToNumber(dealSeed)
  const shuffledPlayers = seededShuffle([...playerClientIds], seedNum)
  const pairIndices = Array.from({ length: wordPairs?.length || 15 }, (_, i) => i)
  const pairShuffled = seededShuffle(pairIndices, seedNum + 1)
  const pairIdx = pairShuffled[0] % (wordPairs?.length || 1)
  const pair = wordPairs?.[pairIdx] || { civilian: 'Carrot', spy: 'Parsnip' }

  const assignments = {}
  let idx = 0
  for (let i = 0; i < civilianCount && idx < shuffledPlayers.length; i++, idx++) {
    assignments[shuffledPlayers[idx]] = { role: 'civilian', word: pair.civilian }
  }
  for (let i = 0; i < spyCount && idx < shuffledPlayers.length; i++, idx++) {
    assignments[shuffledPlayers[idx]] = { role: 'spy', word: pair.spy }
  }
  for (let i = 0; i < blankCount && idx < shuffledPlayers.length; i++, idx++) {
    assignments[shuffledPlayers[idx]] = { role: 'blank', word: '' }
  }

  return {
    assignments,
    gameStateExtras: {
      civilian_word: pair.civilian,
      spy_word: pair.spy,
      phase: 'description',
      round: 1,
      eliminated_players: [],
      votes: {},
      winner: null,
      logs: []
    }
  }
}

export { buildDeck, buildStandard52Deck, seededShuffle, deal, dealAmongUs, hashStringToNumber, getExpectedDeckSize, canBuildDeck }
