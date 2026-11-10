/** 绘图文档领域服务：为用户交互与 Agent 提供统一的已确认图元 CRUD。 */

import type { DrawingObjectInput } from '@363045841yyt/klinechart-plot-contracts'
import { applyDrawingPatch, createDrawingObjectApi } from '@363045841yyt/klinechart-plot-contracts'
import type { TradingDate } from '@/data/provider/types.js'
import { DRAWING_ERROR_CODES, KLineChartError } from '@/errors.js'
import { batch } from '@/foundation/reactivity/signal.js'
import { DEFAULT_DRAWING_FILL_OPACITY } from '@/foundation/tokens/index.js'
import { generateUUID } from '@/foundation/utils/uuid.js'
import type { DrawingDocumentSnapshot } from '../../history/types.js'
import { PREVIEW_ID } from '../../session/impl/DrawingSessionOverlay.js'
import type { DrawingKind, DrawingObject, PersistedDrawingAnchor } from '../../types.js'
import type {
  BatchDrawingPatch,
  CreateDrawingInput,
  DrawingAnchorCommandInput,
  DrawingDocumentDependencies,
  DrawingDuplicatePlacement,
  DrawingStyleKey,
  UpdateDrawingPatch,
} from '../types.js'
import { areAnchorsIdentical, isDrawingLocked, isDrawingMovementLocked } from './drawingAccess.js'
import { normalizeDrawingLabels } from './drawingLabels.js'
import { belongsToDrawingSymbol, bindDrawingSymbol } from './drawingScope.js'
import {
  getDrawingAnchorCount,
  getDrawingInputAnchorCount,
  materializeDrawingAnchors,
} from './materializeAnchors.js'

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
/** 水平线锚点只保存价格。 */
function resolveHorizontalAnchor(input: DrawingAnchorCommandInput): PersistedDrawingAnchor {
  assertFiniteAnchorPrice(input.price, 'Horizontal')
  return { id: `anchor-${generateUUID()}`, type: 'horizontal', price: input.price }
}

/** 水平线锚点只要求类型正确且价格有限。 */
function isHorizontalAnchorValid(anchor: PersistedDrawingAnchor): boolean {
  return anchor.type === 'horizontal' && Number.isFinite(anchor.price)
}

/** 垂直线锚点必须有可解析时间。 */
function isVerticalAnchorValid(anchor: PersistedDrawingAnchor): boolean {
  return anchor.type === 'vertical' && Number.isFinite(Number(anchor.time))
}

/** 普通点锚点同时需要时间与价格。 */
function isPointAnchorValid(anchor: PersistedDrawingAnchor): boolean {
  return (
    anchor.type !== 'horizontal' &&
    anchor.type !== 'vertical' &&
    Number.isFinite(anchor.price) &&
    Number.isFinite(Number(anchor.time))
  )
}

/** 按图元种类校验锚点的类型、时间与价格语义。 */
function isAnchorValid(drawing: DrawingObject, anchor: PersistedDrawingAnchor): boolean {
  if (drawing.kind === 'horizontal-line') return isHorizontalAnchorValid(anchor)
  if (drawing.kind === 'vertical-line') return isVerticalAnchorValid(anchor)
  return isPointAnchorValid(anchor)
}

/** 校验锚点价格为有限数。 */
function assertFiniteAnchorPrice(price: number, axis: 'Horizontal' | 'Vertical'): void {
  if (Number.isFinite(price)) return
  throw new KLineChartError(
    DRAWING_ERROR_CODES.INVALID_ANCHOR,
    `${axis} drawing anchor price must be a finite number.`,
    { details: { price } },
  )
}

export class DrawingDocument {
  private readonly objects: ReturnType<typeof createDrawingObjectApi>

