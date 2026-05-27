/**
 * Vitest 测试环境 polyfill
 * - jsdom 不实现 Path2D
 * - jsdom 不实现 WebGL —— 给 getContext('webgl'/'webgl2') 一个最小桩，让 Chart 构造不会崩
 */

if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
    class Path2DStub {
        constructor(_path?: string | Path2DStub) {}
        addPath(_p: Path2DStub, _t?: DOMMatrix2DInit) {}
        arc() {}
        arcTo() {}
        bezierCurveTo() {}
        closePath() {}
        ellipse() {}
        lineTo() {}
        moveTo() {}
        quadraticCurveTo() {}
        rect() {}
        roundRect() {}
    }
    ;(globalThis as { Path2D?: unknown }).Path2D = Path2DStub
}

function makeWebGLStub(): unknown {
    const noopFn = () => {}
    return new Proxy(
        {},
        {
            get(target, prop) {
                if (typeof prop !== 'string') return undefined
                // WebGL constants: uppercase identifiers should return a number (token)
                if (/^[A-Z][A-Z0-9_]*$/.test(prop)) return 0
                // Resource creators (createShader/createProgram/createBuffer/...) must return non-null objects
                if (
                    prop.startsWith('create') ||
                    prop === 'getParameter' ||
                    prop === 'getShaderParameter' ||
                    prop === 'getProgramParameter' ||
                    prop === 'getUniformLocation' ||
                    prop === 'getAttribLocation' ||
                    prop === 'getExtension' ||
                    prop === 'getContextAttributes' ||
                    prop === 'getSupportedExtensions' ||
                    prop === 'getShaderInfoLog' ||
                    prop === 'getProgramInfoLog' ||
                    prop === 'getError'
                ) {
                    if (prop === 'getShaderInfoLog' || prop === 'getProgramInfoLog') return () => ''
                    if (prop === 'getError') return () => 0
                    if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return () => true
                    if (prop === 'getSupportedExtensions') return () => []
                    if (prop === 'getContextAttributes') return () => ({})
                    if (prop === 'getParameter') return () => 0
                    if (prop === 'getUniformLocation' || prop === 'getAttribLocation') return () => 0
                    return () => ({ __webglStub: true })
                }
                if (prop === 'canvas') {
                    return (target as { __canvas?: HTMLCanvasElement }).__canvas
                }
                // Drawing buffer dimensions
                if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') return 300
                // Everything else: noop
                return noopFn
            },
        },
    )
}

if (typeof HTMLCanvasElement !== 'undefined') {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        contextId: string,
        options?: unknown,
    ): RenderingContext | null {
        if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
            const stub = makeWebGLStub() as unknown as { __canvas?: HTMLCanvasElement }
            stub.__canvas = this
            return stub as unknown as RenderingContext
        }
        return originalGetContext.call(this, contextId as '2d', options as CanvasRenderingContext2DSettings) as RenderingContext | null
    } as typeof HTMLCanvasElement.prototype.getContext
}
