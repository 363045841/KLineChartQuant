/** 有序屏幕原语契约：几何使用逻辑像素，绘制目标保留调用方的裁剪与合成状态。 */
import type { DataTransform } from '../../foundation/plugin/types.js'

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
      kind: 'rects'
      /** 每 4 个数一个矩形：x、y、width、height（逻辑像素，双精度），长度恒为 count * 4。 */
      data: Float64Array
      color: string
    }
  | {
      kind: 'fill'
      paths: readonly PrimitivePath[]
      color: string
      opacity?: number
      fillRule?: CanvasFillRule
      /** 路径是上下两条等长链组成的带子，按条带三角化并跳过 stencil。 */
      band?: boolean
      /** 路径为数据空间（世界 x、价格 y），由帧变换还原屏幕坐标；仅带子支持。 */
      dataSpace?: boolean
      /** 世界坐标的横向平移量；后端在绘制时统一扣除，路径本身保持不变。 */
      offsetX?: number
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
      /** 世界坐标的横向平移量；后端在绘制时统一扣除，路径本身保持不变。 */
      offsetX?: number
      /** 点为数据空间（世界 x、价格 y），由帧变换还原屏幕坐标；仅解析式描边支持。 */
      dataSpace?: boolean
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
    transform?: DataTransform,
  ): boolean
  /** 最近一次完整提交的实际开销；不在绘制过程中同步等待 GPU。 */
  getMetrics?(): Readonly<PrimitiveMetrics>
  /** 仅供基准等待完成，生产帧不调用。 */
  waitForIdle?(): Promise<void>
  /**
   * 为可见画布建立直出表面：图元直接写入该画布，不经过离屏目标，也没有整张拷贝。
   * 无法提供直出能力的后端（Canvas）不实现此方法。
   */
  createSurface?(canvas: HTMLCanvasElement): PrimitiveSurface | null
  dispose(): void
}

/** 可见 GPU 表面的直出入口；`clear` 表示本帧是否先清空整张表面。 */
export interface PrimitiveSurface {
  readonly canvas: HTMLCanvasElement
  paint(
    primitives: readonly PaintPrimitive[],
    dpr: number,
    clear: boolean,
    transform?: DataTransform,
  ): boolean
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
  transform?: DataTransform,
) => void

/** 目标已由合成器绑定的提交入口：只增量绘制的图层只能拿到这个，拿不到 ctx。 */
export type PrimitivePaint = (
  primitives: readonly PaintPrimitive[],
  dpr: number,
  transform?: DataTransform,
) => void

/** 单个绘制目标的合批契约：图层只提交原语，上屏时机由合成器决定。 */
export interface PrimitiveComposer {
  /**
   * 唯一提交入口：目标已由 Scene 绑定，图层不能另行选择输出画布。
   * 纯增量图层与仍持有 ctx 的图层共用同一形状，避免两种调用约定并存。
   */
  readonly submit: PrimitivePaint
  /** 立即合成待提交内容；Scene 在帧末与非合批层前后调用。 */
  flush(): void
}
