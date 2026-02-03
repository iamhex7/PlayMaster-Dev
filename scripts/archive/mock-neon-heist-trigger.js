/**
 * [已归档] 模拟触发 GAME_START 并轮询 pending_action。
 * 通用测试脚本，适用于任意已初始化的房间。
 * 运行：node scripts/archive/mock-neon-heist-trigger.js [房间码]
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const ROOM_CODE = process.env.ROOM_CODE || process.argv[2] || ''

async function post(body) {
  const res = await fetch(`${BASE_URL}/api/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json().catch(() => ({}))
}

async function getGameState(roomCode) {
  const data = await post({ action: 'getGameState', roomCode })
  if (data.error) throw new Error(data.error)
  return data.game_state || {}
}

async function submitEvent(roomCode, lastEvent) {
  const data = await post({ action: 'submitEvent', roomCode, lastEvent })
  if (data.error && !data.ok) throw new Error(data.error)
  return data
}

async function main() {
  const roomCode = ROOM_CODE.trim()
  if (!roomCode) {
    console.error('请提供房间码：node scripts/archive/mock-neon-heist-trigger.js <房间码>')
    process.exit(1)
  }

  console.log('1. 获取当前 game_state...')
  let gs = await getGameState(roomCode)
  console.log('   initialized:', gs.initialized, '| current_pending_action:', gs.current_pending_action ? '有' : '无')

  console.log('2. 触发开局事件 submitEvent(roomCode, { type: "GAME_START" })...')
  const tickResult = await submitEvent(roomCode, { type: 'GAME_START' })
  console.log('   processGameTick ok:', tickResult.ok, tickResult.error ? '| error: ' + tickResult.error : '')
  if (tickResult.thought) console.log('   GM thought:', tickResult.thought)

  console.log('3. 轮询 getGameState 直到出现 current_pending_action（最多 10 次，间隔 2s）...')
  let pending = null
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    gs = await getGameState(roomCode)
    pending = gs.current_pending_action
    if (pending && pending.target_uid) {
      console.log('   第', i + 1, '次轮询：已获得 current_pending_action')
      break
    }
    console.log('   第', i + 1, '次轮询：暂无 pending_action')
  }

  if (pending) {
    console.log('\n--- 预期前端行为 ---')
    console.log('ActionCard 应弹出，类型:', pending.type)
    console.log('params:', JSON.stringify(pending.params, null, 2))
    console.log('target_uid:', pending.target_uid)
  } else {
    console.log('\n未在轮询内获得 current_pending_action，请检查房间是否已 initializeGame、GM 是否返回了 next_action。')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
