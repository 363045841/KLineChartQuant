/**
 * 图表内置命令。每条命令的 run 都调用与 UI 控件、Agent 工具相同的动作：
 * 设置类命令走 settingsCommands（settings_update），图元删除走 removeBatch（drawing_delete 同源），
 * 不另起实现。命令面板、快捷键与 `?` 快捷键表都从这里注册的条目生成。
 */
import { type CommandDef, type CommandTitle, THEME_PRESETS } from '@363045841yyt/klinechart-core'
import { DEFAULT_SETTINGS, type SettingItem } from '@363045841yyt/klinechart-core/config'
import {
  type ChartController,
  CURSOR_DRAWING_TOOL_ID,
  DrawingTool,
} from '@363045841yyt/klinechart-core/controllers'

import { SETTING_LABELS_EN, settingValueLabel } from '../settings/settingsSections.js'

/** 命令分组：面板按此分组展示，快捷键表按此排序。 */
export const COMMAND_GROUPS: ReadonlyArray<{ readonly id: string; readonly title: CommandTitle }> =
  [
    { id: 'general', title: { zh: '通用', en: 'General' } },
    { id: 'drawing', title: { zh: '画线', en: 'Drawing' } },
    { id: 'view', title: { zh: '视图', en: 'View' } },
    { id: 'appearance', title: { zh: '外观', en: 'Appearance' } },
    { id: 'settings', title: { zh: '设置', en: 'Settings' } },
  ]

export interface ChartCommandHost {
  readonly controller: () => ChartController | null
  openPalette(): void
  openShortcuts(): void
  openSettings(): void
  openIndicators(): void
  toggleFullscreen(): void
  selectTool(toolId: string): void
  zoomIn(): void
  zoomOut(): void
  /** 当前是否有选中图元。 */
  hasSelection(): boolean
  /** 删除当前选中图元（与工具条删除按钮同一路径）。 */
  deleteSelection(): void
}

const SETTING_ITEMS = DEFAULT_SETTINGS as unknown as ReadonlyArray<SettingItem>

const DRAWING_SHORTCUTS: ReadonlyArray<{
  readonly tool: string
  readonly title: CommandTitle
  readonly shortcut?: string
  readonly keywords?: ReadonlyArray<string>
}> = [
  { tool: CURSOR_DRAWING_TOOL_ID, title: { zh: '光标', en: 'Cursor' }, shortcut: 'Alt+C' },
  { tool: DrawingTool.TrendLine, title: { zh: '线段', en: 'Trend line' }, shortcut: 'Alt+T' },
  {
    tool: DrawingTool.HorizontalLine,
    title: { zh: '水平线', en: 'Horizontal line' },
    shortcut: 'Alt+H',
  },
  {
    tool: DrawingTool.VerticalLine,
    title: { zh: '垂直线', en: 'Vertical line' },
    shortcut: 'Alt+V',
  },
  {
    tool: DrawingTool.FibRetracement,
    title: { zh: '斐波那契回撤', en: 'Fib retracement' },
    shortcut: 'Alt+F',
    keywords: ['fibonacci'],
  },
  { tool: DrawingTool.Rectangle, title: { zh: '矩形', en: 'Rectangle' } },
  { tool: DrawingTool.Ray, title: { zh: '射线', en: 'Ray' } },
  { tool: DrawingTool.ParallelChannel, title: { zh: '平行通道', en: 'Parallel channel' } },
]

/** 由设置元数据生成“切换/设为”命令，使命令面板可直接检索与修改设置。 */
export function createSettingCommands(host: ChartCommandHost): CommandDef[] {
  const commands: CommandDef[] = []
  const settings = () => host.controller()?.settings.peek()
  const write = (values: Record<string, unknown>) =>
    host.controller()?.settingsCommands.applyValues(values)

  for (const item of SETTING_ITEMS) {
    const en = SETTING_LABELS_EN[item.key] ?? item.key
    if (item.type === 'boolean') {
      commands.push({
        id: `settings.toggle.${item.key}`,
        group: 'settings',
        title: { zh: `切换${item.label}`, en: `Toggle ${en.toLowerCase()}` },
        keywords: [item.key, item.label, en],
        tool: 'settings_update',
        when: () => host.controller() !== null,
        run: () => write({ [item.key]: !settings()?.[item.key] }),
      })
      continue
    }
    for (const option of item.options ?? []) {
      commands.push({
        id: `settings.set.${item.key}.${option.value}`,
        group: item.key === 'theme' ? 'appearance' : 'settings',
        title: {
          zh: `${item.label}：${settingValueLabel(item, option.value)}`,
          en: `${en}: ${option.label}`,
        },
        keywords: [item.key, option.value],
        tool: 'settings_update',
        when: () => host.controller() !== null && settings()?.[item.key] !== option.value,
        run: () => write({ [item.key]: option.value }),
      })
    }
  }

  for (const preset of THEME_PRESETS) {
    commands.push({
      id: `settings.preset.${preset.id}`,
      group: 'appearance',
      title: { zh: `主题风格：${preset.label}`, en: `Theme style: ${preset.id}` },
      keywords: [preset.id, preset.description, 'preset', 'theme', '主题'],
      tool: 'settings_update',
      when: () => host.controller() !== null,
      run: () => {
        const current = settings()?.colorPresetSettings ?? {}
        write({ colorPresetSettings: { ...current, preset: preset.id } })
      },
    })
  }
  return commands
}

