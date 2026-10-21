/** GPU 原语调度：整批准备与原子合成，文字直接由 Canvas 绘制并作为有序边界。 */
import type { PaintPrimitive, PrimitiveBackend, PrimitiveMetrics } from '../types.js'
import { paintCanvasPrimitives } from './canvas.js'
import { createColorResolver } from './colors.js'
import type { DataTransform } from '@/foundation/plugin/types.js'
import { createPrimitivePreparer, type GeometryPrimitive, type PreparedBatch } from './prepare.js'

export interface DeviceMetrics {
  drawCalls: number
  uploads: number
  uploadedBytes: number
  submissions: number
}
export interface PrimitiveDevice {
  render(
    batch: PreparedBatch,
    width: number,
    height: number,
    dpr: number,
    /** false 时只清 stencil，保留上一帧颜色（可见表面的增量帧）。 */
    clear?: boolean,
    transform?: DataTransform,
  ): { canvas: HTMLCanvasElement; metrics: DeviceMetrics }
  waitForIdle(): Promise<void>
  dispose(): void
}

/**
 * 一批内容覆盖的目标面积低于该比例时，离屏渲染 + 整张合成比直接 Canvas 画更贵。
 * 阈值只拦截"几乎空"的批次，正常行情与指标内容仍然走 GPU。
 */
const MIN_GPU_COVERAGE = 0.06

/** 为每次 paint 重置指标；对象只在绘制开始分配一次。 */
function emptyMetrics(): PrimitiveMetrics {
  return {
    primitives: 0,
    culled: 0,
    geometryBuilds: 0,
    geometryHits: 0,
    drawCalls: 0,
    uploads: 0,
    uploadedBytes: 0,
    submissions: 0,
    compositions: 0,
    prepareMs: 0,
    renderMs: 0,
  }
}

/** 估算本批在逻辑像素上的覆盖面积，用于判断离屏合成是否值得。 */
function coverage(primitives: readonly PaintPrimitive[]): number {
  let area = 0
  for (const primitive of primitives) {
    switch (primitive.kind) {
      case 'rect':
        area += Math.abs(primitive.width * primitive.height)
        break
      case 'circle':
        area += Math.PI * primitive.radius * primitive.radius
        break
      case 'rects': {
        const data = primitive.data
        for (let offset = 0; offset < data.length; offset += 4)
          area += Math.abs(data[offset + 2]! * data[offset + 3]!)
        break
      }
      case 'text':
        area += primitive.font.length * 8
        break
      default: {
        let left = Infinity,
          top = Infinity,
          right = -Infinity,
          bottom = -Infinity
        for (const path of primitive.paths)
          for (const point of path) {
            left = Math.min(left, point.x)
            top = Math.min(top, point.y)
            right = Math.max(right, point.x)
            bottom = Math.max(bottom, point.y)
          }
        const expand = primitive.kind === 'stroke' ? primitive.width : 0
        if (right > left && bottom > top)
          area += (right - left + expand) * (bottom - top + expand)
        break
      }
    }
  }
  return area
}

