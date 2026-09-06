/** WebGL2 后端实现，将通用 Renderer 原语适配到既有 WebGL 绘制表面。 */

import { CandleWebGLSurface, LineWebGLSurface } from '../../../engine/renderers/webgl/candleSurface'
import { SharedWebGLSurface } from '../../../engine/renderers/webgl/sharedWebGLSurface'
import { worldXToScreenX } from '../../../foundation/utils/pixelAlign'

import type {
  Renderer,
  RendererCapabilities,
  BufferHandle,
  PipelineHandle,
  ComputePipelineHandle,
  BufferUsage,
  DrawInstancesParams,
  DrawLinesParams,
  DispatchComputeParams,
} from '../Renderer'
import { prepareLineStripForPhysicalPixels } from '../physicalLine'
import type { SurfaceBackend, SurfaceRegion } from '../SurfaceBackend'

type WebGLPipelineDescriptor = {
  type: 'candle' | 'line' | 'fill'
}

type WebGLDrawUniforms = {
  color?: string
  scrollLeft?: number
  lineWidth?: number
  alpha?: number
}

interface BufferRecord {
  usage: BufferUsage
  byteLength: number
  data: ArrayBuffer | null
}

interface PipelineRecord {
  type: 'candle' | 'line' | 'fill'
}

const handleCaps: RendererCapabilities = {
  compute: false,
  storageBuffer: false,
  maxInstances: 1_000_000,
  name: 'webgl2',
}

function toWebGLRegion(r: SurfaceRegion) {
  return r as { x: number; y: number; width: number; height: number; dpr: number }
}

