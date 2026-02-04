'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Minus, Plus } from 'lucide-react'

const CARD_STYLE =
  'rounded-2xl border-2 border-amber-400/60 bg-black/40 backdrop-blur-xl shadow-[0_0_40px_rgba(212,168,83,0.15),0_25px_50px_rgba(0,0,0,0.5)] p-6'

/** 标准化选项：支持 {id,label}、字符串、或 {value,label} */
function normalizeOptions(opts) {
  if (!Array.isArray(opts)) return []
  return opts.map((o) => {
    if (typeof o === 'string') return { id: o, label: o }
    const id = o?.id ?? o?.value ?? o?.label
    const label = o?.label ?? o?.id ?? o?.value ?? String(id ?? '')
    return { id, label }
  }).filter((o) => o.id != null && o.id !== '')
}

/**
 * SELECT: 列表选择器，支持单选/多选，底部「确认提交」
 */
function SelectBlock({ action, onSubmit, disabled = false }) {
  const min = action.min ?? 1
  const max = action.max ?? 1
  const isMulti = max > 1
  const [selected, setSelected] = useState([])
  const options = normalizeOptions(action.options || action.action_options || [])

  const toggle = (id) => {
    if (isMulti) {
      setSelected((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        if (next.length > max) return prev
        return next
      })
    } else {
      setSelected([id])
    }
  }

  const canSubmit = selected.length >= min && selected.length <= max

  return (
    <div className="space-y-4">
      {action.title && (
        <h3 className="text-lg font-semibold text-amber-200/95 tracking-wide">{action.title}</h3>
      )}
      <div className="flex flex-wrap gap-3">
        {options.map((opt) => {
          const isActive = selected.includes(opt.id)
          return (
            <motion.button
              key={opt.id}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => toggle(opt.id)}
              className={`min-w-[120px] px-4 py-3 rounded-xl border-2 text-left transition-all ${
                isActive
                  ? 'border-amber-400 bg-amber-500/25 text-amber-100 shadow-lg shadow-amber-500/20'
                  : 'border-amber-400/30 bg-white/5 text-gray-300 hover:border-amber-400/50 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                {opt.label}
                {isActive && <Check className="w-5 h-5 text-amber-400 shrink-0" />}
              </span>
            </motion.button>
          )
        })}
      </div>
      <motion.button
        type="button"
        disabled={!canSubmit || disabled}
        whileHover={canSubmit ? { scale: 1.02 } : {}}
        whileTap={canSubmit ? { scale: 0.98 } : {}}
        onClick={() => onSubmit({ selectedIds: selected })}
        className={`w-full py-3 rounded-xl font-semibold border-2 transition-all ${
          canSubmit
            ? 'border-amber-400 bg-amber-500/30 text-amber-100 hover:bg-amber-500/40'
            : 'border-amber-400/20 bg-white/5 text-gray-500 cursor-not-allowed'
        }`}
      >
        Confirm
      </motion.button>
    </div>
  )
}

/**
 * INPUT: 数值调节器，大 + / - 按钮，校验 min/max
 */
function InputBlock({ action, onSubmit, disabled = false }) {
  const { value: initial = 0, min = 0, max = 100, step = 1, title } = action
  const [value, setValue] = useState(Math.max(min, Math.min(max, initial)))

  const clamp = (v) => Math.max(min, Math.min(max, v))

  const inc = () => setValue((v) => clamp(v + step))
  const dec = () => setValue((v) => clamp(v - step))
  const change = (e) => {
    const n = Number(e.target.value)
    if (!Number.isNaN(n)) setValue(clamp(n))
  }

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-amber-200/95 tracking-wide">{title}</h3>
      )}
      <div className="flex items-center justify-center gap-4">
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={dec}
          disabled={value <= min}
          className="w-14 h-14 rounded-xl border-2 border-amber-400/60 bg-amber-500/20 text-amber-100 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-500/30 transition-colors"
        >
          <Minus className="w-6 h-6" />
        </motion.button>
        <input
          type="number"
          value={value}
          onChange={change}
          min={min}
          max={max}
          step={step}
          className="w-24 h-14 rounded-xl border-2 border-amber-400/50 bg-black/30 text-center text-xl font-bold text-amber-100 focus:outline-none focus:border-amber-400"
        />
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={inc}
          disabled={value >= max}
          className="w-14 h-14 rounded-xl border-2 border-amber-400/60 bg-amber-500/20 text-amber-100 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-500/30 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      </div>
      <p className="text-center text-sm text-gray-400">
        范围 {min} ~ {max}
      </p>
      <motion.button
        type="button"
        disabled={disabled}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
        onClick={() => !disabled && onSubmit({ value })}
        className={`w-full py-3 rounded-xl font-semibold border-2 border-amber-400 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'bg-amber-500/30 text-amber-100 hover:bg-amber-500/40'}`}
      >
        Confirm
      </motion.button>
    </div>
  )
}

/**
 * CONFIRM: 布尔开关，绿色「是/发动」、红色「否/跳过」
 */
function ConfirmBlock({ action, onSubmit, disabled = false }) {
  const title = action.title ?? action.label
  const message = action.message ?? (action.label !== title ? action.label : null)
  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-amber-200/95 tracking-wide">{title}</h3>
      )}
      {message && (
        <p className="text-gray-300 text-sm leading-relaxed">{message}</p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <motion.button
          type="button"
          disabled={disabled}
          whileHover={!disabled ? { scale: 1.03 } : {}}
          whileTap={!disabled ? { scale: 0.97 } : {}}
          onClick={() => !disabled && onSubmit({ confirmed: true })}
          className={`py-4 rounded-xl border-2 border-emerald-400/70 font-semibold transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/50 shadow-lg shadow-emerald-500/20'}`}
        >
          Yes / Act
        </motion.button>
        <motion.button
          type="button"
          disabled={disabled}
          whileHover={!disabled ? { scale: 1.03 } : {}}
          whileTap={!disabled ? { scale: 0.97 } : {}}
          onClick={() => !disabled && onSubmit({ confirmed: false })}
          className={`py-4 rounded-xl border-2 border-red-400/60 font-semibold transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'bg-red-500/25 text-red-100 hover:bg-red-500/40 shadow-lg shadow-red-500/20'}`}
        >
          No / Skip
        </motion.button>
      </div>
    </div>
  )
}

/**
 * VIEW: 信息反馈，格式化文本 +「我已阅读/确认」关闭
 */
function ViewBlock({ action, onConfirm, disabled = false }) {
  return (
    <div className="space-y-4">
      {action.title && (
        <h3 className="text-lg font-semibold text-amber-200/95 tracking-wide">{action.title}</h3>
      )}
      <div className="rounded-xl bg-white/5 border border-amber-400/20 p-4 text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
        {action.content ?? ''}
      </div>
      <motion.button
        type="button"
        disabled={disabled}
        whileHover={!disabled ? { scale: 1.02 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
        onClick={() => !disabled && onConfirm()}
        className={`w-full py-3 rounded-xl font-semibold border-2 border-amber-400 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'bg-amber-500/30 text-amber-100 hover:bg-amber-500/40'}`}
      >
        I have read / Confirm
      </motion.button>
    </div>
  )
}

/**
 * ActionCard：承载 AI 的 4 种交互协议（SELECT / INPUT / CONFIRM / VIEW）
 * @param {object} pending_action - { type, ... } 对应协议字段
 * @param {function} onComplete - 提交时回调，payload 依 type 不同
 * @param {function} onClose - VIEW 确认或外部关闭时调用
 */
export default function ActionCard({ pending_action, onComplete, onClose, disabled = false }) {
  if (!pending_action || !pending_action.type) return null

  const handleSubmit = (payload) => {
    onComplete?.(payload)
    onClose?.()
  }

  const handleViewConfirm = () => {
    onComplete?.({ confirmed: true })
    onClose?.()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`w-full max-w-lg mx-auto ${CARD_STYLE}`}
    >
        {pending_action.type === 'SELECT' && (
          <SelectBlock action={pending_action} onSubmit={handleSubmit} disabled={disabled} />
        )}
        {pending_action.type === 'INPUT' && (
          <InputBlock action={pending_action} onSubmit={handleSubmit} disabled={disabled} />
        )}
        {pending_action.type === 'CONFIRM' && (
          <ConfirmBlock action={pending_action} onSubmit={handleSubmit} disabled={disabled} />
        )}
        {pending_action.type === 'VIEW' && (
          <ViewBlock action={pending_action} onConfirm={handleViewConfirm} disabled={disabled} />
        )}
    </motion.div>
  )
}
