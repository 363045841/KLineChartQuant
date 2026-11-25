/**
 * 会话级计算定义仓库：把全局定义注册表投影成计算入口。
 *
 * 定义替换时同步通知失效；解析不修改快照，避免在计算过程中触发失效。
 */
import type { CalculationDefinition } from '../../calculation/index.js'
import {
  getRegisteredIndicatorDefinition,
  indicatorCatalogRevision,
  readRegisteredDefinitions,
} from '../../indicators/pipeline/index.js'
import { toCalculationDefinition } from '../../indicators/instances/assembly/indicatorCalculatorCatalog.js'
import type { IndicatorMetadata } from '../../indicators/indicatorMetadata.js'

interface DefinitionEntry {
  readonly metadata: IndicatorMetadata
  readonly definition: CalculationDefinition
}

interface CalculationDefinitionRegistry {
  resolve(definitionId: string): CalculationDefinition | undefined
  subscribe(listener: (changed: readonly string[]) => void): () => void
  dispose(): void
}

/**
 * 创建定义仓库。
 *
 * @returns 定义解析、替换通知与释放
 */
export function createCalculationDefinitions(): CalculationDefinitionRegistry {
  let revision = -1
  let entries = new Map<string, DefinitionEntry>()
  /** 目录通知到达前解析到的定义；同一元数据复用同一对象，避免重复建会话。 */
  let derived = new Map<string, DefinitionEntry>()
  const listeners = new Set<(changed: readonly string[]) => void>()

  /** 按目录修订重建快照；返回身份发生变化的定义 ID。 */
  function refresh(): readonly string[] {
    const current = indicatorCatalogRevision.peek()
    if (current === revision) return []
    const next = new Map<string, DefinitionEntry>()
    for (const metadata of readRegisteredDefinitions()) {
      const existing = entries.get(metadata.name)
      if (existing?.metadata === metadata) {
        next.set(metadata.name, existing)
        continue
      }
      const definition = toCalculationDefinition(metadata)
      if (definition) next.set(metadata.name, { metadata, definition })
    }
    const changed = [...entries.keys()].filter(
      (id) => next.get(id)?.metadata !== entries.get(id)?.metadata,
    )
    entries = next
    revision = current
    derived.clear()
    return changed
  }

  const unsubscribe = indicatorCatalogRevision.subscribe(() => {
    const changed = refresh()
    if (changed.length === 0) return
    for (const listener of listeners) listener(changed)
  })
  refresh()

  return {
    resolve(definitionId) {
      const entry = entries.get(definitionId) ?? derived.get(definitionId)
      if (entry) return entry.definition
      // 注册通知尚未到达时，直接按当前定义生成一份；快照刷新后由 entries 接管。
      const metadata = getRegisteredIndicatorDefinition(definitionId)
      if (metadata === undefined) return undefined
      const definition = toCalculationDefinition(metadata)
      if (definition === undefined) return undefined
      derived.set(definitionId, { metadata, definition })
      return definition
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      unsubscribe()
      listeners.clear()
      entries.clear()
      derived.clear()
      revision = -1
    },
  }
}
