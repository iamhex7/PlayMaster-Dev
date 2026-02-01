import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * [配置区] 环境变量读取
 * 默认仅使用 GEMINI_KEY_3，避免多 Key 轮转导致同一 IP 被限流/拉黑。
 * 若需启用轮转，可改为 [KEY_1, KEY_2, KEY_3].filter(Boolean)。
 */
const API_KEYS = [process.env.GEMINI_KEY_3].filter(Boolean)

/** * [状态区] 全局轮询指针
 * 关键点：放在函数外面，这样所有请求会共享这个进度，实现真正的负载均衡
 */
let globalKeyIndex = 0 

/** * [模型区] 统一使用 gemini-2.0-flash */
const GEMINI_MODEL = 'gemini-2.0-flash'
/** 切换 Key 前等待毫秒数，避免同一出口 IP 瞬间多请求被误判为滥用 */
const KEY_SWITCH_DELAY_MS = 1000 

/**
 * [默认指令区] 顶级游戏架构师 Prompt
 */
const DEFAULT_SYSTEM_INSTRUCTION = `你是一名顶级的游戏架构师。将非结构化的桌游规则解析为规定的 JSON。
严禁幻觉：规则书中未提及的细节不要编造。
输出：纯 JSON，无 markdown。必须包含：
game_name、players_setup、resources、phases、win_condition、opening_speech；
以及 roles (数组 [{name, count, skill_summary}])、cards_per_player、initial_items、min_players、max_players。`

/**
 * 判断是否为 429 频率限制 / 配额错误
 */
function isQuotaError(err) {
  if (!err) return false
  const msg = (err.message || err.toString() || '').toLowerCase()
  return err.status === 429 || /quota|429|rate limit|too many requests/i.test(msg)
}

/**
 * 判断是否为可重试错误（429 限流 或 503 服务过载）
 */
function isRetryableError(err) {
  if (!err) return false
  const msg = (err.message || err.toString() || '').toLowerCase()
  if (err.status === 503 || /overloaded|service unavailable|503/i.test(msg)) return true
  return isQuotaError(err)
}

/**
 * 从 errorDetails 的 RetryInfo 解析建议等待秒数（如 "22s"）
 */
function getRetryDelaySeconds(err) {
  const details = err?.errorDetails || []
  const retryInfo = details.find((d) => d && (d['@type'] || '').includes('RetryInfo'))
  const delay = retryInfo?.retryDelay
  if (typeof delay === 'string' && /^\d+s$/i.test(delay)) return Math.min(parseInt(delay, 10), 60)
  if (typeof delay === 'number' && delay > 0) return Math.min(delay, 60)
  return null
}

/**
 * 【核心函数】带自动轮转重试的 AI 调用
 * @param {string | null} prompt - 文本输入
 * @param {object} options - 可选参数 { parts, systemInstruction }
 */
/**
 * 打印环境变量注入情况（仅 Key 前 4 位，用于确认 Vercel/本地已正确读取）
 */
function logApiKeysDebug() {
  console.log('[Gemini Debug] API_KEYS.length =', API_KEYS.length)
  API_KEYS.forEach((k, i) => {
    const preview = typeof k === 'string' && k.length >= 4 ? `${k.slice(0, 4)}***` : '(undefined or empty)'
    console.log(`[Gemini Debug] GEMINI_KEY_${i + 1} 前4位: ${preview}`)
  })
}