/** 不跨文字重排几何；混合批次使用复用 staging 保证后半批失败时可完整回退。 */
export function createGpuPrimitiveBackend(
  create: (document: Document) => PrimitiveDevice,
  initialDevice?: PrimitiveDevice,
  options: { segments?: boolean } = {},
): PrimitiveBackend {
  let device: PrimitiveDevice | undefined = initialDevice
  let preparer: ReturnType<typeof createPrimitivePreparer> | undefined
  let staging: CanvasRenderingContext2D | null = null
  let disposed = false
  let metrics = emptyMetrics()
  return {
    paint(target, primitives, dpr, dataTransform) {
      if (disposed) return false
      metrics = emptyMetrics()
      metrics.primitives = primitives.length
      if (primitives.every((primitive) => primitive.kind === 'text')) {
        paintCanvasPrimitives(target, primitives, dpr, dataTransform)
        return true
      }
      // 非默认合成、阴影或滤镜不能按整批组合作等价变换，统一交给 Canvas 保持原语语义。
      if (
        target.globalAlpha !== 1 ||
        target.globalCompositeOperation !== 'source-over' ||
        target.shadowBlur !== 0 ||
        target.shadowOffsetX !== 0 ||
        target.shadowOffsetY !== 0 ||
        target.filter !== 'none'
      )
        return false
      const transform = target.getTransform()
      // 统一原语使用目标局部逻辑像素；其他仿射变换交给 Canvas，不能先错误裁剪再变换。
      if (
        transform.a !== dpr ||
        transform.d !== dpr ||
        transform.b !== 0 ||
        transform.c !== 0 ||
        transform.e !== 0 ||
        transform.f !== 0
      )
        return false
      const width = target.canvas.width,
        height = target.canvas.height
      if (width <= 0 || height <= 0) return false
      // 覆盖面积近乎为零时，整张离屏渲染与合成为纯开销。
      const canvasArea = (width / dpr) * (height / dpr)
      if (coverage(primitives) < canvasArea * MIN_GPU_COVERAGE) return false
      try {
        const document = target.canvas.ownerDocument
        if (!document) return false
        preparer ??= createPrimitivePreparer(createColorResolver(document), options)
        const mixed = primitives.some((primitive) => primitive.kind === 'text')
        let destination = target
        if (mixed) {
          if (!staging) staging = document.createElement('canvas').getContext('2d')
          if (!staging) return false
          if (staging.canvas.width !== width) staging.canvas.width = width
          if (staging.canvas.height !== height) staging.canvas.height = height
          staging.setTransform(1, 0, 0, 1, 0, 0)
          staging.clearRect(0, 0, width, height)
          staging.scale(dpr, dpr)
          destination = staging
        }
        const geometry: GeometryPrimitive[] = []
        /** 一个连续几何段一次准备和提交；只有混合批次的私有 staging 会在此时改变。 */
        const flush = (): void => {
          if (!geometry.length) return
          const prepareStart = performance.now()
          const batch = preparer!.prepare(geometry, width, height, dpr, dataTransform)
          metrics.prepareMs += performance.now() - prepareStart
          metrics.culled += batch.culled
          metrics.geometryBuilds += batch.geometryBuilds
          metrics.geometryHits += batch.geometryHits
          if (batch.draws.length) {
            device ??= create(document)
            const renderStart = performance.now()
            const result = device.render(batch, width, height, dpr, true, dataTransform)
            metrics.renderMs += performance.now() - renderStart
            metrics.drawCalls += result.metrics.drawCalls
            metrics.uploads += result.metrics.uploads
            metrics.uploadedBytes += result.metrics.uploadedBytes
            metrics.submissions += result.metrics.submissions
            // 设备目标可能大于本目标，只取左上角 width × height 区域。
            destination.drawImage(
              result.canvas,
              0,
              0,
              width,
              height,
              0,
              0,
              width / dpr,
              height / dpr,
            )
            metrics.compositions++
          }
          geometry.length = 0
        }
        for (const primitive of primitives) {
          if (primitive.kind === 'text') {
            flush()
            paintCanvasPrimitives(destination, [primitive], dpr, dataTransform)
          } else geometry.push(primitive)
        }
        flush()
        if (mixed) {
          target.drawImage(destination.canvas, 0, 0, width / dpr, height / dpr)
          metrics.compositions++
        }
        return true
      } catch {
        device?.dispose()
        device = undefined
        return false
      }
    },
    getMetrics() {
      return { ...metrics }
    },
    async waitForIdle() {
      await device?.waitForIdle()
    },
    dispose() {
      disposed = true
      device?.dispose()
      device = undefined
      preparer = undefined
      if (staging) staging.canvas.width = staging.canvas.height = 1
      staging = null
    },
  }
}
