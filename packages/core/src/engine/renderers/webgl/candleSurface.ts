// WebGL 蜡烛与解析 AA 折线的绘制表面。
import { buildAnalyticLineGeometry } from '@/rendering/render/analyticLineGeometry.js'
import { SharedWebGLSurface, type WebGLRegion } from './sharedWebGLSurface.js'

type LineStrip = {
  points: ReadonlyArray<{ x: number; y: number }>
  width: number
}

type ColoredLineStrip = LineStrip & {
  color: string
}

type FloatColor = readonly [number, number, number, number]

type RectWebGLHandles = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  unitBuffer: WebGLBuffer
  rectBuffer: WebGLBuffer
  resolutionLocation: WebGLUniformLocation
  dprLocation: WebGLUniformLocation
  scrollXLocation: WebGLUniformLocation
  colorLocation: WebGLUniformLocation
}

type LineWebGLHandles = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  resolutionLocation: WebGLUniformLocation
  dprLocation: WebGLUniformLocation
  scrollXLocation: WebGLUniformLocation
  colorLocation: WebGLUniformLocation
}

type CachedLineGeometry = {
  vertices: Float32Array
  vertexCount: number
  points: Float64Array
}

const RECT_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 a_unit;
in vec4 a_rect;

uniform vec2 u_resolution;
uniform float u_dpr;
uniform float u_scrollX;

