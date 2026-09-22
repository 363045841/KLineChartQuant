/** 工具参数未通过 schema 校验，与领域错误和程序异常明确区分。 */
export class ToolInputValidationError extends TypeError {
  /** 跨运行时边界保留的稳定分类，不依赖 instanceof。 */
  readonly code = 'TOOL_INPUT_INVALID' as const

  constructor(message: string) {
    super(message)
    this.name = 'ToolInputValidationError'
  }
}
