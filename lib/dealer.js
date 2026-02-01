/**
 * Deterministic dealer logic: build deck from game_config, shuffle with seed, deal to players.
 * Used only server-side for initializeGame. Ensures no re-deal on refresh.
 */

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

/** Build deck array from game_config.roles: [ { name, count, skill_summary }, ... ]. 若 roles 为空则按 max_players 生成平民兜底，确保牌堆永不为空。 */
function buildDeck(gameConfig) {
  const roles = Array.isArray(gameConfig?.roles) ? gameConfig.roles : []
  const deck = []
  for (const r of roles) {
    const name = r?.name ?? 'Unknown'
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

export { buildDeck, seededShuffle, deal, hashStringToNumber, getExpectedDeckSize }