export function createWebGLRenderer(surface: SurfaceBackend, gl: SharedWebGLSurface): Renderer {
  let disposed = false
  let candleSurface: CandleWebGLSurface | null = null
  let lineSurface: LineWebGLSurface | null = null

  const candle = new CandleWebGLSurface(gl)
  if (candle.isAvailable()) candleSurface = candle
  const line = new LineWebGLSurface(gl)
  if (line.isAvailable()) lineSurface = line

  const bufferMeta = new WeakMap<object, BufferRecord>()
  const pipelineMeta = new WeakMap<object, PipelineRecord>()
  let currentRegion: SurfaceRegion | null = null
  let rectScreenScratch = new Float32Array(0)

  /** 在 CPU 双精度空间完成世界坐标投影，避免低精度 GPU 对大坐标相减产生量化。 */
  function projectRectsToScreen(
    rects: Float32Array,
    rectCount: number,
    scrollLeft: number,
    dpr: number,
  ): Float32Array {
    const floatCount = rectCount * 4
    if (rectScreenScratch.length < floatCount) {
      rectScreenScratch = new Float32Array(floatCount)
    }
    for (let index = 0; index < rectCount; index++) {
      const offset = index * 4
      const worldLeft = rects[offset]!
      const worldRight = worldLeft + rects[offset + 2]!
      const screenLeft = worldXToScreenX(worldLeft, scrollLeft, dpr)
      const screenRight = worldXToScreenX(worldRight, scrollLeft, dpr)
      rectScreenScratch[offset] = screenLeft
      rectScreenScratch[offset + 1] = rects[offset + 1]!
      rectScreenScratch[offset + 2] = Math.max(1 / dpr, screenRight - screenLeft)
      rectScreenScratch[offset + 3] = rects[offset + 3]!
    }
    return rectScreenScratch.subarray(0, floatCount)
  }

  function disposeSurfaces(): void {
    if (candleSurface) {
      candleSurface.destroy()
      candleSurface = null
    }
    if (lineSurface) {
      lineSurface.destroy()
      lineSurface = null
    }
  }

  const renderer = {
    get surface(): SurfaceBackend {
      return surface
    },

    get caps(): RendererCapabilities {
      return handleCaps
    },

    createBuffer(usage: BufferUsage, sizeBytes: number): BufferHandle {
      if (disposed) {
        throw new Error('Renderer is disposed')
      }
      const handle: object = {}
      bufferMeta.set(handle, { usage, byteLength: sizeBytes, data: null })
      return handle as BufferHandle
    },

    writeBuffer(handle: BufferHandle, data: ArrayBufferView, offsetBytes?: number): void {
      if (disposed) return
      const meta = bufferMeta.get(handle as object)
      if (!meta) return
      const offset = offsetBytes ?? 0
      const neededSize = offset + data.byteLength
      if (!meta.data || meta.data.byteLength < neededSize) {
        const newBuf = new ArrayBuffer(Math.max(neededSize, meta.byteLength))
        if (meta.data) {
          new Uint8Array(newBuf).set(
            new Uint8Array(meta.data, 0, Math.min(meta.data.byteLength, neededSize)),
          )
        }
        meta.data = newBuf
      }
      const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      new Uint8Array(meta.data, offset).set(src)
    },

    destroyBuffer(handle: BufferHandle): void {
      if (disposed) return
      bufferMeta.delete(handle as object)
    },

    createPipeline(descriptor: unknown): PipelineHandle {
      if (disposed) {
        throw new Error('Renderer is disposed')
      }
      const desc = descriptor as WebGLPipelineDescriptor
      const handle: object = {}
      pipelineMeta.set(handle, { type: desc.type ?? 'candle' })
      return handle as PipelineHandle
    },

    destroyPipeline(handle: PipelineHandle): void {
      if (disposed) return
      pipelineMeta.delete(handle as object)
    },

    createComputePipeline(_descriptor: unknown): ComputePipelineHandle {
      throw new Error('compute not supported on WebGL backend (caps.compute === false)')
    },

    destroyComputePipeline(_handle: ComputePipelineHandle): void {
      // no-op: WebGL has no compute pipelines
    },

    beginFrame(region: SurfaceRegion): void {
      if (disposed) return
      currentRegion = { ...region }
      surface.bindRegion(region)
      if (candleSurface) {
        candleSurface.setRegion(toWebGLRegion(region))
        candleSurface.resize(region.width, region.height, region.dpr)
        candleSurface.clear()
      }
      if (lineSurface) {
        lineSurface.setRegion(toWebGLRegion(region))
        lineSurface.resize(region.width, region.height, region.dpr)
        lineSurface.clear()
      }
    },

    drawInstances(params: DrawInstancesParams): boolean {
      if (disposed) return false
      const pipelineMeta_rec = pipelineMeta.get(params.pipeline as object)
      if (!pipelineMeta_rec || pipelineMeta_rec.type !== 'candle') return false

      const rectCount = params.instanceCount
      if (rectCount <= 0) return true

      const instanceMeta = bufferMeta.get(params.instances as object)
      if (!instanceMeta || !instanceMeta.data) return false

      const floats = new Float32Array(instanceMeta.data, 0, rectCount * 4)
      const color = (params.uniforms?.color as string) ?? '#000000'
      const scrollLeft = (params.uniforms?.scrollLeft as number) ?? 0

      // candle 路径 fail-closed：无 surface 则 false，由业务层 2D 兜底
      if (!candleSurface) return false
      const dpr = currentRegion?.dpr ?? 1
      const screenRects = projectRectsToScreen(floats, rectCount, scrollLeft, dpr)
      return candleSurface.drawRectBuffer(screenRects, rectCount, color, 0)
    },

    drawLines(params: DrawLinesParams): boolean {
      if (disposed) return false
      const pipelineMeta_rec = pipelineMeta.get(params.pipeline as object)
      if (!pipelineMeta_rec) return false

      const scrollLeft = (params.uniforms?.scrollLeft as number) ?? 0
      // 折线/填充 fail-closed：无 surface 则 false，由业务层 2D 兜底
      if (!lineSurface) return false

      // 批量 strips：一次 drawLineStrips（单次 MSAA clear），多周期 MA 必须走此路径
      if (params.strips && params.strips.length > 0) {
        if (pipelineMeta_rec.type === 'fill') return false
        const dpr = currentRegion?.dpr ?? 1
        const lines = params.strips
          .filter((s) => s.points.length >= 2)
          .map((s) => {
            const physical = prepareLineStripForPhysicalPixels(s, dpr, scrollLeft)
            return {
              points: physical.points.map((p) => ({ x: p.x, y: p.y })),
              color: physical.color,
              width: physical.width ?? 1,
            }
          })
        if (lines.length === 0) return true
        return lineSurface.drawLineStrips(lines, scrollLeft)
      }

      if (!params.vertices || params.vertexCount == null || params.vertexCount < 2) return false
      const vertexMeta = bufferMeta.get(params.vertices as object)
      if (!vertexMeta || !vertexMeta.data) return false

      const color = (params.uniforms?.color as string) ?? '#000000'

      if (pipelineMeta_rec.type === 'fill') {
        const floats = new Float32Array(vertexMeta.data, 0, params.vertexCount * 2)
        const pointCount = Math.floor(params.vertexCount / 2)
        const upperPoints: Array<{ x: number; y: number }> = []
        const lowerPoints: Array<{ x: number; y: number }> = []
        for (let i = 0; i < pointCount; i++) {
          const offset = i * 4
          upperPoints.push({ x: floats[offset]!, y: floats[offset + 1]! })
          lowerPoints.push({ x: floats[offset + 2]!, y: floats[offset + 3]! })
        }
        return lineSurface.drawFilledBand({ upperPoints, lowerPoints }, color, scrollLeft)
      }

      const floats = new Float32Array(vertexMeta.data, 0, params.vertexCount * 2)
      const points: Array<{ x: number; y: number }> = []
      for (let i = 0; i < params.vertexCount; i++) {
        points.push({ x: floats[i * 2]!, y: floats[i * 2 + 1]! })
      }
      const lineWidth = (params.uniforms?.lineWidth as number) ?? 1
      const dpr = currentRegion?.dpr ?? 1
      const physicalStrip = prepareLineStripForPhysicalPixels(
        { points, color, width: lineWidth },
        dpr,
        scrollLeft,
      )
      return lineSurface.drawLineStrips(
        [
          {
            points: physicalStrip.points.map((p) => ({ x: p.x, y: p.y })),
            color: physicalStrip.color,
            width: physicalStrip.width ?? 1,
          },
        ],
        scrollLeft,
      )
    },

    dispatchCompute(_params: DispatchComputeParams): void {
      if (!disposed) {
        throw new Error('dispatchCompute requires a backend with caps.compute === true')
      }
    },

    endFrame(): void {
      // no-op per-frame cleanup; surfaces hold region reference until next frame
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      disposeSurfaces()
      surface.dispose()
    },
  }

  return renderer as Renderer
}
