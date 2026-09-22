// 设置弹窗「界面」分组中的语言选项，供语言下拉直接消费。

import type { AgentLocaleOption } from '../types.js'

/** 语言选项；名称使用各语言的自称，不随界面语言变化。 */
export const AGENT_LOCALE_OPTIONS: ReadonlyArray<AgentLocaleOption> = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
]
