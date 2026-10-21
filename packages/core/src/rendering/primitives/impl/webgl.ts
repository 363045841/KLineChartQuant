/** WebGL2 有序合批设备：实例化基础形状、连续网格上传与受约束的 stencil 合批。 */
import type { PrimitiveBackend, PrimitiveSurface } from '../types.js'
import type { DataTransform } from '@/foundation/plugin/types.js'
import { UploadTracker } from './buffers.js'
import { createColorResolver } from './colors.js'
import { createGpuPrimitiveBackend, type PrimitiveDevice } from './gpu.js'
import { createPrimitivePreparer, type GeometryPrimitive } from './prepare.js'
import {
  INSTANCE_FLOATS,
  MESH_FLOATS,
  MESH_FRAGMENT_GLSL,
  MESH_VERTEX_GLSL,
  SEGMENT_FLOATS,
  SEGMENT_FRAGMENT_GLSL,
  SEGMENT_VERTEX_GLSL,
  SHAPE_FRAGMENT_GLSL,
  SHAPE_VERTEX_GLSL,
} from './shaders.js'

/** 编译具名布局的绘制管线；初始化失败时释放已创建的 shader。 */
function program(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const result = gl.createProgram()
  if (!result) throw new Error('Primitive WebGL allocation failed')
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Primitive shader allocation failed')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        throw new Error('Primitive shader compilation failed')
      }
      gl.attachShader(result, shader)
      gl.deleteShader(shader)
    }
    gl.linkProgram(result)
    if (!gl.getProgramParameter(result, gl.LINK_STATUS))
      throw new Error('Primitive WebGL pipeline failed')
    return result
  } catch (error) {
    gl.deleteProgram(result)
    throw error
  }
}

/**
 * 绑定一个画布的设备。
 *
 * @param canvas 离屏目标或可见表面
 * @param preserveDrawingBuffer 可见表面需要保留像素供截图读取，离屏目标不需要
 */
