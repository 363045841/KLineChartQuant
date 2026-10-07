/**
 * 图表布局文档契约。
 *
 * @remarks
 * 把此前分散在 engine/state 各模块的持久化快照类型（视图工作区、各 Pane 价格轴模式、
 * 可恢复视口位置）集中为一份版本化文档；序列化、存储与恢复实现位于同模块 impl/。
 * 本文件只描述文档形状，不依赖同模块 impl/。
 */

import type { SymbolSpec } from '../../controllers/types.js'
import type { ChartSettings } from '../../foundation/config/chartSettings.js'
import type { PriceAxisRangeMode } from '../../foundation/config/priceAxisRangeMode.js'
import type { ChartWorkspaceId } from '../../foundation/types/chartView.js'
import type { ScaleType } from '../../foundation/types/scaleType.js'
import type { DrawingObject } from '../drawing/index.js'
import type { PaneSpec } from '../pane/types.js'
import type { IndicatorInstanceInput } from '../state/indicatorState.js'

/** 布局文档版本号；恢复时据此迁移旧文档。 */
export const LAYOUT_DOCUMENT_VERSION = 1

/** 单个数据视图可恢复的横向位置：锚点时间 + 相对偏移 + 缩放等级。 */
export interface LayoutViewportSnapshot {
  readonly anchorTimestamp: number
  readonly anchorOffsetPx: number
  readonly zoomLevel: number
}

/** 单个视图工作区中需要跨会话恢复的用户配置。 */
export interface LayoutWorkspace {
  readonly instances: ReadonlyArray<IndicatorInstanceInput>
  readonly paneRatios: Readonly<Record<string, number>>
  readonly paneSpecs: ReadonlyArray<PaneSpec>
  readonly paneScaleTypes: Readonly<Record<string, ScaleType>>
}

/** K 线与分时工作区的完整可恢复快照。 */
export type LayoutWorkspaces = Readonly<Record<ChartWorkspaceId, LayoutWorkspace>>

/** paneId → 范围模式；只保存自动/手动开关，不保存具体范围值。 */
export type LayoutPanePriceAxisModes = Readonly<Record<string, PriceAxisRangeMode>>

/**
 * 图表布局文档：界面上用户可控配置的唯一持久化载体。
 *
 * @remarks
 * 应用级/设备级偏好（渲染后端、缓存上限、调试开关、自选列表、Agent 设置）不属于本
 * 文档，由各自存储管理；行情数据与运行时交互态同样不入文档。
 */
export interface LayoutDocument {
  readonly version: typeof LAYOUT_DOCUMENT_VERSION
  /** 主品种及其数据源、周期、复权与路由描述；旧文档省略时保留当前选择。 */
  readonly currentSymbol?: SymbolSpec | null
  /** 各视图工作区的用户指标与 pane 布局。 */
  readonly workspaces: LayoutWorkspaces
  /** 各 Pane 的价格轴自动/手动模式。 */
  readonly panePriceAxisModes: LayoutPanePriceAxisModes
  /** 图表级设置白名单子集；省略表示沿用当前设置。 */
  readonly settings?: Partial<ChartSettings>
  /** 用户绘图文档；省略表示不携带绘图。 */
  readonly drawings?: ReadonlyArray<DrawingObject>
  /** 按 品种+周期+复权+数据视图 键的可恢复视口位置；省略表示不携带。 */
  readonly viewport?: Readonly<Record<string, LayoutViewportSnapshot>>
}

/** 具名归档在文档上附加身份；运行时状态仍由 Kernel 管理。 */
export interface NamedLayoutDocument extends LayoutDocument {
  readonly id: string
  readonly name: string
}

/** 布局列表项：只暴露名称、身份与是否可删除，不复制文档业务状态。 */
export interface LayoutSummary {
  readonly id: string
  readonly name: string
  /** 默认布局与当前活动布局不可删除。 */
  readonly deletable: boolean
}

/** 布局归档的持久化形状；由 LayoutManager 写入 IndexedDB。 */
export interface LayoutArchive {
  readonly documents: Readonly<Record<string, NamedLayoutDocument>>
  readonly activeId: string
  readonly autoSave: boolean
}

/** 控制器与 UI 消费的布局管理入口。 */
export interface LayoutApi {
  readonly layouts: import('../../foundation/reactivity/signal.js').ReadonlySignal<
    ReadonlyArray<LayoutSummary>
  >
  readonly activeLayoutId: import('../../foundation/reactivity/signal.js').ReadonlySignal<string>
  exportLayout(): LayoutDocument
  readonly layoutAutoSave: import('../../foundation/reactivity/signal.js').ReadonlySignal<boolean>
  readonly layoutDirty: import('../../foundation/reactivity/signal.js').ReadonlySignal<boolean>
  readonly layoutSaveError: import('../../foundation/reactivity/signal.js').ReadonlySignal<
    string | null
  >
  createLayout(input: { name: string }): Promise<string>
  setLayoutAutoSave(input: { enabled: boolean }): Promise<void>
  applyLayout(document: LayoutDocument): void
  listLayouts(): Promise<ReadonlyArray<LayoutSummary>>
  saveLayout(input: { name: string; id?: string }): Promise<string>
  switchLayout(input: { id: string }): Promise<void>
  renameLayout(input: { id: string; name: string }): Promise<void>
  duplicateLayout(input: { id: string; name: string }): Promise<string>
  deleteLayout(input: { id: string }): Promise<void>
}
