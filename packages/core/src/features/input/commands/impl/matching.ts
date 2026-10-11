/**
 * 命令检索与展示的纯函数：匹配打分、字段取分、快捷键展示格式化。
 *
 * 不访问 DOM，便于单测；命令注册表、命令面板与快捷键表共用同一套规则，
 * 宿主也可用 scoreFields 给命令之外的面板来源（设置、品种）排名。
 */
import { canonicalCombo } from '../../keyboard.js'
import type { CommandDef } from '../types.js'

/**
 * 计算 query 与 text 的匹配得分（大小写不敏感），0 表示不匹配。
 * 顺序：完全相等 > 前缀 > 词首 > 子串 > 顺序子序列。
 *
 * @param query - 用户输入
 * @param text - 被匹配的字段
 * @returns 得分；0 为不匹配
 */
export function scoreTextMatch(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  if (q === '') return 1
  const t = text.toLowerCase()
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - Math.min(t.length - q.length, 100)
  const index = t.indexOf(q)
  if (index > 0) {
    const previous = t[index - 1] ?? ''
    const wordStart = /[\s_./:·（(-]/.test(previous)
    return (wordStart ? 600 : 400) - Math.min(index, 100)
  }
  // 子序列：query 每个字符按顺序出现，空隙越多分越低。
  let ti = 0
  let gaps = 0
  for (const ch of q) {
    if (ch === ' ') continue
    const found = t.indexOf(ch, ti)
    if (found === -1) return 0
    gaps += found - ti
    ti = found + 1
  }
  return Math.max(1, 200 - gaps * 5)
}

/**
 * 取 query 在多个字段中的最高得分。
 *
 * @param query - 用户输入
 * @param fields - 候选字段（undefined 跳过）
 * @returns 最高得分；0 为全部不匹配
 */
export function scoreFields(query: string, fields: ReadonlyArray<string | undefined>): number {
  let best = 0
  for (const field of fields) {
    if (!field) continue
    const score = scoreTextMatch(query, field)
    if (score > best) best = score
  }
  return best
}

/**
 * 命令的首个快捷键 combo（用于提示），无则返回 null。
 *
 * @param def - 命令定义
 * @returns 首个 combo 或 null
 */
export function primaryShortcut(def: CommandDef): string | null {
  if (def.shortcut === undefined) return null
  return typeof def.shortcut === 'string' ? def.shortcut : (def.shortcut[0] ?? null)
}

/** macOS 修饰键符号。 */
const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  Mod: '⌘',
  Meta: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
}

/** 具名按键的展示文案。 */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  Enter: '↵',
  ' ': 'Space',
}

/**
 * 按平台展示 combo：macOS 用符号（`⌘⇧Z`），其余用 `+` 连接（`Ctrl+Shift+Z`）。
 * 导出供测试与非注册表调用方使用。
 *
 * @param combo - combo 源字符串
 * @param mac - 是否 macOS
 * @returns 展示文案
 */
export function formatCombo(combo: string, mac: boolean): string {
  const parts = canonicalCombo(combo).split('+')
  const key = parts.pop() ?? ''
  const keyLabel = KEY_LABELS[key] ?? key
  if (mac) return parts.map((modifier) => MAC_SYMBOLS[modifier] ?? modifier).join('') + keyLabel
  return [...parts.map((modifier) => (modifier === 'Mod' ? 'Ctrl' : modifier)), keyLabel].join('+')
}
