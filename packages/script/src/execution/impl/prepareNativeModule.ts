/** 可信脚本的原生执行后端：编译产物交给常驻会话，不加载 TypeScript，不提供沙箱保护。 */
import type { LogEvent } from '../../contracts/log.js'
import type { PreparedScript } from '../../quickjs/types.js'
import { createScriptExecutionSession } from '../session/impl/createScriptExecutionSession.js'
import { createNativeScriptRuntime } from '../session/impl/nativeRuntime.js'
import type { CompiledScriptSources } from '../types.js'
import { createPreparedScript } from './createPreparedScript.js'

/** 编译一次原生工厂；运行态由会话持有，跨 tick 增量执行。 */
export function prepareNativeModule(
  compiled: CompiledScriptSources,
  onLog?: (event: LogEvent) => void,
): PreparedScript {
  const session = createScriptExecutionSession({
    createRuntime: ({ expressionId, params, symbol }) =>
      createNativeScriptRuntime(compiled, { expressionId, onLog, params, symbol }),
    dependency: compiled.dependency,
    replayOnUpdate: compiled.replayOnUpdate,
    onLog,
  })
  return createPreparedScript(session, compiled.dependency)
}
