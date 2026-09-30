// 命名主题的契约，颜色仍由统一的语义 Token 表达。
import type { Theme } from '../types.js'

export type ThemePresetId = 'pro' | 'exchange' | 'terminal' | 'zen' | 'quant'

export const DEFAULT_THEME_PRESET: ThemePresetId = 'pro'

/** 风格映射所需的语义色表；不含市场方向字段。 */
export interface VisualPalette {
  background: string
  surface: string
  card: string
  input: string
  hover: string
  border: string
  borderStrong: string
  text: string
  muted: string
  accent: string
  onAccent: string
  gridMajor: string
  gridMinor: string
}

export interface ThemePreset {
  readonly id: ThemePresetId
  readonly label: string
  readonly description: string
  /** 明暗变体不携带市场方向，沿用独立的亚洲市场开关。 */
  readonly schemes: Readonly<Record<'light' | 'dark', Theme>>
}
