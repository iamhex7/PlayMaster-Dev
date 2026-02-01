'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const MOCKS = (targetUid) => ({
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
})

/**
 * 调试仪表盘：仅开发环境显示，四个按钮直接写 Supabase game_state.current_pending_action，用于验证 ActionCard/InGameView 联动。
 */
export default function DebugPanel({ roomCode, clientId }) {
  const [busy, setBusy] = useState(false)
  const [lastAction, setLastAction] = useState(null)

  const inject = async (actionType) => {
    if (!supabase || !roomCode || !clientId) return
    setBusy(true)
    setLastAction(null)
    try {
      const { data: room, error: fetchErr } = await supabase
        .from('rooms')
        .select('game_state')
        .eq('room_code', roomCode)
        .single()

      if (fetchErr || !room) {
        setLastAction('获取房间失败')
        return
      }

      const current = room.game_state && typeof room.game_state === 'object' ? room.game_state : {}
      const mock = MOCKS(clientId)[actionType] || MOCKS(clientId).CONFIRM
      const statusMessage = `[Debug] 已注入 ${actionType}`
      const logs = Array.isArray(current.logs) ? current.logs : []
      const newState = {
        ...current,
        current_pending_action: mock,
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
        setLastAction('更新失败: ' + updateErr.message)
        return
      }
      setLastAction(`已下发 ${actionType}`)
    } finally {
      setBusy(false)
    }
  }

  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
  if (!isDev) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 rounded-xl border-2 border-amber-400/50 bg-black/80 p-3 shadow-lg backdrop-blur-sm"
      style={{ minWidth: '160px' }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
        Debug 面板
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['CONFIRM', 'SELECT', 'INPUT', 'VIEW'].map((type) => (
          <button
            key={type}
            type="button"
            disabled={busy}
            onClick={() => inject(type)}
            className="rounded-lg border border-amber-400/40 bg-amber-500/20 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
          >
            {type}
          </button>
        ))}
      </div>
      {lastAction && (
        <div className="text-[10px] text-amber-300/80">{lastAction}</div>
      )}
    </div>
  )
}
