/** 有序绘制队列：只合并相邻且缓冲连续的同类批次，独立数据填充保持自身范围。 */
import type { PreparedDraw } from '../types.js'

export class DrawList {
  readonly values: PreparedDraw[] = []
  private mergeable = false

  reset(): void {
    this.values.length = 0
    this.mergeable = false
  }

  /** 合并会修改队尾；需要跨帧保存的独立 draw 必须保持 merge=false。 */
  append(draw: PreparedDraw, merge = false): void {
    const last = this.values.at(-1)
    if (
      merge &&
      this.mergeable &&
      last &&
      last.kind !== 'stencil' &&
      draw.kind !== 'stencil' &&
      last.kind === draw.kind &&
      last.first + last.count === draw.first
    ) {
      last.count += draw.count
    } else this.values.push(draw)
    this.mergeable = merge
  }
}
