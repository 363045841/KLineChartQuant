// Agent 界面文案的契约层：语言标识、语言选项与失败提示的可见原因；文案数据与访问器位于 impl/。
import type { RunFailureReason } from '@earendil-works/pi-durable'

/** 支持的语言标识。 */
export type AgentLocale = 'en' | 'zh-CN'

/** 设置弹窗「界面」分组中的单个语言选项。 */
export interface AgentLocaleOption {
  /** 语言标识。 */
  readonly value: AgentLocale
  /** 语言自称，不随界面语言变化。 */
  readonly label: string
}

/**
 * 时间线需要解释的运行失败：用户主动中止与官方自动续跑的 reset 不打扰用户，
 * 其余原因都必须有文案。
 */
export type VisibleRunFailureReason = Exclude<RunFailureReason, 'aborted' | 'reset'>
