/**
 * 警报公共契约。
 *
 * 警报只是计算结果的消费者：条件由脚本定义，服务负责频率、冷却、过期、
 * 日志与投递；视图与 UI 不参与判断。
 */
import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { SymbolSpec } from '../../controllers/types.js'
import type { CalculationInputs } from '../../engine/calculation/index.js'

export type AlertId = string

/** 触发频率；服务执行，脚本的 freq 只作缺省。 */
export type AlertFrequency = 'once' | 'per-bar' | 'per-bar-close' | 'all'

/** 投递渠道；首版只有应用内与声音。 */
export type AlertChannel = 'in-app' | 'sound'

/** 一条警报规则；创建后条件与绑定不可变，修改走 update。 */
export interface Alert {
  readonly id: AlertId
  readonly name: string
  readonly condition: {
    readonly definitionId: string
    /** 创建时快照；之后改脚本参数不影响本警报。 */
    readonly inputs: CalculationInputs
  }
  /** 品种 + 周期 + 复权；与图表实例无关。 */
  readonly symbol: SymbolSpec
  readonly frequency: AlertFrequency
  /** 两次触发的最小间隔；缺省不限。 */
  readonly cooldownMs?: number
  /** 绝对时间戳；到期后不再求值。 */
  readonly expiresAt?: number
  /** 投递正文，支持 {{ticker}} {{interval}} {{close}} {{time}}。 */
  readonly message: string
  readonly channels: readonly AlertChannel[]
  /** 用户意图：是否参与求值；唯一需要持久化的开关。 */
  readonly enabled: boolean
  /** 最近一次触发；冷却、once 终态与列表展示共用。 */
  readonly lastFiredAt?: number
  /** 最近一次执行失败；成功触发或重新启用时清空。 */
  readonly lastError?: string
  readonly createdAt: number
}

/** create 入参：没有身份与运行态字段。 */
export interface AlertDraft {
  readonly name: string
  readonly condition: Alert['condition']
  readonly symbol: SymbolSpec
  readonly frequency: AlertFrequency
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
    readonly scriptTitle?: string
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

/** 消费者收到的变更；UI 与图上呈现都从这里更新。 */
export type AlertChange =
  | { readonly kind: 'created' | 'updated'; readonly alert: Alert }
  | { readonly kind: 'removed'; readonly alertId: AlertId }
  | { readonly kind: 'fired'; readonly alert: Alert; readonly fire: AlertFire }

export interface AlertHistoryQuery {
  readonly alertId?: AlertId
  readonly limit?: number
}

export interface AlertService {
  readonly alerts: ReadonlySignal<readonly Alert[]>
  readonly fires: ReadonlySignal<readonly AlertFire[]>

  create(draft: AlertDraft): Alert
  update(id: AlertId, patch: Partial<AlertDraft>): Alert
  remove(id: AlertId): void
  get(id: AlertId): Alert | null
  list(query?: { symbol?: SymbolSpec; status?: AlertStatus }): readonly Alert[]
  setEnabled(id: AlertId, enabled: boolean): Alert
  history(query?: AlertHistoryQuery): readonly AlertFire[]
  clearHistory(alertId?: AlertId): void
  subscribe(listener: (change: AlertChange) => void): () => void
  dispose(): void
}

export interface AlertLimits {
  readonly maxAlerts: number
  readonly maxFires: number
  readonly maxFiresPerAlert: number
}

/** 投递端口；UI、声音与未来的系统通知都从这里接入。 */
export interface AlertNotifier {
  notify(change: Extract<AlertChange, { kind: 'fired' }>): void
}
