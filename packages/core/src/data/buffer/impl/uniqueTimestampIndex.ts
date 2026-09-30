/** 数据快照的唯一时间戳索引：重复时间戳没有确定的逻辑位置。 */
export class UniqueTimestampIndex {
  private readonly indices = new Map<number, number>()
  private readonly duplicates = new Set<number>()

  /** 使用当前完整快照重建时间戳索引。 */
  rebuild(data: ReadonlyArray<{ readonly timestamp: number }>): void {
    this.indices.clear()
    this.duplicates.clear()
    for (let index = 0; index < data.length; index++) {
      const timestamp = data[index]!.timestamp
      if (!Number.isFinite(timestamp)) continue
      if (this.indices.has(timestamp)) {
        this.indices.delete(timestamp)
        this.duplicates.add(timestamp)
      } else if (!this.duplicates.has(timestamp)) {
        this.indices.set(timestamp, index)
      }
    }
  }

  /** 返回唯一时间戳的逻辑索引；缺失或重复时返回 null。 */
  get(timestamp: number): number | null {
    if (!Number.isFinite(timestamp) || this.duplicates.has(timestamp)) return null
    return this.indices.get(timestamp) ?? null
  }
}
