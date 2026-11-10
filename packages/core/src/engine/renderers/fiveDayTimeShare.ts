/** 五日分时主图 Layer：与单日分时共用同一套几何契约和绘制路径。 */

import { makePluginLayerId } from '../../foundation/plugin/impl/rendererLayerId.js'
import type { RenderContext } from '../../foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '../../foundation/plugin/index.js'
import { ChartDataViewId } from '../../foundation/types/chartView.js'
import type { DrawListLayer } from '../../rendering/scene/types.js'
import { createTimeSharePainter } from './timeShareRendering/impl/createTimeSharePainter.js'

/** 五日分时主图 Layer：按几何层给出的交易日与连续槽位段绘制。 */
export function createFiveDayTimeShareLayer(): DrawListLayer<RenderContext> {
  const painter = createTimeSharePainter()
  return {
    id: makePluginLayerId(ChartDataViewId.FiveDayTimeShare),
    role: 'primary',
    pane: 'main',
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    kind: 'draw-list',
    paint(context) {
      if (context.dataView !== ChartDataViewId.FiveDayTimeShare) return
      painter.paint(context)
    },
    dispose: painter.dispose,
  }
}
