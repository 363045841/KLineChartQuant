/** 行情与金融计算共用的只读序列契约。 */
export interface Series {
  readonly 0: number
  readonly 1: number
  /** 动态偏移访问，严格 TypeScript 模式下也始终返回 number。 */
  at(offset: number): number
  /** 从当前 K 线向过去偏移；历史不足返回 NaN。 */
  readonly [offset: number]: number
}
