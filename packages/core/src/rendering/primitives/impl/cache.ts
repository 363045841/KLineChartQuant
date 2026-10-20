/** 有界几何缓存：平移归一化、坐标快照精确核对，避免引用复用或哈希碰撞造成残影。 */
import type { PrimitivePath } from '../types.js'

export interface PrimitiveBounds {
  left: number
  top: number
  right: number
  bottom: number
}
export interface CachedGeometry {
  positions: Float64Array
  direct: boolean
  bounds: PrimitiveBounds
}
interface Entry {
  style: string
  source: Float64Array
  geometry: CachedGeometry
  bytes: number
}

/** 缓存只保留 CPU 几何，不绑定 GPU 资源；LRU 同时限制条目和总字节数。 */
export class GeometryCache {
  private entries = new Map<string, Entry>()
  private bytes = 0
  private bits = new DataView(new ArrayBuffer(8))

  /** 同源平移复用；精确源坐标比较使可变数组的修改立即失效。 */
  read(
    style: string,
    paths: readonly PrimitivePath[],
    build: (paths: PrimitivePath[]) => CachedGeometry,
  ): { geometry: CachedGeometry; hit: boolean; x: number; y: number } {
    const x = paths[0]?.[0]?.x ?? 0,
      y = paths[0]?.[0]?.y ?? 0
    let hash = 2166136261,
      count = paths.length + 1
    const mix = (value: number): void => {
      this.bits.setFloat64(0, value)
      hash = Math.imul(hash ^ this.bits.getUint32(0), 16777619)
      hash = Math.imul(hash ^ this.bits.getUint32(4), 16777619)
    }
    mix(paths.length)
    for (const path of paths) {
      mix(path.length)
      count += path.length * 2
      for (const point of path) {
        mix(point.x - x)
        mix(point.y - y)
      }
    }
    const key = `${style}/${hash}/${count}`
    const existing = this.entries.get(key)
    let same = !!existing && existing.style === style && existing.source.length === count
    let index = 1
    if (same)
      for (const path of paths) {
        if (existing!.source[index++] !== path.length) {
          same = false
          break
        }
        for (const point of path) {
          if (
            existing!.source[index++] !== point.x - x ||
            existing!.source[index++] !== point.y - y
          ) {
            same = false
            break
          }
        }
        if (!same) break
      }
    if (same) {
      this.entries.delete(key)
      this.entries.set(key, existing!)
      return { geometry: existing!.geometry, hit: true, x, y }
    }
    const source = new Float64Array(count)
    source[0] = paths.length
    index = 1
    const normalized = paths.map((path) => {
      source[index++] = path.length
      return path.map((point) => {
        const next = { x: point.x - x, y: point.y - y }
        source[index++] = next.x
        source[index++] = next.y
        return next
      })
    })
    const geometry = build(normalized)
    const bytes = source.byteLength + geometry.positions.byteLength + style.length * 2
    if (existing) {
      this.bytes -= existing.bytes
      this.entries.delete(key)
    }
    if (bytes <= 8 * 1024 * 1024) {
      this.entries.set(key, { style, source, geometry, bytes })
      this.bytes += bytes
      while (this.entries.size > 256 || this.bytes > 8 * 1024 * 1024) {
        const oldest = this.entries.keys().next().value!
        this.bytes -= this.entries.get(oldest)!.bytes
        this.entries.delete(oldest)
      }
    }
    return { geometry, hit: false, x, y }
  }
}