  /** 将公共图形服务绑定到 Kernel 仓库；用户选择和历史策略不进入公共图形层。 */
  constructor(private readonly dependencies: DrawingDocumentDependencies) {
    const state = dependencies.drawingState
    this.objects = createDrawingObjectApi({
      list: () => state.readonly.drawings.peek(),
      replace: (drawings) => {
        state.actions.commitDocument(drawings, state.readonly.selectedDrawingIds.peek())
      },
      /** 追加与回收合并成一次文档快照提交，避免创建和选择之间出现中间状态。 */
      append: (drawings, removeIds) => {
        const removed = new Set(removeIds)
        const current = state.readonly.drawings.peek().filter((drawing) => !removed.has(drawing.id))
        state.actions.commitDocument(
          [...current, ...drawings],
          state.readonly.selectedDrawingIds.peek(),
        )
      },
      nextId: () => `drawing-${generateUUID()}`,
      /** 用户文档没有外部回滚；引用表无需重建。 */
      epoch: () => 0,
    })
  }

  /** 用户创建事务同时选择新图元；导入和历史恢复不隐式改变选择。 */
  private createAndSelect(inputs: readonly DrawingObjectInput[]): readonly DrawingObject[] {
    return batch(() => {
      const drawings = this.objects.createMany(inputs)
      this.dependencies.drawingState.actions.setSelectedDrawingIds(
        drawings.map((drawing) => drawing.id),
      )
      return drawings
    })
  }

  snapshot(): DrawingDocumentSnapshot {
    return {
      drawings: this.listDrawings(),
      selectedIds: this.dependencies.drawingState.readonly.selectedDrawingIds.peek(),
    }
  }

  onDrawingsChanged(listener: () => void): () => void {
    return this.dependencies.drawingState.readonly.drawings.subscribe(listener)
  }

  /** 只供历史回放使用；不重新解析锚点，也不重新应用锁定策略。 */
  restoreSnapshot(
    drawings: ReadonlyArray<DrawingObject>,
    selectedIds: ReadonlyArray<string>,
  ): void {
    this.dependencies.drawingState.actions.commitDocument(drawings, selectedIds)
  }

  /** 返回当前已确认图元快照。 */
  listDrawings(): ReadonlyArray<DrawingObject> {
    return this.dependencies.drawingState.readonly.drawings.peek()
  }

  /** 派生当前标的的对象列表；原始文档仍完整保存在同一个 Kernel 状态。 */
  listCurrentDrawings(): ReadonlyArray<DrawingObject> {
    return this.listDrawings().filter((drawing) =>
      belongsToDrawingSymbol(drawing, this.dependencies.getSymbolKey()),
    )
  }

  /** 按 id 查询已确认图元。 */
  getDrawing(id: string): DrawingObject | null {
    const drawing = this.objects.get(id)
    return drawing && belongsToDrawingSymbol(drawing, this.dependencies.getSymbolKey())
      ? drawing
      : null
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
    return this.createAndSelect([
      {
        id: `drawing-${generateUUID()}`,
        kind: input.kind,
        paneId: input.paneId,
        workspaceId: this.dependencies.getWorkspaceId(),
        symbolKey: this.dependencies.getSymbolKey(),
        visible: input.visible ?? true,
        ...(input.locked === undefined ? {} : { locked: input.locked }),
        ...(input.zIndex === undefined ? {} : { zIndex: input.zIndex }),
        anchors,
        params:
          input.params ?? (input.kind === 'regression-channel' ? { sigma: 2 } : Object.freeze({})),
        labels: normalizeDrawingLabels(input.labels),
        style: {
          ...(isChannel(input.kind) ? { fillOpacity: DEFAULT_DRAWING_FILL_OPACITY } : {}),
          ...input.style,
        },
      },
    ])[0]!
  }