export async function generateContentWithRetry(prompt, options = {}) {
  const { parts: optionsParts, systemInstruction } = options
  const contentParts = optionsParts?.length ? optionsParts : [{ text: prompt || '' }]

  if (API_KEYS.length === 0) {
    throw new Error('❌ 未配置任何 GEMINI_KEY，请检查环境变量')
  }

  logApiKeysDebug()
  console.log('[Gemini Debug] 模型:', GEMINI_MODEL, '| 请求为序列化（一个失败后再试下一个）')

  let lastError = null
  const maxAttempts = API_KEYS.length

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentIndex = globalKeyIndex % API_KEYS.length
    const currentKey = API_KEYS[currentIndex]
    const keyLabel = `Key-[#${currentIndex + 1}]`

    try {
      console.log(`\x1b[36m%s\x1b[0m`, `[Gemini API] 正在尝试使用 ${keyLabel}...`)

      const genAI = new GoogleGenerativeAI(currentKey)
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
      })

      const result = await model.generateContent(contentParts)
      const response = await result.response

      console.log(`\x1b[32m%s\x1b[0m`, `[Gemini API] ${keyLabel} 调用成功！`)
      return result
    } catch (err) {
      lastError = err
      console.error('[Gemini Debug] 错误详情:', {
        message: err?.message,
        status: err?.status,
        statusText: err?.statusText,
        errorDetails: err?.errorDetails,
        response: err?.response != null ? '[present]' : undefined
      })
      if (err?.response != null) {
        try {
          console.error('[Gemini Debug] err.response 完整:', JSON.stringify(err.response, null, 2))
        } catch (_) {
          console.error('[Gemini Debug] err.response 无法序列化:', err.response)
        }
      }

      if (isRetryableError(err)) {
        const reason = err.status === 503 ? '503 服务过载' : '429 限流'
        console.warn(`\x1b[33m%s\x1b[0m`, `[Gemini API] ${keyLabel} ${reason}，准备切换下一个...`)
        globalKeyIndex++
        if (attempt < maxAttempts - 1) {
          console.log(`[Gemini API] 等待 ${KEY_SWITCH_DELAY_MS}ms 后再试下一枚 Key`)
          await new Promise((r) => setTimeout(r, KEY_SWITCH_DELAY_MS))
        }
        continue
      }

      console.error(`\x1b[31m%s\x1b[0m`, `[Gemini API] ${keyLabel} 发生非可重试错误:`, err.message)
      throw err
    }
  }

  // 所有 Key 都 429/503 时：按 API 返回的 retryDelay 等待后重试一整轮
  if (lastError && isRetryableError(lastError)) {
    const waitSec = getRetryDelaySeconds(lastError)
    if (waitSec != null && waitSec > 0) {
      console.warn(`[Gemini API] 所有 Key 均已 429/503，按 API 建议等待 ${waitSec}s 后重试一整轮...`)
      await new Promise((r) => setTimeout(r, waitSec * 1000))
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const currentIndex = globalKeyIndex % API_KEYS.length
        const currentKey = API_KEYS[currentIndex]
        const keyLabel = `Key-[#${currentIndex + 1}]`
        try {
          console.log(`[Gemini API] 重试轮 使用 ${keyLabel}...`)
          const genAI = new GoogleGenerativeAI(currentKey)
          const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            systemInstruction: systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
          })
          const result = await model.generateContent(contentParts)
          console.log(`[Gemini API] ${keyLabel} 重试成功！`)
          return result
        } catch (err) {
          lastError = err
          if (isRetryableError(err) && attempt < maxAttempts - 1) {
            globalKeyIndex++
            await new Promise((r) => setTimeout(r, KEY_SWITCH_DELAY_MS))
            continue
          }
          if (!isRetryableError(err)) throw err
        }
      }
    }
  }

  throw new Error(`[Gemini API] 所有配置的 Key 都已尝试但全部失败。最后错误: ${lastError?.message}`)
}

/**
 * 快捷函数：直接获取文本响应
 */
export async function generateContent(prompt) {
  const result = await generateContentWithRetry(prompt)
  return result.response.text()
}

/**
 * 检查 Gemini 连接（用于 GET ?action=checkGemini）
 */
export async function checkGeminiConnection() {
  if (!API_KEYS.length) {
    const msg = '[Gemini] 未配置 API Key（GEMINI_KEY_1/2/3）'
    if (typeof console !== 'undefined') console.warn(msg)
    return { ok: false, message: msg }
  }
  try {
    const result = await generateContentWithRetry('Reply with exactly: OK')
    const text = result?.response?.text()?.trim() || ''
    const msg = `[Gemini] ${GEMINI_MODEL} connection OK. Response: ${text.slice(0, 50)}`
    if (typeof console !== 'undefined') console.log(msg)
    return { ok: true, message: msg }
  } catch (err) {
    const msg = `[Gemini] Connection failed: ${err?.message || err}`
    if (typeof console !== 'undefined') console.error(msg)
    return { ok: false, message: msg }
  }
}

/** PDF 过大时 API 易超时或返回异常错误，建议单次不超过约 20MB（base64 后更大） */
const PDF_SIZE_WARN_BYTES = 10 * 1024 * 1024

/**
 * 规则解析专用函数
 */
export async function parseRules(rulesContent, pdfBuffer = null) {
  const textPrompt = `请将以下游戏规则解析为 JSON，严禁编造：\n\n${rulesContent || '（见 PDF 内容）'}\n\n注意：输出必须是合法 JSON 格式。`

  const parts = []
  if (pdfBuffer) {
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)
    const sizeBytes = buf.length
    if (sizeBytes > PDF_SIZE_WARN_BYTES) {
      console.warn(`[Gemini Debug] PDF 较大: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB，可能增加超时或 429 风险`)
    }
    const base64 = buf.toString('base64')
    parts.push({ inlineData: { mimeType: 'application/pdf', data: base64 } })
  }
  parts.push({ text: textPrompt })

  const textLen = (rulesContent || '').length
  const pdfBytes = pdfBuffer ? (Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer)).length : 0
  console.log('[Gemini Debug] Payload: rulesText 长度', textLen, '|', pdfBytes ? `PDF ${pdfBytes} bytes` : '仅文本')

  const result = await generateContentWithRetry(null, { parts })
  let text = result.response.text().trim()
  
  // 清洗 Markdown 的代码块标签
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error("JSON 解析失败，原始文本内容为:", text)
    throw new Error("AI 返回的格式不是有效的 JSON")
  }
}