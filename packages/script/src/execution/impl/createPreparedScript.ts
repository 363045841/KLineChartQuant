/**
 * 执行会话到 PreparedScript 的唯一封装。
 *
 * 原生与 QuickJS 后端只负责 runtime 装配；请求路由、运行参数与释放语义共用这一层。
 */
import type { ComputeDependency, ComputeRange } from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../../contracts/input.js'
import type { PreparedScript, ScriptParamValue } from '../../quickjs/types.js'
import { CURRENT_SYMBOL } from '../../request/impl/symbols.js'
import type { ScriptRequestContext } from '../../request/types.js'
import type { ScriptExecutionSession } from '../session/types.js'

/**
 * 把执行会话包装成稳定的脚本入口。
 *
 * @param session 已创建的执行会话
 * @param dependency 编译期解析出的历史依赖
 * @returns 可重复运行与显式释放的脚本对象
 */
export function createPreparedScript(
  session: ScriptExecutionSession,
  dependency: ComputeDependency,
): PreparedScript {
  return Object.freeze({
    definition: Object.freeze({ ...session.definition, dependency }),
    requests(params: Readonly<Record<string, ScriptParamValue>> = {}, symbol = CURRENT_SYMBOL) {
      return session.requests(params, symbol)
    },
    run(
      bars: readonly Bar[],
      params: Readonly<Record<string, ScriptParamValue>> = {},
      context?: ScriptRequestContext,
      range?: ComputeRange,
      live?: boolean,
    ) {
      return session.run({ bars, params, context, range, ...(live === undefined ? {} : { live }) })
    },
    dispose() {
      session.dispose()
    },
  })
}
