/** 真实浏览器渐变像素回归：覆盖 Canvas、GPU 合成/直出、DPR、stencil 与缓存重放。 */
import type {
  PaintPrimitive,
  PrimitiveBackend,
  PrimitiveFade,
} from '../../packages/core/src/rendering/primitives/types'

/** 小目标也必须正确合成，覆盖离屏存储大于本批目标的情况。 */
const VIEWPORT = { width: 100, height: 100 }

/** 比较实际像素与线性透明度，检查渐变没有向透明黑偏色。 */
function checkPixels(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  fade: PrimitiveFade,
  label: string,
): void {
  for (const y of [10, 30, 50, 70, 90]) {
    const physicalY = Math.floor(y * dpr)
    const screenY = (physicalY + 0.5) / dpr
    const coverage = Math.max(0, Math.min(1, (fade.toY - screenY) / (fade.toY - fade.fromY)))
    const expected = 128 * 0.75 * coverage
    const pixel = ctx.getImageData(Math.floor(20 * dpr), physicalY, 1, 1).data
    // 低 alpha 读回会放大反预乘的量化误差；在预乘空间比较颜色，容许两级舍入。
    const redError = Math.abs((pixel[0]! / 255 - 1) * pixel[3]!)
    if (Math.abs(pixel[3]! - expected) > 2 || redError > 2) {
      throw new Error(`${label}/y=${y}: pixel ${Array.from(pixel)}, expected alpha ${expected}`)
    }
  }
}

/** 同一份几何依次切换渐变方向，验证所有后端都更新颜色而不复用旧渐变。 */
export function checkFillFade(name: string, backend: PrimitiveBackend): number {
  let cases = 0
  for (const dpr of [1, 1.25, 1.5, 2]) {
    for (const stencil of [false, true]) {
      const canvas = document.createElement('canvas')
      canvas.width = VIEWPORT.width * dpr
      canvas.height = VIEWPORT.height * dpr
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.scale(dpr, dpr)
      const rect = [
        { x: 5, y: 5 },
        { x: 95, y: 5 },
        { x: 95, y: 95 },
        { x: 5, y: 95 },
      ]
      const hole = [
        { x: 70, y: 30 },
        { x: 70, y: 70 },
        { x: 90, y: 70 },
        { x: 90, y: 30 },
      ]
      const paths = stencil ? [rect, hole] : [rect]
      const directCanvas = document.createElement('canvas')
      directCanvas.width = VIEWPORT.width * dpr
      directCanvas.height = VIEWPORT.height * dpr
      const surface = backend.createSurface?.(directCanvas)
      try {
        for (const reverse of [false, true]) {
          const fade = reverse ? { fromY: 80, toY: 20 } : { fromY: 20, toY: 80 }
          const command: PaintPrimitive = {
            kind: 'fill',
            color: '#ff000080',
            opacity: 0.75,
            paths,
            fade,
            band: !stencil,
            dataSpace: !stencil,
          }
          const transform = { offsetX: 0, yScale: 1, yOffset: 0 }
          const label = `${name}/${dpr}/${reverse}/${stencil}`
          ctx.clearRect(0, 0, VIEWPORT.width, VIEWPORT.height)
          if (!backend.paint(ctx, [command], dpr, transform))
            throw new Error(`${label}: paint failed`)
          checkPixels(ctx, dpr, fade, label)
          cases++
          if (surface) {
            if (!surface.paint([command], dpr, true, transform))
              throw new Error(`${label}: surface failed`)
            ctx.clearRect(0, 0, VIEWPORT.width, VIEWPORT.height)
            ctx.drawImage(directCanvas, 0, 0, VIEWPORT.width, VIEWPORT.height)
            checkPixels(ctx, dpr, fade, `${label}/surface`)
            cases++
          }
        }
      } finally {
        surface?.dispose()
      }
    }
  }
  return cases
}

/** 参考线→面积→价格线必须消费各自描边实例，避免 WebGL 重复读取第一批线段。 */
export function checkStrokeFillOrder(name: string, backend: PrimitiveBackend): void {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 100
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const commands: PaintPrimitive[] = [
    {
      kind: 'stroke',
      color: '#ff0000',
      width: 4,
      paths: [
        [
          { x: 10, y: 10 },
          { x: 90, y: 10 },
        ],
      ],
    },
    {
      kind: 'fill',
      color: '#00ff00',
      band: true,
      paths: [
        [
          { x: 10, y: 25 },
          { x: 90, y: 25 },
          { x: 90, y: 45 },
          { x: 10, y: 45 },
        ],
      ],
      fade: { fromY: 25, toY: 45 },
    },
    {
      kind: 'stroke',
      color: '#0000ff',
      width: 4,
      cap: 'round',
      join: 'round',
      paths: [
        [
          { x: 10, y: 70 },
          { x: 90, y: 70 },
        ],
      ],
    },
  ]
  const surfaceCanvas = document.createElement('canvas')
  surfaceCanvas.width = surfaceCanvas.height = 100
  const surface = backend.createSurface?.(surfaceCanvas)
  /** 像素位置验证线条没有串批，也没有覆盖后续渐变。 */
  const verify = (): void => {
    const red = ctx.getImageData(50, 10, 1, 1).data
    const green = ctx.getImageData(50, 35, 1, 1).data
    const blue = ctx.getImageData(50, 70, 1, 1).data
    if (
      red[0] !== 255 ||
      red[3] !== 255 ||
      green[1] !== 255 ||
      blue[2] !== 255 ||
      blue[3] !== 255
    ) {
      throw new Error(`${name}: reference/fill/price order changed`)
    }
  }
  try {
    if (!backend.paint(ctx, commands, 1)) throw new Error(`${name}: mixed batch failed`)
    verify()
    if (surface) {
      if (!surface.paint(commands, 1, true)) throw new Error(`${name}: mixed surface failed`)
      ctx.clearRect(0, 0, 100, 100)
      ctx.drawImage(surfaceCanvas, 0, 0)
      verify()
    }
  } finally {
    surface?.dispose()
  }
}
