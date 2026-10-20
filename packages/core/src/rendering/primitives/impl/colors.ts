/** 跨批次颜色解析：常见格式直接解码，其他 CSS 颜色只读回一次并受 LRU 上限约束。 */
export type PrimitiveColor = readonly [number, number, number, number]
export type ColorResolver = (color: string) => PrimitiveColor

/** 创建后端私有缓存，避免每批新建 Canvas 并同步读回相同颜色。 */
export function createColorResolver(document: Document): ColorResolver {
  const cache = new Map<string, PrimitiveColor>()
  let context: CanvasRenderingContext2D | null = null
  return (color) => {
    const hit = cache.get(color)
    if (hit) {
      cache.delete(color)
      cache.set(color, hit)
      return hit
    }
    let result: PrimitiveColor
    const value = color.trim()
    if (/^#[\da-f]{3,4}$|^#[\da-f]{6}$|^#[\da-f]{8}$/i.test(value)) {
      const raw = value.slice(1)
      const hex = raw.length < 5 ? [...raw].map((char) => char + char).join('') : raw
      result = [
        Number.parseInt(hex.slice(0, 2), 16) / 255,
        Number.parseInt(hex.slice(2, 4), 16) / 255,
        Number.parseInt(hex.slice(4, 6), 16) / 255,
        hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
      ]
    } else {
      if (!context) {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Primitive color context unavailable')
      }
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const pixel = context.getImageData(0, 0, 1, 1).data
      result = [pixel[0]! / 255, pixel[1]! / 255, pixel[2]! / 255, pixel[3]! / 255]
    }
    cache.set(color, result)
    if (cache.size > 256) cache.delete(cache.keys().next().value!)
    return result
  }
}
