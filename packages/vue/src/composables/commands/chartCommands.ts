/**
 * 图表内置命令目录。每条命令的 run 直接调用 controller 上、与 Agent 工具相同的
 * 动作，不另起实现。目录本身不依赖 Vue 响应式，只通过 host 拿当前 controller。
 */
import type { CommandDef } from '@363045841yyt/klinechart-core'
import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
import type { Component } from 'vue'
import IconTablerArrowBackUp from '~icons/tabler/arrow-back-up'
import IconTablerArrowForwardUp from '~icons/tabler/arrow-forward-up'
import IconTablerArrowNarrowLeft from '~icons/tabler/arrow-narrow-left'
import IconTablerArrowNarrowRight from '~icons/tabler/arrow-narrow-right'
import IconTablerCamera from '~icons/tabler/camera'
import IconTablerCommand from '~icons/tabler/command'
import IconTablerMaximize from '~icons/tabler/maximize'
import IconTablerRefresh from '~icons/tabler/refresh'
import IconTablerSettings from '~icons/tabler/settings'
import IconTablerZoomIn from '~icons/tabler/zoom-in'
import IconTablerZoomOut from '~icons/tabler/zoom-out'
import {
  type ChartScreenshotAction,
  chartScreenshotActions,
} from '../chart/useChartScreenshot.js'

/** 命令 id 到功能图标的映射；快捷键设置等界面据此展示命令图标。 */
export const CHART_COMMAND_ICONS: Readonly<Record<string, Component>> = {
  'palette.open': IconTablerCommand,
  'chart.snapshot': IconTablerCamera,
  'settings.open': IconTablerSettings,
  'drawing.undo': IconTablerArrowBackUp,
  'drawing.redo': IconTablerArrowForwardUp,
  'view.zoomIn': IconTablerZoomIn,
  'view.zoomOut': IconTablerZoomOut,
  'view.moveLeft': IconTablerArrowNarrowLeft,
  'view.moveRight': IconTablerArrowNarrowRight,
  'view.reset': IconTablerRefresh,
  'view.fullscreen': IconTablerMaximize,
}

/** 命令目录需要的宿主能力。 */
export interface ChartCommandHost {
  /** 当前图表的 controller；未就绪返回 null。 */
  readonly controller: () => ChartController | null
  /** 打开/关闭命令面板（⌘K 命令的动作）。 */
  openPalette(): void
  /** 切换图表容器的全屏状态。 */
  toggleFullscreen(): void
  /** 打开图表设置对话框。 */
  openSettings(): void
  /** 按截图动作导出图表图片（下载或复制到剪贴板）。 */
  screenshot(action: ChartScreenshotAction): void
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
      id: 'chart.snapshot',
      group: 'general',
      title: { zh: '截图', en: 'Take snapshot' },
      keywords: ['snapshot', 'screenshot', '截图', '导出图片'],
      shortcut: 'Alt+S',
      run: () => host.screenshot(chartScreenshotActions.download),
    },
    {
      id: 'settings.open',
      group: 'settings',
      title: { zh: '打开设置', en: 'Open settings' },
      keywords: ['settings', 'preferences', '设置'],
      shortcut: 'Mod+,',
      scope: 'global',
      allowInEditable: true,
      run: host.openSettings,
    },
    {
      id: 'view.zoomIn',
      group: 'view',
      title: { zh: '放大', en: 'Zoom in' },
      keywords: ['zoom', 'in', '放大'],
      shortcut: 'Mod+ArrowUp',
      when: () => controller() !== null,
      run: () => controller()?.zoomIn(),
    },
    {
      id: 'view.zoomOut',
      group: 'view',
      title: { zh: '缩小', en: 'Zoom out' },
      keywords: ['zoom', 'out', '缩小'],
      shortcut: 'Mod+ArrowDown',
      when: () => controller() !== null,
      run: () => controller()?.zoomOut(),
    },
    {
      id: 'view.moveLeft',
      group: 'view',
      title: { zh: '左移一根 K 线', en: 'Move chart one bar left' },
      keywords: ['scroll', 'left', 'previous', '左移', '上一根'],
      shortcut: 'ArrowLeft',
      when: () => controller() !== null,
      run: () => controller()?.scrollByBars(-1),
    },
    {
      id: 'view.moveRight',
      group: 'view',
      title: { zh: '右移一根 K 线', en: 'Move chart one bar right' },
      keywords: ['scroll', 'right', 'next', '右移', '下一根'],
      shortcut: 'ArrowRight',
      when: () => controller() !== null,
      run: () => controller()?.scrollByBars(1),
    },
    {
      id: 'view.reset',
      group: 'view',
      title: { zh: '重置图表', en: 'Reset chart' },
      keywords: ['reset', 'default', '重置', '默认视图'],
      shortcut: 'Alt+R',
      when: () => controller() !== null,
      run: () => controller()?.resetChart(),
    },
    {
      id: 'view.fullscreen',
      group: 'view',
      title: { zh: '全屏', en: 'Fullscreen' },
      keywords: ['fullscreen', '全屏'],
      shortcut: 'Shift+F',
      run: host.toggleFullscreen,
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
