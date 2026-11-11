/** CPU 线性缓冲：写入者声明变更区间，重放只推进游标，不扫描或复制 CPU 镜像。 */
export class FloatArena {
  private storage = new Float32Array(256)
  length = 0
  private firstWrite = Infinity
  private lastWrite = 0

  /** 声明接下来写入的块，保留已有内容并按倍数扩容。 */
  reserve(additional: number): void {
    this.firstWrite = Math.min(this.firstWrite, this.length)
    this.lastWrite = Math.max(this.lastWrite, this.length + additional)
    this.ensureCapacity(additional)
  }

  /** 容量与内容变更分开：复用既有区间不会触发上传。 */
  private ensureCapacity(additional: number): void {
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
    this.firstWrite = Infinity
    this.lastWrite = 0
  }

  /** 复用上一批内容：只推进游标，不重写存储。 */
  skip(additional: number): void {
    this.ensureCapacity(additional)
    this.length += additional
  }

  /** 本轮被写入的连续包络；尾部缩短不上传，重新增长必须由写入或保留区间提供内容。 */
  uploadRange(): UploadRange | null {
    const end = Math.min(this.lastWrite, this.length)
    return this.firstWrite < end
      ? { offset: this.firstWrite * 4, values: this.storage.subarray(this.firstWrite, end) }
      : null
  }
}

export interface UploadRange {
  offset: number
  values: Float32Array
}

/** 新 GPU 存储需要完整初始化；已分配存储直接消费生产者的变更区间。 */
export function resolveUploadRange(
  values: Float32Array,
  dirty: UploadRange | null,
  allocated: boolean,
): UploadRange | null {
  return allocated && values.length > 0 ? { offset: 0, values } : dirty
}
