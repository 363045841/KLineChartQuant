import { SharedWebGLSurface, type PhysicalRegion, type WebGLCompositeOptions, type WebGLRegion } from './sharedWebGLSurface'

type Rect = {
    x: number
    y: number
    width: number
    height: number
}

type LineStrip = {
    points: Array<{ x: number; y: number }>
    width: number
}

type ColoredLineStrip = LineStrip & {
    color: string
}

type FilledBand = {
    upperPoints: Array<{ x: number; y: number }>
    lowerPoints: Array<{ x: number; y: number }>
}

type FloatColor = readonly [number, number, number, number]

type RectWebGLHandles = {
    program: WebGLProgram
    vao: WebGLVertexArrayObject
    unitBuffer: WebGLBuffer
    rectBuffer: WebGLBuffer
    resolutionLocation: WebGLUniformLocation
    scrollXLocation: WebGLUniformLocation
    colorLocation: WebGLUniformLocation
}

type BasicLineWebGLHandles = {
    program: WebGLProgram
    vao: WebGLVertexArrayObject
    vertexBuffer: WebGLBuffer
    resolutionLocation: WebGLUniformLocation
    scrollXLocation: WebGLUniformLocation
    colorLocation: WebGLUniformLocation
}

type LineWebGLHandles = {
    basic: BasicLineWebGLHandles
}

type MsaaTargets = {
    samples: number
    widthPx: number
    heightPx: number
    msaaFramebuffer: WebGLFramebuffer
    msaaColorRenderbuffer: WebGLRenderbuffer
    resolveFramebuffer: WebGLFramebuffer
    resolveTexture: WebGLTexture
}

const RECT_VERTEX_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 a_unit;
in vec4 a_rect;

uniform vec2 u_resolution;
uniform float u_scrollX;

