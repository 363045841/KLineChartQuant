/**
 * 副图指标配置表
 *
 * 定义各副图指标的默认参数和标题信息获取函数，
 * 由 KLineChart.vue 消费，集中管理避免散落在组件中。
 */

import type { TitleInfo } from '../../renderers/paneTitle'
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
} from '../../renderers/Indicator'

export interface SubPaneIndicatorConfig {
  defaultParams: Record<string, number | boolean | string>
  getTitleInfo: (
    data: any[],
    index: number | null,
    params: Record<string, number | boolean | string>,
    pluginHost: PluginHost,
    paneId: string,  // 新增：paneId 参数
  ) => TitleInfo | null
}

export const SUB_PANE_INDICATOR_CONFIGS: Record<string, SubPaneIndicatorConfig> = {
  VOLUME: {
    defaultParams: {},
    getTitleInfo: () => ({ name: 'VOL', params: [], values: [] }),
  },
  MACD: {
    defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getMACDTitleInfo(
        index,
        (params.fastPeriod as number) ?? 12,
        (params.slowPeriod as number) ?? 26,
        (params.signalPeriod as number) ?? 9,
        pluginHost,
        paneId,  // 使用传入的 paneId
      )
    },
  },
  RSI: {
    defaultParams: { period1: 6, period2: 12, period3: 24 },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getRSITitleInfo(
        index,
        (params.period1 as number) ?? 6,
        (params.period2 as number) ?? 12,
        (params.period3 as number) ?? 24,
        pluginHost,
        paneId,
      )
    },
  },
  CCI: {
    defaultParams: { period: 14, showCCI: true },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getCCITitleInfo(
        index,
        (params.period as number) ?? 14,
        pluginHost,
        paneId,
      )
    },
  },
  STOCH: {
    defaultParams: { n: 9, m: 3, showK: true, showD: true },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getSTOCHTitleInfo(
        index,
        (params.n as number) ?? 9,
        (params.m as number) ?? 3,
        pluginHost,
        paneId,
      )
    },
  },
  MOM: {
    defaultParams: { period: 10, showMOM: true },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getMOMTitleInfo(
        index,
        (params.period as number) ?? 10,
        pluginHost,
        paneId,
      )
    },
  },
  WMSR: {
    defaultParams: { period: 14, showWMSR: true },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getWMSRTitleInfo(
        index,
        (params.period as number) ?? 14,
        pluginHost,
        paneId,
      )
    },
  },
  KST: {
    defaultParams: {
      roc1: 10, roc2: 15, roc3: 20, roc4: 30,
      signalPeriod: 9, showKST: true, showSignal: true,
    },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getKSTTitleInfo(
        index,
        (params.roc1 as number) ?? 10,
        (params.roc2 as number) ?? 15,
        (params.roc3 as number) ?? 20,
        (params.roc4 as number) ?? 30,
        (params.signalPeriod as number) ?? 9,
        pluginHost,
        paneId,
      )
    },
  },
  FASTK: {
    defaultParams: { period: 9, showFASTK: true },
    getTitleInfo: (_data, index, params, pluginHost, paneId) => {
      if (index === null) return null
      return getFASTKTitleInfo(
        index,
        (params.period as number) ?? 9,
        pluginHost,
        paneId,
      )
    },
  },
    ATR: {
        defaultParams: { period: 14, showATR: true },
        getTitleInfo: (_data, index, params, pluginHost, paneId) => {
            if (index === null) return null
            return getATRTitleInfo(
                index,
                (params.period as number) ?? 14,
                pluginHost,
                paneId,
            )
        },
    },
    WMA: {
        defaultParams: { period: 10, showWMA: true },
        getTitleInfo: () => ({ name: 'WMA', params: [], values: [] }),
    },
    DEMA: {
        defaultParams: { period: 14, showDEMA: true },
        getTitleInfo: () => ({ name: 'DEMA', params: [], values: [] }),
    },
    TEMA: {
        defaultParams: { period: 14, showTEMA: true },
        getTitleInfo: () => ({ name: 'TEMA', params: [], values: [] }),
    },
    HMA: {
        defaultParams: { period: 14, showHMA: true },
        getTitleInfo: () => ({ name: 'HMA', params: [], values: [] }),
    },
    KAMA: {
        defaultParams: { period: 10, fastPeriod: 2, slowPeriod: 30, showKAMA: true },
        getTitleInfo: () => ({ name: 'KAMA', params: [], values: [] }),
    },
    SAR: {
        defaultParams: { step: 0.02, maxStep: 0.2, showSAR: true },
        getTitleInfo: () => ({ name: 'SAR', params: [], values: [] }),
    },
    SUPERTREND: {
        defaultParams: { atrPeriod: 10, multiplier: 3, showSuperTrend: true },
        getTitleInfo: () => ({ name: 'SuperTrend', params: [], values: [] }),
    },
    KELTNER: {
        defaultParams: { emaPeriod: 20, atrPeriod: 10, multiplier: 2, showUpper: true, showMiddle: true, showLower: true },
        getTitleInfo: () => ({ name: 'Keltner', params: [], values: [] }),
    },
    DONCHIAN: {
        defaultParams: { period: 20, showUpper: true, showMiddle: true, showLower: true },
        getTitleInfo: () => ({ name: 'Donchian', params: [], values: [] }),
    },
    ICHIMOKU: {
        defaultParams: { tenkanPeriod: 9, kijunPeriod: 26, spanBPeriod: 52, displacement: 26, showTenkan: true, showKijun: true, showSpanA: true, showSpanB: true, showChikou: true, showCloud: true },
        getTitleInfo: () => ({ name: 'Ichimoku', params: [], values: [] }),
    },
    ROC: {
        defaultParams: { period: 12, showROC: true },
        getTitleInfo: () => ({ name: 'ROC', params: [], values: [] }),
    },
    TRIX: {
        defaultParams: { period: 15, signalPeriod: 9, showTRIX: true, showSignal: true },
        getTitleInfo: () => ({ name: 'TRIX', params: [], values: [] }),
    },
    HV: {
        defaultParams: { period: 20, annualizationFactor: 252, showHV: true },
        getTitleInfo: () => ({ name: 'HV', params: [], values: [] }),
    },
    PARKINSON: {
        defaultParams: { period: 20, annualizationFactor: 252, showParkinson: true },
        getTitleInfo: () => ({ name: 'Parkinson', params: [], values: [] }),
    },
    CHAIKIN_VOL: {
        defaultParams: { emaPeriod: 10, rocPeriod: 10, showChaikinVol: true },
        getTitleInfo: () => ({ name: 'ChaikinVol', params: [], values: [] }),
    },
    VMA: {
        defaultParams: { period: 5, showVMA: true },
        getTitleInfo: () => ({ name: 'VMA', params: [], values: [] }),
    },
    OBV: {
        defaultParams: { showOBV: true },
        getTitleInfo: () => ({ name: 'OBV', params: [], values: [] }),
    },
    PVT: {
        defaultParams: { showPVT: true },
        getTitleInfo: () => ({ name: 'PVT', params: [], values: [] }),
    },
    VWAP: {
        defaultParams: { sessionResetGapMs: 0, showVWAP: true },
        getTitleInfo: () => ({ name: 'VWAP', params: [], values: [] }),
    },
    CMF: {
        defaultParams: { period: 20, showCMF: true },
        getTitleInfo: () => ({ name: 'CMF', params: [], values: [] }),
    },
    MFI: {
        defaultParams: { period: 14, showMFI: true },
        getTitleInfo: () => ({ name: 'MFI', params: [], values: [] }),
    },
    PIVOT: {
        defaultParams: { showPP: true, showR1: true, showR2: true, showR3: false, showS1: true, showS2: true, showS3: false },
        getTitleInfo: () => ({ name: 'Pivot', params: [], values: [] }),
    },
    FIB: {
        defaultParams: { period: 50, showLevels: true },
        getTitleInfo: () => ({ name: 'Fib', params: [], values: [] }),
    },
    STRUCTURE: {
        defaultParams: { leftWindow: 2, rightWindow: 2, breakoutSource: 'close', showSwingLabels: true, showBOS: true, showCHOCH: true, showProvisional: false },
        getTitleInfo: () => ({ name: 'Structure', params: [], values: [] }),
    },
    ZONES: {
        defaultParams: { showFVG: true, showOB: true, showFilledZones: false, obLookback: 5 },
        getTitleInfo: () => ({ name: 'Zones', params: [], values: [] }),
    },
    VOLUME_PROFILE: {
        defaultParams: { bins: 24, lookback: 0, valueAreaPercent: 0.7, showVolumeProfile: true },
        getTitleInfo: () => ({ name: 'VP', params: [], values: [] }),
    },
}

export const SUB_PANE_INDICATORS = Object.keys(SUB_PANE_INDICATOR_CONFIGS) as SubIndicatorType[]
