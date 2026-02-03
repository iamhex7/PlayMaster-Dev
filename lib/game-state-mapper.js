import { PHASE_LABELS } from './game-phases'

/**
 * 将原始 game_state 映射为 InGameView 所需格式
 */
export function mapGameStateForView(realGameState) {
  if (!realGameState) return null
  return {
    game_name: realGameState.game_name ?? (realGameState.gameId === 'among-us' ? '谁是卧底' : realGameState.gameId === 'texas-holdem' ? '德州扑克' : '霓虹劫案'),
    current_phase: PHASE_LABELS[realGameState.phase] ?? realGameState.phase ?? realGameState.current_phase ?? '—',
    current_day_round: realGameState.round ?? realGameState.current_day_round ?? 1,
    in_game_time: realGameState.in_game_time ?? '—',
    active_player: realGameState.active_player ?? realGameState.current_player ?? '',
    game_logs: Array.isArray(realGameState.logs) ? realGameState.logs : (Array.isArray(realGameState.game_logs) ? realGameState.game_logs : []),
    phase: realGameState.phase,
    winner: realGameState.winner,
    status_message: realGameState.status_message,
    community_cards: Array.isArray(realGameState.community_cards) ? realGameState.community_cards : [],
    pot: typeof realGameState.pot === 'number' ? realGameState.pot : (typeof realGameState.pot === 'string' ? parseFloat(realGameState.pot) : null),
    current_bet: typeof realGameState.current_bet === 'number' ? realGameState.current_bet : null
  }
}
