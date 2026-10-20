/** GPU 原语调度：整批准备与原子合成，文字直接由 Canvas 绘制并作为有序边界。 */
import type { PaintPrimitive, PrimitiveBackend, PrimitiveMetrics } from '../types.js'
import { paintCanvasPrimitives } from './canvas.js'
import { createColorResolver } from './colors.js'
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
  ): { canvas: HTMLCanvasElement; metrics: DeviceMetrics }
  waitForIdle(): Promise<void>
  dispose(): void
}

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

/** 不跨文字重排几何；混合批次使用复用 staging 保证后半批失败时可完整回退。 */
export function createGpuPrimitiveBackend(
  create: (document: Document) => PrimitiveDevice,
  initialDevice?: PrimitiveDevice,
): PrimitiveBackend {
  let device: PrimitiveDevice | undefined = initialDevice
  let preparer: ReturnType<typeof createPrimitivePreparer> | undefined
  let staging: CanvasRenderingContext2D | null = null
  let disposed = false
  let metrics = emptyMetrics()
  return {
    paint(target, primitives, dpr) {
      if (disposed) return false
      metrics = emptyMetrics()
      metrics.primitives = primitives.length
      if (primitives.every((primitive) => primitive.kind === 'text')) {
        paintCanvasPrimitives(target, primitives, dpr)
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
      try {
        const document = target.canvas.ownerDocument
        const width = target.canvas.width,
          height = target.canvas.height
        if (!document || width <= 0 || height <= 0) return false
        preparer ??= createPrimitivePreparer(createColorResolver(document))
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
          const batch = preparer!.prepare(geometry, width, height, dpr)
          metrics.prepareMs += performance.now() - prepareStart
          metrics.culled += batch.culled
          metrics.geometryBuilds += batch.geometryBuilds
          metrics.geometryHits += batch.geometryHits
          if (batch.draws.length) {
            device ??= create(document)
            const renderStart = performance.now()
            const result = device.render(batch, width, height, dpr)
            metrics.renderMs += performance.now() - renderStart
            metrics.drawCalls += result.metrics.drawCalls
            metrics.uploads += result.metrics.uploads
            metrics.uploadedBytes += result.metrics.uploadedBytes
            metrics.submissions += result.metrics.submissions
            destination.drawImage(result.canvas, 0, 0, width / dpr, height / dpr)
            metrics.compositions++
          }
          geometry.length = 0
        }
        for (const primitive of primitives) {
          if (primitive.kind === 'text') {
            flush()
            paintCanvasPrimitives(destination, [primitive], dpr)
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
