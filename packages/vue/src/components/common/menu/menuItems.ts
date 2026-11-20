/**
 * 右键菜单的共享装配：按 group 合并声明，命令快捷键统一由注册表格式化。
 *
 * 图表菜单与图元菜单只在 label/icon/disabled 的领域规则上不同，装配流程一致。
 */
import type { CommandRegistry } from '@363045841yyt/klinechart-core'
import type { DropMenuGroup, DropMenuItem } from './DropMenu.vue'

/** 菜单声明；group 相同且相邻的项合并为一组。 */
export interface MenuItemDeclaration {
  readonly id: string
  readonly group: string
  readonly label: string
  /** 绑定的命令 id；提供时按注册表补快捷键。 */
  readonly command?: string
}

/** 取命令的首个快捷键并按平台格式化；未绑定或注册表缺失返回 undefined。 */
export function menuShortcut(
  commands: CommandRegistry | null,
  command: string | undefined,
): string | undefined {
  if (!command || !commands) return undefined
  const shortcut = commands.get(command)?.shortcut
  const combo = Array.isArray(shortcut) ? shortcut[0] : shortcut
  return combo ? commands.formatShortcut(combo) : undefined
}

/**
 * 按声明顺序合并同组菜单项。
 *
 * @param items 菜单声明
 * @param resolve 返回该项的渲染形态；返回 null 表示当前上下文不展示该项
 * @returns DropMenu 分组
 */
export function buildMenuGroups(
  items: readonly MenuItemDeclaration[],
  resolve: (item: MenuItemDeclaration) => DropMenuItem | null,
): DropMenuGroup[] {
  const groups: Array<{ id: string; label: string; items: DropMenuItem[] }> = []
  for (const item of items) {
    const entry = resolve(item)
    if (!entry) continue
    let group = groups.at(-1)
    if (group?.id !== item.group) {
      group = { id: item.group, label: '', items: [] }
      groups.push(group)
    }
    group.items.push(entry)
  }
  return groups
}
