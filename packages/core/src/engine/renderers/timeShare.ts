/** 分时主图 Layer：单日分时与五日分时共用同一套绘制路径。 */

import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { DrawListLayer } from '../../rendering/scene/types.js'
import { createTimeSharePainter } from './timeShareRendering/impl/createTimeSharePainter.js'

/** 分时指标实例名；主图实例声明与 Layer 身份必须保持同一字符串。 */
const TIME_SHARE_INDICATOR = 'timeShare'

/** 分时主图 Layer：几何与分段由帧准备阶段统一提供。 */
export function createTimeShareLayer(): DrawListLayer<RenderContext> {
  const painter = createTimeSharePainter()
  return {
    id: makePluginLayerId(TIME_SHARE_INDICATOR),
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    kind: 'draw-list',
    paint(context) {
      if (context.dataView !== ChartDataViewId.TimeShare) return
      painter.paint(context)
    },
    dispose: painter.dispose,
  }
}
