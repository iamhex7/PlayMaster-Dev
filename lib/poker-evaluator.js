/**
 * 德州扑克牌型判定与比较
 * 七选五：从 2 张底牌 + 5 张公共牌中选出最强 5 张
 */

const RANK_MAP = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 }
const SUITS = ['♠', '♥', '♦', '♣']
const HAND_NAMES = {
  royal_flush: '皇家同花顺',
  straight_flush: '同花顺',
  four_of_a_kind: '四条',
  full_house: '葫芦',
  flush: '同花',
  straight: '顺子',
  three_of_a_kind: '三条',
  two_pair: '两对',
  one_pair: '一对',
  high_card: '高牌'
}

/** 解析牌面：roleName "A♠" -> { rank: 14, suit: '♠', raw: 'A' } */
function parseCard(card) {
  const str = (card?.roleName ?? card?.skill_summary ?? String(card ?? '')).trim()
  if (!str) return null
  const suit = SUITS.find((s) => str.includes(s))
  const rankStr = str.replace(/[♠♥♦♣]/g, '').trim()
  const rank = RANK_MAP[rankStr] ?? parseInt(rankStr, 10)
  if (!rank || !suit) return null
  return { rank, suit, raw: rankStr }
}

/** C(n,k) 组合 */
function combinations(arr, k) {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c])
  const withoutFirst = combinations(rest, k)
  return [...withFirst, ...withoutFirst]
}

/** 统计点数出现次数，返回降序 [rank, count][] */
function countRanks(cards) {
  const counts = {}
  for (const c of cards) {
    counts[c.rank] = (counts[c.rank] || 0) + 1
  }
  return Object.entries(counts)
    .map(([r, c]) => [parseInt(r, 10), c])
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return b[0] - a[0]
    })
}

/** 是否同花 */
function isFlush(cards) {
  const s = cards[0]?.suit
  return cards.length === 5 && cards.every((c) => c.suit === s)
}

/** 是否顺子，返回最大牌值或 0；A2345 最小顺子返回 5 */
function isStraight(cards) {
  const ranks = [...new Set(cards.map((c) => c.rank))]
  if (ranks.length < 5) return 0
  const sorted = [...ranks].sort((a, b) => b - a)
  for (let i = 0; i <= sorted.length - 5; i++) {
    const five = sorted.slice(i, i + 5)
    let ok = true
    for (let j = 0; j < 4; j++) {
      if (five[j] - five[j + 1] !== 1) {
        ok = false
        break
      }
    }
    if (ok) return five[0]
  }
  if (ranks.includes(14)) {
    const low = ranks.filter((r) => r > 1).concat([1])
    if (low.length >= 5) {
      const s = [...low].sort((a, b) => b - a).slice(0, 5)
      let ok = true
      for (let j = 0; j < 4; j++) {
        if (s[j] - s[j + 1] !== 1) {
          ok = false
          break
        }
      }
      if (ok) return 5
    }
  }
  return 0
}

/** 评估 5 张牌，返回 [等级, ...tiebreakers] 用于比较 */
function evaluateFive(cards) {
  const parsed = cards.map(parseCard).filter(Boolean)
  if (parsed.length !== 5) return [0]

  const ranks = parsed.map((c) => c.rank).sort((a, b) => b - a)
  const cnt = countRanks(parsed)

  const flush = isFlush(parsed)
  const straightHigh = isStraight(parsed)

  if (flush && straightHigh === 14) return [10, 14]
  if (flush && straightHigh > 0) return [9, straightHigh]
  if (cnt[0][1] === 4) return [8, cnt[0][0], cnt[1][0]]
  if (cnt[0][1] === 3 && cnt[1][1] === 2) return [7, cnt[0][0], cnt[1][0]]
  if (flush) return [6, ...ranks]
  if (straightHigh > 0) return [5, straightHigh]
  if (cnt[0][1] === 3) return [4, cnt[0][0], cnt[1][0], cnt[2][0]]
  if (cnt[0][1] === 2 && cnt[1][1] === 2) return [3, Math.max(cnt[0][0], cnt[1][0]), Math.min(cnt[0][0], cnt[1][0]), cnt[2][0]]
  if (cnt[0][1] === 2) return [2, cnt[0][0], cnt[1][0], cnt[2][0], cnt[3][0]]
  return [1, ...ranks]
}

/** 从 7 张牌中找最强 5 张组合 */
function bestHand(sevenCards) {
  const parsed = sevenCards.map(parseCard).filter(Boolean)
  if (parsed.length < 5) return [0]
  if (parsed.length === 5) return evaluateFive(parsed)
  const combs = combinations(parsed, 5)
  let best = [0]
  for (const c of combs) {
    const score = evaluateFive(c)
    if (compareScores(score, best) > 0) best = score
  }
  return best
}

/** 比较两个分数，返回 1 / 0 / -1 */
function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const va = a[i] ?? 0
    const vb = b[i] ?? 0
    if (va > vb) return 1
    if (va < vb) return -1
  }
  return 0
}

/** 获取牌型名称 */
function getHandName(score) {
  const names = ['', '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺', '皇家同花顺']
  return names[score[0]] ?? '未知'
}

/**
 * 摊牌判定：比较所有活跃玩家的手牌，返回获胜者 client_id 列表（平局可多人）
 * @param {Array<{client_id: string, holeCards: Array}>} playersWithCards
 * @param {Array} communityCards
 * @returns {{ winners: string[], handName: string, scores: Map<string, number[]> }}
 */
export function evaluateShowdown(playersWithCards, communityCards) {
  const results = []
  for (const p of playersWithCards) {
    const seven = [...(p.holeCards || []), ...(communityCards || [])]
    const score = bestHand(seven)
    results.push({ client_id: p.client_id, score, handName: getHandName(score) })
  }
  if (results.length === 0) return { winners: [], handName: '', scores: new Map() }
  results.sort((a, b) => compareScores(b.score, a.score))
  const bestScore = results[0].score
  const winners = results.filter((r) => compareScores(r.score, bestScore) === 0).map((r) => r.client_id)
  const scores = new Map(results.map((r) => [r.client_id, r.score]))
  return {
    winners,
    handName: results[0].handName,
    scores
  }
}

export { parseCard, bestHand, getHandName, HAND_NAMES }
