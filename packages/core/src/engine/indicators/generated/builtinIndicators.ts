/** 自动扫描 @Indicator 生成；请修改定义类，不要手动编辑。 */
import type {
  IndicatorDefinitionClass,
  IndicatorDescriptor,
} from '../indicatorDefinitionRegistry.js'

/** 内置定义的静态目录与按需加载入口；目录字段在编译期提取，读取目录不会加载实现。 */
export const BUILTIN_INDICATOR_MANIFEST: ReadonlyArray<{
  readonly descriptor: IndicatorDescriptor
  readonly load: () => Promise<IndicatorDefinitionClass>
}> = [
  {
    descriptor: {"name":"extremaMarkers","kind":"system","displayName":"极值标记","category":"main","defaultPaneId":"main","dataViews":["kline"]},
    load: () => import('../../renderers/extremaMarkers.js').then((module) => module.ExtremaMarkersIndicatorDefinition),
  },
  {
    descriptor: {"name":"fiveDayTimeShare","kind":"system","displayName":"五日分时","category":"main","defaultPaneId":"main","dataViews":["fiveDayTimeShare"]},
    load: () => import('../../renderers/fiveDayTimeShare.js').then((module) => module.FiveDayTimeShareIndicatorDefinition),
  },
  {
    descriptor: {"name":"lastPriceLabelRegistrar","kind":"system","displayName":"最新价标签注册","category":"main","defaultPaneId":"main","dataViews":["kline"]},
    load: () => import('../../renderers/lastPrice.js').then((module) => module.LastPriceLabelRegistrarIndicatorDefinition),
  },
  {
    descriptor: {"name":"lastPriceLine","kind":"system","displayName":"最新价点虚线","category":"main","defaultPaneId":"main","dataViews":["kline"]},
    load: () => import('../../renderers/lastPrice.js').then((module) => module.LastPriceLineIndicatorDefinition),
  },
  {
    descriptor: {"name":"timeShare","kind":"system","displayName":"分时","category":"main","defaultPaneId":"main","dataViews":["timeshare"]},
    load: () => import('../../renderers/timeShare.js').then((module) => module.TimeShareIndicatorDefinition),
  },
]
