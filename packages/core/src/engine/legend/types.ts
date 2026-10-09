/**
 * 图例统一契约：数据投影、CRUD、交互请求与展示行。
 *
 * 仅存放跨模块引用或被公开 API 暴露的类型；构建与绘制实现留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

import type { SymbolSpec } from '@/controllers/types.js'
import type { ChartIndicatorFacade } from '@/engine/chart/impl/facade/chartIndicatorFacade.js'
import type { ChartPaneFacade } from '@/engine/chart/impl/facade/chartPaneFacade.js'
import type { ComparisonCommandsApi } from '@/engine/data/comparisonCommands.js'
import type { TitleValueItem } from '@/engine/indicators/indicatorMetadata.js'
import type { PluginHost } from '@/foundation/plugin/index.js'
import type { ReadonlySignal } from '@/foundation/reactivity/index.js'
import type { KLineData } from '@/foundation/types/price.js'

/** 图例行的像素布局，由构建阶段按帧算出。 */
export interface LegendLayout {
  x: number
  y: number
  lineHeight: number
  gap: number
  paneWidth: number
  compact: boolean
}

/** 当前 K 线及图例派生的展示字段，保留 KLineData 自定义属性。 */
export type LegendCurrentBar = Omit<KLineData, 'volume'> & {
  volume: number | null
  // 成交量+单位格式化文本(eg. 1.23亿)
  volumeText: string | null
  color: string
}

export interface LegendTimeshareRow {
  price: number
  average: number
  changeAmount: number
  changePercent: number
  volume: number | null
  /** 带手数单位的成交量文本。 */
  volumeText: string | null
  amount: number | null
  amountText: string | null
  changeColor: string
}

export interface LegendIndicatorRow {
  /** 实例身份，用于 Legend 命中后的操作。 */
  instanceId: string
  /** 指标规范 ID（displayName），与可见集合、实例目录同一身份空间。 */
  definitionId: string
  /** 隐藏的指标图例保留并置灰。 */
  hidden: boolean
  /** 指标实例仍在异步加载：行内展示加载圈。 */
  loading: boolean
  name: string
  /** 参数文本片段；数字参数与枚举参数统一按顺序拼接展示。 */
  params?: (number | string)[]
  values?: TitleValueItem[]
}

export interface LegendComparisonRow {
  identity?: string
  hidden?: boolean
  symbol: string
  name?: string
  price: number | null
  bar: KLineData | null
  percent: number | null
  color: string
  percentColor: string
}

/**
 * 主图左上角图例完整上下文。
 * DOM renderer 与自定义 legend slot 共用同一份数据。
 */
export interface LegendTemplateContext {
  /** 与默认 DOM 共用的主图展示行，供自定义模板直接消费。 */
  rows: ReadonlyArray<LegendRow>
  period: string
  index: number
  hasCrosshair: boolean
  layout: LegendLayout
  colors: {
    textPrimary: string
    textTertiary: string
    up: string
    down: string
  }
  /** 十字线指向的当前 K 线展示行（含 volumeText / color 与自定义字段） */
  currentBar: LegendCurrentBar | null
  timeshare: LegendTimeshareRow | null
  indicators: ReadonlyArray<LegendIndicatorRow>
  comparisons: ReadonlyArray<LegendComparisonRow>
  /** 当前索引处的原始 K 线（分时模式下可能无 close） */
  bar: KLineData | null
}

/** 主图图例公开配置，保留现有配置入口。 */
export interface LegendOptions {
  visible?: boolean
  visibleIndicatorIds?: ReadonlyArray<string>
}

export interface LegendText {
  readonly text: string
  readonly color: string
  readonly gapBefore?: number
}

export interface LegendRow {
  key: string
  paneId: string
  x: number
  y: number
  maxWidth: number
  height: number
  gap: number
  texts: ReadonlyArray<LegendText>
  /** 按钮集合、标签和边界状态由 Core 生成，renderer 不按图例类型分支。 */
  actions: ReadonlyArray<LegendActionButton>
  indicator?: { instanceId: string; definitionId: string }
  comparison?: { identity: string }
  hidden?: boolean
  loading?: boolean
}

export type LegendEntry = Readonly<
  | {
      id: string
      kind: 'indicator'
      paneId: string
      definitionId: string
      hidden: boolean
      params: Readonly<Record<string, unknown>>
    }
  | {
      id: string
      kind: 'comparison'
      paneId: string
      identity: string
      spec: SymbolSpec
      hidden: boolean
    }
  | {
      id: string
      kind: 'custom'
      paneId: string
      texts: ReadonlyArray<LegendText>
      hidden: boolean
    }
>
export type CreateLegendInput =
  | {
      kind: 'indicator'
      definitionId: string
      role: 'main' | 'sub'
      params?: Record<string, unknown>
    }
  | { kind: 'comparison'; spec: SymbolSpec; primary?: SymbolSpec | null }
  | { kind: 'custom'; id: string; paneId: string; texts: ReadonlyArray<LegendText> }

export interface LegendPatch {
  hidden?: boolean
  params?: Record<string, unknown>
  texts?: ReadonlyArray<LegendText>
}

export type LegendAction =
  | 'move-up'
  | 'move-down'
  | 'replace'
  | 'toggle-visibility'
  | 'settings'
  | 'close'

export interface LegendActionButton {
  readonly action: LegendAction
  readonly label: string
  readonly enabled: boolean
}
export const LEGEND_UI_EVENT = 'klc:legend-ui'

/** Core 只把需要宿主打开界面的操作发布给框架。 */
export interface LegendUiRequest {
  action: 'replace' | 'settings'
  id: string
  paneId: string
  definitionId: string
  role: 'main' | 'sub'
}

/** 内置图例写入其所属领域，自定义图例由图例模块持有。 */
export interface LegendApi {
  readonly context: ReadonlySignal<LegendTemplateContext | null>
  readonly rows: ReadonlySignal<ReadonlyArray<LegendRow>>
  list(): ReadonlyArray<LegendEntry>
  get(id: string): LegendEntry | null
  create(input: CreateLegendInput): string | null
  update(id: string, patch: LegendPatch): boolean
  remove(id: string): boolean
  move(id: string, direction: 'up' | 'down'): boolean
  replace(id: string, definitionId: string): boolean
  execute(id: string, action: LegendAction): LegendUiRequest | null
}

/** 图例只消费所属领域的状态和写入能力，不复制领域集合。 */
export interface LegendManagerDependencies {
  host: PluginHost
  indicators: ChartIndicatorFacade
  panes: ChartPaneFacade
  comparisons: ComparisonCommandsApi
  getComparisonHidden: (identity: string) => boolean
  setComparisonHidden: (identity: string, hidden: boolean) => void
  getOptions: () => { yPaddingPx: number; legend?: LegendOptions }
  getVisibleIndicatorIds: () => ReadonlyArray<string>
  requestRender: () => void
}