  /** 克隆整组图元的唯一实现；源快照可以已不在文档中，供复制、粘贴与拖拽复制共用。 */
  duplicateDrawings(
    placements: ReadonlyArray<DrawingDuplicatePlacement>,
  ): ReadonlyArray<DrawingObject> {
    if (placements.length === 0) return Object.freeze([])
    if (new Set(placements.map((placement) => placement.source.id)).size !== placements.length)
      return Object.freeze([])
    const copies: DrawingObject[] = []
    for (const { source, anchors } of placements) {
      if (!this.dependencies.hasPaneId(source.paneId)) return Object.freeze([])
      if (!this.hasValidAnchors(source, anchors)) return Object.freeze([])
      const copy = this.objects.clone(source)
      copies.push({
        ...copy,
        visible: true,
        locked: false,
        workspaceId: this.dependencies.getWorkspaceId(),
        symbolKey: this.dependencies.getSymbolKey(),
        anchors: anchors.map((anchor, anchorIndex) => ({
          ...anchor,
          id: copy.anchors[anchorIndex]!.id,
        })),
      })
    }
    return this.createAndSelect(copies)
  }

  /** 以完整模型快照替换一个已确认图元；移动被锁时仅在锚点未变时接受。 */
  updateDrawing(drawing: DrawingObject): DrawingObject | null {
    const current = this.getDrawing(drawing.id)
    if (!current) return null
    const globalLocked = this.dependencies.drawingState.readonly.globalDrawingLock.peek()
    if (
      isDrawingMovementLocked(current, globalLocked) &&
      !areAnchorsIdentical(current.anchors, drawing.anchors)
    )
      return null
    return this.writeDrawing(drawing)
  }

  /** 将外部声明式 patch 转换为完整模型快照后提交；移动被锁时只拒绝锚点 patch。 */
  updateDrawingFromInput(id: string, patch: UpdateDrawingPatch): DrawingObject | null {
    const current = this.getDrawing(id)
    if (!current) return null
    const globalLocked = this.dependencies.drawingState.readonly.globalDrawingLock.peek()
    if (isDrawingMovementLocked(current, globalLocked) && patch.anchors !== undefined) return null
    const anchors =
      patch.anchors === undefined ? undefined : this.resolveAnchorsForUpdate(id, patch.anchors)
    return this.writeDrawing(applyDrawingPatch(current, { ...patch, anchors }))
  }

