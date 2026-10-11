/**
 * 命令层的按键组合工具：把 DOM 键盘事件转成注册表使用的组合串。
 * 命令面板的“按键即搜索”与快捷键设置的录入共用这一份实现。
 */

/** 仅按下这些键时不算有效组合。 */
const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift']

/**
 * 把键盘事件转成注册表使用的组合串（如 `Mod+Shift+Z`）。
 *
 * @param event - DOM 键盘事件
 * @returns 组合串；只按修饰键时返回 null
 */
export function comboFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.includes(event.key)) return null
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const key = event.key === ' ' ? 'Space' : event.key
  if (!key) return null
  parts.push(key.length === 1 ? key.toUpperCase() : key)
  return parts.join('+')
}
