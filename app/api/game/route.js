import { createClient } from '@supabase/supabase-js'
import { parseRules, checkGeminiConnection } from '@/lib/gemini'
import { processGameTick } from '@/lib/gemini/gm-engine'
import { deal } from '@/lib/dealer'
import { SAMPLE_GAMES } from '@/lib/constants'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

function getSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return null
  return createClient(supabaseUrl, supabaseAnonKey)
}

/** GET: ?action=checkGemini 检查 Gemini 3 Flash 连接 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  if (action === 'checkGemini') {
    const result = await checkGeminiConnection()
    return Response.json(result)
  }
  return Response.json({ error: 'Unknown action' }, { status: 400 })
}

/** POST: 统一入口。body.action: enterRoom | parseRules | briefingAck。所有操作以 room_code 为唯一键。参数名 target_code 用于 enter_room。 */
export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let body = {}

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      body = {
        action: formData.get('action') || 'parseRules',
        roomCode: formData.get('roomCode')?.toString()?.trim(),
        rulesText: formData.get('rulesText')?.toString()?.trim() || '',
        file: formData.get('file')
      }
    } else {
      body = await request.json()
    }

    const action = body.action
    const roomCode = body.roomCode?.trim()
    const target_code = roomCode

    if (!roomCode) {
      return Response.json({ error: 'Missing room_code' }, { status: 400 })
    }

    const supabase = getSupabase()
    if (!supabase) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    if (action === 'enterRoom') {
      const hostClientId = body.hostClientId || null
      let rowId = null
      
      // 先检查房间是否已存在
      const { data: existingRoom } = await supabase
        .from('rooms')
        .select('id, host_client_id')
        .eq('room_code', roomCode)
        .single()
      
      if (existingRoom?.id) {
        rowId = existingRoom.id
        // 如果房间已存在但没有 host，且当前请求提供了 hostClientId，则更新
        if (!existingRoom.host_client_id && hostClientId) {
          await supabase
            .from('rooms')
            .update({ host_client_id: hostClientId, updated_at: new Date().toISOString() })
            .eq('id', rowId)
        }
      } else {
        // 创建新房间
        try {
          const { error: rpcError } = await supabase.rpc('enter_room', { target_code })
          if (!rpcError) {
            const { data: row } = await supabase.from('rooms').select('id').eq('room_code', roomCode).single()
            rowId = row?.id
          }
        } catch (_) {}
        
        if (rowId == null) {
          const payload = {
            room_code: roomCode,
            room_password: roomCode,
            status: 'LOBBY',
            host_client_id: hostClientId, // 存储 host 身份
            updated_at: new Date().toISOString()
          }
          const { data: insertData, error: insertError } = await supabase
            .from('rooms')
            .upsert(payload, { onConflict: 'room_code' })
            .select('id')
            .single()
          if (insertError) {
            console.error('[enterRoom] insert fallback failed:', insertError.message)
            return Response.json({ error: '房间创建失败：' + insertError.message }, { status: 500 })
          }
          rowId = insertData?.id
        }
      }
      return Response.json({ ok: true, id: rowId }, { status: 200 })
    }

    if (action === 'registerPlayer') {
      const clientId = body.clientId || body.playerId
      if (!clientId) {
        return Response.json({ error: 'Missing clientId / playerId' }, { status: 400 })
      }
      const { data: roomRow, error: roomErr } = await supabase
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single()
      if (roomErr || !roomRow?.id) {
        return Response.json({ error: 'Room not found' }, { status: 404 })
      }
      const { error: upsertErr } = await supabase
        .from('players')
        .upsert(
          { room_id: roomRow.id, client_id: clientId },
          { onConflict: 'room_id,client_id' }
        )
      if (upsertErr) {
        console.error('[registerPlayer] failed:', upsertErr.message)
        return Response.json({ error: upsertErr.message }, { status: 500 })
      }
      const { count } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomRow.id)
      if (typeof count === 'number') {
        await supabase
          .from('rooms')
          .update({ player_count: count, updated_at: new Date().toISOString() })
          .eq('id', roomRow.id)
      }
      return Response.json({ ok: true }, { status: 200 })
    }

    if (action === 'parseRules') {
      const gameId = body.gameId?.trim()
      const useSampleGame = gameId === 'neon-heist' && SAMPLE_GAMES['neon-heist']

      let result
      if (useSampleGame) {
        result = SAMPLE_GAMES['neon-heist']
      } else {
        let rulesText = body.rulesText || ''
        let pdfBuffer = null
        if (body.file && body.file instanceof Blob && body.file.size > 0) {
          const buf = await body.file.arrayBuffer()
          pdfBuffer = Buffer.from(buf)
        }
        if (!rulesText?.trim() && !pdfBuffer) {
          return Response.json({ error: 'Provide rulesText or upload a PDF' }, { status: 400 })
        }
        try {
          result = await parseRules(rulesText || ' ', pdfBuffer)
        } catch (parseErr) {
          console.error('[parseRules] Gemini parse failed:', parseErr)
          return Response.json({ error: '规则解析失败：' + (parseErr?.message || 'AI 解析错误') }, { status: 500 })
        }
      }

      const { data: existing } = await supabase
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single()
      if (!existing?.id) {
        const { error: insertErr } = await supabase
          .from('rooms')
          .insert({ room_code: roomCode, room_password: roomCode, status: 'LOBBY', updated_at: new Date().toISOString() })
        if (insertErr) {
          console.error('[parseRules] room insert failed:', insertErr.message)
          return Response.json({ error: '房间不存在且创建失败：' + insertErr.message }, { status: 500 })
        }
      }

      const { error } = await supabase
        .from('rooms')
        .update({
          status: 'BRIEFING',
          game_config: result,
          briefing_acks: [],
          updated_at: new Date().toISOString()
        })
        .eq('room_code', roomCode)

      if (error) {
        console.error('[parseRules] DB update failed:', error.message)
        return Response.json({ error: '数据库更新失败：' + error.message }, { status: 500 })
      }
      return Response.json({ ok: true, game_config: result }, { status: 200 })
    }

    if (action === 'briefingAck') {
      const clientId = body.clientId || body.playerId
      const name = body.name || `Player-${(clientId || '').slice(0, 8)}`
      if (!clientId) {
        return Response.json({ error: 'Missing clientId / playerId' }, { status: 400 })
      }

      const { error: rpcErr } = await supabase.rpc('append_briefing_ack', {
        p_room_code: roomCode,
        p_client_id: clientId,
        p_name: name
      })
      if (!rpcErr) {
        const { data: row } = await supabase
          .from('rooms')
          .select('briefing_acks')
          .eq('room_code', roomCode)
          .single()
        const acks = Array.isArray(row?.briefing_acks) ? row.briefing_acks : []
        return Response.json({ ok: true, briefing_acks: acks }, { status: 200 })
      }
      if (rpcErr.code === '42883' || rpcErr.message?.includes('function')) {
        const { data: row } = await supabase
          .from('rooms')
          .select('briefing_acks')
          .eq('room_code', roomCode)
          .single()
        const acks = Array.isArray(row?.briefing_acks) ? row.briefing_acks : []
        if (acks.some((a) => a?.clientId === clientId || a?.playerId === clientId)) {
          return Response.json({ ok: true, briefing_acks: acks }, { status: 200 })
        }
        const next = [...acks, { playerId: clientId, clientId, name, at: new Date().toISOString() }]
        const { error } = await supabase
          .from('rooms')
          .update({ briefing_acks: next, updated_at: new Date().toISOString() })
          .eq('room_code', roomCode)
        if (error) return Response.json({ error: error.message }, { status: 500 })
        return Response.json({ ok: true, briefing_acks: next }, { status: 200 })
      }
      return Response.json({ error: rpcErr.message }, { status: 500 })
    }

    if (action === 'initializeGame') {
      const clientId = body.clientId
      const isHost = body.isHost === true
      if (!clientId) {
        return Response.json({ error: 'Missing clientId' }, { status: 400 })
      }

      const { data: roomRow, error: roomErr } = await supabase
        .from('rooms')
        .select('id, game_config, game_state, briefing_acks, host_client_id')
        .eq('room_code', roomCode)
        .single()

      if (roomErr || !roomRow?.id) {
        return Response.json({ error: 'Room not found' }, { status: 404 })
      }

      // 检查权限：host 或第一个确认的玩家可以初始化
      const isActualHost = roomRow.host_client_id === clientId
      const acks = Array.isArray(roomRow.briefing_acks) ? roomRow.briefing_acks : []
      const isFirstAcker = acks.length > 0 && acks[0]?.clientId === clientId
      
      if (!isActualHost && !isFirstAcker && !isHost) {
        console.warn('[initializeGame] Permission denied:', { clientId, hostClientId: roomRow.host_client_id, isHost, isActualHost, isFirstAcker })
        return Response.json({ error: 'Only host or first player can initialize game' }, { status: 403 })
      }

      const acks = Array.isArray(roomRow.briefing_acks) ? roomRow.briefing_acks : []
      const playerClientIds = acks.map((a) => a?.clientId ?? a?.playerId).filter(Boolean)
      
      // 获取实际的玩家数量（从 players 表）
      const { count: actualPlayerCount } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomRow.id)
      
      const gameConfig = roomRow.game_config && typeof roomRow.game_config === 'object' ? roomRow.game_config : {}
      const maxPlayers = typeof gameConfig.max_players === 'number' ? gameConfig.max_players : 10
      const minPlayers = typeof gameConfig.min_players === 'number' ? gameConfig.min_players : 1
      
      // 使用确认人数和实际玩家数的较大值
      const n = Math.max(playerClientIds.length, actualPlayerCount || 0)
      
      console.log('[initializeGame] Player check:', {
        ackedCount: playerClientIds.length,
        actualPlayerCount,
        n,
        minPlayers,
        maxPlayers
      })
      
      if (n < minPlayers || n > maxPlayers) {
        return Response.json(
          { error: `当前确认人数 ${n} 不在允许范围内（${minPlayers}–${maxPlayers} 人）。` },
          { status: 400 }
        )
      }

      const gameState = roomRow.game_state && typeof roomRow.game_state === 'object' ? roomRow.game_state : {}
      const alreadyInitialized = gameState.initialized === true

      if (!alreadyInitialized) {
        await supabase
          .from('rooms')
          .update({ status: 'ASSIGNING_ROLES', updated_at: new Date().toISOString() })
          .eq('room_code', roomCode)

        if (typeof gameConfig?.cards_per_player !== 'number') gameConfig.cards_per_player = 1

        const dealSeed = `${roomRow.id}-${Date.now()}`
        const { assignments, remainder } = deal(gameConfig, playerClientIds, dealSeed)
        const initialItems = gameConfig.initial_items && typeof gameConfig.initial_items === 'object' ? gameConfig.initial_items : { coins: 2 }

        for (const cid of playerClientIds) {
          const hand = assignments[cid] || []
          const roleInfo = { cards: hand }
          if (hand.length === 0) console.warn('[initializeGame] empty hand for client:', cid?.slice(0, 8))
          const { error: upsertErr } = await supabase.from('players').upsert(
            {
              room_id: roomRow.id,
              client_id: cid,
              role_info: roleInfo,
              inventory: initialItems,
              created_at: new Date().toISOString()
            },
            { onConflict: 'room_id,client_id' }
          )
          if (upsertErr) {
            console.error('[initializeGame] players upsert failed:', upsertErr.message)
            return Response.json({ error: 'Failed to save player data' }, { status: 500 })
          }
        }

        const newGameState = {
          ...gameState,
          deck: remainder,
          deal_seed: dealSeed,
          initialized: true
        }
        const { error: updateStateErr } = await supabase
          .from('rooms')
          .update({
            game_state: newGameState,
            status: 'ROLE_REVEAL',
            updated_at: new Date().toISOString()
          })
          .eq('room_code', roomCode)
        if (updateStateErr) {
          return Response.json({ error: 'Failed to update room state' }, { status: 500 })
        }
      } else {
        const { error: statusErr } = await supabase
          .from('rooms')
          .update({ status: 'ROLE_REVEAL', updated_at: new Date().toISOString() })
          .eq('room_code', roomCode)
        if (statusErr) return Response.json({ error: statusErr.message }, { status: 500 })
      }
      return Response.json({ ok: true, status: 'ROLE_REVEAL' }, { status: 200 })
    }

    if (action === 'getGameState') {
      const { data: roomRow, error: roomErr } = await supabase
        .from('rooms')
        .select('game_state, status')
        .eq('room_code', roomCode)
        .single()
      if (roomErr || !roomRow) {
        return Response.json({ error: 'Room not found' }, { status: 404 })
      }
      const game_state = roomRow.game_state && typeof roomRow.game_state === 'object' ? roomRow.game_state : {}
      return Response.json({ game_state, status: roomRow.status ?? 'LOBBY' })
    }

    if (action === 'getMyRole') {
      const clientId = body.clientId
      if (!clientId) {
        return Response.json({ error: 'Missing clientId' }, { status: 400 })
      }

      const { data: roomRow } = await supabase
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single()

      if (!roomRow?.id) {
        return Response.json({ error: 'Room not found' }, { status: 404 })
      }

      const { data: playerRow, error: playerErr } = await supabase
        .from('players')
        .select('role_info, inventory')
        .eq('room_id', roomRow.id)
        .eq('client_id', clientId)
        .single()

      if (playerErr || !playerRow) {
        return Response.json({ error: 'Player data not found' }, { status: 404 })
      }

      return Response.json({
        role_info: playerRow.role_info ?? {},
        inventory: playerRow.inventory ?? {}
      })
    }

    if (action === 'processTick') {
      const lastEvent = body.lastEvent != null ? body.lastEvent : {}
      try {
        const result = await processGameTick(roomCode, lastEvent)
        return Response.json(result, { status: result.ok ? 200 : 500 })
      } catch (err) {
        console.error('[processTick]', err?.message || err)
        return Response.json({ ok: false, error: err?.message || 'processGameTick failed' }, { status: 500 })
      }
    }

    if (action === 'submitEvent') {
      const lastEvent = body.lastEvent != null ? body.lastEvent : {}
      const { data: roomRow } = await supabase.from('rooms').select('id').eq('room_code', roomCode).single()
      if (roomRow?.id) {
        try {
          await supabase.from('game_events').insert({
            room_id: roomRow.id,
            event_type: lastEvent?.type ?? lastEvent?.action ?? 'PLAYER_ACTION',
            payload: lastEvent,
            created_at: new Date().toISOString()
          })
        } catch (e) {
          console.warn('[submitEvent] game_events insert failed (table may not exist):', e?.message)
        }
      }
      try {
        const result = await processGameTick(roomCode, lastEvent)
        return Response.json(result, { status: result.ok ? 200 : 500 })
      } catch (err) {
        console.error('[submitEvent] processGameTick:', err?.message || err)
        return Response.json({ ok: false, error: err?.message || 'processGameTick failed' }, { status: 500 })
      }
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('[game API]', e?.message || e)
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
