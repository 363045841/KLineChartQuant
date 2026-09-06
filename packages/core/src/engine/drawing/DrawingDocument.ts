/** 绘图文档领域服务：为用户交互与 Agent 提供统一的已确认图元 CRUD。 */
import type {
  PersistedDrawingAnchor,
  DrawingKind,
  DrawingLabels,
  DrawingObject,
  DrawingStyle,
  DrawingWorkspaceId,
} from '../../foundation/plugin'
import { generateUUID } from '../../foundation/utils/uuid'
import { DRAWING_ERROR_CODES, KLineChartError } from '../../errors'
import type { TradingDate } from '../../data/provider/types'
import type { DrawingStateModule } from '../state/drawingState'

import { PREVIEW_ID } from './DrawingState'

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

const DRAWING_STYLE_KEYS: ReadonlyArray<DrawingStyleKey> = [
  'stroke',
  'strokeWidth',
  'strokeStyle',
  'fill',
  'fillOpacity',
  'pointRadius',
  'textColor',
  'fontSize',
]

/** 绘图文档解析锚点坐标所需的最小数据访问能力。 */
export interface DrawingDocumentDependencies {
  readonly drawingState: DrawingStateModule
  readonly getLogicalIndexAtTimestamp: (timestamp: number) => number | null
  readonly findAnchorAtTradingDate: (tradingDate: TradingDate) => {
    readonly timestamp: number
  } | null
  readonly hasPaneId: (paneId: string) => boolean
  readonly getWorkspaceId: () => DrawingWorkspaceId
}

const DEFAULT_DRAWING_STYLE: Readonly<DrawingStyle> = {
  stroke: '#2962ff',
  strokeWidth: 1,
  strokeStyle: 'solid',
}

/** 返回不同图元种类要求的锚点数。 */
function getRequiredAnchorCount(kind: DrawingKind): 1 | 2 | 3 {
  switch (kind) {
    case 'horizontal-line':
    case 'horizontal-ray':
    case 'vertical-line':
    case 'cross-line':
      return 1
    case 'parallel-channel':
    case 'flat-line':
    case 'disjoint-channel':
      return 3
    default:
      return 2
  }
}

/** 判断图元是否需要默认半透明填充。 */
function isChannel(kind: DrawingKind): boolean {
  return [
    'rectangle',
    'parallel-channel',
    'regression-channel',
    'flat-line',
    'disjoint-channel',
  ].includes(kind)
}

/** 已确认图元的唯一 CRUD 入口。 */
export class DrawingDocument {
  constructor(private readonly dependencies: DrawingDocumentDependencies) {}

  /** 返回当前已确认图元快照。 */
  listDrawings(): ReadonlyArray<DrawingObject> {
    return this.dependencies.drawingState.readonly.drawings.peek()
  }

  /** 按 id 查询已确认图元。 */
  getDrawing(id: string): DrawingObject | null {
    return this.listDrawings().find((drawing) => drawing.id === id) ?? null
  }

