/**
 * 副图指标配置表
 *
 * 定义各副图指标的默认参数和标题信息获取函数，
 * 由 KLineChart.vue 消费，集中管理避免散落在组件中。
 */

import type { TitleInfo } from '@/core/renderers/paneTitle'
import type { PluginHost } from '@/plugin'
import type { SubIndicatorType } from '@/core/renderers/Indicator'
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
} from '@/core/renderers/Indicator'

export interface SubPaneIndicatorConfig {
  defaultParams: Record<string, number | boolean>
  getTitleInfo: (
    data: any[],
    index: number | null,
    params: Record<string, number | boolean>,
    pluginHost: PluginHost,
    paneId: string,  // 新增：paneId 参数
  ) => TitleInfo | null
}

export const SUB_PANE_INDICATOR_CONFIGS: Record<SubIndicatorType, SubPaneIndicatorConfig> = {
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
}

export const SUB_PANE_INDICATORS = Object.keys(SUB_PANE_INDICATOR_CONFIGS) as SubIndicatorType[]
