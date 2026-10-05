/** 图表级十字线覆盖层的帧输入，不依赖 pane Scene 分发。 */
import type { PaneInfo } from '../../../foundation/plugin/types.js'
import type { Viewport } from '../../chart/types.js'

export interface CrosshairOverlayFrame {
  viewport: Pick<Viewport, 'plotWidth' | 'plotHeight' | 'dpr'>
  pos: { x: number; y: number } | null
  price: number | null
  activePane: PaneInfo | null
  color: string
}
