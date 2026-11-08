/**
 * 成交量分布指标：按交易日重置的 `SVP` 与可配置阶段的 `PVP`。
 *
 * 两者共用同一套聚合与绘制实现，差异只在阶段口径与参数暴露：
 * `SVP` 固定按交易日分段且只出现在日内周期；`PVP` 由「阶段数量 × 阶段单位」决定分段，
 * 因此用户可以用两个不同阶段的 PVP 组合出「周固定范围」的效果。
 * 样式参数（各部位颜色与不透明度）与可见周期区间由两者共用。
 */
import type { RenderContext } from '../../../foundation/plugin/index.js'
import { ChartDataViewId } from '../../../foundation/types/chartView.js'
import type { Layer } from '../../../rendering/scene/types.js'
import { Indicator } from '../../indicators/indicatorDecorator.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { INDICATOR_PERIOD_INPUT_OPTIONS } from '../../indicators/indicatorPeriodVisibility.js'
import { createVolumeProfileLayer } from './impl/render.js'
import {
  COMMON_VOLUME_PROFILE_PARAMS,
  DEFAULT_VOLUME_PROFILE_PARAMS,
  MAX_BOX_WIDTH_PERCENT,
  MAX_PROFILE_ROWS,
  MIN_BOX_WIDTH_PERCENT,
  MIN_PROFILE_ROWS,
} from './types.js'

export { buildVolumeProfile } from './impl/build.js'
export { resolveVolumeProfileSlices } from './impl/period.js'
export * from './types.js'

/** 可见周期区间：两端都是周期键，与定义声明的范围取交集。 */
const PERIOD_RANGE_INPUT_DEFS = {
  visibleFrom: { title: '可见周期起', options: INDICATOR_PERIOD_INPUT_OPTIONS },
  visibleTo: { title: '可见周期止', options: INDICATOR_PERIOD_INPUT_OPTIONS },
} as const

/** 可调色部位：颜色空串跟随主题，不透明度是相对主题原有 alpha 的缩放百分比。 */
const PALETTE_INPUT_DEFS = {
  upColor: { title: '上涨成交量颜色', color: true },
  upOpacity: { title: '上涨成交量不透明度', min: 0, max: 100, step: 1 },
  downColor: { title: '下跌成交量颜色', color: true },
  downOpacity: { title: '下跌成交量不透明度', min: 0, max: 100, step: 1 },
  valueAreaUpColor: { title: '价值区上涨颜色', color: true },
  valueAreaUpOpacity: { title: '价值区上涨不透明度', min: 0, max: 100, step: 1 },
  valueAreaDownColor: { title: '价值区下跌颜色', color: true },
  valueAreaDownOpacity: { title: '价值区下跌不透明度', min: 0, max: 100, step: 1 },
  pointOfControlColor: { title: 'POC 颜色', color: true },
  pointOfControlOpacity: { title: 'POC 不透明度', min: 0, max: 100, step: 1 },
  valueAreaHighColor: { title: 'VAH 颜色', color: true },
  valueAreaHighOpacity: { title: 'VAH 不透明度', min: 0, max: 100, step: 1 },
  valueAreaLowColor: { title: 'VAL 颜色', color: true },
  valueAreaLowOpacity: { title: 'VAL 不透明度', min: 0, max: 100, step: 1 },
  boxBackgroundColor: { title: '分布框底色', color: true },
  boxBackgroundOpacity: { title: '分布框底色不透明度', min: 0, max: 100, step: 1 },
} as const

/** 选项表的公共部分：成交量口径、价值区、行数、box、参考线、可见周期与配色。 */
const COMMON_INPUT_DEFS = {
  volumeMode: {
    title: '成交量',
    options: [
      { value: 'total', label: '合计' },
      { value: 'updown', label: '上/下' },
      { value: 'delta', label: '差值' },
    ],
  },
  valueAreaPercent: { title: '数值区成交量', min: 1, max: 100, step: 1 },
  rowSize: { title: '行数', min: MIN_PROFILE_ROWS, max: MAX_PROFILE_ROWS, step: 1 },
  boxWidthPercent: {
    title: '宽度（box 的百分比）',
    min: MIN_BOX_WIDTH_PERCENT,
    max: MAX_BOX_WIDTH_PERCENT,
    step: 1,
  },
  boxPosition: {
    title: '位置',
    options: [
      { value: 'left', label: '左' },
      { value: 'right', label: '右' },
    ],
  },
  showPoc: { title: 'POC' },
  showVah: { title: 'VAH' },
  showVal: { title: 'VAL' },
  extendPoc: { title: '向右延长 POC' },
  extendVah: { title: '向右延长 VAH' },
  extendVal: { title: '向右延长 VAL' },
  ...PERIOD_RANGE_INPUT_DEFS,
  ...PALETTE_INPUT_DEFS,
} as const

/** 渲染工厂的公共入参。 */
interface VolumeProfileRendererOptions {
  paneId: string
  instanceId: string
  params?: Record<string, unknown>
}

/** 会话成交量分布（SVP）：按交易日（行情时区）分段，只用于日内周期。 */
@Indicator({
  name: 'svp',
  displayName: 'SVP',
  category: 'main',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine],
  kind: IndicatorKind.Indicator,
  allowMainPane: true,
  runtime: {
    // 会话分布只在日内周期成立：默认区间停在 4 小时，日线及以上不绘制也不进图例。
    defaultParams: { ...COMMON_VOLUME_PROFILE_PARAMS, visibleTo: '4h' },
    // 聚合在渲染期完成（依赖可见范围的价位域），没有逐 bar 输出。
    compute: () => null,
    inputDefs: COMMON_INPUT_DEFS,
  },
  mainPane: {},
})
export class SessionVolumeProfileIndicatorDefinition {
  static rendererFactory = (options: VolumeProfileRendererOptions): Layer<RenderContext> =>
    createVolumeProfileLayer('session', options.paneId, options.instanceId, options.params)
}

/** 周期性成交量分布（PVP）：每「阶段数量 × 阶段单位」画一个分布图。 */
@Indicator({
  name: 'pvp',
  displayName: 'PVP',
  category: 'main',
  defaultPaneId: 'main',
  dataViews: [ChartDataViewId.KLine],
  kind: IndicatorKind.Indicator,
  allowMainPane: true,
  // 阶段口径是实例自己的参数，因此允许叠加多个：同时看周与月的分布。
  multiInstance: true,
  runtime: {
    defaultParams: {
      periodCount: DEFAULT_VOLUME_PROFILE_PARAMS.periodCount,
      periodUnit: DEFAULT_VOLUME_PROFILE_PARAMS.periodUnit,
      ...COMMON_VOLUME_PROFILE_PARAMS,
    },
    compute: () => null,
    inputDefs: {
      periodCount: { title: '阶段数量', min: 1, max: 12, step: 1 },
      periodUnit: {
        title: '阶段单位',
        options: [
          { value: 'candle', label: 'K线' },
          { value: 'day', label: '天' },
          { value: 'week', label: '周' },
          { value: 'month', label: '月' },
        ],
      },
      ...COMMON_INPUT_DEFS,
    },
  },
  mainPane: {},
})
export class PeriodicVolumeProfileIndicatorDefinition {
  static rendererFactory = (options: VolumeProfileRendererOptions): Layer<RenderContext> =>
    createVolumeProfileLayer('periodic', options.paneId, options.instanceId, options.params)
}
