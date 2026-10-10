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
    descriptor: {"name":"alma","kind":"indicator","displayName":"ALMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":9,"offset":0.85,"sigma":6},"defaultOptions":{"showALMA":true}},
    load: () => import('../../renderers/Indicator/alma.js').then((module) => module.ALMADefinition),
  },
  {
    descriptor: {"name":"atr","kind":"indicator","displayName":"ATR","category":"oscillator","indicatorType":"volatility","defaultPaneId":"sub_ATR","defaultParams":{"period":14},"defaultOptions":{"showATR":true}},
    load: () => import('../../renderers/Indicator/atr.js').then((module) => module.ATRIndicatorDefinition),
  },
  {
    descriptor: {"name":"awesomeOscillator","kind":"indicator","displayName":"AO","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_AO","defaultParams":{"fast":5,"slow":34},"defaultOptions":{"showAO":true}},
    load: () => import('../../renderers/Indicator/awesomeOscillator.js').then((module) => module.AwesomeOscillatorIndicatorDefinition),
  },
  {
    descriptor: {"name":"boll","kind":"indicator","displayName":"BOLL","category":"main","indicatorType":"channel","defaultPaneId":"main","dataViews":["kline","timeshare","fiveDayTimeShare"],"defaultParams":{"period":20,"multiplier":2},"defaultOptions":{"showUpper":true,"showMiddle":true,"showLower":true}},
    load: () => import('../../renderers/Indicator/boll.js').then((module) => module.BOLLDefinition),
  },
  {
    descriptor: {"name":"cci","kind":"indicator","displayName":"CCI","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_CCI","defaultParams":{"period":14},"defaultOptions":{"showCCI":true}},
    load: () => import('../../renderers/Indicator/cci.js').then((module) => module.CCIIndicatorDefinition),
  },
  {
    descriptor: {"name":"chaikinVol","kind":"indicator","displayName":"ChaikinVol","category":"oscillator","indicatorType":"volatility","defaultPaneId":"sub_ChaikinVol","defaultParams":{"emaPeriod":10,"rocPeriod":10},"defaultOptions":{"showChaikinVol":true}},
    load: () => import('../../renderers/Indicator/chaikinVol.js').then((module) => module.ChaikinVolIndicatorDefinition),
  },
  {
    descriptor: {"name":"cmf","kind":"indicator","displayName":"CMF","category":"volume","indicatorType":"volume","defaultPaneId":"sub_CMF","defaultParams":{"period":20},"defaultOptions":{"showCMF":true}},
    load: () => import('../../renderers/Indicator/cmf.js').then((module) => module.CMFIndicatorDefinition),
  },
  {
    descriptor: {"name":"dema","kind":"indicator","displayName":"DEMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14},"defaultOptions":{"showDEMA":true}},
    load: () => import('../../renderers/Indicator/dema.js').then((module) => module.DEMADefinition),
  },
  {
    descriptor: {"name":"dma","kind":"indicator","displayName":"DMA","category":"oscillator","indicatorType":"trend","defaultPaneId":"sub_DMA","defaultParams":{"p1":10,"p2":50,"p3":10},"defaultOptions":{"showDMA":true}},
    load: () => import('../../renderers/Indicator/dma.js').then((module) => module.DMADefinition),
  },
  {
    descriptor: {"name":"donchian","kind":"indicator","displayName":"Donchian","category":"main","indicatorType":"channel","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":20},"defaultOptions":{"showUpper":true,"showMiddle":true,"showLower":true}},
    load: () => import('../../renderers/Indicator/donchian.js').then((module) => module.DonchianDefinition),
  },
  {
    descriptor: {"name":"dpo","kind":"indicator","displayName":"DPO","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_DPO","defaultParams":{"period":20},"defaultOptions":{"showDPO":true}},
    load: () => import('../../renderers/Indicator/dpo.js').then((module) => module.DPOIndicatorDefinition),
  },
  {
    descriptor: {"name":"ene","kind":"indicator","displayName":"ENE","category":"main","indicatorType":"channel","defaultPaneId":"main","defaultParams":{"period":10,"deviation":11}},
    load: () => import('../../renderers/Indicator/ene.js').then((module) => module.ENEDefinition),
  },
  {
    descriptor: {"name":"expma","kind":"indicator","displayName":"EXPMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","defaultParams":{"fastPeriod":12,"slowPeriod":50}},
    load: () => import('../../renderers/Indicator/expma.js').then((module) => module.EXPMADefinition),
  },
  {
    descriptor: {"name":"fastk","kind":"indicator","displayName":"FASTK","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_FASTK","defaultParams":{"period":9},"defaultOptions":{"showFASTK":true}},
    load: () => import('../../renderers/Indicator/fastk.js').then((module) => module.FASTKIndicatorDefinition),
  },
  {
    descriptor: {"name":"fib","kind":"indicator","displayName":"Fib","category":"main","indicatorType":"support-resistance","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":50},"defaultOptions":{"showLevels":true}},
    load: () => import('../../renderers/Indicator/fib.js').then((module) => module.FibDefinition),
  },
  {
    descriptor: {"name":"fisherTransform","kind":"indicator","displayName":"Fisher","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_Fisher","defaultParams":{"period":10},"defaultOptions":{"showFisher":true,"showSignal":true}},
    load: () => import('../../renderers/Indicator/fisherTransform.js').then((module) => module.FisherTransformIndicatorDefinition),
  },
  {
    descriptor: {"name":"footprint","kind":"indicator","displayName":"Footprint","category":"main","indicatorType":"volume","defaultPaneId":"main","defaultParams":{"rowMode":"averageRange","rowPeriod":20,"targetRows":15,"ticksPerRow":300,"imbalanceRatio":3,"metric":"turnover"},"defaultOptions":{"textMode":"bidAsk"}},
    load: () => import('../../renderers/Indicator/footprint.js').then((module) => module.FootprintIndicatorDefinition),
  },
  {
    descriptor: {"name":"frama","kind":"indicator","displayName":"frama","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":16},"defaultOptions":{"showFRAMA":true}},
    load: () => import('../../renderers/Indicator/frama.js').then((module) => module.FRAMADefinition),
  },
  {
    descriptor: {"name":"gmma","kind":"indicator","displayName":"GMMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{},"defaultOptions":{"showGMMA":true}},
    load: () => import('../../renderers/Indicator/gmma.js').then((module) => module.GMMADefinition),
  },
  {
    descriptor: {"name":"hma","kind":"indicator","displayName":"HMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14},"defaultOptions":{"showHMA":true}},
    load: () => import('../../renderers/Indicator/hma.js').then((module) => module.HMADefinition),
  },
  {
    descriptor: {"name":"hv","kind":"indicator","displayName":"HV","category":"oscillator","indicatorType":"volatility","defaultPaneId":"sub_HV","defaultParams":{"period":20,"annualizationFactor":252},"defaultOptions":{"showHV":true}},
    load: () => import('../../renderers/Indicator/hv.js').then((module) => module.HVIndicatorDefinition),
  },
  {
    descriptor: {"name":"ichimoku","kind":"indicator","displayName":"Ichimoku","category":"main","indicatorType":"trend","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"tenkanPeriod":9,"kijunPeriod":26,"spanBPeriod":52,"displacement":26},"defaultOptions":{"showTenkan":true,"showKijun":true,"showSpanA":true,"showSpanB":true,"showCloud":true,"showChikou":true}},
    load: () => import('../../renderers/Indicator/ichimoku.js').then((module) => module.IchimokuDefinition),
  },
  {
    descriptor: {"name":"kama","kind":"indicator","displayName":"KAMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":10,"fastPeriod":2,"slowPeriod":30},"defaultOptions":{"showKAMA":true}},
    load: () => import('../../renderers/Indicator/kama.js').then((module) => module.KAMADefinition),
  },
  {
    descriptor: {"name":"keltner","kind":"indicator","displayName":"Keltner","category":"main","indicatorType":"channel","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"emaPeriod":20,"atrPeriod":10,"multiplier":2},"defaultOptions":{"showUpper":true,"showMiddle":true,"showLower":true}},
    load: () => import('../../renderers/Indicator/keltner.js').then((module) => module.KeltnerDefinition),
  },
  {
    descriptor: {"name":"kst","kind":"indicator","displayName":"KST","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_KST","defaultParams":{"roc1":10,"roc2":15,"roc3":20,"roc4":30,"signalPeriod":9},"defaultOptions":{"showKST":true,"showSignal":true}},
    load: () => import('../../renderers/Indicator/kst.js').then((module) => module.KSTIndicatorDefinition),
  },
  {
    descriptor: {"name":"lsma","kind":"indicator","displayName":"LSMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":25},"defaultOptions":{"showLSMA":true}},
    load: () => import('../../renderers/Indicator/lsma.js').then((module) => module.LSMADefinition),
  },
  {
    descriptor: {"name":"ma","kind":"indicator","displayName":"MA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","defaultParams":{"period1":5,"period2":10,"period3":20,"period4":30,"period5":60},"defaultOptions":{"ma5":true,"ma10":true,"ma20":true,"ma30":true,"ma60":true}},
    load: () => import('../../renderers/Indicator/ma.js').then((module) => module.MADefinition),
  },
  {
    descriptor: {"name":"macd","kind":"indicator","displayName":"MACD","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_MACD","dataViews":["kline","timeshare","fiveDayTimeShare"],"defaultParams":{"fastPeriod":12,"slowPeriod":26,"signalPeriod":9},"defaultOptions":{"showDIF":true,"showDEA":true,"showBAR":true}},
    load: () => import('../../renderers/Indicator/macd.js').then((module) => module.MACDIndicatorDefinition),
  },
  {
    descriptor: {"name":"mfi","kind":"indicator","displayName":"MFI","category":"volume","indicatorType":"volume","defaultPaneId":"sub_MFI","defaultParams":{"period":14},"defaultOptions":{"showMFI":true}},
    load: () => import('../../renderers/Indicator/mfi.js').then((module) => module.MFIIndicatorDefinition),
  },
  {
    descriptor: {"name":"mom","kind":"indicator","displayName":"MOM","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_MOM","defaultParams":{"period":10},"defaultOptions":{"showMOM":true}},
    load: () => import('../../renderers/Indicator/mom.js').then((module) => module.MOMIndicatorDefinition),
  },
  {
    descriptor: {"name":"obv","kind":"indicator","displayName":"OBV","category":"volume","indicatorType":"volume","defaultPaneId":"sub_OBV","defaultParams":{},"defaultOptions":{"showOBV":true}},
    load: () => import('../../renderers/Indicator/obv.js').then((module) => module.OBVIndicatorDefinition),
  },
  {
    descriptor: {"name":"parkinson","kind":"indicator","displayName":"Parkinson","category":"oscillator","indicatorType":"volatility","defaultPaneId":"sub_Parkinson","defaultParams":{"period":20,"annualizationFactor":252},"defaultOptions":{"showParkinson":true}},
    load: () => import('../../renderers/Indicator/parkinson.js').then((module) => module.ParkinsonIndicatorDefinition),
  },
  {
    descriptor: {"name":"pivot","kind":"indicator","displayName":"Pivot","category":"main","indicatorType":"support-resistance","defaultPaneId":"main","allowMainPane":true,"defaultParams":{},"defaultOptions":{"showPP":true,"showR1":true,"showR2":true,"showR3":true,"showS1":true,"showS2":true,"showS3":true}},
    load: () => import('../../renderers/Indicator/pivot.js').then((module) => module.PivotDefinition),
  },
  {
    descriptor: {"name":"pvt","kind":"indicator","displayName":"PVT","category":"volume","indicatorType":"volume","defaultPaneId":"sub_PVT","defaultParams":{},"defaultOptions":{"showPVT":true}},
    load: () => import('../../renderers/Indicator/pvt.js').then((module) => module.PVTIndicatorDefinition),
  },
  {
    descriptor: {"name":"roc","kind":"indicator","displayName":"ROC","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_ROC","defaultParams":{"period":12},"defaultOptions":{"showROC":true}},
    load: () => import('../../renderers/Indicator/roc.js').then((module) => module.ROCIndicatorDefinition),
  },
  {
    descriptor: {"name":"rsi","kind":"indicator","displayName":"RSI","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_RSI","dataViews":["kline","timeshare","fiveDayTimeShare"],"defaultParams":{"period1":6,"period2":12,"period3":24},"defaultOptions":{"showRSI1":true,"showRSI2":true,"showRSI3":true}},
    load: () => import('../../renderers/Indicator/rsi.js').then((module) => module.RSIIndicatorDefinition),
  },
  {
    descriptor: {"name":"sar","kind":"indicator","displayName":"SAR","category":"main","indicatorType":"trend","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"step":0.02,"maxStep":0.2},"defaultOptions":{"showSAR":true}},
    load: () => import('../../renderers/Indicator/sar.js').then((module) => module.SARDefinition),
  },
  {
    descriptor: {"name":"schaffTrendCycle","kind":"indicator","displayName":"STC","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_STC","defaultParams":{"fast":23,"slow":50,"cycle":10,"factor":0.5},"defaultOptions":{"showSTC":true}},
    load: () => import('../../renderers/Indicator/schaffTrendCycle.js').then((module) => module.SchaffTrendCycleIndicatorDefinition),
  },
  {
    descriptor: {"name":"smma","kind":"indicator","displayName":"SMMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14},"defaultOptions":{"showSMMA":true}},
    load: () => import('../../renderers/Indicator/smma.js').then((module) => module.SMMADefinition),
  },
  {
    descriptor: {"name":"stoch","kind":"indicator","displayName":"KDJ","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_STOCH","dataViews":["kline","timeshare","fiveDayTimeShare"],"defaultParams":{"n":9,"m":3},"defaultOptions":{"showK":true,"showD":true,"showJ":true}},
    load: () => import('../../renderers/Indicator/stoch.js').then((module) => module.STOCHIndicatorDefinition),
  },
  {
    descriptor: {"name":"stochRSI","kind":"indicator","displayName":"StochRSI","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_StochRSI","defaultParams":{"period":14,"kPeriod":3,"dPeriod":3},"defaultOptions":{"showK":true,"showD":true}},
    load: () => import('../../renderers/Indicator/stochRSI.js').then((module) => module.StochRSIIndicatorDefinition),
  },
  {
    descriptor: {"name":"structure","kind":"indicator","displayName":"Structure","category":"main","indicatorType":"structure","defaultPaneId":"sub_Structure","allowMainPane":true,"defaultParams":{"leftWindow":5,"rightWindow":2,"breakoutSource":"close"},"defaultOptions":{"showSwingLabels":true,"showBOS":true,"showCHOCH":true,"showProvisional":true}},
    load: () => import('../../renderers/Indicator/structure.js').then((module) => module.StructureIndicatorDefinition),
  },
  {
    descriptor: {"name":"supertrend","kind":"indicator","displayName":"SuperTrend","category":"main","indicatorType":"trend","defaultPaneId":"sub_SuperTrend","allowMainPane":true,"defaultParams":{"atrPeriod":10,"multiplier":3},"defaultOptions":{"showSuperTrend":true}},
    load: () => import('../../renderers/Indicator/supertrend.js').then((module) => module.SuperTrendIndicatorDefinition),
  },
  {
    descriptor: {"name":"t3","kind":"indicator","displayName":"t3","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":5,"volumeFactor":0.7},"defaultOptions":{"showT3":true}},
    load: () => import('../../renderers/Indicator/t3.js').then((module) => module.T3Definition),
  },
  {
    descriptor: {"name":"tema","kind":"indicator","displayName":"TEMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14},"defaultOptions":{"showTEMA":true}},
    load: () => import('../../renderers/Indicator/tema.js').then((module) => module.TEMADefinition),
  },
  {
    descriptor: {"name":"trima","kind":"indicator","displayName":"TRIMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":20},"defaultOptions":{"showTRIMA":true}},
    load: () => import('../../renderers/Indicator/trima.js').then((module) => module.TRIMADefinition),
  },
  {
    descriptor: {"name":"trix","kind":"indicator","displayName":"TRIX","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_TRIX","defaultParams":{"period":15,"signalPeriod":9},"defaultOptions":{"showTRIX":true,"showSignal":true}},
    load: () => import('../../renderers/Indicator/trix.js').then((module) => module.TRIXIndicatorDefinition),
  },
  {
    descriptor: {"name":"ultimateOscillator","kind":"indicator","displayName":"UO","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_UO","defaultParams":{"p1":7,"p2":14,"p3":28},"defaultOptions":{"showUO":true}},
    load: () => import('../../renderers/Indicator/ultimateOscillator.js').then((module) => module.UltimateOscillatorIndicatorDefinition),
  },
  {
    descriptor: {"name":"vidya","kind":"indicator","displayName":"vidya","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14,"cmoPeriod":9},"defaultOptions":{"showVIDYA":true}},
    load: () => import('../../renderers/Indicator/vidya.js').then((module) => module.VIDYADefinition),
  },
  {
    descriptor: {"name":"vma","kind":"indicator","displayName":"VMA","category":"volume","indicatorType":"volume","defaultPaneId":"sub_VMA","defaultParams":{"period":5},"defaultOptions":{"showVMA":true}},
    load: () => import('../../renderers/Indicator/vma.js').then((module) => module.VMAIndicatorDefinition),
  },
  {
    descriptor: {"name":"volumeProfile","kind":"indicator","displayName":"VP","category":"volume","indicatorType":"volume","defaultPaneId":"sub_VolumeProfile","defaultParams":{"bins":24,"lookback":100,"valueAreaPercent":70},"defaultOptions":{"showPOC":true,"showValueArea":true}},
    load: () => import('../../renderers/Indicator/volumeProfile.js').then((module) => module.VolumeProfileIndicatorDefinition),
  },
  {
    descriptor: {"name":"vwap","kind":"indicator","displayName":"VWAP","category":"volume","indicatorType":"volume","defaultPaneId":"sub_VWAP","defaultParams":{"sessionResetGapMs":0},"defaultOptions":{"showVWAP":true}},
    load: () => import('../../renderers/Indicator/vwap.js').then((module) => module.VWAPIndicatorDefinition),
  },
  {
    descriptor: {"name":"vwma","kind":"indicator","displayName":"VWMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":20},"defaultOptions":{"showVWMA":true}},
    load: () => import('../../renderers/Indicator/vwma.js').then((module) => module.VWMADefinition),
  },
  {
    descriptor: {"name":"wma","kind":"indicator","displayName":"WMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":10},"defaultOptions":{"showWMA":true}},
    load: () => import('../../renderers/Indicator/wma.js').then((module) => module.WMADefinition),
  },
  {
    descriptor: {"name":"wmsr","kind":"indicator","displayName":"WMSR","category":"oscillator","indicatorType":"momentum","defaultPaneId":"sub_WMSR","defaultParams":{"period":14},"defaultOptions":{"showWMSR":true}},
    load: () => import('../../renderers/Indicator/wmsr.js').then((module) => module.WMSRIndicatorDefinition),
  },
  {
    descriptor: {"name":"zlema","kind":"indicator","displayName":"ZLEMA","category":"main","indicatorType":"moving-average","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"period":14},"defaultOptions":{"showZLEMA":true}},
    load: () => import('../../renderers/Indicator/zlema.js').then((module) => module.ZLEMADefinition),
  },
  {
    descriptor: {"name":"zones","kind":"indicator","displayName":"Zones","category":"main","indicatorType":"structure","defaultPaneId":"main","allowMainPane":true,"defaultParams":{"obLookback":20},"defaultOptions":{"showFVG":true,"showOB":true,"showFilledZones":true}},
    load: () => import('../../renderers/Indicator/zones.js').then((module) => module.ZonesDefinition),
  },
  {
    descriptor: {"name":"extremaMarkers","kind":"system","displayName":"极值标记","category":"main","indicatorType":"other","defaultPaneId":"main","dataViews":["kline"]},
    load: () => import('../../renderers/extremaMarkers.js').then((module) => module.ExtremaMarkersIndicatorDefinition),
  },
  {
    descriptor: {"name":"fiveDayTimeShare","kind":"system","displayName":"五日分时","category":"main","indicatorType":"other","defaultPaneId":"main","dataViews":["fiveDayTimeShare"]},
    load: () => import('../../renderers/fiveDayTimeShare.js').then((module) => module.FiveDayTimeShareIndicatorDefinition),
  },
  {
    descriptor: {"name":"lastPriceLabelRegistrar","kind":"system","displayName":"最新价标签注册","category":"main","indicatorType":"other","defaultPaneId":"main","dataViews":["kline"]},
    load: () => import('../../renderers/lastPrice.js').then((module) => module.LastPriceLabelRegistrarIndicatorDefinition),
  },
  {
    descriptor: {"name":"lastPriceLine","kind":"system","displayName":"最新价虚线","category":"main","indicatorType":"other","defaultPaneId":"main","dataViews":["kline"]},
    load: () => import('../../renderers/lastPrice.js').then((module) => module.LastPriceLineIndicatorDefinition),
  },
  {
    descriptor: {"name":"volume","kind":"indicator","displayName":"VOL","category":"volume","indicatorType":"volume","defaultPaneId":"sub","dataViews":["kline","timeshare"]},
    load: () => import('../../renderers/subVolume.js').then((module) => module.VolumeIndicatorDefinition),
  },
  {
    descriptor: {"name":"timeShare","kind":"system","displayName":"分时","category":"main","indicatorType":"other","defaultPaneId":"main","dataViews":["timeshare"]},
    load: () => import('../../renderers/timeShare.js').then((module) => module.TimeShareIndicatorDefinition),
  },
]
