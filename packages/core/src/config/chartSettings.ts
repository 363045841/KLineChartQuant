/**
 * 图表设置配置
 */

export interface SettingItem {
  key: string
  label: string
  type: 'boolean' | 'select'
  default: boolean | string
  group?: string
  options?: { value: string; label: string }[]
}

/**
 * 检测设备类型：mobile / tablet / desktop
 * 优先使用 Client Hints API (navigator.userAgentData)，不支持时回退到 UA + 屏幕/触控检测
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'

  const uaData = (navigator as any).userAgentData
  if (uaData?.formFactor) {
    const formFactor = uaData.formFactor as string
    if (formFactor === 'phone') return 'mobile'
    if (formFactor === 'tablet') return 'tablet'
    if (formFactor === 'desktop') return 'desktop'
  }

  if (uaData?.mobile === true) return 'mobile'
  if (uaData?.mobile === false) {
    // 明确非手机，但不确定是平板还是桌面，继续后续判断
  }

  const ua = navigator.userAgent.toLowerCase()
  const isMobileUA = /android.*mobile|webos|iphone|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua)
  if (isMobileUA) return 'mobile'

  const hasTouch = navigator.maxTouchPoints > 1
  const isTabletScreen = window.screen.width >= 768 && window.screen.width <= 1366

  if (hasTouch && isTabletScreen) return 'tablet'

  return 'desktop'
}

/** 移动端（含平板）默认不开启 WebGL */
const ENABLE_WEBGL_DEFAULT = getDeviceType() === 'desktop'

/** 默认设置配置 */
export const DEFAULT_SETTINGS = [
  { key: 'showGridLines', label: '显示网格', type: 'boolean', default: true, group: 'main' },
  { key: 'showVolumePriceMarkers', label: '显示量价关系标记', type: 'boolean', default: false, group: 'main' },
  { key: 'logarithmicScale', label: '对数价格轴', type: 'boolean', default: false, group: 'main' },
  { key: 'disableMainPaneVerticalScroll', label: '主图纵轴刻度自适应调整', type: 'boolean', default: true, group: 'main' },
  { key: 'isAsiaMarket', label: '亚洲市场颜色（红涨绿跌）', type: 'boolean', default: false, group: 'main' },
  { key: 'enableWebGLRendering', label: '启用 WebGL 硬件加速渲染', type: 'boolean', default: ENABLE_WEBGL_DEFAULT, group: 'main' },
  { key: 'theme', label: '主题', type: 'select', default: 'light', group: 'main', options: [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'auto', label: '跟随系统' },
  ] },
  { key: 'performanceTest10kKlines', label: '万条K线性能测试', type: 'boolean', default: false, group: 'experimental' },
  { key: 'enableCanvasProfiler', label: 'Canvas 性能分析插桩', type: 'boolean', default: false, group: 'experimental' },
] as const

/** 图表设置类型（从 DEFAULT_SETTINGS 自动推导，同时兼容扩展） */
export type ChartSettings = {
  [K in (typeof DEFAULT_SETTINGS)[number]['key']]?: boolean | string
} & Record<string, boolean | string | ColorPresetSettings | undefined> & {
  colorPresetSettings?: ColorPresetSettings
}

/** localStorage 存储键名 */
export const SETTINGS_STORAGE_KEY = 'kline-chart-settings'
import type { ColorPresetSettings } from '../tokens/colorPresetSettings'
