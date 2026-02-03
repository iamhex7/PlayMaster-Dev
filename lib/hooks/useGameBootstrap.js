import { useEffect } from 'react'

/**
 * 进入游戏后：拉取 game_state，若已初始化且无 pending_action 则发送 GAME_START 并轮询
 */
export function useGameBootstrap(roomCode, showInGame, fetchGameState, setGameStateLoading, bootstrapped, setBootstrapped) {
  useEffect(() => {
    if (!showInGame || !roomCode) return
    setGameStateLoading(true)
    fetchGameState().then((gs) => {
      setGameStateLoading(false)
      if (!gs) return
      const initialized = gs.initialized === true
      const hasPending = gs.current_pending_action && gs.current_pending_action.target_uid
      if (initialized && !hasPending && !bootstrapped) {
        setBootstrapped(true)
        fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submitEvent', roomCode, lastEvent: { type: 'GAME_START' } })
        })
          .then((r) => r.json())
          .then(() => {
            let pollCount = 0
            const poll = () => {
              pollCount++
              fetchGameState()
              if (pollCount < 5) setTimeout(poll, 2000)
            }
            setTimeout(poll, 1500)
          })
      }
    })
  }, [showInGame, roomCode, fetchGameState, setGameStateLoading, bootstrapped, setBootstrapped])
}
