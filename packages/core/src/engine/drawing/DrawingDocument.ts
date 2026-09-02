/** 绘图文档领域服务：为用户交互与 Agent 提供统一的已确认图元 CRUD。 */
import type {
  DrawingAnchor,
  DrawingKind,
  DrawingObject,
  DrawingStyle,
} from '../../foundation/plugin'
import { generateUUID } from '../../foundation/utils/uuid'
import { DRAWING_ERROR_CODES, KLineChartError } from '../../errors'
import type { TradingDate } from '../../data/provider/types'
import type { DrawingStateModule } from '../state/drawingState'

import { PREVIEW_ID } from './DrawingState'

/** 外部命令使用价格锚点；需要水平位置的图元额外提供时间。 */
export interface DrawingAnchorInput {
  /** 交易日锚点，按数据中的 date 字段定位。 */
  readonly tradingDate?: TradingDate
  /** 精确时间锚点，按毫秒时间戳定位。 */
  readonly timestamp?: number
  readonly price: number
}

/** 创建已确认图元所需的声明式输入。 */
export interface CreateDrawingInput {
  readonly kind: DrawingKind
  readonly paneId: string
  readonly anchors: ReadonlyArray<DrawingAnchorInput>
  readonly style?: Partial<DrawingStyle>
  readonly params?: Readonly<Record<string, unknown>>
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
}

/** 更新已确认图元的声明式 patch。 */
export interface UpdateDrawingPatch {
  readonly anchors?: ReadonlyArray<DrawingAnchorInput>
  readonly style?: Partial<DrawingStyle>
  readonly params?: Readonly<Record<string, unknown>>
  readonly visible?: boolean
  readonly locked?: boolean
  readonly zIndex?: number
}

/** 绘图文档解析锚点坐标所需的最小数据访问能力。 */
export interface DrawingDocumentDependencies {
  readonly drawingState: DrawingStateModule
  readonly getLogicalIndexAtTimestamp: (timestamp: number) => number | null
  readonly findAnchorAtTradingDate: (tradingDate: TradingDate) => {
    readonly index: number
    readonly timestamp: number
  } | null
  readonly hasPaneId: (paneId: string) => boolean
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
      visible: input.visible ?? true,
      ...(input.locked === undefined ? {} : { locked: input.locked }),
      ...(input.zIndex === undefined ? {} : { zIndex: input.zIndex }),
      anchors,
      params:
        input.params ?? (input.kind === 'regression-channel' ? { sigma: 2 } : Object.freeze({})),
      style: {
        ...DEFAULT_DRAWING_STYLE,
        ...(isChannel(input.kind) ? { fillOpacity: 0.1 } : {}),
        ...input.style,
      },
    }
    this.dependencies.drawingState.actions.upsertDrawing(drawing)
    return this.getDrawing(drawing.id)!
  }

  /** 按 id 更新一个已确认图元，并返回最新快照。 */
  updateDrawing(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    const anchors =
      patch.anchors === undefined ? undefined : this.resolveAnchorsForUpdate(id, patch.anchors)
    return this.dependencies.drawingState.actions.updateDrawing(id, {
      ...(anchors === undefined ? {} : { anchors }),
      ...(patch.style === undefined ? {} : { style: patch.style }),
      ...(patch.params === undefined ? {} : { params: patch.params }),
      ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      ...(patch.locked === undefined ? {} : { locked: patch.locked }),
      ...(patch.zIndex === undefined ? {} : { zIndex: patch.zIndex }),
    })
  }

  /** 移除指定图元。 */
  removeDrawing(id: string): boolean {
    return this.dependencies.drawingState.actions.removeDrawing(id)
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

  /** 校验锚点数量并将时间坐标转换为当前数据序列 index。 */
  private resolveAnchors(
    kind: DrawingKind,
    inputs: ReadonlyArray<DrawingAnchorInput>,
  ): DrawingAnchor[] {
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
      anchors[2] = { ...anchors[2]!, index: anchors[1]!.index, time: anchors[1]!.time }
    }
    return anchors
  }

  /** 更新锚点时保留已有锚点 id，避免交互引用失效。 */
  private resolveAnchorsForUpdate(
    id: string,
    inputs: ReadonlyArray<DrawingAnchorInput>,
  ): DrawingAnchor[] {
    const drawing = this.getDrawing(id)
    if (!drawing) return []
    const anchors = this.resolveAnchors(drawing.kind, inputs)
    return anchors.map((anchor, index) => ({
      ...anchor,
      id: drawing.anchors[index]?.id ?? anchor.id,
    }))
  }

  /** 解析单个声明式锚点；水平线仅由价格决定，不依赖 K 线时间。 */
  private resolveAnchor(kind: DrawingKind, input: DrawingAnchorInput): DrawingAnchor {
    if (!Number.isFinite(input.price)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing anchor price must be a finite number.',
        { details: { timestamp: input.timestamp, price: input.price } },
      )
    }
    if (kind === 'horizontal-line') {
      return { id: `anchor-${generateUUID()}`, index: -1, price: input.price }
    }
    if (input.tradingDate !== undefined && input.timestamp !== undefined) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing anchor must provide either tradingDate or timestamp, not both.',
        {
          details: {
            tradingDate: input.tradingDate,
            timestamp: input.timestamp,
            price: input.price,
          },
        },
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
      return {
        id: `anchor-${generateUUID()}`,
        index: resolved.index,
        time: resolved.timestamp,
        price: input.price,
      }
    }
    const timestamp = input.timestamp
    if (timestamp === undefined || !Number.isFinite(timestamp)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing anchor timestamp and price must be finite numbers.',
        { details: { timestamp: input.timestamp, price: input.price } },
      )
    }
    const index = this.dependencies.getLogicalIndexAtTimestamp(timestamp)
    if (index === null) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.ANCHOR_NOT_FOUND,
        `No chart data exists for drawing anchor timestamp ${timestamp}.`,
        { details: { timestamp } },
      )
    }
    return { id: `anchor-${generateUUID()}`, index, time: timestamp, price: input.price }
  }
}
