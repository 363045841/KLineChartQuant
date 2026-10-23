/**
 * 帧内跨层原语合成：同一目标按提交顺序累积，目标状态不变时整帧只合成一次。
 *
 * 合成边界由目标状态决定：填充色、线宽等图元级状态不影响合批；仿射变换、
 * 透明度、合成模式、阴影与滤镜属于目标级状态，变化前必须先落盘，否则后画的原语
 * 会被套上错误的坐标系或透明度。
 */

import type { DataTransform } from '@/foundation/plugin/types.js'
import type { PaintPrimitive, PrimitivePaint, PrimitiveSink } from '../types.js'

export interface PrimitiveComposer {
  /**
   * 唯一提交入口：目标已由 Scene 绑定，图层不能另行选择输出画布。
   * 纯增量图层与仍持有 ctx 的图层共用同一形状，避免两种调用约定并存。
   */
  readonly submit: PrimitivePaint
  /** 立即合成待提交内容；Scene 在帧末与非合批层前后调用。 */
  flush(): void
}

/** 影响整批原语解释结果的目标状态快照。 */
interface ComposedState {
  readonly transform: DOMMatrix
  readonly alpha: number
  readonly composite: GlobalCompositeOperation
  readonly filter: string
  readonly shadowBlur: number
  readonly shadowOffsetX: number
  readonly shadowOffsetY: number
}

/** 读取目标当前的目标级状态。 */
function readState(target: CanvasRenderingContext2D): ComposedState {
  return {
    transform: target.getTransform(),
    alpha: target.globalAlpha,
    composite: target.globalCompositeOperation,
    filter: target.filter,
    shadowBlur: target.shadowBlur,
    shadowOffsetX: target.shadowOffsetX,
    shadowOffsetY: target.shadowOffsetY,
  }
}

/** 两个快照是否可以用同一批合成, 若改变则需 flush 上屏 */
function sameState(left: ComposedState, right: ComposedState): boolean {
  return (
    left.transform.a === right.transform.a &&
    left.transform.b === right.transform.b &&
    left.transform.c === right.transform.c &&
    left.transform.d === right.transform.d &&
    left.transform.e === right.transform.e &&
    left.transform.f === right.transform.f &&
    left.alpha === right.alpha &&
    left.composite === right.composite &&
    left.filter === right.filter &&
    left.shadowBlur === right.shadowBlur &&
    left.shadowOffsetX === right.shadowOffsetX &&
    left.shadowOffsetY === right.shadowOffsetY
  )
}

/**
 * 为一个绘制目标建立合成器。
 *
 * @param submit 真实后端提交器，负责 GPU 与 Canvas 的分派
 * @param target 本帧该绘制目标的上下文
 */
export function createPrimitiveComposer(
  submit: PrimitiveSink,
  target: CanvasRenderingContext2D,
): PrimitiveComposer {
  let pending: PaintPrimitive[] = []
  let pendingState: ComposedState | null = null
  let pendingDpr = 1
  let pendingTransform: DataTransform | undefined

  /** 追加一批纯增量原语；目标级状态或数据变换变化前先落盘。 */
  const compose = (
    primitives: readonly PaintPrimitive[],
    dpr: number,
    transform?: DataTransform,
  ): void => {
    if (primitives.length === 0) return
    const state = readState(target)
    if (
      pendingState !== null &&
      (pendingDpr !== dpr || pendingTransform !== transform || !sameState(pendingState, state))
    )
      flush()
    if (pendingState === null) {
      pendingState = state
      pendingDpr = dpr
      pendingTransform = transform
    }
    for (const primitive of primitives) pending.push(primitive)
  }

  /** 用提交时记录的状态重放整批，保证跨层合并后坐标与透明度仍准确。 */
  const flush = (): void => {
    if (pending.length === 0 || pendingState === null) return
    const batch = pending
    const state = pendingState
    const dpr = pendingDpr
    const transform = pendingTransform
    pending = []
    pendingState = null
    pendingTransform = undefined
    target.save()
    target.setTransform(state.transform)
    target.globalAlpha = state.alpha
    target.globalCompositeOperation = state.composite
    target.filter = state.filter
    target.shadowBlur = state.shadowBlur
    target.shadowOffsetX = state.shadowOffsetX
    target.shadowOffsetY = state.shadowOffsetY
    try {
      submit(target, batch, dpr, transform)
    } finally {
      target.restore()
    }
  }

  return { flush, submit: compose }
}
