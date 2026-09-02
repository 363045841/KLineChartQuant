/** 绘图文档领域服务：为用户交互与 Agent 提供统一的已确认图元 CRUD。 */
import type {
  DrawingAnchor,
  DrawingKind,
  DrawingObject,
  DrawingStyle,
} from '../../foundation/plugin'
import { generateUUID } from '../../foundation/utils/uuid'
import type { DrawingStateModule } from '../state/drawingState'

import { PREVIEW_ID } from './DrawingState'

/** 外部命令使用时间和价格描述锚点，逻辑 index 由文档根据当前数据解析。 */
export interface DrawingAnchorInput {
  readonly time: number
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
      throw new RangeError(`Unknown drawing pane '${input.paneId}'.`)
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
      throw new RangeError(`Drawing kind '${kind}' requires exactly ${required} anchors.`)
    }
    const anchors = inputs.map((input) => this.resolveAnchor(input))
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

  /** 解析单个声明式锚点。 */
  private resolveAnchor(input: DrawingAnchorInput): DrawingAnchor {
    if (!Number.isFinite(input.time) || !Number.isFinite(input.price)) {
      throw new TypeError('Drawing anchor time and price must be finite numbers.')
    }
    const index = this.dependencies.getLogicalIndexAtTimestamp(input.time)
    if (index === null) {
      throw new RangeError(`No chart data exists for drawing anchor timestamp ${input.time}.`)
    }
    return { id: `anchor-${generateUUID()}`, index, time: input.time, price: input.price }
  }
}