function createDevice(
  canvas: HTMLCanvasElement,
  preserveDrawingBuffer: boolean,
  direct = false,
): PrimitiveDevice {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    stencil: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer,
  })
  if (!gl) throw new Error('Primitive WebGL unavailable')
  const meshProgram = program(gl, MESH_VERTEX_GLSL, MESH_FRAGMENT_GLSL)
  const shapeProgram = program(gl, SHAPE_VERTEX_GLSL, SHAPE_FRAGMENT_GLSL)
  const segmentProgram = program(gl, SEGMENT_VERTEX_GLSL, SEGMENT_FRAGMENT_GLSL)
  const meshBuffer = gl.createBuffer(),
    instanceBuffer = gl.createBuffer(),
    segmentBuffer = gl.createBuffer()
  const meshVao = gl.createVertexArray(),
    shapeVao = gl.createVertexArray(),
    segmentVao = gl.createVertexArray()
  if (!meshBuffer || !instanceBuffer || !segmentBuffer || !meshVao || !shapeVao || !segmentVao)
    throw new Error('Primitive WebGL allocation failed')
  const meshTracker = new UploadTracker(),
    instanceTracker = new UploadTracker(),
    segmentTracker = new UploadTracker()
  let meshCapacity = 0,
    instanceCapacity = 0,
    segmentCapacity = 0
  const viewport = gl.getUniformLocation(shapeProgram, 'viewport'),
    meshViewport = gl.getUniformLocation(meshProgram, 'viewport'),
    meshData = gl.getUniformLocation(meshProgram, 'data'),
    segmentViewport = gl.getUniformLocation(segmentProgram, 'viewport'),
    segmentData = gl.getUniformLocation(segmentProgram, 'data')
  gl.bindVertexArray(meshVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer)
  for (const [name, count, offset] of [
    ['position', 2, 0],
    ['color', 4, 8],
    ['mode', 1, 24],
  ] as const) {
    const location = gl.getAttribLocation(meshProgram, name)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, MESH_FLOATS * 4, offset)
  }
  const shapeLocations = ['bounds', 'parameters', 'fillColor', 'strokeColor'].map((name) =>
    gl.getAttribLocation(shapeProgram, name),
  )
  gl.bindVertexArray(shapeVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
  for (const location of shapeLocations) {
    gl.enableVertexAttribArray(location)
    gl.vertexAttribDivisor(location, 1)
  }
  // 折线段实例布局与 vertex shader 的显式 location 一一对应。
  gl.bindVertexArray(segmentVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, segmentBuffer)
  for (const [location, count, offset] of [
    [0, 2, 0],
    [1, 2, 8],
    [2, 1, 16],
    [3, 4, 20],
    [4, 1, 36],
  ] as const) {
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, SEGMENT_FLOATS * 4, offset)
    gl.vertexAttribDivisor(location, 1)
  }
  return {
    render(batch, width, height, dpr, clear = true, transform) {
      if (gl.isContextLost()) throw new Error('Primitive WebGL context lost')
      // 目标只增不减：多 pane 交替绘制不会每帧重分配 drawing buffer。
      if (canvas.width < width) canvas.width = width
      if (canvas.height < height) canvas.height = height
      const metrics = { drawCalls: 0, uploads: 0, uploadedBytes: 0, submissions: 1 }
      /** 每类数据最多一次 bufferSubData；完全未变时复用 GPU 内容。 */
      const upload = (
        buffer: WebGLBuffer,
        values: Float32Array,
        tracker: UploadTracker,
        capacity: number,
      ): number => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        const grow = values.byteLength > capacity
        if (grow) {
          capacity = Math.max(values.byteLength, capacity * 2, 1024)
          gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW)
        }
        const range = tracker.update(values, grow)
        if (range) {
          gl.bufferSubData(gl.ARRAY_BUFFER, range.offset, range.values)
          metrics.uploads++
          metrics.uploadedBytes += range.values.byteLength
        }
        return capacity
      }
      meshCapacity = batch.changed.vertices
        ? upload(meshBuffer, batch.vertices, meshTracker, meshCapacity)
        : meshCapacity
      instanceCapacity = batch.changed.instances
        ? upload(instanceBuffer, batch.instances, instanceTracker, instanceCapacity)
        : instanceCapacity
      segmentCapacity = batch.changed.segments
        ? upload(segmentBuffer, batch.segments, segmentTracker, segmentCapacity)
        : segmentCapacity
      gl.viewport(0, 0, width, height)
      gl.colorMask(true, true, true, true)
      gl.stencilMask(0xff)
      gl.clearColor(0, 0, 0, 0)
      gl.clearStencil(0)
      // 只清理本目标区域，共享设备上其他 pane 的残留不影响本次读回。
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(0, 0, width, height)
      // 可见表面在增量帧保留颜色，只重置 stencil。
      gl.clear(clear ? gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT : gl.STENCIL_BUFFER_BIT)
      gl.disable(gl.SCISSOR_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      let active: 'mesh' | 'shape' | 'segments' | undefined
      let segmentTransform: DataTransform | undefined
      for (const draw of batch.draws) {
        if (draw.kind === 'segments') {
          const dataSpace = transform !== undefined
          if (active !== 'segments') {
            gl.useProgram(segmentProgram)
            gl.bindVertexArray(segmentVao)
            gl.uniform4f(segmentViewport, width / dpr, height / dpr, dpr, 0)
            active = 'segments'
            segmentTransform = undefined
          }
          // 数据空间折线的轴/滚动变换只改 uniform，滚动与轴缩放都不重写顶点缓冲。
          if (segmentTransform !== transform) {
            gl.uniform3f(
              segmentData,
              dataSpace ? transform!.offsetX : 0,
              dataSpace ? transform!.yScale : 1,
              dataSpace ? transform!.yOffset : 0,
            )
            segmentTransform = transform
          }
          gl.disable(gl.STENCIL_TEST)
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, draw.count)
          metrics.drawCalls++
        } else if (draw.kind === 'instances') {
          if (active !== 'shape') {
            gl.useProgram(shapeProgram)
            gl.bindVertexArray(shapeVao)
            gl.uniform4f(viewport, width / dpr, height / dpr, dpr, 0)
            active = 'shape'
          }
          gl.disable(gl.STENCIL_TEST)
          gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
          for (let i = 0; i < shapeLocations.length; i++)
            gl.vertexAttribPointer(
              shapeLocations[i]!,
              4,
              gl.FLOAT,
              false,
              INSTANCE_FLOATS * 4,
              draw.first * INSTANCE_FLOATS * 4 + i * 16,
            )
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, draw.count)
          metrics.drawCalls++
        } else {
          if (active !== 'mesh') {
            gl.useProgram(meshProgram)
            gl.bindVertexArray(meshVao)
            gl.uniform4f(meshViewport, width / dpr, height / dpr, dpr, 0)
            // 屏幕顶点 mode=0 不受影响；数据空间带子在这里按帧还原。
            gl.uniform3f(
              meshData,
              transform?.offsetX ?? 0,
              transform?.yScale ?? 1,
              transform?.yOffset ?? 0,
            )
            active = 'mesh'
          }
          if (draw.kind === 'direct') {
            gl.disable(gl.STENCIL_TEST)
            gl.drawArrays(gl.TRIANGLES, draw.first, draw.count)
            metrics.drawCalls++
          } else {
            gl.enable(gl.STENCIL_TEST)
            gl.colorMask(false, false, false, false)
            gl.stencilFunc(gl.ALWAYS, 0, 0xff)
            gl.stencilOpSeparate(
              gl.FRONT,
              gl.KEEP,
              gl.KEEP,
              draw.evenodd ? gl.INVERT : gl.INCR_WRAP,
            )
            gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, draw.evenodd ? gl.INVERT : gl.DECR_WRAP)
            gl.drawArrays(gl.TRIANGLES, draw.first, draw.count)
            gl.colorMask(true, true, true, true)
            gl.stencilFunc(gl.NOTEQUAL, 0, draw.evenodd ? 1 : 0xff)
            gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO)
            gl.drawArrays(gl.TRIANGLES, draw.coverFirst, draw.coverCount)
            metrics.drawCalls += 2
          }
        }
      }
      gl.disable(gl.STENCIL_TEST)
      // 不在热路径调用 getError/finish；context 丢失由入口检查及宿主生命周期处理。
      return { canvas, metrics }
    },
    async waitForIdle() {
      gl.finish()
    },
    dispose() {
      gl.deleteBuffer(meshBuffer)
      gl.deleteBuffer(instanceBuffer)
      gl.deleteBuffer(segmentBuffer)
      gl.deleteVertexArray(meshVao)
      gl.deleteVertexArray(shapeVao)
      gl.deleteVertexArray(segmentVao)
      gl.deleteProgram(meshProgram)
      gl.deleteProgram(shapeProgram)
      gl.deleteProgram(segmentProgram)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      // 可见画布的尺寸归 Pane 所有；只有离屏目标在释放时归零后备存储。
      if (!direct) canvas.width = canvas.height = 1
    },
  }
}

