/**
 * 警报公共契约。
 *
 * 警报只是计算结果的消费者：条件由脚本定义，服务负责频率、冷却、过期、
 * 日志与投递；视图与 UI 不参与判断。
 */
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { SymbolSpec } from '../../controllers/types.js'
import type { CalculationInputs } from '../../engine/calculation/index.js'
import type { ScriptAlertFrequency } from '@363045841yyt/klinechart-plot-contracts'

export type AlertId = string

/** 触发频率由脚本声明，规则不覆盖。 */
export type AlertFrequency = ScriptAlertFrequency

/** 投递渠道。 */
export type AlertChannel = 'in-app' | 'sound'

/** 一条警报规则；脚本引用与行情绑定的变更通过 update 提交。 */
export interface Alert {
  readonly id: AlertId
  readonly name: string
  readonly script: {
    /** 被引用的警报脚本定义身份。 */
    readonly definitionId: string
    /** 用户设定的参数值；提交时与脚本当前默认值合并。 */
    readonly inputs: CalculationInputs
  }
  /** 品种 + 周期 + 复权；与图表实例无关。 */
  readonly symbol: SymbolSpec
  /** 两次触发的最小间隔；缺省不限。 */
  readonly cooldownMs?: number
  /** 绝对时间戳；从该时刻起拒绝触发。 */
  readonly expiresAt?: number
  /** 投递正文，支持 {{ticker}} {{interval}} {{close}} {{time}} {{message}}。 */
  readonly message: string
  readonly channels: readonly AlertChannel[]
  /** 用户是否已启用规则。 */
  readonly enabled: boolean
  /** 最近一次触发；冷却、once 终态与列表展示共用。 */
  readonly lastFiredAt?: number
  /** 最近一次触发的 K 线时间；切换行情绑定时清除。 */
  readonly lastFiredBarTime?: number
  /** 最近一次执行失败；成功触发或重新启用时清空。 */
  readonly lastError?: string
  readonly createdAt: number
}

/** create 入参：没有身份与运行态字段。 */
export interface AlertDraft {
  readonly name: string
  readonly script: Alert['script']
  readonly symbol: SymbolSpec
  readonly cooldownMs?: number
  readonly expiresAt?: number
  readonly message: string
  readonly channels: readonly AlertChannel[]
  readonly enabled?: boolean
}

/** 一次触发记录；只保留展示与审计所需字段。 */
export interface AlertFire {
  readonly id: string
  readonly alertId: AlertId
  /** 触发瞬间的墙钟时间。 */
  readonly firedAt: number
  readonly source: {
    readonly ticker: string
    readonly interval: string
  }
  /** 已渲染占位符的最终文案。 */
  readonly message: string
  /** 触发时价格。 */
  readonly price: number
  /** 触发所在 bar 的时间，用于图上定位。 */
  readonly barTime: number
}

/** 状态推导结果；不落盘。 */
export type AlertStatus = 'active' | 'triggered' | 'expired' | 'error' | 'paused'

export interface AlertService {
  readonly alerts: ReadonlySignal<readonly Alert[]>
  readonly fires: ReadonlySignal<readonly AlertFire[]>

  create(draft: AlertDraft): Alert
  update(id: AlertId, patch: Partial<AlertDraft>): Alert
  remove(id: AlertId): void
  get(id: AlertId): Alert | null
  list(query?: { symbol?: SymbolSpec; status?: AlertStatus }): readonly Alert[]
  setEnabled(id: AlertId, enabled: boolean): Alert
  clearHistory(alertId?: AlertId): void
  subscribeNotifications(channel: AlertChannel, listener: (fire: AlertFire) => void): () => void
  dispose(): Promise<void>
}

export interface AlertLimits {
  readonly maxAlerts: number
  readonly maxFires: number
  readonly maxFiresPerAlert: number
}
