import type { SurfaceBackend, SurfaceRegion } from './SurfaceBackend'
import type {
  Renderer,
  RendererCapabilities,
  BufferHandle,
  PipelineHandle,
  BufferUsage,
  DrawInstancesParams,
  DrawLinesParams,
  DispatchComputeParams,
} from './Renderer'
import { SharedWebGLSurface } from '../engine/renderers/webgl/sharedWebGLSurface'
import { CandleWebGLSurface, LineWebGLSurface } from '../engine/renderers/webgl/candleSurface'

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

export function createWebGLRenderer(
  surface: SurfaceBackend,
  gl: SharedWebGLSurface,
): Renderer {
  let disposed = false
  let candleSurface: CandleWebGLSurface | null = null
  let lineSurface: LineWebGLSurface | null = null
  let fallbackCtx: CanvasRenderingContext2D | null = null
  let fallbackDpr = 1

  const candle = new CandleWebGLSurface(gl)
  if (candle.isAvailable()) candleSurface = candle
  const line = new LineWebGLSurface(gl)
  if (line.isAvailable()) lineSurface = line

  const bufferMeta = new WeakMap<object, BufferRecord>()
  const pipelineMeta = new WeakMap<object, PipelineRecord>()

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

    setFallbackContext(ctx: CanvasRenderingContext2D | null, dpr: number): void {
      fallbackCtx = ctx
      fallbackDpr = dpr
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
      throw new Error(
        'compute not supported on WebGL backend (caps.compute === false)',
      )
    },

    destroyComputePipeline(_handle: ComputePipelineHandle): void {
      // no-op: WebGL has no compute pipelines
    },

    beginFrame(region: SurfaceRegion): void {
      if (disposed) return
      surface.bindRegion(region)
      if (candleSurface) {
        candleSurface.setRegion(toWebGLRegion(region))
        candleSurface.resize(region.width, region.height, region.dpr)
      }
      if (lineSurface) {
        lineSurface.setRegion(toWebGLRegion(region))
        lineSurface.resize(region.width, region.height, region.dpr)
      }
    },

    drawInstances(params: DrawInstancesParams): void {
      if (disposed) return
      const pipelineMeta_rec = pipelineMeta.get(params.pipeline as object)
      if (!pipelineMeta_rec || pipelineMeta_rec.type !== 'candle') return

      const instanceMeta = bufferMeta.get(params.instances as object)
      if (!instanceMeta || !instanceMeta.data) return

      const rectCount = params.instanceCount
      if (rectCount <= 0) return

      const floats = new Float32Array(instanceMeta.data, 0, rectCount * 4)
      const color = (params.uniforms?.color as string) ?? '#000000'
      const scrollLeft = (params.uniforms?.scrollLeft as number) ?? 0

      if (candleSurface) {
        candleSurface.drawRectBuffer(floats, rectCount, color, scrollLeft)
        return
      }

      if (fallbackCtx) {
        const ctx = fallbackCtx
        ctx.fillStyle = color
        for (let i = 0; i < rectCount; i++) {
          const x = floats[i * 4] - scrollLeft
          const y = floats[i * 4 + 1]
          const w = Math.max(0, floats[i * 4 + 2])
          const h = floats[i * 4 + 3]
          ctx.fillRect(x, y, w, h)
        }
      }
    },

    drawLines(params: DrawLinesParams): void {
      if (disposed) return
      const pipelineMeta_rec = pipelineMeta.get(params.pipeline as object)
      if (!pipelineMeta_rec) return

      const vertexMeta = bufferMeta.get(params.vertices as object)
      if (!vertexMeta || !vertexMeta.data) return
      if (params.vertexCount < 2) return

      const color = (params.uniforms?.color as string) ?? '#000000'
      const scrollLeft = (params.uniforms?.scrollLeft as number) ?? 0

      if (pipelineMeta_rec.type === 'fill') {
        const floats = new Float32Array(vertexMeta.data, 0, params.vertexCount * 2)
        const pointCount = Math.floor(params.vertexCount / 2)
        const upperPoints: Array<{ x: number; y: number }> = []
        const lowerPoints: Array<{ x: number; y: number }> = []
        for (let i = 0; i < pointCount; i++) {
          const offset = i * 4
          upperPoints.push({ x: floats[offset], y: floats[offset + 1] })
          lowerPoints.push({ x: floats[offset + 2], y: floats[offset + 3] })
        }

        if (lineSurface) {
          lineSurface.drawFilledBand({ upperPoints, lowerPoints }, color, scrollLeft)
          return
        }

        if (fallbackCtx) {
          const ctx = fallbackCtx
          ctx.beginPath()
          ctx.moveTo(upperPoints[0].x - scrollLeft, upperPoints[0].y)
          for (let i = 1; i < upperPoints.length; i++) {
            ctx.lineTo(upperPoints[i].x - scrollLeft, upperPoints[i].y)
          }
          for (let i = lowerPoints.length - 1; i >= 0; i--) {
            ctx.lineTo(lowerPoints[i].x - scrollLeft, lowerPoints[i].y)
          }
          ctx.closePath()
          ctx.fillStyle = color
          ctx.fill()
        }
        return
      }

      const floats = new Float32Array(vertexMeta.data, 0, params.vertexCount * 2)

      if (lineSurface) {
        const points: Array<{ x: number; y: number }> = []
        for (let i = 0; i < params.vertexCount; i++) {
          points.push({ x: floats[i * 2], y: floats[i * 2 + 1] })
        }
        const lineWidth = (params.uniforms?.lineWidth as number) ?? 1
        const lines = [{ points, color, width: lineWidth }]
        lineSurface.drawLineStrips(lines, scrollLeft)
        return
      }

      if (fallbackCtx) {
        const ctx = fallbackCtx
        const lineWidth = (params.uniforms?.lineWidth as number) ?? 1
        const dashPattern = params.uniforms?.dashPattern as number[] | undefined
        ctx.beginPath()
        ctx.moveTo(floats[0] - scrollLeft, floats[1])
        for (let i = 1; i < params.vertexCount; i++) {
          ctx.lineTo(floats[i * 2] - scrollLeft, floats[i * 2 + 1])
        }
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        if (dashPattern && dashPattern.length > 0) {
          ctx.setLineDash(dashPattern)
        }
        ctx.stroke()
        if (dashPattern && dashPattern.length > 0) {
          ctx.setLineDash([])
        }
      }
    },

    dispatchCompute(_params: DispatchComputeParams): void {
      if (!disposed) {
        throw new Error(
          'dispatchCompute requires a backend with caps.compute === true',
        )
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
