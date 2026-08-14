import type { ChartDataManager } from '../data/chartDataManager'
import type { Pane, VisibleRange } from '../layout/pane'

import type { ChartModeHandler } from './types'

export class KLineMode implements ChartModeHandler {
  readonly debugName = 'KLine'

  readonly useIndicatorScheduler = true

  computeContentWidth(
    _dataLength: number,
    _leftBufferWidth: number,
    _viewWidth: number,
    _opt: { kWidth: number; kGap: number },
    _dpr: number,
  ): number | null {
    return null
  }

  computeKWidth(
    _dataLength: number,
    _viewWidth: number,
    _dpr: number,
  ): { kWidth: number; kGap: number } | null {
    return null
  }

  updatePaneRange(
    pane: Pane,
    range: VisibleRange,
    dm: ChartDataManager,
    mergedIndicatorRange?: { min: number; max: number } | null,
  ): void {
    pane.updateRange(dm.getInternalData(), range, mergedIndicatorRange)
  }

  onActivate(
    _chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      setRendererEnabled: (name: string, enabled: boolean) => void
      dataManager: ChartDataManager
      currentPeriod: string
    },
    _prev: ChartModeHandler | null,
  ): void {}

  onDeactivate(
    _chart: {
      enableMainIndicator: (
        id: string,
        params?: Record<string, number | boolean | string>,
      ) => boolean
      disableMainIndicator: (id: string) => boolean
      setRendererEnabled: (name: string, enabled: boolean) => void
      dataManager: ChartDataManager
    },
    _next: ChartModeHandler | null,
  ): void {}
}
