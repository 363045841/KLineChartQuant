/**
 * 脚本参考端口：把随脚本包发布的参考内容适配成 Agent 工具读取面。
 *
 * 内容由生成器从同一份契约产出（`SCRIPT_API_REFERENCE`），这里只做索引，
 * 不复制文档、也不在运行期读文件。
 */
import type {
  ChartAgentScriptReference,
  ScriptReferenceEntry,
  ScriptReferenceTopic,
} from '@363045841yyt/klinechart-core/controllers'
import { SCRIPT_API_REFERENCE } from '@363045841yyt/klinechart-script'

/** 工具描述只需要展示元数据，正文单独建索引。 */
const entries: readonly ScriptReferenceEntry[] = SCRIPT_API_REFERENCE.map(
  ({ id, title, summary }) => ({ id, title, summary }),
)

const contents = new Map<ScriptReferenceTopic, string>(
  SCRIPT_API_REFERENCE.map((entry) => [entry.id, entry.content]),
)

/** 创建脚本参考查询面；主题缺失说明生成物与契约不一致，直接失败。 */
export function createScriptReference(): ChartAgentScriptReference {
  return {
    list: () => entries,
    read: (topic) => {
      const content = contents.get(topic)
      if (content === undefined)
        throw new Error(`[ScriptReference] missing generated topic '${topic}'`)
      return content
    },
  }
}
