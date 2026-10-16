/** 指标选择器的用户脚本删除操作，复用宿主源码仓库的版本与持久化契约。 */
import { shallowRef } from 'vue'
import type { ScriptSourceStore } from './chart/scriptEditor/types.js'

/** 提供用户身份判断、删除状态和可见错误，不维护额外的脚本目录。 */
export function useScriptRemoval(store: ScriptSourceStore | undefined) {
  const removing = shallowRef<string | null>(null)
  const removalError = shallowRef<string | null>(null)

  /** 只有宿主仓库中明确属于用户的脚本才提供删除入口。 */
  function canRemove(id: string): boolean {
    return store?.read(id)?.identity === 'user'
  }

  /** 按读取时的版本删除，失败时保留条目并向界面报告。 */
  async function removeScript(id: string): Promise<void> {
    if (!store || removing.value) return
    const document = store.read(id)
    if (document?.identity !== 'user') return
    removing.value = id
    removalError.value = null
    try {
      await store.remove(document.id, document.revision)
    } catch (error) {
      removalError.value = error instanceof Error ? error.message : String(error)
    } finally {
      removing.value = null
    }
  }

  return { removing, removalError, canRemove, removeScript }
}
