/** 指标实例角色运行时取值；状态、布局、控制器与适配器共用同一份定义。 */
export const INDICATOR_ROLE = {
  MAIN: 'main',
  SUB: 'sub',
} as const

/** 指标实例所在的图表区域；由所属 pane 派生，不单独表达业务能力。 */
export type IndicatorInstanceRole = (typeof INDICATOR_ROLE)[keyof typeof INDICATOR_ROLE]