/** 直接写入可见画布的 WebGL 表面；保留绘图缓冲以支持后续截图。 */
function createSurface(canvas: HTMLCanvasElement): PrimitiveSurface | null {
  let device: PrimitiveDevice | null = null
  let preparer: ReturnType<typeof createPrimitivePreparer> | null = null
  return {
    canvas,
    paint(primitives, dpr, clear, transform) {
      try {
        const document = canvas.ownerDocument
        if (!document) return false
        // 文字由上层 2D 画布负责；这里只接受几何原语。
        if (primitives.some((primitive) => primitive.kind === 'text')) return false
        const width = canvas.width,
          height = canvas.height
        if (width <= 0 || height <= 0) return false
        preparer ??= createPrimitivePreparer(createColorResolver(document), { segments: true })
        const batch = preparer.prepare(primitives as GeometryPrimitive[], width, height, dpr, transform)
        device ??= createDevice(canvas, true, true)
        device.render(batch, width, height, dpr, clear, transform)
        return true
      } catch {
        device?.dispose()
        device = null
        // 新设备没有上一批 GPU 内容，必须让准备器重新写入而不是复用。
        preparer = null
        return false
      }
    },
    dispose() {
      device?.dispose()
      device = null
    },
  }
}

/** 延迟创建离屏资源；无图形或全在屏幕外的批次不创建 GPU surface。 */
export function createWebGLPrimitiveBackend(): PrimitiveBackend {
  const composite = createGpuPrimitiveBackend(
    (document) => createDevice(document.createElement('canvas'), false),
    undefined,
    { segments: true },
  )
  return { ...composite, createSurface }
}
