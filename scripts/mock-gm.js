/**
 * GM 模拟器：直接操作 Supabase，将预设的 current_pending_action 写入指定房间的 game_state。
 * 用于在 API 欠费/受限时验证 ActionCard 与 InGameView 的联动。
 *
 * 环境：从项目根目录运行。会尝试读取 .env.local 中的 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY。
 * 使用：node scripts/mock-gm.js <roomCode> <actionType> [targetUid]
 * 示例：node scripts/mock-gm.js ABC123 CONFIRM
 *       node scripts/mock-gm.js ABC123 SELECT <你的 clientId>   # 传入 targetUid 后当前用户会看到 ActionCard
 */

const path = require('path')
const fs = require('fs')

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    content.split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    })
  }
} catch (_) {}

const { createClient } = require('@supabase/supabase-js')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 请设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY（或 SUPABASE_SERVICE_ROLE_KEY），或在 .env.local 中配置')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)
const roomCode = process.argv[2] || ''
const actionType = (process.argv[3] || 'CONFIRM').toUpperCase()
const targetUid = process.argv[4] || 'CURRENT_USER'

const MOCKS = {
  CONFIRM: {
    type: 'CONFIRM',
    target_uid: targetUid,
    params: {
      title: '渗透确认',
      label: '是否消耗 1 点行动点 (AP) 尝试绕过第一道安全网格？',
      message: '是否消耗 1 点行动点 (AP) 尝试绕过第一道安全网格？',
      action_code: 'START_INFILTRATION'
    }
  },
  SELECT: {
    type: 'SELECT',
    target_uid: targetUid,
    params: {
      title: '选择渗透路径',
      options: [
        { id: 'vent', label: '通风管道 (AP-1)' },
        { id: 'hall', label: '前台大厅 (AP-0, 风险高)' },
        { id: 'sewer', label: '下水道 (AP-2)' }
      ],
      min: 1,
      max: 1
    }
  },
  INPUT: {
    type: 'INPUT',
    target_uid: targetUid,
    params: {
      title: '输入金库密码',
      label: '请输入你猜想的 3 位解密代码 (0–999)',
      value: 0,
      min: 0,
      max: 999,
      step: 1
    }
  },
  VIEW: {
    type: 'VIEW',
    target_uid: targetUid,
    params: {
      title: '查看身份/线索',
      content: '你在尸体上找到一张纸条，上面写着：金库密码的第一位是 7。'
    }
  }
}

const selected = MOCKS[actionType] || MOCKS.CONFIRM
const statusMessage = `[Mock GM] 已下发 ${actionType}：${selected.params?.title || actionType}`

async function main() {
  if (!roomCode) {
    console.error('用法: node scripts/mock-gm.js <roomCode> <actionType> [targetUid]')
    console.error('  actionType: CONFIRM | SELECT | INPUT | VIEW')
    process.exit(1)
  }

  const { data: room, error: fetchErr } = await supabase
    .from('rooms')
    .select('game_state')
    .eq('room_code', roomCode)
    .single()

  if (fetchErr || !room) {
    console.error('❌ 房间不存在或查询失败:', fetchErr?.message || 'not found')
    process.exit(1)
  }

  const currentState = room.game_state && typeof room.game_state === 'object' ? room.game_state : {}
  const logs = Array.isArray(currentState.logs) ? currentState.logs : []
  const newState = {
    ...currentState,
    current_pending_action: selected,
    status_message: statusMessage,
    logs: [...logs, statusMessage]
  }

  const { error: updateErr } = await supabase
    .from('rooms')
    .update({
      game_state: newState,
      updated_at: new Date().toISOString()
    })
    .eq('room_code', roomCode)

  if (updateErr) {
    console.error('❌ 更新失败:', updateErr.message)
    process.exit(1)
  }

  console.log('✅ Mock GM 已写入:', roomCode, actionType)
  console.log('   target_uid:', targetUid)
  console.log('   若前端已订阅 Realtime，应很快看到对应 ActionCard。')
}

main()
