/** 一目均衡表声明五条 Plot，云层引用 spanA 和 spanB。 */
import { calcIchimokuData } from '@/engine/indicators/calculators/index.js'
import { Indicator } from '@/engine/indicators/indicatorDecorator.js'
import { IndicatorKind } from '@/engine/indicators/indicatorMetadata.js'
import { plotRenderer } from '@/engine/plots/impl/plotDefinition.js'
@Indicator({
  name: 'ichimoku',
  displayName: 'Ichimoku',
  kind: IndicatorKind.Indicator,
  category: 'main',
  defaultPaneId: 'main',
  allowMainPane: true,
  mainPane: {
    toActiveConfig: (params, active) => ({
      ...params,
      showTenkan: active,
      showKijun: active,
      showSpanA: active,
      showSpanB: active,
      showChikou: active,
      showCloud: active,
    }),
  },
  scale: { indicatorKey: 'ichimoku', label: 'Ichimoku', decimals: 2 },
  plots: {
    series: [
      {
        id: 'tenkan',
        label: 'TENKAN',
        field: 'tenkan',
        show: 'showTenkan',
        color: (c) => c.ichimoku.tenkan,
      },
      {
        id: 'kijun',
        label: 'KIJUN',
        field: 'kijun',
        show: 'showKijun',
        color: (c) => c.ichimoku.kijun,
      },
      {
        id: 'spanA',
        label: 'SPAN A',
        field: 'spanA',
        show: 'showSpanA',
        color: (c) => c.ichimoku.spanA,
      },
      {
        id: 'spanB',
        label: 'SPAN B',
        field: 'spanB',
        show: 'showSpanB',
        color: (c) => c.ichimoku.spanB,
      },
      {
        id: 'chikou',
        label: 'CHIKOU',
        field: 'chikou',
        show: 'showChikou',
        color: (c) => c.ichimoku.chikou,
      },
    ],
    fills: [
      {
        id: 'cloud',
        from: 'spanA',
        to: 'spanB',
        show: 'showCloud',
        color: (c, from, to) => {
          if (from === undefined || to === undefined) return null
          return from > to ? c.candleUpBody : c.candleDownBody
        },
      },
    ],
  },
  presentation: {
    defaultOptions: {
      showTenkan: true,
      showKijun: true,
      showSpanA: true,
      showSpanB: true,
      showCloud: true,
      showChikou: true,
    },
  },
  runtime: {
    defaultParams: { tenkanPeriod: 9, kijunPeriod: 26, spanBPeriod: 52, displacement: 26 },
    computeKey: 'calcIchimokuData',
    compute: (data, c) =>
      calcIchimokuData(data, c.tenkanPeriod, c.kijunPeriod, c.spanBPeriod, c.displacement),
  },
})
export class IchimokuDefinition {
  // @indicator 装饰器按名称读取静态 rendererFactory，静态分析无法识别该读取。
  // fallow-ignore-next-line unused-class-member
  static rendererFactory = plotRenderer('ichimoku')
}