  /** 无策略的原子快照写入，仅校验 id/kind/pane 匹配。 */
  private writeDrawing(drawing: DrawingObject): DrawingObject | null {
    return this.objects.update({
      ...drawing,
      labels: normalizeDrawingLabels(drawing.labels),
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
    // 移动被锁的图元不可拖拽（自身锁定或全局锁）。
    const globalLocked = this.dependencies.drawingState.readonly.globalDrawingLock.peek()
    if (drawings.some((drawing) => isDrawingMovementLocked(drawing, globalLocked)))
      return Object.freeze([])

    const updatedById = new Map<string, DrawingObject>()
    for (const update of updates) {
      const drawing = drawings.find((item) => item.id === update.id)
      if (!drawing || !this.hasValidAnchors(drawing, update.anchors)) return Object.freeze([])
      updatedById.set(drawing.id, { ...drawing, anchors: [...update.anchors] })
    }

    return this.objects.updateMany(ids.map((id) => updatedById.get(id)!))
  }

  /** 校验交互层提交的全部锚点是否符合图元的坐标语义。 */
  private hasValidAnchors(
    drawing: DrawingObject,
    anchors: ReadonlyArray<PersistedDrawingAnchor>,
  ): boolean {
    if (anchors.length !== getDrawingAnchorCount(drawing.kind)) return false
    return anchors.every((anchor) => isAnchorValid(drawing, anchor))
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

  /** 原子更新多个图元的公共属性；样式字段不合法时整批不写，锁定图元同样接受。 */
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

    return this.objects.updateMany(drawings.map((drawing) => applyDrawingPatch(drawing, patch)))
  }

  /** 移除指定图元；锁定图元不可移除。 */
  removeDrawing(id: string): boolean {
    const drawing = this.getDrawing(id)
    if (!drawing || isDrawingLocked(drawing)) return false
    return this.objects.delete(id)
  }

  /** 原子移除一批图元；锁定图元保留，其余照常移除。 */
  removeBatch(ids: ReadonlyArray<string>): boolean {
    const targets = this.getDrawingsByIds(ids).filter((drawing) => !isDrawingLocked(drawing))
    if (targets.length === 0) return false
    return this.objects.deleteMany(targets.map((drawing) => drawing.id))
  }

  /** 清除所有已确认图元。 */
  clearDrawings(): void {
    this.objects.deleteMany(this.listCurrentDrawings().map((drawing) => drawing.id))
  }

  /** 原子替换整份文档；旧数据的输入锚点在此补齐。调用方决定记录历史或重设基线。 */
  replaceDrawings(drawings: ReadonlyArray<DrawingObject>): void {
    const committed = drawings.filter((drawing) => drawing.id !== PREVIEW_ID)
    this.objects.replaceAll(
      committed.map((drawing) => ({
        ...bindDrawingSymbol(drawing, this.dependencies.getSymbolKey()),
        anchors: materializeDrawingAnchors(
          drawing.kind,
          drawing.anchors,
          () => `anchor-${generateUUID()}`,
        ),
        labels: normalizeDrawingLabels(drawing.labels),
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
    const drawingsById = new Map(this.listCurrentDrawings().map((drawing) => [drawing.id, drawing]))
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
    if (kind === 'horizontal-line') return resolveHorizontalAnchor(input)
    if (kind === 'vertical-line') return this.resolveVerticalAnchor(input)
    return this.resolvePointAnchor(input)
  }

  /** 水平线只持久化价格，不允许未来偏移。 */
  private resolveVerticalAnchor(input: DrawingAnchorCommandInput): PersistedDrawingAnchor {
    assertFiniteAnchorPrice(input.price, 'Vertical')
    if (input.tradingDate !== undefined) {
      return {
        id: `anchor-${generateUUID()}`,
        type: 'vertical',
        time: this.resolveAnchorTradingDate(input.tradingDate),
        price: input.price,
      }
    }
    const anchor = this.resolveTimestampAnchor(input)
    return {
      id: `anchor-${generateUUID()}`,
      type: 'vertical',
      time: anchor.timestamp,
      price: input.price,
    }
  }

  /** 普通点锚点同时持久化时间与价格。 */
  private resolvePointAnchor(input: DrawingAnchorCommandInput): PersistedDrawingAnchor {
    const anchor = this.resolveTimeAnchorInput(input)
    return this.createPointAnchor(anchor.timestamp, input.price)
  }

  /** 将声明式交易日或时间戳解析为稳定时间。 */
  private resolveTimeAnchorInput(input: DrawingAnchorCommandInput): {
    timestamp: number
  } {
    if (input.tradingDate !== undefined) {
      return {
        timestamp: this.resolveAnchorTradingDate(input.tradingDate),
      }
    }
    return this.resolveTimestampAnchor(input)
  }

  /** 文档接受任意有限时间；是否可见由当前视图的公共坐标服务决定。 */
  private resolveTimestampAnchor(input: DrawingAnchorCommandInput): {
    timestamp: number
  } {
    const timestamp = input.timestamp
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing anchor timestamp must be a finite number.',
        { details: { timestamp: input.timestamp, price: input.price } },
      )
    }
    return { timestamp }
  }

  /** 校验并创建同时包含时间与价格的普通锚点。 */
  private createPointAnchor(timestamp: number, price: number): PersistedDrawingAnchor {
    if (!Number.isFinite(price)) {
      throw new KLineChartError(
        DRAWING_ERROR_CODES.INVALID_ANCHOR,
        'Drawing point anchor price must be a finite number.',
        { details: { timestamp, price } },
      )
    }
    return { id: `anchor-${generateUUID()}`, type: 'point', time: timestamp, price }
  }
}
