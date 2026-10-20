/** WebGL2 有序合批设备：实例化基础形状、连续网格上传与受约束的 stencil 合批。 */
import { UploadTracker } from './buffers.js'
import { createGpuPrimitiveBackend, type PrimitiveDevice } from './gpu.js'
import {
  INSTANCE_FLOATS,
  MESH_FLOATS,
  MESH_FRAGMENT_GLSL,
  MESH_VERTEX_GLSL,
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

/** 独立 context 只负责整批目标，不改变行情 surface 和帧生命周期。 */
function createDevice(document: Document): PrimitiveDevice {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    stencil: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  })
  if (!gl) throw new Error('Primitive WebGL unavailable')
  const meshProgram = program(gl, MESH_VERTEX_GLSL, MESH_FRAGMENT_GLSL)
  const shapeProgram = program(gl, SHAPE_VERTEX_GLSL, SHAPE_FRAGMENT_GLSL)
  const meshBuffer = gl.createBuffer(),
    instanceBuffer = gl.createBuffer()
  const meshVao = gl.createVertexArray(),
    shapeVao = gl.createVertexArray()
  if (!meshBuffer || !instanceBuffer || !meshVao || !shapeVao)
    throw new Error('Primitive WebGL allocation failed')
  const meshTracker = new UploadTracker(),
    instanceTracker = new UploadTracker()
  let meshCapacity = 0,
    instanceCapacity = 0
  const viewport = gl.getUniformLocation(shapeProgram, 'viewport')
  gl.bindVertexArray(meshVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer)
  for (const [name, count, offset] of [
    ['position', 2, 0],
    ['color', 4, 8],
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
  return {
    render(batch, width, height, dpr) {
      if (gl.isContextLost()) throw new Error('Primitive WebGL context lost')
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
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
      meshCapacity = upload(meshBuffer, batch.vertices, meshTracker, meshCapacity)
      instanceCapacity = upload(instanceBuffer, batch.instances, instanceTracker, instanceCapacity)
      gl.viewport(0, 0, width, height)
      gl.colorMask(true, true, true, true)
      gl.stencilMask(0xff)
      gl.clearColor(0, 0, 0, 0)
      gl.clearStencil(0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      let active: 'mesh' | 'shape' | undefined
      for (const draw of batch.draws) {
        if (draw.kind === 'instances') {
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
      gl.deleteVertexArray(meshVao)
      gl.deleteVertexArray(shapeVao)
      gl.deleteProgram(meshProgram)
      gl.deleteProgram(shapeProgram)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.width = canvas.height = 1
    },
  }
}

/** 延迟创建资源；无图形或全在屏幕外的批次不创建 GPU context。 */
export function createWebGLPrimitiveBackend(document?: Document) {
  return createGpuPrimitiveBackend(createDevice, document ? createDevice(document) : undefined)
}
