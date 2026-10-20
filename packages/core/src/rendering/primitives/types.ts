/** 有序屏幕原语契约：几何使用逻辑像素，绘制目标保留调用方的裁剪与合成状态。 */
export type PrimitivePoint = Readonly<{ x: number; y: number }>
export type PrimitivePath = readonly PrimitivePoint[]

export type PaintPrimitive =
  | {
      kind: 'circle'
      x: number
      y: number
      radius: number
      color: string
      strokeColor?: string
      strokeWidth?: number
    }
  | {
      kind: 'rect'
      x: number
      y: number
      width: number
      height: number
      radius?: number
      color: string
      strokeColor?: string
      strokeWidth?: number
    }
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
  paint(
    target: CanvasRenderingContext2D,
    primitives: readonly PaintPrimitive[],
    dpr: number,
  ): boolean
  /** 最近一次完整提交的实际开销；不在绘制过程中同步等待 GPU。 */
  getMetrics?(): Readonly<PrimitiveMetrics>
  /** 仅供基准等待完成，生产帧不调用。 */
  waitForIdle?(): Promise<void>
  dispose(): void
}

/** CPU 阶段耗时与实际驱动调用计数；耗时不冒充 GPU timestamp。 */
export interface PrimitiveMetrics {
  primitives: number
  culled: number
  geometryBuilds: number
  geometryHits: number
  drawCalls: number
  uploads: number
  uploadedBytes: number
  submissions: number
  compositions: number
  prepareMs: number
  renderMs: number
}

/** 业务投影只输出原语；自定义 drawing renderer 也可以复用同一提交入口。 */
export type PrimitiveSink = (
  target: CanvasRenderingContext2D,
  primitives: readonly PaintPrimitive[],
  dpr: number,
) => void
