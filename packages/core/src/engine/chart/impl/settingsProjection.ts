/**
 * 设置变化投影：把已提交设置映射到运行时资源。
 *
 * 只处理与资源生命周期相关的字段；其余设置由各自的订阅消费。
 */

import { resolveMarketDataCacheMaxBytes } from '../../../data/buffer/impl/marketDataPolicy.js'
import type { ChartSettings } from '../../../foundation/config/chartSettings.js'
import type { RendererBackend } from '../../../rendering/render/index.js'
import { UpdateLevel } from '../../pane/index.js'

/** 设置投影所需端口。 */
export interface ChartSettingsProjectionDeps {
  /** 提示浮层位置可能随设置改变。 */
  resetTooltipPlacement(): void
  /** 行情缓存上限写入唯一缓存。 */
  setCacheMaxBytes(bytes: number): void
  /** 切换渲染后端；返回的 promise 在资源就绪后完成。 */
  switchRendererBackend(backend: RendererBackend): Promise<void>
  /** 下一帧重新评估轴宽。 */
  unlockAxisWidth(): void
  scheduleDraw(level?: UpdateLevel): void
}

/** 一次比较并提交设置差异。 */
export function projectChartSettings(
  previous: Readonly<ChartSettings>,
  next: Readonly<ChartSettings>,
  deps: ChartSettingsProjectionDeps,
): void {
  deps.unlockAxisWidth()
  if (previous.tooltipPosition !== next.tooltipPosition) deps.resetTooltipPlacement()
  if (previous.marketDataCacheMaxMiB !== next.marketDataCacheMaxMiB)
    deps.setCacheMaxBytes(resolveMarketDataCacheMaxBytes(next.marketDataCacheMaxMiB))
  if (previous.rendererBackend !== next.rendererBackend) {
    void deps.switchRendererBackend(next.rendererBackend as RendererBackend).then(() => {
      deps.scheduleDraw(UpdateLevel.All)
    })
    return
  }
  deps.scheduleDraw()
}
