/** 绘图文档领域服务：为用户交互与 Agent 提供统一的已确认图元 CRUD。 */

import type { TradingDate } from '../../data/provider/types.js'
import { DRAWING_ERROR_CODES, KLineChartError } from '../../errors.js'
import type {
  DrawingKind,
  DrawingLabels,
  DrawingObject,
  DrawingStyle,
  DrawingWorkspaceId,
  PersistedDrawingAnchor,
} from '../../foundation/plugin/index.js'
import { DEFAULT_DRAWING_STROKE } from '../../foundation/tokens/index.js'
import { generateUUID } from '../../foundation/utils/uuid.js'
import type { DrawingStateModule } from '../state/drawingState.js'
import { PREVIEW_ID } from './DrawingState.js'
import { isDrawingLocked } from './drawingAccess.js'
import {
  getDrawingAnchorCount,
  getDrawingInputAnchorCount,
  materializeDrawingAnchors,
} from './materializeAnchors.js'

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

/** 可批量修改的样式字段全集 */
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

const DEFAULT_DRAWING_STYLE: Readonly<DrawingStyle> = {
  stroke: DEFAULT_DRAWING_STROKE,
  strokeWidth: 1,
  strokeStyle: 'solid',
}

/** 将用户 Enter 与外部输入统一为绘图文档的字面量换行控制码。 */
function normalizeDrawingLabels(labels: DrawingLabels): DrawingLabels {
  const normalizeText = (text: string) => text.replace(/\r\n?|\n/g, '\\n')
  const normalizeGroup = (group: DrawingLabels['line']) =>
    Object.fromEntries(
      Object.entries(group).map(([key, label]) => [
        key,
        { ...label, text: normalizeText(label.text) },
      ]),
    )
  return {
    line: normalizeGroup(labels.line),
    area: normalizeGroup(labels.area),
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

/** 判断 patch 是否触及 locked 以外的可写字段；锁定图元只接受 locked 字段。 */
function hasEditablePatchFields(patch: {
  readonly anchors?: unknown
  readonly style?: unknown
  readonly params?: unknown
  readonly labels?: unknown
  readonly visible?: unknown
  readonly zIndex?: unknown
}): boolean {
  return (
    patch.anchors !== undefined ||
    patch.style !== undefined ||
    patch.params !== undefined ||
    patch.labels !== undefined ||
    patch.visible !== undefined ||
    patch.zIndex !== undefined
  )
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

  /** 创建、校验并提交一个已确认图元，同时将其设为唯一选中。 */
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
      labels: normalizeDrawingLabels(input.labels ?? { line: {}, area: {} }),
      style: {
        ...DEFAULT_DRAWING_STYLE,
        ...(isChannel(input.kind) ? { fillOpacity: 0.1 } : {}),
        ...input.style,
      },
    }
    this.dependencies.drawingState.actions.addDrawingAndSelect(drawing)
    return this.getDrawing(drawing.id)!
  }

  /** 以完整模型快照替换一个已确认图元；锁定图元拒绝。 */
  updateDrawing(drawing: DrawingObject): DrawingObject | null {
    const current = this.getDrawing(drawing.id)
    if (!current || isDrawingLocked(current)) return null
    return this.writeDrawing(drawing)
  }

  /** 将外部声明式 patch 转换为完整模型快照后提交；锁定图元只接受 locked 字段。 */
  updateDrawingFromInput(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    const current = this.getDrawing(id)
    if (!current) return null
    if (isDrawingLocked(current) && hasEditablePatchFields(patch)) return null
    const anchors =
      patch.anchors === undefined ? undefined : this.resolveAnchorsForUpdate(id, patch.anchors)
    return this.writeDrawing({
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

  /** 无策略的原子快照写入，仅校验 id/kind/pane 匹配。 */
  private writeDrawing(drawing: DrawingObject): DrawingObject | null {
    const current = this.getDrawing(drawing.id)
    if (!current || drawing.kind !== current.kind || drawing.paneId !== current.paneId) return null
    return this.dependencies.drawingState.actions.updateDrawing(drawing.id, {
      ...drawing,
      labels: normalizeDrawingLabels(drawing.labels ?? { line: {}, area: {} }),
    })
  }

  /** 提交交互层已解析的拖拽锚点，不再转换为外部声明式输入。 */
  commitDrawingDrag(
    id: string,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): DrawingObject | null {
    return this.commitDrawingDrags([{ id, anchors }])[0] ?? null
  }

  /** 原子提交一组交互层拖拽后的已解析锚点。 */
  commitDrawingDrags(
    updates: ReadonlyArray<{ id: string; anchors: ReadonlyArray<PersistedDrawingAnchor> }>,
  ): ReadonlyArray<DrawingObject> {
    const ids = updates.map((update) => update.id)
    if (ids.length === 0 || new Set(ids).size !== ids.length) return Object.freeze([])
    const drawings = this.getDrawingsByIds(ids)
    if (drawings.length !== updates.length) return Object.freeze([])
    // 锁定图元不可拖拽。
    if (drawings.some((drawing) => isDrawingLocked(drawing))) return Object.freeze([])

    const updatedById = new Map<string, DrawingObject>()
    for (const update of updates) {
      const drawing = drawings.find((item) => item.id === update.id)
      if (!drawing || !this.hasValidDragAnchors(drawing, update.anchors)) return Object.freeze([])
      updatedById.set(drawing.id, { ...drawing, anchors: [...update.anchors] })
    }

    const snapshot = this.dependencies.drawingState.actions.setDrawings(
      this.listDrawings().map((drawing) => updatedById.get(drawing.id) ?? drawing),
    )
    return Object.freeze(ids.map((id) => snapshot.find((drawing) => drawing.id === id)!))
  }

  /** 校验拖拽提交的锚点是否仍符合原图元的坐标语义。 */
  private hasValidDragAnchors(
    drawing: DrawingObject,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): boolean {
    if (anchors.length !== getDrawingAnchorCount(drawing.kind)) return false
    return anchors.every((anchor) => {
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
  }

  /** 返回一批图元共同拥有的样式字段。 */
  getBatchStyleKeys(ids: ReadonlyArray<string>): ReadonlyArray<DrawingStyleKey> {
    const drawings = this.getDrawingsByIds(ids)
    if (drawings.length === 0) return Object.freeze([])
    // 通道类的填充能力由 kind 固有（渲染端必有 area 图元，fill 缺省时从 stroke 派生），
    // 因此全通道类集合的 fill 总是可批量修改，不依赖 style 上是否显式存在该键。
    const fillSupported = drawings.every((drawing) => isChannel(drawing.kind))
    return Object.freeze(
      DRAWING_STYLE_KEYS.filter(
        (key) =>
          (key === 'fill' && fillSupported) ||
          drawings.every((drawing) => drawing.style[key] !== undefined),
      ),
    )
  }

  /** 原子更新多个图元的公共属性；样式字段不合法时整批不写，含其它字段时跳过锁定目标。 */
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

    const targets = hasEditablePatchFields(patch)
      ? drawings.filter((drawing) => !isDrawingLocked(drawing))
      : drawings
    if (targets.length === 0) return Object.freeze([])

    return this.dependencies.drawingState.actions.updateDrawings(
      targets.map((drawing) => drawing.id),
      patch,
    )
  }

  /** 移除指定图元；锁定图元不可移除。 */
  removeDrawing(id: string): boolean {
    const drawing = this.getDrawing(id)
    if (!drawing || isDrawingLocked(drawing)) return false
    return this.dependencies.drawingState.actions.removeDrawing(id)
  }

  /** 原子移除一批图元；锁定图元保留，其余照常移除。 */
  removeBatch(ids: ReadonlyArray<string>): boolean {
    const targets = this.getDrawingsByIds(ids).filter((drawing) => !isDrawingLocked(drawing))
    if (targets.length === 0) return false
    return this.dependencies.drawingState.actions.removeDrawings(
      targets.map((drawing) => drawing.id),
    )
  }

  /** 清除所有已确认图元。 */
  clearDrawings(): void {
    this.dependencies.drawingState.actions.clearDrawings()
  }

  /** 原子替换整份文档，仅供受控组件与导入导出使用；旧数据的输入锚点在此补齐。 */
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    this.dependencies.drawingState.actions.setDrawings(
      drawings
        .filter((drawing) => drawing.id !== PREVIEW_ID)
        .map((drawing) => ({
          ...drawing,
          anchors: materializeDrawingAnchors(
            drawing.kind,
            drawing.anchors,
            () => `anchor-${generateUUID()}`,
          ),
          labels: normalizeDrawingLabels(drawing.labels ?? { line: {}, area: {} }),
        })),
    )
  }

  /** 校验输入锚点数量，解析坐标并补齐该图元的全部持久化锚点。 */
  private resolveAnchors(
    kind: DrawingKind,
    inputs: ReadonlyArray<DrawingAnchorCommandInput>,
  ): PersistedDrawingAnchor[] {
    const required = getDrawingInputAnchorCount(kind)
    if (inputs.length !== required) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR_COUNT,
        `Drawing kind '${kind}' requires exactly ${required} anchors.`,
        { details: { kind, expected: required, actual: inputs.length } },
      )
    }
    return materializeDrawingAnchors(
      kind,
      inputs.map((input) => this.resolveAnchor(kind, input)),
      () => `anchor-${generateUUID()}`,
    )
  }

  /** 解析交易日锚点；按互相排斥的失败原因抛出语义明确的错误码。 */
  private resolveAnchorTradingDate(tradingDate: TradingDate): number {
    const resolution = this.dependencies.findAnchorAtTradingDate(tradingDate)
    switch (resolution.kind) {
      case 'resolved':
        return resolution.timestamp
      case 'out-of-range':
        throw new KLineChartError(
          DRAWING_ERROR_CODES.ANCHOR_DATE_OUT_OF_RANGE,
          `Drawing anchor date ${tradingDate} is outside the loaded range ${resolution.earliest}..${resolution.latest}.`,
          { details: { tradingDate, earliest: resolution.earliest, latest: resolution.latest } },
        )
      case 'not-trading':
        throw new KLineChartError(
          DRAWING_ERROR_CODES.ANCHOR_DATE_NOT_TRADING,
          `No bar exists on ${tradingDate} in the loaded chart data.`,
          { details: { tradingDate } },
        )
      case 'date-unavailable':
        throw new KLineChartError(
          DRAWING_ERROR_CODES.ANCHOR_DATE_UNAVAILABLE,
          'The loaded chart data exposes no per-bar date to resolve a trading-date anchor.',
          { details: { tradingDate } },
        )
    }
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
      const timestamp = this.resolveAnchorTradingDate(input.tradingDate)
      return kind === 'vertical-line'
        ? {
            id: `anchor-${generateUUID()}`,
            type: 'vertical',
            time: timestamp,
            price: input.price,
          }
        : this.createPointAnchor(timestamp, undefined, input.price)
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
