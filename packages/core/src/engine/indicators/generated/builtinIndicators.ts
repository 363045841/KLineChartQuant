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
    descriptor: {"name":"structure","kind":"indicator","displayName":"Structure","category":"main","defaultPaneId":"sub_Structure","allowMainPane":true,"defaultParams":{"leftWindow":5,"rightWindow":2,"breakoutSource":"close"},"defaultOptions":{"showSwingLabels":true,"showBOS":true,"showCHOCH":true,"showProvisional":true}},
    load: () => import('../../renderers/Indicator/structure.js').then((module) => module.StructureIndicatorDefinition),
  },
  {
    descriptor: {"name":"volumeProfile","kind":"indicator","displayName":"VP","category":"volume","defaultPaneId":"sub_VolumeProfile","defaultParams":{"bins":24,"lookback":100,"valueAreaPercent":70},"defaultOptions":{"showPOC":true,"showValueArea":true}},
    load: () => import('../../renderers/Indicator/volumeProfile.js').then((module) => module.VolumeProfileIndicatorDefinition),
  },
  {
    descriptor: {"name":"zones","kind":"indicator","displayName":"Zones","category":"main","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"obLookback":20},"defaultOptions":{"showFVG":true,"showOB":true,"showFilledZones":true}},
    load: () => import('../../renderers/Indicator/zones.js').then((module) => module.ZonesDefinition),
  },
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
    descriptor: {"name":"lastPriceLine","kind":"system","displayName":"最新价虚线","category":"main","defaultPaneId":"main","dataViews":["kline"]},
    load: () => import('../../renderers/lastPrice.js').then((module) => module.LastPriceLineIndicatorDefinition),
  },
  {
    descriptor: {"name":"timeShare","kind":"system","displayName":"分时","category":"main","defaultPaneId":"main","dataViews":["timeshare"]},
    load: () => import('../../renderers/timeShare.js').then((module) => module.TimeShareIndicatorDefinition),
  },
]
