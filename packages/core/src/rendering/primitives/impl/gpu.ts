/** GPU 原语调度：纯几何整批准备并一次合成，含文字的批次整批交给 Canvas 单次重放。 */

import type { DataTransform } from '@/foundation/plugin/types.js'
import type { PaintPrimitive, PrimitiveBackend, PrimitiveMetrics } from '../types.js'
import { paintCanvasPrimitives } from './canvas.js'
import { createColorResolver } from './colors.js'
import { createPrimitivePreparer, type GeometryPrimitive, type PreparedBatch } from './prepare.js'

/** 设备侧计数是公开指标 `PrimitiveMetrics` 的切片，字段类型只在那里定义一次。 */
export type DeviceMetrics = Pick<
  PrimitiveMetrics,
  'drawCalls' | 'uploads' | 'uploadedBytes' | 'submissions'
>
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

/** 文字只能由 Canvas 解释，其余原语都可由 GPU 后端准备与合成。 */
function isGeometryPrimitive(primitive: PaintPrimitive): primitive is GeometryPrimitive {
  return primitive.kind !== 'text'
}

/** 估算本批在逻辑像素上的覆盖面积，用于判断离屏合成是否值得。 */
function coverage(primitives: readonly GeometryPrimitive[]): number {
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
        if (right > left && bottom > top) area += (right - left + expand) * (bottom - top + expand)
        break
      }
    }
  }
  return area
}

/**
 * 创建 GPU 原语后端。
 *
 * 文字必须与同批几何保持原始交错顺序，而 GPU 合成按整张目标进行：若在每段文字处
 * 各做一次离屏渲染与整张合成，文字数量会把整画布拷贝放大成 O(n)。因此含文字的批次
 * 整批交给 Canvas 单次重放；只有纯几何批次进入离屏渲染，每批只合成一次。
 *
 * @param create 按需创建离屏设备；首次真正绘制时才分配 GPU 资源
 * @param initialDevice 已创建的共享设备；与 `create` 二选一
 * @param options 准备器选项；GPU 后端开启解析式描边
 */
export function createGpuPrimitiveBackend(
  create: (document: Document) => PrimitiveDevice,
  initialDevice?: PrimitiveDevice,
  options: { segments?: boolean } = {},
): PrimitiveBackend {
  let device: PrimitiveDevice | undefined = initialDevice
  let preparer: ReturnType<typeof createPrimitivePreparer> | undefined
  let disposed = false
  let metrics = emptyMetrics()
  return {
    paint(target, primitives, dpr, dataTransform) {
      if (disposed) return false
      metrics = emptyMetrics()
      metrics.primitives = primitives.length
      if (primitives.length === 0) return true
      if (primitives.some((primitive) => primitive.kind === 'text')) {
        paintCanvasPrimitives(target, primitives, dpr, dataTransform)
        return true
      }
      const geometry = primitives.filter(isGeometryPrimitive)
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
      if (coverage(geometry) < canvasArea * MIN_GPU_COVERAGE) return false
      try {
        const document = target.canvas.ownerDocument
        if (!document) return false
        preparer ??= createPrimitivePreparer(createColorResolver(document), options)
        const prepareStart = performance.now()
        const batch = preparer.prepare(geometry, width, height, dpr, dataTransform)
        metrics.prepareMs += performance.now() - prepareStart
        metrics.culled += batch.culled
        metrics.geometryBuilds += batch.geometryBuilds
        metrics.geometryHits += batch.geometryHits
        if (!batch.draws.length) return true
        device ??= create(document)
        const renderStart = performance.now()
        const result = device.render(batch, width, height, dpr, true, dataTransform)
        metrics.renderMs += performance.now() - renderStart
        metrics.drawCalls += result.metrics.drawCalls
        metrics.uploads += result.metrics.uploads
        metrics.uploadedBytes += result.metrics.uploadedBytes
        metrics.submissions += result.metrics.submissions
        // 设备目标可能大于本目标，只取左上角 width × height 区域。
        target.drawImage(result.canvas, 0, 0, width, height, 0, 0, width / dpr, height / dpr)
        metrics.compositions++
        return true
      } catch {
        device?.dispose()
        device = undefined
        // 复用缓存只对原设备有效；设备重建后必须重新写入全部缓冲。
        preparer = undefined
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
    },
  }
}
