/**
 * 成交量分布指标：按交易日重置的 `SVP` 与可配置阶段的 `PVP`。
 *
 * 两者共用同一套聚合与绘制实现，差异只在阶段口径与参数暴露：
 * `SVP` 固定按交易日分段且只出现在日内周期；`PVP` 由「阶段数量 × 阶段单位」决定分段，
 * 因此用户可以用两个不同阶段的 PVP 组合出「周固定范围」的效果。
 */
import type { RenderContext } from '../../../foundation/plugin/index.js'
import { ChartDataViewId } from '../../../foundation/types/chartView.js'
import type { Layer } from '../../../rendering/scene/types.js'
import { Indicator } from '../../indicators/indicatorDecorator.js'
import { IndicatorKind } from '../../indicators/indicatorMetadata.js'
import { createVolumeProfileLayer } from './impl/render.js'
import {
  DEFAULT_VOLUME_PROFILE_PARAMS,
  MAX_BOX_WIDTH_PERCENT,
  MAX_PROFILE_ROWS,
  MIN_BOX_WIDTH_PERCENT,
  MIN_PROFILE_ROWS,
} from './types.js'

export { buildVolumeProfile } from './impl/build.js'
export { resolveVolumeProfileSlices } from './impl/period.js'
export * from './types.js'

/** 选项表的公共部分：成交量口径、价值区、行数、box 与参考线。 */
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
  // 会话分布只在日内周期成立；日线及以上没有「当日」概念，整体隐藏。
  visiblePeriods: [{ unit: 'minute' }, { unit: 'hour' }],
  runtime: {
    defaultParams: {
      volumeMode: DEFAULT_VOLUME_PROFILE_PARAMS.volumeMode,
      valueAreaPercent: DEFAULT_VOLUME_PROFILE_PARAMS.valueAreaPercent,
      rowSize: DEFAULT_VOLUME_PROFILE_PARAMS.rowSize,
      boxWidthPercent: DEFAULT_VOLUME_PROFILE_PARAMS.boxWidthPercent,
      boxPosition: DEFAULT_VOLUME_PROFILE_PARAMS.boxPosition,
      showPoc: DEFAULT_VOLUME_PROFILE_PARAMS.showPoc,
      showVah: DEFAULT_VOLUME_PROFILE_PARAMS.showVah,
      showVal: DEFAULT_VOLUME_PROFILE_PARAMS.showVal,
      extendPoc: DEFAULT_VOLUME_PROFILE_PARAMS.extendPoc,
      extendVah: DEFAULT_VOLUME_PROFILE_PARAMS.extendVah,
      extendVal: DEFAULT_VOLUME_PROFILE_PARAMS.extendVal,
    },
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
  runtime: {
    defaultParams: {
      periodCount: DEFAULT_VOLUME_PROFILE_PARAMS.periodCount,
      periodUnit: DEFAULT_VOLUME_PROFILE_PARAMS.periodUnit,
      volumeMode: DEFAULT_VOLUME_PROFILE_PARAMS.volumeMode,
      valueAreaPercent: DEFAULT_VOLUME_PROFILE_PARAMS.valueAreaPercent,
      rowSize: DEFAULT_VOLUME_PROFILE_PARAMS.rowSize,
      boxWidthPercent: DEFAULT_VOLUME_PROFILE_PARAMS.boxWidthPercent,
      boxPosition: DEFAULT_VOLUME_PROFILE_PARAMS.boxPosition,
      showPoc: DEFAULT_VOLUME_PROFILE_PARAMS.showPoc,
      showVah: DEFAULT_VOLUME_PROFILE_PARAMS.showVah,
      showVal: DEFAULT_VOLUME_PROFILE_PARAMS.showVal,
      extendPoc: DEFAULT_VOLUME_PROFILE_PARAMS.extendPoc,
      extendVah: DEFAULT_VOLUME_PROFILE_PARAMS.extendVah,
      extendVal: DEFAULT_VOLUME_PROFILE_PARAMS.extendVal,
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
