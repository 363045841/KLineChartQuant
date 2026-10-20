/** CPU 线性缓冲与上传差异跟踪：按容量增长，逐帧复用，只上传变化区间。 */
export class FloatArena {
  private storage = new Float32Array(256)
  length = 0

  /** 保留已有内容并按倍数扩容。 */
  reserve(additional: number): void {
    const needed = this.length + additional
    if (needed <= this.storage.length) return
    const next = new Float32Array(Math.max(needed, this.storage.length * 2))
    next.set(this.storage.subarray(0, this.length))
    this.storage = next
  }

  /** 追加一个标量，调用方提前 reserve 整个几何块。 */
  write(value: number): void {
    this.storage[this.length++] = value
  }

  /** 获取已写视图；只在下一次 prepare 前有效，驱动上传会同步复制数据。 */
  view(): Float32Array {
    return this.storage.subarray(0, this.length)
  }

  /** 清空游标而保留容量。 */
  reset(): void {
    this.length = 0
  }
}

export interface UploadRange {
  offset: number
  values: Float32Array
}

/** 保留上一次 GPU 内容的 CPU 镜像，精确比较并合并成一个连续上传区间。 */
export class UploadTracker {
  private previous = new Float32Array(0)
  private length = 0

  /** force 用于新分配的 GPU buffer；完全未变时不产生上传。 */
  update(values: Float32Array, force = false): UploadRange | null {
    if (this.previous.length < values.length) {
      this.previous = new Float32Array(Math.max(values.length, this.previous.length * 2))
      force = true
    }
    let first = values.length,
      last = -1
    for (let i = 0; i < values.length; i++) {
      if (force || i >= this.length || this.previous[i] !== values[i]) {
        first = Math.min(first, i)
        last = i
        this.previous[i] = values[i]!
      }
    }
    this.length = values.length
    return last < first ? null : { offset: first * 4, values: values.subarray(first, last + 1) }
  }
}
