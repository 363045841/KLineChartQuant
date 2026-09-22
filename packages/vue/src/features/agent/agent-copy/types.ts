// Agent 界面文案的契约层：语言标识与语言选项形状；文案数据与访问器位于 impl/。

/** 支持的语言标识。 */
export type AgentLocale = 'en' | 'zh-CN'

/** 设置弹窗「界面」分组中的单个语言选项。 */
export interface AgentLocaleOption {
  /** 语言标识。 */
  readonly value: AgentLocale
  /** 语言自称，不随界面语言变化。 */
  readonly label: string
}