/** 图表内置命令全集。 */
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
      id: 'help.shortcuts',
      group: 'general',
      title: { zh: '快捷键一览', en: 'Keyboard shortcuts' },
      keywords: ['help', 'keys', 'hotkeys', '帮助'],
      shortcut: '?',
      scope: 'global',
      run: host.openShortcuts,
    },
    {
      id: 'settings.open',
      group: 'general',
      title: { zh: '打开设置', en: 'Open settings' },
      keywords: ['preferences', 'options', '偏好'],
      shortcut: 'Mod+,',
      scope: 'global',
      run: host.openSettings,
    },
    {
      id: 'indicators.open',
      group: 'general',
      title: { zh: '添加指标', en: 'Add indicator' },
      keywords: ['indicator', 'study', 'MA', 'MACD', 'RSI'],
      shortcut: '/',
      run: host.openIndicators,
    },
    {
      id: 'drawing.undo',
      group: 'drawing',
      title: { zh: '撤销画线', en: 'Undo drawing' },
      keywords: ['undo'],
      shortcut: 'Mod+Z',
      when: () => controller()?.canUndoDrawing.peek() === true,
      run: () => controller()?.undoDrawing(),
    },
    {
      id: 'drawing.redo',
      group: 'drawing',
      title: { zh: '重做画线', en: 'Redo drawing' },
      keywords: ['redo'],
      shortcut: ['Mod+Shift+Z', 'Mod+Y'],
      when: () => controller()?.canRedoDrawing.peek() === true,
      run: () => controller()?.redoDrawing(),
    },
    {
      id: 'drawing.delete',
      group: 'drawing',
      title: { zh: '删除选中图元', en: 'Delete selected drawings' },
      keywords: ['remove', 'delete'],
      shortcut: ['Delete', 'Backspace'],
      tool: 'drawing_delete',
      when: host.hasSelection,
      run: host.deleteSelection,
    },
    {
      id: 'drawing.clearAll',
      group: 'drawing',
      title: { zh: '清除全部图元', en: 'Clear all drawings' },
      keywords: ['remove all', 'clear'],
      tool: 'drawings_clear',
      when: () => (controller()?.drawings.peek().length ?? 0) > 0,
      run: () => controller()?.clearDrawings(),
    },
    ...DRAWING_SHORTCUTS.map(
      (entry): CommandDef => ({
        id: `drawing.tool.${entry.tool}`,
        group: 'drawing',
        title: entry.title,
        keywords: ['draw', '画线', entry.tool, ...(entry.keywords ?? [])],
        ...(entry.shortcut ? { shortcut: entry.shortcut } : {}),
        run: () => host.selectTool(entry.tool),
      }),
    ),
    {
      id: 'view.zoomIn',
      group: 'view',
      title: { zh: '放大', en: 'Zoom in' },
      run: host.zoomIn,
    },
    {
      id: 'view.zoomOut',
      group: 'view',
      title: { zh: '缩小', en: 'Zoom out' },
      run: host.zoomOut,
    },
    {
      id: 'view.fullscreen',
      group: 'view',
      title: { zh: '切换全屏', en: 'Toggle fullscreen' },
      keywords: ['fullscreen', 'maximize'],
      shortcut: 'Shift+F',
      run: host.toggleFullscreen,
    },
    {
      id: 'view.resetPriceAxis',
      group: 'view',
      title: { zh: '重置价格轴', en: 'Reset price scale' },
      keywords: ['auto fit', 'axis'],
      shortcut: 'Alt+R',
      run: () => controller()?.resetMainPriceAxis(),
    },
    ...createSettingCommands(host),
  ]
}
