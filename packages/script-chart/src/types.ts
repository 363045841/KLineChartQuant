/** 脚本指标注册到图表时的配置；用于覆盖脚本自身的声明。 */
export interface ScriptIndicatorOptions {
  /** 覆盖脚本声明的放置位置。 */
  pane?: 'main' | 'sub'
  /** 覆盖脚本声明的显示名称。 */
  displayName?: string
}
