/**
 * 图表内置命令目录。每条命令的 run 直接调用 controller 上、与 Agent 工具相同的
 * 动作，不另起实现。目录本身不依赖 Vue 响应式，只通过 host 拿当前 controller。
 */
import type { CommandDef } from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Component } from 'vue'
import IconTablerArrowBackUp from '~icons/tabler/arrow-back-up'
import IconTablerArrowForwardUp from '~icons/tabler/arrow-forward-up'
import IconTablerCommand from '~icons/tabler/command'

/** 命令 id 到功能图标的映射；快捷键设置等界面据此展示命令图标。 */
export const CHART_COMMAND_ICONS: Readonly<Record<string, Component>> = {
  'palette.open': IconTablerCommand,
  'drawing.undo': IconTablerArrowBackUp,
  'drawing.redo': IconTablerArrowForwardUp,
}

/** 命令目录需要的宿主能力。 */
export interface ChartCommandHost {
  /** 当前图表的 controller；未就绪返回 null。 */
  readonly controller: () => ChartController | null
  /** 打开/关闭命令面板（⌘K 命令的动作）。 */
  openPalette(): void
}

/**
 * 生成图表命令全集。
 *
 * @param host - 宿主能力
 * @returns 命令定义数组
 */
export function createChartCommands(host: ChartCommandHost): CommandDef[] {
  const controller = host.controller
  return [
    {
      id: 'palette.open',
      group: 'general',
      title: { zh: '命令面板', en: 'Command palette' },
      keywords: ['search', 'command', '搜索'],
      shortcut: 'Mod+K',
      scope: 'global',
      allowInEditable: true,
      palette: false,
      run: host.openPalette,
    },
    {
      id: 'drawing.undo',
      group: 'drawing',
      title: { zh: '撤回', en: 'Undo' },
      keywords: ['undo'],
      shortcut: 'Mod+Z',
      when: () => controller()?.canUndoDrawing.peek() === true,
      run: () => controller()?.undoDrawing(),
    },
    {
      id: 'drawing.redo',
      group: 'drawing',
      title: { zh: '重做', en: 'Redo' },
      keywords: ['redo'],
      shortcut: ['Mod+Shift+Z', 'Mod+Y'],
      when: () => controller()?.canRedoDrawing.peek() === true,
      run: () => controller()?.redoDrawing(),
    },
  ]
}