void main() {
    float left = round((a_rect.x - u_scrollX) * u_dpr);
    float top = round(a_rect.y * u_dpr);
    float right = round((a_rect.x + a_rect.z - u_scrollX) * u_dpr);
    float bottom = round((a_rect.y + a_rect.w) * u_dpr);
    vec2 position = vec2(
        left + a_unit.x * max(1.0, right - left),
        top + a_unit.y * max(1.0, bottom - top)
    );

    vec2 zeroToOne = position / u_resolution;
    vec2 clip = vec2(
        zeroToOne.x * 2.0 - 1.0,
        1.0 - zeroToOne.y * 2.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
}`

const LINE_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_edge;
out vec2 v_edge;

uniform vec2 u_resolution;
uniform float u_dpr;
uniform float u_scrollX;

void main() {
    vec2 position = vec2(
        (a_position.x - u_scrollX) * u_dpr,
        a_position.y * u_dpr
    );
    v_edge = a_edge;
    vec2 zeroToOne = position / u_resolution;
    vec2 clip = vec2(
        zeroToOne.x * 2.0 - 1.0,
        1.0 - zeroToOne.y * 2.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
}`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

uniform vec4 u_color;
out vec4 outColor;

void main() {
    outColor = u_color;
}`

const UNIT_QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1])

const LINE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
in vec2 v_edge;
uniform vec4 u_color;
out vec4 outColor;
void main() {
    float aa = max(fwidth(v_edge.x), 1e-4);
    float cov = clamp((v_edge.y - abs(v_edge.x)) / aa + 0.5, 0.0, 1.0);
    outColor = vec4(u_color.rgb, u_color.a * cov);
}`

export class CandleWebGLSurface {
  private shared: SharedWebGLSurface
  private handles: RectWebGLHandles | null = null
  private logicalWidth = 0
  private logicalHeight = 0
  private available = false
  private rectCapacity = 0
  private region: WebGLRegion | null = null

  constructor(shared: SharedWebGLSurface) {
    this.shared = shared
    this.handles = this.initRectHandles()
    this.available = this.handles !== null
  }

  isAvailable(): boolean {
    return this.available
  }

  setRegion(region: WebGLRegion): void {
    this.region = region
  }

  resize(width: number, height: number, _dpr: number): void {
    this.logicalWidth = width
    this.logicalHeight = height
  }

  /** 直接传入已打包的 Float32Array：每 4 个元素为一组 (x, y, width, height) */
  drawRectBuffer(
    rectData: Float32Array,
    rectCount: number,
    color: string,
    scrollLeft: number,
  ): boolean {
    const handles = this.handles
    if (!handles || rectCount === 0 || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
      return false
    }

    const colorValue = parseColor(color)
    if (!colorValue) return false

    const floatCount = rectCount * 4
    const gl = this.shared.getGL()
    if (!gl || !this.region || !this.shared.bindRegion(this.region)) return false
    const physical = this.shared.getPhysicalRegion(this.region)
    if (!physical) return false

    gl.useProgram(handles.program)
    gl.bindVertexArray(handles.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, handles.rectBuffer)

    if (this.rectCapacity < floatCount) {
      this.rectCapacity = nextBufferFloatCapacity(floatCount)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.rectCapacity * Float32Array.BYTES_PER_ELEMENT,
        gl.DYNAMIC_DRAW,
      )
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, rectData)

    if (colorValue[3] === 1) {
      gl.disable(gl.BLEND)
    } else {
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    }
    gl.uniform2f(handles.resolutionLocation, physical.widthPx, physical.heightPx)
    gl.uniform1f(handles.dprLocation, this.region.dpr)
    gl.uniform1f(handles.scrollXLocation, scrollLeft)
    gl.uniform4f(handles.colorLocation, colorValue[0], colorValue[1], colorValue[2], colorValue[3])
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, rectCount)
    gl.bindVertexArray(null)
    return true
  }

  destroy(): void {
    const handles = this.handles
    if (!handles) return

    const gl = this.shared.getGL()
    if (gl) {
      const { program, vao, unitBuffer, rectBuffer } = handles
      gl.deleteBuffer(unitBuffer)
      gl.deleteBuffer(rectBuffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
    this.handles = null
    this.available = false
  }

  private initRectHandles(): RectWebGLHandles | null {
    const gl = this.shared.getGL()
    if (!gl) return null

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, RECT_VERTEX_SHADER_SOURCE)
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      return null
    }

    const program = createProgram(gl, vertexShader, fragmentShader)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    if (!program) return null

    const vao = gl.createVertexArray()
    const unitBuffer = gl.createBuffer()
    const rectBuffer = gl.createBuffer()
    if (!vao || !unitBuffer || !rectBuffer) {
      if (vao) gl.deleteVertexArray(vao)
      if (unitBuffer) gl.deleteBuffer(unitBuffer)
      if (rectBuffer) gl.deleteBuffer(rectBuffer)
      gl.deleteProgram(program)
      return null
    }

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const dprLocation = gl.getUniformLocation(program, 'u_dpr')
    const scrollXLocation = gl.getUniformLocation(program, 'u_scrollX')
    const colorLocation = gl.getUniformLocation(program, 'u_color')
    if (!resolutionLocation || !dprLocation || !scrollXLocation || !colorLocation) {
      gl.deleteBuffer(unitBuffer)
      gl.deleteBuffer(rectBuffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      return null
    }

    const unitLocation = gl.getAttribLocation(program, 'a_unit')
    const rectLocation = gl.getAttribLocation(program, 'a_rect')
    if (unitLocation < 0 || rectLocation < 0) {
      gl.deleteBuffer(unitBuffer)
      gl.deleteBuffer(rectBuffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      return null
    }

    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, unitBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, UNIT_QUAD, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(unitLocation)
    gl.vertexAttribPointer(unitLocation, 2, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(unitLocation, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, rectBuffer)
    gl.enableVertexAttribArray(rectLocation)
    gl.vertexAttribPointer(rectLocation, 4, gl.FLOAT, false, 16, 0)
    gl.vertexAttribDivisor(rectLocation, 1)
    gl.bindVertexArray(null)

    return {
      program,
      vao,
      unitBuffer,
      rectBuffer,
      resolutionLocation,
      dprLocation,
      scrollXLocation,
      colorLocation,
    }
  }
}

export class LineWebGLSurface {
  private shared: SharedWebGLSurface
  private handles: LineWebGLHandles | null = null
  private logicalWidth = 0
  private logicalHeight = 0
  private dpr = 1
  private available = false
  private vertexCapacity = 0
  private lineScratch = new Float32Array(0)
  private region: WebGLRegion | null = null

  // 以 points 数组引用与线宽缓存几何；DPR 改变时重建物理 AA 边距。
  private geoCache = new WeakMap<
    ReadonlyArray<{ x: number; y: number }>,
    Map<number, CachedLineGeometry>
  >()

  constructor(shared: SharedWebGLSurface) {
    this.shared = shared
    this.handles = this.initLineHandles()
    this.available = this.handles !== null
  }

  isAvailable(): boolean {
    return this.available
  }

  setRegion(region: WebGLRegion): void {
    this.region = region
  }

  resize(width: number, height: number, dpr: number): void {
    this.logicalWidth = width
    this.logicalHeight = height
    if (this.dpr !== dpr) this.geoCache = new WeakMap()
    this.dpr = dpr
  }

  drawLineStrips(lines: ColoredLineStrip[], scrollLeft: number): boolean {
    const handles = this.handles
    if (!handles || lines.length === 0 || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
      return false
    }

    type DrawCmd = {
      colorValue: FloatColor
      firstVertex: number
      pointCount: number
      vertices: Float32Array
    }

    const gl = this.shared.getGL()
    const region = this.region
    if (!gl || !region) return false

    const drawCmds: DrawCmd[] = []
    let totalFloats = 0

    for (const line of lines) {
      if (line.points.length < 2) return false

      const colorValue = parseColor(line.color)
      if (!colorValue) return false

      const geometry = this.getLineGeometry(line)
      if (!geometry) return false
      drawCmds.push({
        colorValue,
        firstVertex: totalFloats / 4,
        pointCount: geometry.vertexCount,
        vertices: geometry.vertices,
      })
      totalFloats += geometry.vertices.length
    }

    if (this.lineScratch.length < totalFloats) {
      this.lineScratch = new Float32Array(nextBufferFloatCapacity(totalFloats))
    }
    let floatOffset = 0
    for (const cmd of drawCmds) {
      this.lineScratch.set(cmd.vertices, floatOffset)
      floatOffset += cmd.vertices.length
    }

    if (!this.shared.bindRegion(region)) {
      return false
    }
    const physical = this.shared.getPhysicalRegion(region)
    if (!physical) return false

    gl.useProgram(handles.program)
    // 不透明蜡烛会关闭 BLEND；线条 coverage 必须在每批绘制时恢复混合。
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindVertexArray(handles.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, handles.vertexBuffer)

    if (this.vertexCapacity < totalFloats) {
      this.vertexCapacity = nextBufferFloatCapacity(totalFloats)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        this.vertexCapacity * Float32Array.BYTES_PER_ELEMENT,
        gl.DYNAMIC_DRAW,
      )
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineScratch.subarray(0, totalFloats))

    gl.uniform2f(handles.resolutionLocation, physical.widthPx, physical.heightPx)
    gl.uniform1f(handles.dprLocation, region.dpr)
    gl.uniform1f(handles.scrollXLocation, scrollLeft)

    for (const cmd of drawCmds) {
      gl.uniform4f(
        handles.colorLocation,
        cmd.colorValue[0],
        cmd.colorValue[1],
        cmd.colorValue[2],
        cmd.colorValue[3],
      )
      gl.drawArrays(gl.TRIANGLES, cmd.firstVertex, cmd.pointCount)
    }

    gl.bindVertexArray(null)

    return true
  }

  private getLineGeometry(line: LineStrip): { vertices: Float32Array; vertexCount: number } | null {
    const width = line.width
    let widthMap = this.geoCache.get(line.points)
    if (widthMap) {
      const cached = widthMap.get(width)
      if (
        cached &&
        cached.points.length === line.points.length * 2 &&
        line.points.every(
          (point, index) =>
            cached.points[index * 2] === point.x && cached.points[index * 2 + 1] === point.y,
        )
      ) {
        return cached
      }
    } else {
      widthMap = new Map()
      this.geoCache.set(line.points, widthMap)
    }

    const vertices = buildAnalyticLineGeometry(line.points, width, this.dpr)
    if (!vertices) return null
    const points = new Float64Array(line.points.length * 2)
    for (let index = 0; index < line.points.length; index++) {
      points[index * 2] = line.points[index]!.x
      points[index * 2 + 1] = line.points[index]!.y
    }
    const geometry = { vertices, vertexCount: vertices.length / 4, points }
    widthMap.set(width, geometry)
    return geometry
  }

  destroy(): void {
    const handles = this.handles
    const gl = this.shared.getGL()
    if (!handles) {
      this.vertexCapacity = 0
      return
    }

    if (gl) {
      gl.deleteBuffer(handles.vertexBuffer)
      gl.deleteVertexArray(handles.vao)
      gl.deleteProgram(handles.program)
    }
    this.handles = null
    this.available = false
    this.vertexCapacity = 0
  }

  private initLineHandles(): LineWebGLHandles | null {
    const gl = this.shared.getGL()
    if (!gl) return null

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, LINE_VERTEX_SHADER_SOURCE)
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, LINE_FRAGMENT_SHADER_SOURCE)
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      return null
    }

    const program = createProgram(gl, vertexShader, fragmentShader)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    if (!program) return null

    const vao = gl.createVertexArray()
    const vertexBuffer = gl.createBuffer()
    if (!vao || !vertexBuffer) {
      if (vao) gl.deleteVertexArray(vao)
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer)
      gl.deleteProgram(program)
      return null
    }

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const dprLocation = gl.getUniformLocation(program, 'u_dpr')
    const scrollXLocation = gl.getUniformLocation(program, 'u_scrollX')
    const colorLocation = gl.getUniformLocation(program, 'u_color')
    if (!resolutionLocation || !dprLocation || !scrollXLocation || !colorLocation) {
      gl.deleteBuffer(vertexBuffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      return null
    }

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    const edgeLocation = gl.getAttribLocation(program, 'a_edge')
    if (positionLocation < 0 || edgeLocation < 0) {
      gl.deleteBuffer(vertexBuffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      return null
    }

    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(edgeLocation)
    gl.vertexAttribPointer(edgeLocation, 2, gl.FLOAT, false, 16, 8)
    gl.bindVertexArray(null)

    return {
      program,
      vao,
      vertexBuffer,
      resolutionLocation,
      dprLocation,
      scrollXLocation,
      colorLocation,
    }
  }
}
function nextBufferFloatCapacity(required: number): number {
  let capacity = 1
  while (capacity < required) {
    capacity <<= 1
  }
  return capacity
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader
  }

  gl.deleteShader(shader)
  return null
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program
  }

  gl.deleteProgram(program)
  return null
}

