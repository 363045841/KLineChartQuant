/** 库初始化验证：编译一次消费该库的指标，失败即拒绝保存或恢复。 */
import type { ScriptDocument } from '../types.js'
import type { ScriptExecutor } from './scriptExecutor.js'

/**
 * 验证库能被正常加载。
 *
 * @param executor 执行器，负责准备与释放编译句柄
 * @param name 库名
 * @param documents 参与解析的文档快照；缺省用当前仓库
 */
export async function validateLibrary(
  executor: ScriptExecutor,
  name: string,
  documents?: readonly ScriptDocument[],
): Promise<void> {
  const prepared = await executor.prepare(
    `importLibrary(${JSON.stringify(name)});\ndefineIndicator({ name: '__library_validation', position: Position.Sub, onBar() {} })`,
    false,
    documents,
  )
  await executor.releaseHandle(prepared.handle)
}
