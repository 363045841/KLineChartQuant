/** 按稳定脚本身份保存有界日志；编辑器只订阅所编辑脚本。 */
import {
  type LogEvent,
  SCRIPT_OUTPUT_LIMIT,
  type ScriptOutputSource,
} from '@363045841yyt/klinechart-plot-contracts'

/** 创建服务级输出仓库，快照可直接传给独立窗口。 */
export function createScriptOutput() {
  const entries = new Map<string, readonly LogEvent[]>()
  const listeners = new Map<string, Set<(events: readonly LogEvent[]) => void>>()
  /** 发布完整快照，所有订阅者看到同一份输出。 */
  function publish(id: string, events: readonly LogEvent[]): void {
    entries.set(id, events)
    for (const listener of listeners.get(id) ?? []) listener(events)
  }
  const source: ScriptOutputSource = {
    subscribe(id, listener) {
      const group = listeners.get(id) ?? new Set()
      listeners.set(id, group)
      group.add(listener)
      listener(entries.get(id) ?? [])
      return () => {
        group.delete(listener)
        if (!group.size) listeners.delete(id)
      }
    },
    clear(id) {
      publish(id, [])
    },
  }
  return {
    source,
    append(id: string, events: readonly LogEvent[]) {
      publish(id, [...(entries.get(id) ?? []), ...events].slice(-SCRIPT_OUTPUT_LIMIT))
    },
    remove(id: string) {
      publish(id, [])
      entries.delete(id)
    },
    dispose() {
      entries.clear()
      listeners.clear()
    },
  }
}
