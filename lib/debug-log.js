/**
 * 调试日志缓冲：供服务端写入，API 读取，前端字幕条展示
 * 用于在 localhost 网页中实时查看 terminal 信息
 */

const MAX_ENTRIES = 200
const entries = []

/** 追加一条日志 */
export function push(tag, message, meta = null) {
  const ts = new Date().toISOString()
  const entry = { ts, tag, message, meta }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.shift()
  return entry
}

/** 获取最近 N 条 */
export function getRecent(n = 50) {
  return entries.slice(-n)
}

/** 清空 */
export function clear() {
  entries.length = 0
}
