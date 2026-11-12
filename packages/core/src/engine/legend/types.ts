/**
 * 图例统一契约：数据投影、CRUD、交互请求与展示行。
 *
 * 仅存放跨模块引用或被公开 API 暴露的类型；构建与绘制实现留在 impl/。
 * 本文件不得 import 同子模块 impl/。
 */

import type { SymbolSpec } from '@/controllers/types.js'
import type { ChartPaneFacade } from '@/engine/chart/impl/facade/chartPaneFacade.js'
import type { ComparisonCommandsApi } from '@/engine/data/comparisonCommands.js'
import type { TitleValueItem } from '@/engine/indicators/indicatorMetadata.js'
import type { IndicatorInstanceRole } from '@/engine/state/indicatorRole.js'
import type { PluginHost } from '@/foundation/plugin/index.js'
import type { ReadonlySignal } from '@/foundation/reactivity/index.js'
import type { KLineData } from '@/foundation/types/price.js'

/** 图例文本的 CSS line-height；行盒高度与文本行高分离时，顶部对齐按两者差值补偿。 */
export const LEGEND_TEXT_LINE_HEIGHT = 18

/** 图例行的像素布局，由构建阶段按帧算出。 */
export interface LegendLayout {
  x: number
  y: number
  lineHeight: number
  gap: number
  paneWidth: number
  compact: boolean
}

/** 行情相对基准价的涨跌；K 线用前一根收盘价，分时用前收。缺少基准时为 null。 */
export interface LegendBarChange {
  amount: number
  percent: number
  /** 涨跌文本颜色，随正负取涨跌色。 */
  color: string
}

/** 当前 K 线及图例派生的展示字段，保留 KLineData 自定义属性。 */
export type LegendCurrentBar = Omit<KLineData, 'volume' | 'changePercent' | 'changeAmount'> & {
  volume: number | null
  // 成交量缩写文本(eg. 1.23亿)，单位由数据契约决定
  volumeText: string | null
  color: string
  change: LegendBarChange | null
}

export interface LegendTimeshareRow {
  price: number
  average: number
  /** 相对前收的涨跌；前收无效时为 null，行情行照常显示。 */
  change: LegendBarChange | null
  volume: number | null
  /** 成交量缩写文本；单位由数据契约决定，图例不拼接。 */
  volumeText: string | null
  amount: number | null
  amountText: string | null
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
  /** 计算失败时保留指标身份，错误消息供默认和自定义图例展示。 */
  error?: string
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
  comparisons: ReadonlyArray<LegendComparisonRow>
  /** 当前索引处的原始 K 线（分时模式下可能无 close） */
  bar: KLineData | null
}

/** 主图图例公开配置。 */
export interface LegendOptions {
  visible?: boolean
}

/** 展示文本片段；gapBefore 相对上一段，省略时由行投影补默认间距。 */
export interface LegendText {
  readonly text: string
  readonly color: string
  readonly gapBefore?: number
}

/** 行投影解析后的文本片段：间距已确定，renderer 不再按位置推断。 */
export interface LegendRowText extends LegendText {
  readonly gapBefore: number
}

export interface LegendRow {
  key: string
  paneId: string
  /** 行盒左边界（相对图表容器）。 */
  x: number
  /** 行盒顶部（相对图表容器），不含文本垂直居中的补偿。 */
  y: number
  maxWidth: number
  height: number
  texts: ReadonlyArray<LegendRowText>
  /** 按钮集合、标签和边界状态由 Core 生成，renderer 不按图例类型分支。 */
  actions: ReadonlyArray<LegendActionButton>
  indicator?: { instanceId: string; definitionId: string }
  comparison?: { identity: string }
  hidden?: boolean
  loading?: boolean
  error?: string
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
  | 'move-pane-up'
  | 'move-pane-down'
  | 'move-up'
  | 'move-down'
  | 'move-to'
  | 'replace'
  | 'edit-code'
  | 'toggle-visibility'
  | 'settings'
  | 'close'

export interface LegendActionButton {
  readonly action: LegendAction
  readonly label: string
  readonly enabled: boolean
}
export const LEGEND_UI_EVENT = 'klc:legend-ui'

/** 触发按钮的视口矩形；宿主据此把移动菜单贴在按钮下方。 */
export interface LegendAnchorRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Core 只把需要宿主打开界面的操作发布给框架。 */
export type LegendUiRequest =
  | {
      readonly action: 'replace' | 'settings' | 'edit-code'
      readonly id: string
      readonly paneId: string
      readonly definitionId: string
      readonly role: IndicatorInstanceRole
    }
  | {
      readonly action: 'move-to'
      readonly id: string
      readonly options: ReadonlyArray<import('@/engine/pane/types.js').InstanceMoveOption>
    }

/** 移动目标请求；目标列表由 Core 投影，菜单由宿主框架渲染。 */
export type LegendMoveRequest = Extract<LegendUiRequest, { action: 'move-to' }>

/** 图例 UI 事件 detail：移动目标额外携带触发按钮矩形，供宿主定位菜单。 */
export type LegendUiEventDetail =
  | Exclude<LegendUiRequest, { action: 'move-to' }>
  | (LegendMoveRequest & { readonly anchor: LegendAnchorRect })

/** 内置图例写入其所属领域，自定义图例由图例模块持有。 */
export interface LegendApi {
  readonly context: ReadonlySignal<LegendTemplateContext | null>
  readonly rows: ReadonlySignal<ReadonlyArray<LegendRow>>
  /** 主图图例整块收起；只改变显示，不影响行情布局。 */
  readonly mainCollapsed: ReadonlySignal<boolean>
  list(): ReadonlyArray<LegendEntry>
  get(id: string): LegendEntry | null
  /** 切换主图图例整块收起；无指标行时拒绝收起。 */
  setMainCollapsed(collapsed: boolean): void
  /** 主图当前是否允许收起。 */
  canCollapse(): boolean
  create(input: CreateLegendInput): string | null
  update(id: string, patch: LegendPatch): boolean
  remove(id: string): boolean
  move(id: string, direction: 'up' | 'down'): boolean
  /** 迁移实例归属；菜单项直接调用这里。 */
  moveTo(id: string, target: import('@/engine/pane/types.js').InstanceMoveTarget): boolean
  replace(id: string, definitionId: string): boolean
  execute(id: string, action: LegendAction): LegendUiRequest | null
}

/** 图例只消费所属领域的状态和写入能力，不复制领域集合。 */
export interface LegendManagerDependencies {
  host: PluginHost
  panes: ChartPaneFacade
  comparisons: ComparisonCommandsApi
  getComparisonHidden: (identity: string) => boolean
  setComparisonHidden: (identity: string, hidden: boolean) => void
  getOptions: () => { legend?: LegendOptions }
  /** 主图是否已有品种；空图不展示收起入口。 */
  hasPrimarySymbol: () => boolean
  /** 判断指标定义是否来自脚本，决定是否展示代码编辑入口。 */
  isScriptIndicator?: (definitionId: string) => boolean
  requestRender: () => void
}
