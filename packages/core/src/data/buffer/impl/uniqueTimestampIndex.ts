/** 时间戳到稳定序号的唯一索引；序号不随 prepend 改变。 */
export class UniqueTimestampIndex {
  private readonly ordinals = new Map<number, number>()

  /** 用完整序列重建索引；调用方保证时间戳已唯一化。 */
  rebuild(data: readonly { readonly timestamp: number }[], origin: number): void {
    this.ordinals.clear()
    this.addRange(data, origin, 0, data.length)
  }

  /** 写入 [start, end) 区间的稳定序号；同一时间戳覆盖旧序号。 */
  addRange(
    data: readonly { readonly timestamp: number }[],
    origin: number,
    start: number,
    end: number,
  ): void {
    for (let index = start; index < end; index++) {
      const timestamp = data[index]!.timestamp
      if (!Number.isFinite(timestamp)) continue
      this.ordinals.set(timestamp, origin + index)
    }
  }

  /** 返回时间戳的稳定序号；不存在时返回 null。 */
  getOrdinal(timestamp: number): number | null {
    if (!Number.isFinite(timestamp)) return null
    return this.ordinals.get(timestamp) ?? null
  }

  /** 清空索引。 */
  clear(): void {
    this.ordinals.clear()
  }
}
