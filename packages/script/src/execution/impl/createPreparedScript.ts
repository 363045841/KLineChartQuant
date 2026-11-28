/**
 * 执行会话到 PreparedScript 的唯一封装。
 *
 * 原生与 QuickJS 后端只负责 runtime 装配；请求路由、运行参数与释放语义共用这一层。
 */
import type {
  Bar,
  ComputeChange,
} from '@363045841yyt/klinechart-plot-contracts'
import type {
  PreparedScript,
  ScriptParamValue,
} from '../../quickjs/types.js'
import { CURRENT_SYMBOL } from '../../request/impl/symbols.js'
import type { ScriptRequestContext } from '../../request/types.js'
import type { ScriptExecutionSession } from '../session/types.js'

/**
 * 把执行会话包装成稳定的脚本入口。
 *
 * @param session 已创建的执行会话
 * @returns 可重复运行与显式释放的脚本对象
 */
export function createPreparedScript(session: ScriptExecutionSession): PreparedScript {
  return Object.freeze({
    definition: Object.freeze({ ...session.definition }),
    requests(params: Readonly<Record<string, ScriptParamValue>> = {}, symbol = CURRENT_SYMBOL) {
      return session.requests(params, symbol)
    },
    run(input: {
      readonly bars: readonly Bar[]
      readonly change: ComputeChange
      readonly params?: Readonly<Record<string, ScriptParamValue>>
      readonly context?: ScriptRequestContext
      readonly live?: boolean
    }) {
      return session.run(input)
    },
    dispose() {
      session.dispose()
    },
  })
}
