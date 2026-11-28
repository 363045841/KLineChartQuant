/**
 * 脚本警报事件：脚本执行的一种输出，与绘图序列并列。
 *
 * 运行时只在最后一根实时 bar 上产出事件；历史加载、回放与前插都不产生事件，
 * 因此事件本身不需要再带“是否实时”的标记。
 */

/** 警报脚本声明的触发频率；由脚本决定，规则不覆盖。 */
export type ScriptAlertFrequency = 'once' | 'per-bar' | 'per-bar-close' | 'all'

/** 判断脚本声明的频率是否受支持。 */
export function isScriptAlertFrequency(value: unknown): value is ScriptAlertFrequency {
  return (
    value === 'once' || value === 'per-bar' || value === 'per-bar-close' || value === 'all'
  )
}

export interface ScriptAlertEvent {
  readonly message: string
  /** 事件所在 bar 的时间戳，不是墙钟时间。 */
  readonly barTime: number
  /** 产生事件时的实时价格。 */
  readonly price: number
}
