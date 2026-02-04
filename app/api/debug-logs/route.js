import { getRecent } from '@/lib/debug-log'

/** GET: 返回最近调试日志，供前端字幕条轮询 */
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const n = Math.min(parseInt(searchParams.get('n') || '50', 10), 100)
  const logs = getRecent(n)
  return Response.json({ logs })
}
