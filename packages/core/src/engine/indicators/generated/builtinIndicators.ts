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
    descriptor: {"name":"alma","kind":"indicator","displayName":"ALMA","category":"main","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":9,"offset":0.85,"sigma":6},"defaultOptions":{"showALMA":true}},
    load: () => import('../../renderers/Indicator/alma.js').then((module) => module.ALMADefinition),
  },
  {
    descriptor: {"name":"fisherTransform","kind":"indicator","displayName":"Fisher","category":"oscillator","defaultPaneId":"sub_Fisher","defaultParams":{"period":10},"defaultOptions":{"showFisher":true,"showSignal":true}},
    load: () => import('../../renderers/Indicator/fisherTransform.js').then((module) => module.FisherTransformIndicatorDefinition),
  },
  {
    descriptor: {"name":"kama","kind":"indicator","displayName":"KAMA","category":"main","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":10,"fastPeriod":2,"slowPeriod":30},"defaultOptions":{"showKAMA":true}},
    load: () => import('../../renderers/Indicator/kama.js').then((module) => module.KAMADefinition),
  },
  {
    descriptor: {"name":"lsma","kind":"indicator","displayName":"LSMA","category":"main","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":25},"defaultOptions":{"showLSMA":true}},
    load: () => import('../../renderers/Indicator/lsma.js').then((module) => module.LSMADefinition),
  },
  {
    descriptor: {"name":"schaffTrendCycle","kind":"indicator","displayName":"STC","category":"oscillator","defaultPaneId":"sub_STC","defaultParams":{"fast":23,"slow":50,"cycle":10,"factor":0.5},"defaultOptions":{"showSTC":true}},
    load: () => import('../../renderers/Indicator/schaffTrendCycle.js').then((module) => module.SchaffTrendCycleIndicatorDefinition),
  },
  {
    descriptor: {"name":"smma","kind":"indicator","displayName":"SMMA","category":"main","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14},"defaultOptions":{"showSMMA":true}},
    load: () => import('../../renderers/Indicator/smma.js').then((module) => module.SMMADefinition),
  },
  {
    descriptor: {"name":"stochRSI","kind":"indicator","displayName":"StochRSI","category":"oscillator","defaultPaneId":"sub_StochRSI","defaultParams":{"period":14,"kPeriod":3,"dPeriod":3},"defaultOptions":{"showK":true,"showD":true}},
    load: () => import('../../renderers/Indicator/stochRSI.js').then((module) => module.StochRSIIndicatorDefinition),
  },
  {
    descriptor: {"name":"structure","kind":"indicator","displayName":"Structure","category":"main","defaultPaneId":"sub_Structure","allowMainPane":true,"defaultParams":{"leftWindow":5,"rightWindow":2,"breakoutSource":"close"},"defaultOptions":{"showSwingLabels":true,"showBOS":true,"showCHOCH":true,"showProvisional":true}},
    load: () => import('../../renderers/Indicator/structure.js').then((module) => module.StructureIndicatorDefinition),
  },
  {
    descriptor: {"name":"vidya","kind":"indicator","displayName":"vidya","category":"main","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14,"cmoPeriod":9},"defaultOptions":{"showVIDYA":true}},
    load: () => import('../../renderers/Indicator/vidya.js').then((module) => module.VIDYADefinition),
  },
  {
    descriptor: {"name":"volumeProfile","kind":"indicator","displayName":"VP","category":"volume","defaultPaneId":"sub_VolumeProfile","defaultParams":{"bins":24,"lookback":100,"valueAreaPercent":70},"defaultOptions":{"showPOC":true,"showValueArea":true}},
    load: () => import('../../renderers/Indicator/volumeProfile.js').then((module) => module.VolumeProfileIndicatorDefinition),
  },
  {
    descriptor: {"name":"zlema","kind":"indicator","displayName":"ZLEMA","category":"main","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14},"defaultOptions":{"showZLEMA":true}},
    load: () => import('../../renderers/Indicator/zlema.js').then((module) => module.ZLEMADefinition),
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
