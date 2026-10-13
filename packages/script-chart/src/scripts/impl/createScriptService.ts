/** 通过 core 定义仓库提交完整脚本文档，不维护影子源码仓库。 */
import {
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  registerPlotIndicator,
  removeScriptIndicatorDefinition,
  updatePlotIndicator,
} from '@363045841yyt/klinechart-core'
import {
  preloadQuickJS,
  type QuickJSLibrary,
  type QuickJSScriptDefinition,
  readQuickJSScriptDefinitionSync,
  runQuickJSScriptSync,
} from '@363045841yyt/klinechart-script'
import type { ScriptDocument, ScriptService } from '../types.js'

/** 实例只配置 VM 库，所有服务实例从 core 同一仓库读取已提交定义。 */
export async function createScriptService(
  libraries: readonly QuickJSLibrary[] = [],
): Promise<ScriptService> {
  await preloadQuickJS()

  /** 从已提交定义还原公开快照，读取无需重新执行用户脚本。 */
  function read(id: string): ScriptDocument | undefined {
    const metadata = getRegisteredIndicatorDefinition(id)
    const document = metadata?.document
    if (!metadata || !document || metadata.source !== 'script') return undefined
    // 定义在提交时已校验；公开元数据保存在同一不可变编译快照内。
    return documentsFromMetadata(metadata.name)
  }

  /** 文档读模型从 core 的编译产物读取，元数据不再执行 VM。 */
  function documentsFromMetadata(name: string): ScriptDocument | undefined {
    const metadata = getRegisteredIndicatorDefinition(name)
    const document = metadata?.document
    if (!metadata || !document || !document.definition) return undefined
    return Object.freeze({
      id: metadata.displayName,
      revision: document.revision,
      source: document.source,
      definition: document.definition,
    })
  }

  /** 校验和编译全部完成后，以单个定义快照提交，执行闭包绑定该版本源码。 */
  function publish(
    source: string,
    definition: QuickJSScriptDefinition,
    revision: number,
    update: boolean,
  ): ScriptDocument {
    const id = definition.displayName ?? definition.name
    const document = Object.freeze({ revision, source, definition })
    const commit = update ? updatePlotIndicator : registerPlotIndicator
    commit({
      ...definition,
      source: 'script',
      document,
      compute: (bars, params) => runQuickJSScriptSync({ source, bars, params, libraries }),
    })
    return Object.freeze({ id, ...document })
  }

  /** 乐观并发校验，过期编辑会话不能覆盖新提交。 */
  function requireRevision(id: string, expected: number): ScriptDocument {
    const current = read(id)
    if (!current) throw new Error(`脚本不存在：${id}`)
    if (current.revision !== expected) throw new Error(`脚本已更新，请重新打开：${id}`)
    return current
  }

  return Object.freeze({
    create(source: string) {
      return publish(source, readQuickJSScriptDefinitionSync(source, libraries), 1, false)
    },
    read,
    list() {
      return Object.freeze(
        getRegisteredIndicatorDefinitions().flatMap((metadata) => {
          const document = read(metadata.name)
          return document ? [document] : []
        }),
      )
    },
    update(id: string, source: string, expectedRevision: number) {
      const current = requireRevision(id, expectedRevision)
      const definition = readQuickJSScriptDefinitionSync(source, libraries)
      if (
        definition.name !== current.definition.name ||
        (definition.displayName ?? definition.name) !== current.id
      ) {
        throw new Error('已有脚本的 name 和 displayName 是固定身份，请创建新脚本')
      }
      return publish(source, definition, current.revision + 1, true)
    },
    remove(id: string, expectedRevision: number) {
      const current = requireRevision(id, expectedRevision)
      removeScriptIndicatorDefinition(current.definition.name)
    },
  })
}