void main() {
    vec2 position = vec2(
        a_rect.x - u_scrollX + a_unit.x * a_rect.z,
        a_rect.y + a_unit.y * a_rect.w
    );

    vec2 zeroToOne = position / u_resolution;
    vec2 clip = vec2(
        zeroToOne.x * 2.0 - 1.0,
        1.0 - zeroToOne.y * 2.0
    );

    gl_Position = vec4(clip, 0.0, 1.0);
}`

const LINE_VERTEX_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 a_position;

uniform vec2 u_resolution;
uniform float u_scrollX;

void main() {
    vec2 position = vec2(a_position.x - u_scrollX, a_position.y);
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

const UNIT_QUAD = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    0, 1,
    1, 0,
    1, 1,
])

const MITER_DOT_MIN = 0.5

export class CandleWebGLSurface {
    private shared: SharedWebGLSurface
    private handles: RectWebGLHandles | null = null
    private logicalWidth = 0
    private logicalHeight = 0
    private available = false
    private rectCapacity = 0
    private rectScratch = new Float32Array(0)
    private region: WebGLRegion | null = null

    constructor(shared: SharedWebGLSurface) {
        this.shared = shared
        this.handles = this.initRectHandles()
        this.available = this.handles !== null
    }

    isAvailable(): boolean {
        return this.available
    }

    getCanvas(): HTMLCanvasElement {
        return this.shared.getCanvas()
    }

    setRegion(region: WebGLRegion): void {
        this.region = region
    }

    resize(width: number, height: number, _dpr: number): void {
        this.logicalWidth = width
        this.logicalHeight = height
    }

    clear(): void {
        if (!this.region || this.logicalWidth <= 0 || this.logicalHeight <= 0) return
        this.shared.clearRegion(this.region)
    }

    compositeTo(ctx: CanvasRenderingContext2D, options: WebGLCompositeOptions = {}): void {
        if (!this.region) return
        this.shared.compositeRegionTo(ctx, this.region, options)
    }

    /** 直接传入已打包的 Float32Array：每 4 个元素为一组 (x, y, width, height) */
    drawRectBuffer(rectData: Float32Array, rectCount: number, color: string, scrollLeft: number): boolean {
        const handles = this.handles
        if (!handles || rectCount === 0 || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
            return false
        }

        const colorValue = parseColor(color)
        if (!colorValue) return false

        const floatCount = rectCount * 4
        const gl = this.shared.getGL()
        if (!gl || !this.region || !this.shared.bindRegion(this.region)) return false

        gl.useProgram(handles.program)
        gl.bindVertexArray(handles.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, handles.rectBuffer)

        if (this.rectCapacity < floatCount) {
            this.rectCapacity = nextBufferFloatCapacity(floatCount)
            gl.bufferData(gl.ARRAY_BUFFER, this.rectCapacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW)
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, rectData)

        if (colorValue[3] === 1) {
            gl.disable(gl.BLEND)
        } else {
            gl.enable(gl.BLEND)
        }
        gl.uniform2f(handles.resolutionLocation, this.logicalWidth, this.logicalHeight)
        gl.uniform1f(handles.scrollXLocation, scrollLeft)
        gl.uniform4f(handles.colorLocation, colorValue[0], colorValue[1], colorValue[2], colorValue[3])
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, rectCount)
        gl.bindVertexArray(null)
        return true
    }

    drawRects(rects: Rect[], color: string, scrollLeft: number): boolean {
        const handles = this.handles
        if (!handles || !rects.length || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
            return false
        }

        const floatCount = rects.length * 4
        if (this.rectScratch.length < floatCount) {
            this.rectScratch = new Float32Array(nextBufferFloatCapacity(floatCount))
        }

        for (let i = 0; i < rects.length; i++) {
            const rect = rects[i]!
            const offset = i * 4
            this.rectScratch[offset] = rect.x
            this.rectScratch[offset + 1] = rect.y
            this.rectScratch[offset + 2] = rect.width
            this.rectScratch[offset + 3] = rect.height
        }

        return this.drawRectBuffer(this.rectScratch.subarray(0, floatCount), rects.length, color, scrollLeft)
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
        const scrollXLocation = gl.getUniformLocation(program, 'u_scrollX')
        const colorLocation = gl.getUniformLocation(program, 'u_color')
        if (!resolutionLocation || !scrollXLocation || !colorLocation) {
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

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        return {
            program,
            vao,
            unitBuffer,
            rectBuffer,
            resolutionLocation,
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
    private fillScratch = new Float32Array(0)
    private lineScratch = new Float32Array(0)
    private region: WebGLRegion | null = null
    private msaaTargets: MsaaTargets | null = null

    // Geometry cache: 以 points 数组引用 + halfWidth 为 key，避免每帧重算法线/miter
    private geoCache = new WeakMap<Array<{ x: number; y: number }>, Map<number, { vertices: Float32Array; vertexCount: number }>>()

    constructor(shared: SharedWebGLSurface) {
        this.shared = shared
        this.handles = this.initLineHandles()
        this.available = this.handles !== null
    }

    isAvailable(): boolean {
        return this.available
    }

    getCanvas(): HTMLCanvasElement {
        return this.shared.getCanvas()
    }

    setRegion(region: WebGLRegion): void {
        this.region = region
    }

    resize(width: number, height: number, dpr: number): void {
        this.logicalWidth = width
        this.logicalHeight = height
        this.dpr = dpr
    }

    clear(): void {
        if (!this.region || this.logicalWidth <= 0 || this.logicalHeight <= 0) return
        this.shared.clearRegion(this.region)
    }

    compositeTo(ctx: CanvasRenderingContext2D, options: WebGLCompositeOptions = {}): void {
        if (!this.region) return
        this.shared.compositeRegionTo(ctx, this.region, options)
    }

    drawLineStrips(lines: ColoredLineStrip[], scrollLeft: number): boolean {
        const handles = this.handles
        if (!handles || lines.length === 0 || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
            return false
        }

        type DrawCmd = {
            colorValue: FloatColor
            mode: number
            firstVertex: number
            pointCount: number
            vertices?: Float32Array
            points?: Array<{ x: number; y: number }>
        }

        const gl = this.shared.getGL()
        const region = this.region
        if (!gl || !region) return false

        const drawCmds: DrawCmd[] = []
        let totalFloats = 0
        let hasNativeLines = false

        for (const line of lines) {
            if (line.points.length < 2) return false

            const colorValue = parseColor(line.color)
            if (!colorValue) return false

            if (line.width <= 1) {
                hasNativeLines = true
                drawCmds.push({
                    colorValue,
                    mode: gl.LINE_STRIP,
                    firstVertex: totalFloats / 2,
                    pointCount: line.points.length,
                    points: line.points,
                })
                totalFloats += line.points.length * 2
                continue
            }

            const geometry = this.getLineGeometry(line)
            if (!geometry) return false
            drawCmds.push({
                colorValue,
                mode: gl.TRIANGLES,
                firstVertex: totalFloats / 2,
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
            if (cmd.vertices) {
                this.lineScratch.set(cmd.vertices, floatOffset)
                floatOffset += cmd.vertices.length
                continue
            }

            const points = cmd.points
            if (!points) return false
            for (const point of points) {
                this.lineScratch[floatOffset++] = point.x
                this.lineScratch[floatOffset++] = point.y
            }
        }

        const msaaRender = this.beginMsaaRender(gl, region)
        if (!msaaRender && !this.shared.bindRegion(region)) {
            return false
        }

        gl.useProgram(handles.basic.program)
        gl.bindVertexArray(handles.basic.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, handles.basic.vertexBuffer)

        if (this.vertexCapacity < totalFloats) {
            this.vertexCapacity = nextBufferFloatCapacity(totalFloats)
            gl.bufferData(gl.ARRAY_BUFFER, this.vertexCapacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW)
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineScratch.subarray(0, totalFloats))

        gl.uniform2f(handles.basic.resolutionLocation, this.logicalWidth, this.logicalHeight)
        gl.uniform1f(handles.basic.scrollXLocation, scrollLeft)
        if (hasNativeLines) {
            gl.lineWidth(1)
        }

        for (const cmd of drawCmds) {
            gl.uniform4f(handles.basic.colorLocation, cmd.colorValue[0], cmd.colorValue[1], cmd.colorValue[2], cmd.colorValue[3])
            gl.drawArrays(cmd.mode, cmd.firstVertex, cmd.pointCount)
        }

        gl.bindVertexArray(null)

        if (msaaRender) {
            this.resolveMsaaToSharedRegion(gl, msaaRender.targets, msaaRender.physical)
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        return true
    }

    private getLineGeometry(line: LineStrip): { vertices: Float32Array; vertexCount: number } | null {
        const halfWidth = line.width / 2
        let widthMap = this.geoCache.get(line.points)
        if (widthMap) {
            const cached = widthMap.get(halfWidth)
            if (cached) return cached
        } else {
            widthMap = new Map()
            this.geoCache.set(line.points, widthMap)
        }

        const geometry = buildJoinedPolylineGeometry(line.points, halfWidth)
        if (geometry) widthMap.set(halfWidth, geometry)
        return geometry
    }

    drawFilledBand(band: FilledBand, color: string, scrollLeft: number): boolean {
        const handles = this.handles
        const pointCount = Math.min(band.upperPoints.length, band.lowerPoints.length)
        if (!handles || pointCount < 2 || this.logicalWidth <= 0 || this.logicalHeight <= 0) {
            return false
        }

        const colorValue = parseColor(color)
        if (!colorValue) return false

        const vertexCount = pointCount * 2
        const floatCount = vertexCount * 2
        if (this.fillScratch.length < floatCount) {
            this.fillScratch = new Float32Array(nextBufferFloatCapacity(floatCount))
        }

        let writeIndex = 0
        for (let i = 0; i < pointCount; i++) {
            const upper = band.upperPoints[i]!
            const lower = band.lowerPoints[i]!
            this.fillScratch[writeIndex++] = upper.x
            this.fillScratch[writeIndex++] = upper.y
            this.fillScratch[writeIndex++] = lower.x
            this.fillScratch[writeIndex++] = lower.y
        }

        const gl = this.shared.getGL()
        const region = this.region
        if (!gl || !region) return false

        const msaaRender = this.beginMsaaRender(gl, region)
        if (!msaaRender && !this.shared.bindRegion(region)) return false

        gl.useProgram(handles.basic.program)
        gl.bindVertexArray(handles.basic.vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, handles.basic.vertexBuffer)

        if (this.vertexCapacity < floatCount) {
            this.vertexCapacity = nextBufferFloatCapacity(floatCount)
            gl.bufferData(gl.ARRAY_BUFFER, this.vertexCapacity * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW)
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fillScratch.subarray(0, floatCount))

        gl.uniform2f(handles.basic.resolutionLocation, this.logicalWidth, this.logicalHeight)
        gl.uniform1f(handles.basic.scrollXLocation, scrollLeft)
        gl.uniform4f(handles.basic.colorLocation, colorValue[0], colorValue[1], colorValue[2], colorValue[3])
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexCount)
        gl.bindVertexArray(null)

        if (msaaRender) {
            this.resolveMsaaToSharedRegion(gl, msaaRender.targets, msaaRender.physical)
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        return true
    }

    destroy(): void {
        const handles = this.handles
        const gl = this.shared.getGL()
        if (gl) {
            this.destroyMsaaTargets(gl)
        }
        if (!handles) {
            this.vertexCapacity = 0
            return
        }

        if (gl) {
            const { basic } = handles
            gl.deleteBuffer(basic.vertexBuffer)
            gl.deleteVertexArray(basic.vao)
            gl.deleteProgram(basic.program)
        }
        this.handles = null
        this.available = false
        this.vertexCapacity = 0
    }

    private beginMsaaRender(gl: WebGL2RenderingContext, region: WebGLRegion): { targets: MsaaTargets; physical: PhysicalRegion } | null {
        const physical = this.shared.getPhysicalRegion(region)
        const targets = physical ? this.ensureMsaaTargets(gl, physical) : null
        if (!physical || !targets) return null

        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.msaaFramebuffer)
        gl.viewport(0, 0, targets.widthPx, targets.heightPx)
        gl.disable(gl.SCISSOR_TEST)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        return { targets, physical }
    }

    private ensureMsaaTargets(gl: WebGL2RenderingContext, physical: PhysicalRegion): MsaaTargets | null {
        const preferredSamples = 4
        const maxSamples = Number(gl.getParameter(gl.MAX_SAMPLES)) || 0
        const samples = Math.max(1, Math.min(preferredSamples, maxSamples))
        if (samples <= 1) return null

        const existing = this.msaaTargets
        if (
            existing
            && existing.widthPx === physical.widthPx
            && existing.heightPx === physical.heightPx
            && existing.samples === samples
        ) {
            return existing
        }

        this.destroyMsaaTargets(gl)

        const msaaFramebuffer = gl.createFramebuffer()
        const msaaColorRenderbuffer = gl.createRenderbuffer()
        const resolveFramebuffer = gl.createFramebuffer()
        const resolveTexture = gl.createTexture()
        if (!msaaFramebuffer || !msaaColorRenderbuffer || !resolveFramebuffer || !resolveTexture) {
            if (msaaFramebuffer) gl.deleteFramebuffer(msaaFramebuffer)
            if (msaaColorRenderbuffer) gl.deleteRenderbuffer(msaaColorRenderbuffer)
            if (resolveFramebuffer) gl.deleteFramebuffer(resolveFramebuffer)
            if (resolveTexture) gl.deleteTexture(resolveTexture)
            return null
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer)
        gl.bindRenderbuffer(gl.RENDERBUFFER, msaaColorRenderbuffer)
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, physical.widthPx, physical.heightPx)
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msaaColorRenderbuffer)
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.bindRenderbuffer(gl.RENDERBUFFER, null)
            gl.deleteFramebuffer(msaaFramebuffer)
            gl.deleteRenderbuffer(msaaColorRenderbuffer)
            gl.deleteFramebuffer(resolveFramebuffer)
            gl.deleteTexture(resolveTexture)
            return null
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFramebuffer)
        gl.bindTexture(gl.TEXTURE_2D, resolveTexture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, physical.widthPx, physical.heightPx, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resolveTexture, 0)
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.bindTexture(gl.TEXTURE_2D, null)
            gl.bindRenderbuffer(gl.RENDERBUFFER, null)
            gl.deleteFramebuffer(msaaFramebuffer)
            gl.deleteRenderbuffer(msaaColorRenderbuffer)
            gl.deleteFramebuffer(resolveFramebuffer)
            gl.deleteTexture(resolveTexture)
            return null
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.bindTexture(gl.TEXTURE_2D, null)
        gl.bindRenderbuffer(gl.RENDERBUFFER, null)

        const targets = {
            samples,
            widthPx: physical.widthPx,
            heightPx: physical.heightPx,
            msaaFramebuffer,
            msaaColorRenderbuffer,
            resolveFramebuffer,
            resolveTexture,
        }
        this.msaaTargets = targets
        return targets
    }

    private destroyMsaaTargets(gl: WebGL2RenderingContext): void {
        const targets = this.msaaTargets
        if (!targets) return
        gl.deleteFramebuffer(targets.msaaFramebuffer)
        gl.deleteRenderbuffer(targets.msaaColorRenderbuffer)
        gl.deleteFramebuffer(targets.resolveFramebuffer)
        gl.deleteTexture(targets.resolveTexture)
        this.msaaTargets = null
    }

    private resolveMsaaToSharedRegion(gl: WebGL2RenderingContext, targets: MsaaTargets, physical: PhysicalRegion): void {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targets.msaaFramebuffer)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targets.resolveFramebuffer)
        gl.blitFramebuffer(
            0, 0, targets.widthPx, targets.heightPx,
            0, 0, targets.widthPx, targets.heightPx,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST,
        )

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targets.resolveFramebuffer)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
        const destY = this.shared.getCanvas().height - physical.sourceY - physical.heightPx
        gl.disable(gl.SCISSOR_TEST)
        gl.blitFramebuffer(
            0, 0, targets.widthPx, targets.heightPx,
            physical.sourceX, destY, physical.sourceX + physical.widthPx, destY + physical.heightPx,
            gl.COLOR_BUFFER_BIT,
            gl.NEAREST,
        )
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
    }

    private initLineHandles(): LineWebGLHandles | null {
        const gl = this.shared.getGL()
        if (!gl) return null

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, LINE_VERTEX_SHADER_SOURCE)
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
        const vertexBuffer = gl.createBuffer()
        if (!vao || !vertexBuffer) {
            if (vao) gl.deleteVertexArray(vao)
            if (vertexBuffer) gl.deleteBuffer(vertexBuffer)
            gl.deleteProgram(program)
            return null
        }

        const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
        const scrollXLocation = gl.getUniformLocation(program, 'u_scrollX')
        const colorLocation = gl.getUniformLocation(program, 'u_color')
        if (!resolutionLocation || !scrollXLocation || !colorLocation) {
            gl.deleteBuffer(vertexBuffer)
            gl.deleteVertexArray(vao)
            gl.deleteProgram(program)
            return null
        }

        const positionLocation = gl.getAttribLocation(program, 'a_position')
        if (positionLocation < 0) {
            gl.deleteBuffer(vertexBuffer)
            gl.deleteVertexArray(vao)
            gl.deleteProgram(program)
            return null
        }

        gl.bindVertexArray(vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
        gl.enableVertexAttribArray(positionLocation)
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
        gl.bindVertexArray(null)

        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

        return {
            basic: {
                program,
                vao,
                vertexBuffer,
                resolutionLocation,
                scrollXLocation,
                colorLocation,
            },
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

interface PolylineNormal {
    nx: number
    ny: number
    valid: boolean
}

function buildJoinedPolylineGeometry(points: Array<{ x: number; y: number }>, halfWidth: number) {
    if (points.length < 2) return null

    // 使用固定结构数组，避免动态对象分配
    const normals: PolylineNormal[] = new Array(points.length - 1)
    let validSegmentCount = 0

    // 第一遍：计算所有法线（用 sqrt 替代 hypot，缓存逆长度）
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i]!
        const end = points[i + 1]!
        const dx = end.x - start.x
        const dy = end.y - start.y
        const lenSq = dx * dx + dy * dy
        if (lenSq <= 0) {
            normals[i] = { nx: 0, ny: 0, valid: false }
            continue
        }
        const invLen = 1 / Math.sqrt(lenSq)
        normals[i] = { nx: -dy * invLen, ny: dx * invLen, valid: true }
        validSegmentCount++
    }

    if (validSegmentCount === 0) return null

    // 预分配顶点数组：每对有效相邻点生成12个float（6个顶点 * 2个坐标）
    const maxVerticesFloats = (points.length - 1) * 12
    const vertices = new Float32Array(maxVerticesFloats)
    let vertexWriteIndex = 0

    // 计算 miter 并直接写入顶点
    for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i]!
        const next = points[i + 1]!

        const prevNormal = i > 0 ? normals[i - 1] : null
        const currNormal = normals[i]!

        if (!currNormal.valid) continue
        if (!prevNormal && !currNormal.valid) continue

        // 计算 curr 点的 miter 法线
        let miterNX = 0
        let miterNY = 0
        if (prevNormal?.valid && currNormal.valid) {
            miterNX = prevNormal.nx + currNormal.nx
            miterNY = prevNormal.ny + currNormal.ny
            const miterLenSq = miterNX * miterNX + miterNY * miterNY
            if (miterLenSq > 1e-12) {
                const invMiter = 1 / Math.sqrt(miterLenSq)
                miterNX *= invMiter
                miterNY *= invMiter
                const dot = miterNX * currNormal.nx + miterNY * currNormal.ny
                const scale = 1 / Math.max(MITER_DOT_MIN, Math.abs(dot))
                miterNX *= scale
                miterNY *= scale
            } else {
                miterNX = currNormal.nx
                miterNY = currNormal.ny
            }
        } else if (currNormal.valid) {
            miterNX = currNormal.nx
            miterNY = currNormal.ny
        } else if (prevNormal?.valid) {
            miterNX = prevNormal.nx
            miterNY = prevNormal.ny
        } else {
            continue
        }

        // 计算 next 点的法线（用于下一对点）
        let nextMiterNX = currNormal.nx
        let nextMiterNY = currNormal.ny
        const nextNormal = i < points.length - 2 ? normals[i + 1] : null
        if (nextNormal?.valid && currNormal.valid) {
            nextMiterNX = currNormal.nx + nextNormal.nx
            nextMiterNY = currNormal.ny + nextNormal.ny
            const miterLenSq = nextMiterNX * nextMiterNX + nextMiterNY * nextMiterNY
            if (miterLenSq > 1e-12) {
                const invMiter = 1 / Math.sqrt(miterLenSq)
                nextMiterNX *= invMiter
                nextMiterNY *= invMiter
                const dot = nextMiterNX * nextNormal.nx + nextMiterNY * nextNormal.ny
                const scale = 1 / Math.max(MITER_DOT_MIN, Math.abs(dot))
                nextMiterNX *= scale
                nextMiterNY *= scale
            } else {
                nextMiterNX = currNormal.nx
                nextMiterNY = currNormal.ny
            }
        }

        // 计算四个角点
        const leftAX = curr.x + miterNX * halfWidth
        const leftAY = curr.y + miterNY * halfWidth
        const rightAX = curr.x - miterNX * halfWidth
        const rightAY = curr.y - miterNY * halfWidth
        const leftBX = next.x + nextMiterNX * halfWidth
        const leftBY = next.y + nextMiterNY * halfWidth
        const rightBX = next.x - nextMiterNX * halfWidth
        const rightBY = next.y - nextMiterNY * halfWidth

        // 写入两个三角形（6个顶点）
        vertices[vertexWriteIndex++] = leftAX
        vertices[vertexWriteIndex++] = leftAY
        vertices[vertexWriteIndex++] = rightAX
        vertices[vertexWriteIndex++] = rightAY
        vertices[vertexWriteIndex++] = leftBX
        vertices[vertexWriteIndex++] = leftBY
        vertices[vertexWriteIndex++] = leftBX
        vertices[vertexWriteIndex++] = leftBY
        vertices[vertexWriteIndex++] = rightAX
        vertices[vertexWriteIndex++] = rightAY
        vertices[vertexWriteIndex++] = rightBX
        vertices[vertexWriteIndex++] = rightBY
    }

    if (vertexWriteIndex === 0) return null

    return {
        vertices: vertexWriteIndex === maxVerticesFloats ? vertices : vertices.subarray(0, vertexWriteIndex),
        vertexCount: vertexWriteIndex / 2,
    }
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
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

function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
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
        const values = normalized.slice(5, -1).split(',').map((part) => Number(part.trim()))
        if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
            result = [values[0]! / 255, values[1]! / 255, values[2]! / 255, values[3]!]
        }
    } else if (normalized.startsWith('rgb(')) {
        const values = normalized.slice(4, -1).split(',').map((part) => Number(part.trim()))
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
