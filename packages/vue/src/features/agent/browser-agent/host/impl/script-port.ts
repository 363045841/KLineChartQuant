/**
 * 脚本能力适配：静态参考 + 页面级脚本服务。
 *
 * 参考内容来自生成物，用户脚本文档来自 ScriptService；这里只做契约投影与
 * 领域错误到工具错误的翻译，不复制编译、持久化或目录逻辑。
 */
import { ToolInputValidationError } from '@363045841yyt/klinechart-core/agent-tools'
import type {
  ChartAgentScriptDocument,
  ChartAgentScriptFolder,
  ChartAgentScriptRef,
  ChartAgentScripts,
  ScriptReferenceEntry,
  ScriptReferenceTopic,
} from '@363045841yyt/klinechart-core/controllers'
import { SCRIPT_API_REFERENCE } from '@363045841yyt/klinechart-script'
import type { ScriptDocument, ScriptService } from '@363045841yyt/klinechart-script-chart'

/** 适配层只依赖实际使用的方法，测试不需要伪造整个脚本服务。 */
export type ScriptsServicePort = Pick<
  ScriptService,
  'list' | 'listFolders' | 'read' | 'createIndicator' | 'update' | 'remove'
>

/** 工具描述只需要展示元数据，正文单独建索引。 */
const referenceEntries: readonly ScriptReferenceEntry[] = SCRIPT_API_REFERENCE.map(
  ({ id, title, summary }) => ({ id, title, summary }),
)

const referenceContents = new Map<ScriptReferenceTopic, string>(
  SCRIPT_API_REFERENCE.map((entry) => [entry.id, entry.content]),
)

/** 领域异常统一翻译成模型可纠正的输入错误，保留原始文案。 */
function asToolError(error: unknown): ToolInputValidationError {
  if (error instanceof ToolInputValidationError) return error
  return new ToolInputValidationError(
    error instanceof Error ? error.message : 'The script operation failed.',
  )
}

/** 文档身份投影；库脚本没有 Agent 可寻址的名称，直接拒绝。 */
function toRef(document: ScriptDocument): ChartAgentScriptRef {
  if (document.kind !== 'indicator')
    throw new ToolInputValidationError(
      'The selected script is a library; script tools only edit indicator scripts.',
    )
  return { id: document.id, name: document.definition.name }
}

/** 只允许用户指标脚本进入读写面；内置与库脚本在领域层就拒绝。 */
function requireUserIndicator(
  document: ScriptDocument | undefined,
  scriptId: string,
): ScriptDocument {
  if (document === undefined)
    throw new ToolInputValidationError(
      `Unknown script '${scriptId}'. Call scripts_read to list the ids.`,
    )
  if (document.identity !== 'user')
    throw new ToolInputValidationError(`Script '${scriptId}' is built in and cannot be changed.`)
  if (document.kind !== 'indicator')
    throw new ToolInputValidationError(
      `Script '${scriptId}' is a library; script tools only edit indicator scripts.`,
    )
  return document
}

/**
 * 创建脚本端口。
 * @param loadService 页面级服务加载器；首次工具调用才触发脚本包初始化。
 * @returns Agent 可读写的脚本能力面。
 */
export function createScriptsPort(
  loadService: () => Promise<ScriptsServicePort>,
): ChartAgentScripts {
  return {
    listReferenceTopics: () => referenceEntries,
    readReference(topic) {
      const content = referenceContents.get(topic)
      if (content === undefined) throw new Error(`[ScriptsPort] missing generated topic '${topic}'`)
      return content
    },
    async list() {
      const service = await loadService()
      return service
        .list()
        .filter((document) => document.identity === 'user' && document.kind === 'indicator')
        .map(toRef)
    },
    async listFolders(): Promise<ReadonlyArray<ChartAgentScriptFolder>> {
      const service = await loadService()
      return service
        .listFolders()
        .filter((folder) => folder.kind === 'indicator')
        .map((folder) => ({ path: folder.path }))
    },
    async read(scriptId): Promise<ChartAgentScriptDocument> {
      const service = await loadService()
      const document = requireUserIndicator(service.read(scriptId), scriptId)
      return { id: document.id, name: document.definition.name, source: document.source }
    },
    async create(input) {
      const service = await loadService()
      try {
        return toRef(await service.createIndicator(input.source, input.folder ?? ''))
      } catch (error) {
        throw asToolError(error)
      }
    },
    async update(scriptId, source) {
      const service = await loadService()
      try {
        const current = requireUserIndicator(service.read(scriptId), scriptId)
        return toRef(await service.update(scriptId, source, current.revision))
      } catch (error) {
        throw asToolError(error)
      }
    },
    async remove(scriptId) {
      const service = await loadService()
      try {
        const current = requireUserIndicator(service.read(scriptId), scriptId)
        await service.remove(scriptId, current.revision)
        return toRef(current)
      } catch (error) {
        throw asToolError(error)
      }
    },
  }
}
