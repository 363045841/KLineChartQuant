// 五种视觉风格共用原有深浅主题；Pro 保持原始 Token，不复制涨跌规则。
import { darkTheme } from '../../theme-dark.js'
import { lightTheme } from '../../theme-light.js'
import { DEFAULT_THEME_PRESET, type ThemePreset } from '../types.js'
import { exchange, quant, terminal, zen } from './visualPalettes.js'
import { createVisualTheme } from './visualTheme.js'

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'pro',
    label: 'Pro · 专业',
    description: '原版基底 · 数据优先',
    schemes: { dark: darkTheme, light: lightTheme },
  },
  {
    id: 'exchange',
    label: 'Exchange · 交易',
    description: '分层面板 · 琥珀强调',
    schemes: {
      dark: createVisualTheme(darkTheme, exchange.dark, 'exchange'),
      light: createVisualTheme(lightTheme, exchange.light, 'exchange'),
    },
  },
  {
    id: 'terminal',
    label: 'Terminal · 终端',
    description: '紧凑控件 · 清晰边界',
    schemes: {
      dark: createVisualTheme(darkTheme, terminal.dark, 'terminal'),
      light: createVisualTheme(lightTheme, terminal.light, 'terminal'),
    },
  },
  {
    id: 'zen',
    label: 'Zen · 极简',
    description: '柔和网格 · 舒展留白',
    schemes: {
      dark: createVisualTheme(darkTheme, zen.dark, 'zen'),
      light: createVisualTheme(lightTheme, zen.light, 'zen'),
    },
  },
  {
    id: 'quant',
    label: 'Quant · 研究',
    description: '多色指标 · 研究工作台',
    schemes: {
      dark: createVisualTheme(darkTheme, quant.dark, 'quant'),
      light: createVisualTheme(lightTheme, quant.light, 'quant'),
    },
  },
]

/** 根据外部标识查找预设，用于配置归一化。 */
export function findThemePreset(id: unknown): ThemePreset | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id)
}

/** 未选择风格时保留现有基础主题，明暗偏好不受风格切换影响。 */
export function resolveBaseTheme(mode: 'light' | 'dark', id: unknown = DEFAULT_THEME_PRESET) {
  return findThemePreset(id)?.schemes[mode] ?? (mode === 'dark' ? darkTheme : lightTheme)
}
