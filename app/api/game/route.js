import { createClient } from '@supabase/supabase-js'
import { parseRules, checkGeminiConnection } from '@/lib/gemini'

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
      let rowId = null
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
      console.log('房间创建成功：ID 为', rowId)
      return Response.json({ ok: true, id: rowId }, { status: 200 })
    }

    if (action === 'parseRules') {
      let rulesText = body.rulesText || ''
      let pdfBuffer = null
      if (body.file && body.file instanceof Blob && body.file.size > 0) {
        const buf = await body.file.arrayBuffer()
        pdfBuffer = Buffer.from(buf)
      }
      if (!rulesText?.trim() && !pdfBuffer) {
        return Response.json({ error: 'Provide rulesText or upload a PDF' }, { status: 400 })
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

      let result
      try {
        result = await parseRules(rulesText || ' ', pdfBuffer)
      } catch (parseErr) {
        console.error('[parseRules] Gemini parse failed:', parseErr)
        return Response.json({ error: '规则解析失败：' + (parseErr?.message || 'AI 解析错误') }, { status: 500 })
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
      const clientId = body.clientId
      const name = body.name || `Player-${(clientId || '').slice(0, 8)}`
      if (!clientId) {
        return Response.json({ error: 'Missing clientId' }, { status: 400 })
      }

      const { data: row } = await supabase
        .from('rooms')
        .select('briefing_acks')
        .eq('room_code', roomCode)
        .single()

      const acks = Array.isArray(row?.briefing_acks) ? row.briefing_acks : []
      if (acks.some((a) => a?.clientId === clientId)) {
        return Response.json({ ok: true, already: true }, { status: 200 })
      }

      const next = [...acks, { clientId, name, at: new Date().toISOString() }]
      const { error } = await supabase
        .from('rooms')
        .update({ briefing_acks: next, updated_at: new Date().toISOString() })
        .eq('room_code', roomCode)

      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ ok: true }, { status: 200 })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('game API error:', e)
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
