/** 品种行情的唯一组装入口：一个业务对象，多种画法和附属显示，共用所属 Pane。 */
import type { FootprintRenderState } from '@/components/footprint/types.js'
import { bindRenderAxis } from '@/foundation/geometry/axisBinding.js'
import { RENDERER_PRIORITY, type RenderContext } from '@/foundation/plugin/index.js'
import { ChartDataViewId } from '@/foundation/types/chartView.js'
import type { DrawListLayer, Layer, RenderObjectDescriptor } from '@/rendering/scene/types.js'
import { createCandlePainter } from './candle.js'
import { createComparisonLineLayer } from './comparisonLine.js'
import { createExtremaMarkersLayer } from './extremaMarkers.js'
import { createFootprintLayer } from './footprint.js'
import { createLastPriceLineLayer } from './lastPrice.js'
import { CANDLE_LAYER_ID, PRICE_SERIES_AXIS_ID } from './rendererIds.js'
import { createTimeSharePainter } from './timeShareRendering/impl/createTimeSharePainter.js'

/** 主层身份不随视图或形态变化；切换画法不会改变对象树入口。 */
export function createPriceSeriesLayer(
  paneId: string,
  object?: RenderObjectDescriptor,
): DrawListLayer<RenderContext> {
  const candles = createCandlePainter()
  const timeShare = createTimeSharePainter()
  return {
    id: CANDLE_LAYER_ID,
    kind: 'draw-list',
    role: 'content',
    pane: paneId,
    z: RENDERER_PRIORITY.MAIN,
    visible: true,
    object,
    paint(context) {
      const bound = bindRenderAxis(context, PRICE_SERIES_AXIS_ID)
      if (context.dataView === ChartDataViewId.KLine) candles.paint(bound)
      else timeShare.paint(bound)
    },
    dispose() {
      candles.dispose()
      timeShare.dispose()
    },
  }
}

/** 所有内部层只在这里登记；领域管理器统一迁移、显隐和释放整组。 */
export function createPriceSeriesLayers(
  paneId: string,
  object: RenderObjectDescriptor,
  readFootprint: () => FootprintRenderState | null,
): ReadonlyArray<Layer<RenderContext>> {
  const layers: ReadonlyArray<Layer<RenderContext>> = [
    createPriceSeriesLayer(paneId, object),
    createFootprintLayer(readFootprint, paneId),
    createComparisonLineLayer(paneId),
    createLastPriceLineLayer(paneId),
    createExtremaMarkersLayer(paneId),
  ]
  return layers.map((layer) =>
    layer.id === CANDLE_LAYER_ID
      ? layer
      : {
          ...layer,
          paint: (context) => layer.paint(bindRenderAxis(context, PRICE_SERIES_AXIS_ID)),
        },
  )
}