  /** 创建、校验并提交一个已确认图元。 */
  createDrawing(input: CreateDrawingInput): DrawingObject {
    if (!this.dependencies.hasPaneId(input.paneId)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.UNKNOWN_PANE,
        `Unknown drawing pane '${input.paneId}'.`,
        { details: { paneId: input.paneId } },
      )
    }
    const anchors = this.resolveAnchors(input.kind, input.anchors)
    const drawing: DrawingObject = {
      id: `drawing-${generateUUID()}`,
      kind: input.kind,
      paneId: input.paneId,
      workspaceId: this.dependencies.getWorkspaceId(),
      visible: input.visible ?? true,
      ...(input.locked === undefined ? {} : { locked: input.locked }),
      ...(input.zIndex === undefined ? {} : { zIndex: input.zIndex }),
      anchors,
      params:
        input.params ?? (input.kind === 'regression-channel' ? { sigma: 2 } : Object.freeze({})),
      labels: input.labels ?? { line: {}, area: {} },
      style: {
        ...DEFAULT_DRAWING_STYLE,
        ...(isChannel(input.kind) ? { fillOpacity: 0.1 } : {}),
        ...input.style,
      },
    }
    this.dependencies.drawingState.actions.upsertDrawing(drawing)
    return this.getDrawing(drawing.id)!
  }

  /** 以完整模型快照替换一个已确认图元。 */
  updateDrawing(drawing: DrawingObject): DrawingObject | null {
    const current = this.getDrawing(drawing.id)
    if (!current || drawing.kind !== current.kind || drawing.paneId !== current.paneId) return null
    return this.dependencies.drawingState.actions.updateDrawing(drawing.id, drawing)
  }

  /** 将外部声明式 patch 转换为完整模型快照后提交。 */
  updateDrawingFromInput(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    const current = this.getDrawing(id)
    if (!current) return null
    const anchors =
      patch.anchors === undefined ? undefined : this.resolveAnchorsForUpdate(id, patch.anchors)
    return this.updateDrawing({
      ...current,
      ...(anchors === undefined ? {} : { anchors }),
      ...(patch.style === undefined ? {} : { style: { ...current.style, ...patch.style } }),
      ...(patch.params === undefined ? {} : { params: patch.params }),
      ...(patch.labels === undefined ? {} : { labels: patch.labels }),
      ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      ...(patch.locked === undefined ? {} : { locked: patch.locked }),
      ...(patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }),
    })
  }

  /** 提交交互层已解析的拖拽锚点，不再转换为外部声明式输入。 */
  commitDrawingDrag(
    id: string,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): DrawingObject | null {
    const drawing = this.getDrawing(id)
    if (!drawing || anchors.length !== getRequiredAnchorCount(drawing.kind)) return null
    const valid = anchors.every((anchor) => {
      const hasValidFutureOffset =
        anchor.futureOffset === undefined ||
        (Number.isInteger(anchor.futureOffset) && anchor.futureOffset > 0)
      if (!hasValidFutureOffset) return false
      if (drawing.kind === 'horizontal-line') {
        return (
          anchor.type === 'horizontal' &&
          anchor.futureOffset === undefined &&
          Number.isFinite(anchor.price)
        )
      }
      if (drawing.kind === 'vertical-line') {
        return anchor.type === 'vertical' && Number.isFinite(Number(anchor.time))
      }
      return (
        anchor.type !== 'horizontal' &&
        anchor.type !== 'vertical' &&
        Number.isFinite(anchor.price) &&
        Number.isFinite(Number(anchor.time))
      )
    })
    if (!valid) return null
    return this.updateDrawing({ ...drawing, anchors: [...anchors] })
  }

  /** 返回一批图元共同拥有的样式字段。 */
  getBatchStyleKeys(ids: ReadonlyArray<string>): ReadonlyArray<DrawingStyleKey> {
    const drawings = this.getDrawingsByIds(ids)
    if (drawings.length === 0) return Object.freeze([])
    return Object.freeze(
      DRAWING_STYLE_KEYS.filter((key) =>
        drawings.every((drawing) => drawing.style[key] !== undefined),
      ),
    )
  }

  /** 原子更新多个图元的公共属性；目标或样式字段不合法时不写入。 */
  updateBatch(ids: ReadonlyArray<string>, patch: BatchDrawingPatch): ReadonlyArray<DrawingObject> {
    const drawings = this.getDrawingsByIds(ids)
    if (drawings.length === 0) return Object.freeze([])

    const style = patch.style
    const supportedStyleKeys = new Set(this.getBatchStyleKeys(ids))
    if (
      style !== undefined &&
      Object.keys(style).some((key) => !supportedStyleKeys.has(key as DrawingStyleKey))
    ) {
      return Object.freeze([])
    }

    return this.dependencies.drawingState.actions.updateDrawings(
      drawings.map((drawing) => drawing.id),
      patch,
    )
  }

  /** 移除指定图元。 */
  removeDrawing(id: string): boolean {
    return this.dependencies.drawingState.actions.removeDrawing(id)
  }

  /** 原子移除一批图元；任一 id 不存在时不写入。 */
  removeBatch(ids: ReadonlyArray<string>): boolean {
    const drawings = this.getDrawingsByIds(ids)
    if (drawings.length === 0) return false
    return this.dependencies.drawingState.actions.removeDrawings(
      drawings.map((drawing) => drawing.id),
    )
  }

  /** 清除所有已确认图元。 */
  clearDrawings(): void {
    this.dependencies.drawingState.actions.clearDrawings()
  }

  /** 原子替换整份文档，仅供受控组件与导入导出使用。 */
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    this.dependencies.drawingState.actions.setDrawings(
      drawings.filter((drawing) => drawing.id !== PREVIEW_ID),
    )
  }

  /** 校验锚点数量并持久化时间坐标与价格。 */
  private resolveAnchors(
    kind: DrawingKind,
    inputs: ReadonlyArray<DrawingAnchorCommandInput>,
  ): PersistedDrawingAnchor[] {
    const required = getRequiredAnchorCount(kind)
    if (inputs.length !== required) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR_COUNT,
        `Drawing kind '${kind}' requires exactly ${required} anchors.`,
        { details: { kind, expected: required, actual: inputs.length } },
      )
    }
    const anchors = inputs.map((input) => this.resolveAnchor(kind, input))
    if (kind === 'flat-line') {
      anchors[2] = {
        ...anchors[2]!,
        time: anchors[1]!.time,
        futureOffset: anchors[1]!.futureOffset,
      }
    }
    return anchors
  }

  /** 按输入顺序读取唯一图元；任一 id 不存在时返回空数组。 */
  private getDrawingsByIds(ids: ReadonlyArray<string>): ReadonlyArray<DrawingObject> {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) return Object.freeze([])
    const drawingsById = new Map(this.listDrawings().map((drawing) => [drawing.id, drawing]))
    const drawings = uniqueIds.map((id) => drawingsById.get(id))
    return drawings.some((drawing) => drawing === undefined)
      ? Object.freeze([])
      : (drawings as ReadonlyArray<DrawingObject>)
  }

  /** 更新锚点时保留已有锚点 id，避免交互引用失效。 */
  private resolveAnchorsForUpdate(
    id: string,
    inputs: ReadonlyArray<DrawingAnchorCommandInput>,
  ): PersistedDrawingAnchor[] {
    const drawing = this.getDrawing(id)
    if (!drawing) return []
    const anchors = this.resolveAnchors(drawing.kind, inputs)
    return anchors.map((anchor, index) => ({
      ...anchor,
      id: drawing.anchors[index]?.id ?? anchor.id,
    }))
  }

  /** 解析单个声明式锚点，按图元种类持久化所需坐标轴。 */
  private resolveAnchor(
    kind: DrawingKind,
    input: DrawingAnchorCommandInput,
  ): PersistedDrawingAnchor {
    if (kind === 'horizontal-line') {
      if (input.futureOffset !== undefined) {
        throw new KLineChartError(
          DRAWING_ERROR_CODES.INVALID_ANCHOR,
          'Horizontal drawing anchors cannot use a future offset.',
          { details: { futureOffset: input.futureOffset } },
        )
      }
      if (!Number.isFinite(input.price)) {
        throw new KLineChartError(
          DRAWING_ERROR_CODES.INVALID_ANCHOR,
          'Horizontal drawing anchor price must be a finite number.',
          { details: { price: input.price } },
        )
      }
      return { id: `anchor-${generateUUID()}`, type: 'horizontal', price: input.price! }
    }
    if (kind === 'vertical-line' && !Number.isFinite(input.price)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Vertical drawing anchor price must be a finite number.',
        { details: { price: input.price } },
      )
    }
    if (input.tradingDate !== undefined) {
      const resolved = this.dependencies.findAnchorAtTradingDate(input.tradingDate)
      if (resolved === null) {
        throw new KLineChartError(
          DRAWING_ERROR_CODES.ANCHOR_NOT_FOUND,
          `No chart data exists for drawing anchor trading date ${input.tradingDate}.`,
          { details: { tradingDate: input.tradingDate } },
        )
      }
      return kind === 'vertical-line'
        ? {
            id: `anchor-${generateUUID()}`,
            type: 'vertical',
            time: resolved.timestamp,
            price: input.price,
          }
        : this.createPointAnchor(resolved.timestamp, undefined, input.price)
    }
    const timestamp = input.timestamp
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing anchor timestamp must be a finite number.',
        { details: { timestamp: input.timestamp, price: input.price } },
      )
    }
    if (this.dependencies.getLogicalIndexAtTimestamp(timestamp) === null) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.ANCHOR_NOT_FOUND,
        `No chart data exists for drawing anchor timestamp ${timestamp}.`,
        { details: { timestamp } },
      )
    }
    const futureOffset = input.futureOffset
    if (futureOffset !== undefined && (!Number.isInteger(futureOffset) || futureOffset <= 0)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing anchor future offset must be a positive integer.',
        { details: { timestamp, futureOffset, price: input.price } },
      )
    }
    return kind === 'vertical-line'
      ? {
          id: `anchor-${generateUUID()}`,
          type: 'vertical',
          time: timestamp,
          futureOffset,
          price: input.price,
        }
      : this.createPointAnchor(timestamp, futureOffset, input.price)
  }

  /** 校验并创建同时包含时间与价格的普通锚点。 */
  private createPointAnchor(
    timestamp: number,
    futureOffset: number | undefined,
    price: number,
  ): PersistedDrawingAnchor {
    if (!Number.isFinite(price)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing point anchor price must be a finite number.',
        { details: { timestamp, price } },
      )
    }
    return { id: `anchor-${generateUUID()}`, type: 'point', time: timestamp, futureOffset, price }
  }
}
