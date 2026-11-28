/** 行情变化描述：数据层只说明本次写入影响哪一段，计算端据此决定从哪根重算。 */

/**
 * 变化种类。
 *
 * - append：尾部追加，既有下标与结果都有效，从新根开始算
 * - update：已有 bar 被修订，长度可能不变；从 start 起的结果全部失效
 * - replace：从 start 起整体替换（历史回补、前置插入）；start 之后的下标全部失效
 * - reset：整体替换，旧下标全部失效
 */
export type DataChangeKind = 'append' | 'update' | 'replace' | 'reset'

/**
 * 一次行情变化。
 *
 * `start` 是首个受影响的下标；计算端从它重放到序列末尾。
 * `revision` 是该序列的修订号，单调递增；消费端据此发现丢帧并退化为 reset。
 */
export interface ComputeChange {
  readonly kind: DataChangeKind
  readonly start: number
  readonly revision: number
}
