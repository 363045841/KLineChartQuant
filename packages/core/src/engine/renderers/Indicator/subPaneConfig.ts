/**
 * 副图指标配置表
 *
 * 定义各副图指标的默认参数和标题信息获取函数，
 * 由 KLineChart.vue 消费，集中管理避免散落在组件中。
 */

import type { PluginHost } from '../../../plugin'
import type { SubIndicatorType } from '../../renderers/Indicator'
import {
    getMACDTitleInfo,
    getRSITitleInfo,
    getCCITitleInfo,
    getSTOCHTitleInfo,
    getMOMTitleInfo,
    getWMSRTitleInfo,
    getKSTTitleInfo,
    getFASTKTitleInfo,
    getATRTitleInfo,
    getROCTitleInfo,
    getTRIXTitleInfo,
    getHVTitleInfo,
    getParkinsonTitleInfo,
    getChaikinVolTitleInfo,
    getVMATitleInfo,
    getOBVTitleInfo,
    getPVTTitleInfo,
    getVWAPTitleInfo,
    getCMFTitleInfo,
    getMFITitleInfo,
    getVolumeProfileTitleInfo,
    getStructureTitleInfo,
    getWMATitleInfo,
    getDEMATitleInfo,
    getTEMATitleInfo,
    getHMATitleInfo,
    getKAMATitleInfo,
    getSARTitleInfo,
    getSuperTrendTitleInfo,
    getKeltnerTitleInfo,
    getDonchianTitleInfo,
    getIchimokuTitleInfo,
    getPivotTitleInfo,
    getFibTitleInfo,
    getZonesTitleInfo,
} from '../../renderers/Indicator'
import type { KLineData } from '../../../types/price'
import type { TitleInfo, GetTitleInfoFn } from '../../indicators/indicatorMetadata'

export interface SubPaneIndicatorConfig {
  defaultParams: Record<string, number | boolean | string>
  getTitleInfo: GetTitleInfoFn
}

