/** 有序屏幕原语契约：几何使用逻辑像素，绘制目标保留调用方的裁剪与合成状态。 */
export type PrimitivePoint = Readonly<{ x: number; y: number }>
export type PrimitivePath = readonly PrimitivePoint[]

export type PaintPrimitive =
  | { kind: 'circle'; x: number; y: number; radius: number; color: string }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; radius?: number; color: string }
  | {
      kind: 'fill'
      paths: readonly PrimitivePath[]
      color: string
      opacity?: number
      fillRule?: CanvasFillRule
    }
  | {
      kind: 'stroke'
      paths: readonly PrimitivePath[]
      color: string
      width: number
      closed?: boolean
      dash?: readonly number[]
      dashOffset?: number
      cap?: CanvasLineCap
      join?: CanvasLineJoin
      miterLimit?: number
    }
  | {
      kind: 'text'
      text: string
      x: number
      y: number
      font: string
      color: string
      align: CanvasTextAlign
      baseline: CanvasTextBaseline
      rotation?: number
      /** 旋转坐标系中的行偏移。 */
      offsetY?: number
    }

/** 整批先画到隔离目标，成功后才合成；false 保证未改变调用方目标。 */
export interface PrimitiveBackend {
  paint(target: CanvasRenderingContext2D, primitives: readonly PaintPrimitive[], dpr: number): boolean
  dispose(): void
}

/** 业务投影只输出原语；自定义 drawing renderer 也可以复用同一提交入口。 */
export type PrimitiveSink = (
  target: CanvasRenderingContext2D,
  primitives: readonly PaintPrimitive[],
  dpr: number,
) => void
