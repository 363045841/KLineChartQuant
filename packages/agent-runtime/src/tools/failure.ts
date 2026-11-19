// 工具失败结果的统一信封：图表工具与网络搜索工具共用同一种机器可读结构。
import type { AgentErrorView } from '../contracts/ui.js'
import type { RuntimeToolResult } from '../pi/types.js'

/**
 * 把工具失败投影成标准结果。
 *
 * 正文、摘要与 UI 字段必须来自同一份错误视图，否则模型读到的错误与用户看到会漂移。
 *
 * @param failure 业务工具产生的可修正错误。
 * @returns 带 `success: false` 信封的运行时工具结果。
 */
export function toolFailureResult(failure: AgentErrorView): RuntimeToolResult {
  return {
    content: JSON.stringify({ success: false, error: failure, stateChanged: false }),
    summary: failure.message,
    failure,
  }
}
