/**
 * 绘图文档 / 命令层的对外契约与依赖接口。
 *
 * 这里只声明模型层的输入输出类型与外部依赖形状，实现位于 model/impl/；
 * 调用方依赖本文件，不反向依赖 impl/。
 */

import type { TradingDate } from '../../../data/provider/types.js'
import type { DrawingStyle } from '../../../foundation/plugin/index.js'
import type { DrawingStateModule } from '../../state/drawingState.js'
import type { DrawingHistoryDocumentPort } from '../history/types.js'
import type {
  DrawingKind,
  DrawingLabels,
  DrawingObject,
  DrawingWorkspaceId,
  PersistedDrawingAnchor,
} from '../types.js'

/** 外部命令按图元需要提供价格和一种明确的时间轴定位方式。 */
export type DrawingAnchorCommandInput =
  | {
      /** 交易日锚点，按数据中的 date 字段定位。 */
      readonly tradingDate: TradingDate
      readonly timestamp?: never
      readonly futureOffset?: never
      readonly price: number
    }
  | {
      /** 精确时间锚点，按毫秒时间戳定位。 */
      readonly timestamp: number
      readonly tradingDate?: never
      /** 基准 K 线之后的未来时间轴槽位数。 */
      readonly futureOffset?: number
      readonly price: number
    }
  | {
      /** 水平图元只使用价格坐标。 */
      readonly tradingDate?: never
      readonly timestamp?: never
      readonly futureOffset?: never
      readonly price: number
    }

/** 创建已确认图元所需的声明式输入。 */
export interface CreateDrawingInput {
  readonly kind: DrawingKind
  readonly paneId: string
  readonly anchors: ReadonlyArray<DrawingAnchorCommandInput>
  readonly style?: Partial<DrawingStyle>
  readonly params?: Readonly<Record<string, unknown>>
  readonly labels?: DrawingLabels
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
}

/** 更新已确认图元的声明式 patch。 */
export interface UpdateDrawingPatch {
  readonly anchors?: ReadonlyArray<DrawingAnchorCommandInput>
  readonly style?: Partial<DrawingStyle>
  readonly params?: Readonly<Record<string, unknown>>
  readonly labels?: DrawingLabels
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
}

/** 可同时应用到多个图元的公共属性。 */
export interface BatchDrawingPatch {
  readonly style?: Partial<DrawingStyle>
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
}

/** DrawingStyle 的字段名。 */
export type DrawingStyleKey = keyof DrawingStyle

/**
 * 交易日锚点的解析结果；把“找不到”拆成互相排斥的原因，
 * 让上层按语义抛不同错误码，而不是用一个错误码覆盖多种失败。
 */
export type AnchorTradingDateResolution =
  | { readonly kind: 'resolved'; readonly timestamp: number }
  | { readonly kind: 'out-of-range'; readonly earliest: string; readonly latest: string }
  | { readonly kind: 'not-trading' }
  | { readonly kind: 'date-unavailable' }

/** 绘图文档解析锚点坐标所需的最小数据访问能力。 */
export interface DrawingDocumentDependencies {
  readonly drawingState: DrawingStateModule
  readonly getLogicalIndexAtTimestamp: (timestamp: number) => number | null
  readonly getDrawingTimestampAtLogicalIndex: (index: number) => number | null
  readonly getDrawingData: () => ReadonlyArray<{ timestamp: number }>
  readonly findAnchorAtTradingDate: (tradingDate: TradingDate) => AnchorTradingDateResolution
  readonly hasPaneId: (paneId: string) => boolean
  readonly getWorkspaceId: () => DrawingWorkspaceId
}

/**
 * 命令层所需的文档写能力；由 `DrawingDocument` 实现。
 * 契约层只声明命令实际调用的方法，不反向依赖 impl/。
 */
export interface DrawingCommandsDocumentPort extends DrawingHistoryDocumentPort {
  createDrawing(input: CreateDrawingInput): DrawingObject
  updateDrawing(drawing: DrawingObject): DrawingObject | null
  updateDrawingFromInput(id: string, patch: UpdateDrawingPatch): DrawingObject | null
  commitDrawingDrag(
    id: string,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): DrawingObject | null
  commitDrawingDrags(
    updates: ReadonlyArray<{ id: string; anchors: ReadonlyArray<PersistedDrawingAnchor> }>,
  ): ReadonlyArray<DrawingObject>
  updateBatch(ids: ReadonlyArray<string>, patch: BatchDrawingPatch): ReadonlyArray<DrawingObject>
  removeDrawing(id: string): boolean
  removeBatch(ids: ReadonlyArray<string>): boolean
  clearDrawings(): void
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void
}

/** 绘图命令运行所需的领域文档和渲染失效能力。 */
export interface DrawingCommandsDependencies {
  readonly document: DrawingCommandsDocumentPort
  readonly requestDraw: () => void
}