const colorCache = new Map<string, FloatColor>()

function parseColor(color: string): FloatColor | null {
  const cached = colorCache.get(color)
  if (cached) return cached

  const normalized = color.trim().toLowerCase()
  let result: FloatColor | null = null

  if (normalized.startsWith('rgba(')) {
    const values = normalized
      .slice(5, -1)
      .split(',')
      .map((part) => Number(part.trim()))
    if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
      result = [values[0]! / 255, values[1]! / 255, values[2]! / 255, values[3]!]
    }
  } else if (normalized.startsWith('rgb(')) {
    const values = normalized
      .slice(4, -1)
      .split(',')
      .map((part) => Number(part.trim()))
    if (values.length === 3 && values.every((value) => Number.isFinite(value))) {
      result = [values[0]! / 255, values[1]! / 255, values[2]! / 255, 1]
    }
  } else if (normalized.startsWith('#')) {
    const hex = normalized.slice(1)
    if (hex.length === 6) {
      result = [
        Number.parseInt(hex.slice(0, 2), 16) / 255,
        Number.parseInt(hex.slice(2, 4), 16) / 255,
        Number.parseInt(hex.slice(4, 6), 16) / 255,
        1,
      ]
    } else if (hex.length === 3) {
      result = [
        Number.parseInt(hex[0]! + hex[0]!, 16) / 255,
        Number.parseInt(hex[1]! + hex[1]!, 16) / 255,
        Number.parseInt(hex[2]! + hex[2]!, 16) / 255,
        1,
      ]
    }
  }

  if (result) colorCache.set(color, result)
  return result
}