export const SUB_PANE_INDICATOR_CONFIGS: Record<string, SubPaneIndicatorConfig> = {
  VOLUME: {
    defaultParams: {},
    getTitleInfo: (data, index) => {
      if (index === null) return null
      const kline = (data as KLineData[])[index]
      if (!kline || kline.volume === undefined) return null
      const color = kline.open < kline.close ? '#ef4444' : '#22c55e'
      return {
        name: 'VOL',
        params: [],
        values: [{ label: 'VOL', value: kline.volume, color }],
      }
    },
  },
  MACD: {
    defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    getTitleInfo: getMACDTitleInfo,
  },
  RSI: {
    defaultParams: { period1: 6, period2: 12, period3: 24 },
    getTitleInfo: getRSITitleInfo,
  },
  CCI: {
    defaultParams: { period: 14, showCCI: true },
    getTitleInfo: getCCITitleInfo,
  },
  STOCH: {
    defaultParams: { n: 9, m: 3, showK: true, showD: true },
    getTitleInfo: getSTOCHTitleInfo,
  },
  MOM: {
    defaultParams: { period: 10, showMOM: true },
    getTitleInfo: getMOMTitleInfo,
  },
  WMSR: {
    defaultParams: { period: 14, showWMSR: true },
    getTitleInfo: getWMSRTitleInfo,
  },
  KST: {
    defaultParams: {
      roc1: 10, roc2: 15, roc3: 20, roc4: 30,
      signalPeriod: 9, showKST: true, showSignal: true,
    },
    getTitleInfo: getKSTTitleInfo,
  },
  FASTK: {
    defaultParams: { period: 9, showFASTK: true },
    getTitleInfo: getFASTKTitleInfo,
  },
  ATR: {
    defaultParams: { period: 14, showATR: true },
    getTitleInfo: getATRTitleInfo,
  },
  WMA: {
    defaultParams: { period: 10, showWMA: true },
    getTitleInfo: getWMATitleInfo,
  },
  DEMA: {
    defaultParams: { period: 14, showDEMA: true },
    getTitleInfo: getDEMATitleInfo,
  },
  TEMA: {
    defaultParams: { period: 14, showTEMA: true },
    getTitleInfo: getTEMATitleInfo,
  },
  HMA: {
    defaultParams: { period: 14, showHMA: true },
    getTitleInfo: getHMATitleInfo,
  },
  KAMA: {
    defaultParams: { period: 10, fastPeriod: 2, slowPeriod: 30, showKAMA: true },
    getTitleInfo: getKAMATitleInfo,
  },
  SAR: {
    defaultParams: { step: 0.02, maxStep: 0.2, showSAR: true },
    getTitleInfo: getSARTitleInfo,
  },
  SUPERTREND: {
    defaultParams: { atrPeriod: 10, multiplier: 3, showSuperTrend: true },
    getTitleInfo: getSuperTrendTitleInfo,
  },
  KELTNER: {
    defaultParams: { emaPeriod: 20, atrPeriod: 10, multiplier: 2, showUpper: true, showMiddle: true, showLower: true },
    getTitleInfo: getKeltnerTitleInfo,
  },
  DONCHIAN: {
    defaultParams: { period: 20, showUpper: true, showMiddle: true, showLower: true },
    getTitleInfo: getDonchianTitleInfo,
  },
  ICHIMOKU: {
    defaultParams: { tenkanPeriod: 9, kijunPeriod: 26, spanBPeriod: 52, displacement: 26, showTenkan: true, showKijun: true, showSpanA: true, showSpanB: true, showChikou: true, showCloud: true },
    getTitleInfo: getIchimokuTitleInfo,
  },
  ROC: {
    defaultParams: { period: 12, showROC: true },
    getTitleInfo: getROCTitleInfo,
  },
  TRIX: {
    defaultParams: { period: 15, signalPeriod: 9, showTRIX: true, showSignal: true },
    getTitleInfo: getTRIXTitleInfo,
  },
  HV: {
    defaultParams: { period: 20, annualizationFactor: 252, showHV: true },
    getTitleInfo: getHVTitleInfo,
  },
  PARKINSON: {
    defaultParams: { period: 20, annualizationFactor: 252, showParkinson: true },
    getTitleInfo: getParkinsonTitleInfo,
  },
  CHAIKIN_VOL: {
    defaultParams: { emaPeriod: 10, rocPeriod: 10, showChaikinVol: true },
    getTitleInfo: getChaikinVolTitleInfo,
  },
  VMA: {
    defaultParams: { period: 5, showVMA: true },
    getTitleInfo: getVMATitleInfo,
  },
  OBV: {
    defaultParams: { showOBV: true },
    getTitleInfo: getOBVTitleInfo,
  },
  PVT: {
    defaultParams: { showPVT: true },
    getTitleInfo: getPVTTitleInfo,
  },
  VWAP: {
    defaultParams: { sessionResetGapMs: 0, showVWAP: true },
    getTitleInfo: getVWAPTitleInfo,
  },
  CMF: {
    defaultParams: { period: 20, showCMF: true },
    getTitleInfo: getCMFTitleInfo,
  },
  MFI: {
    defaultParams: { period: 14, showMFI: true },
    getTitleInfo: getMFITitleInfo,
  },
  PIVOT: {
    defaultParams: { showPP: true, showR1: true, showR2: true, showR3: false, showS1: true, showS2: true, showS3: false },
    getTitleInfo: getPivotTitleInfo,
  },
  FIB: {
    defaultParams: { period: 50, showLevels: true },
    getTitleInfo: getFibTitleInfo,
  },
  STRUCTURE: {
    defaultParams: { leftWindow: 2, rightWindow: 2, breakoutSource: 'close', showSwingLabels: true, showBOS: true, showCHOCH: true, showProvisional: false },
    getTitleInfo: getStructureTitleInfo,
  },
  ZONES: {
    defaultParams: { showFVG: true, showOB: true, showFilledZones: false, obLookback: 5 },
    getTitleInfo: getZonesTitleInfo,
  },
  VOLUME_PROFILE: {
    defaultParams: { bins: 24, lookback: 0, valueAreaPercent: 0.7, showVolumeProfile: true },
    getTitleInfo: getVolumeProfileTitleInfo,
  },
}

export const SUB_PANE_INDICATORS = Object.keys(SUB_PANE_INDICATOR_CONFIGS) as SubIndicatorType[]
