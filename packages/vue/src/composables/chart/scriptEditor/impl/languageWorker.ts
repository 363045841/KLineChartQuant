/** Worker 中运行 TypeScript 语言服务，补全与诊断复用 CodeMirror 的现成适配。 */
import type { CompletionResult } from '@codemirror/autocomplete'
import { createWorker } from '@valtown/codemirror-ts/worker'
import ts from 'typescript'
import type { ScriptLanguageWorker, ScriptSignatureHelp } from '../types.js'
import { createScriptTypeEnvironment, updateScriptParameters } from './typeEnvironment.js'

/** TypeScript 与 CodeMirror 使用不同的类型名称，在语言边界统一转换。 */
const COMPLETION_TYPES: Record<ts.ScriptElementKind, string> = {
  '': 'text',
  warning: 'text',
  keyword: 'keyword',
  script: 'namespace',
  module: 'namespace',
  class: 'class',
  'local class': 'class',
  interface: 'interface',
  type: 'type',
  enum: 'enum',
  'enum member': 'constant',
  var: 'variable',
  'local var': 'variable',
  using: 'variable',
  'await using': 'variable',
  function: 'function',
  'local function': 'function',
  method: 'method',
  getter: 'property',
  setter: 'property',
  property: 'property',
  accessor: 'property',
  constructor: 'function',
  call: 'function',
  index: 'property',
  construct: 'function',
  parameter: 'variable',
  'type parameter': 'type',
  'primitive type': 'type',
  label: 'text',
  alias: 'variable',
  const: 'constant',
  let: 'variable',
  directory: 'namespace',
  'external module name': 'namespace',
  'JSX attribute': 'property',
  string: 'text',
  link: 'text',
  'link name': 'text',
  'link text': 'text',
}

/** 创建语言服务端；用于真实 Worker 和不依赖 DOM 的契约测试。 */
export function createScriptLanguageWorker(): ScriptLanguageWorker {
  // 通过初始化 RPC 创建环境，加载错误可返回编辑器，不在 Worker 顶层静默失败。
  const worker = createWorker(createScriptTypeEnvironment)
  return {
    ...worker,
    /** 更新文档后从同一个类型程序派生参数，不维护额外的输入目录。 */
    updateFile(input: { path: string; code: string }) {
      // typescript-vfs 将空文本视为缺失快照；空文档用等价空白保留虚拟文件身份。
      worker.updateFile({ ...input, code: input.code || '\n' })
      updateScriptParameters(worker.getEnv())
    },
    /** 传递语言服务的完整候选，避免现成适配的旧白名单过滤脚本全局和 JS 关键字。 */
    async getAutocompletion({
      path,
      context,
    }: Parameters<ScriptLanguageWorker['getAutocompletion']>[0]): Promise<CompletionResult | null> {
      const env = worker.getEnv()
      const text = env.getSourceFile(path)?.getFullText() ?? ''
      const word = text.slice(0, context.pos).match(/[\w$]*$/)?.[0] ?? ''
      if (!context.explicit && !word && text[context.pos - 1] !== '.') return null
      const result = env.languageService.getCompletionsAtPosition(path, context.pos, {
        includeCompletionsForModuleExports: false,
        includeCompletionsWithInsertText: true,
      })
      if (!result) return null
      return {
        from: result.optionalReplacementSpan?.start ?? context.pos - word.length,
        options: result.entries.map((entry) => {
          // 成员和函数才查询注释，避免为关键字、普通变量逐项解析详情。
          const details =
            result.isMemberCompletion ||
            entry.kind === ts.ScriptElementKind.functionElement ||
            entry.kind === ts.ScriptElementKind.localFunctionElement
              ? env.languageService.getCompletionEntryDetails(
                  path,
                  context.pos,
                  entry.name,
                  undefined,
                  entry.source,
                  undefined,
                  entry.data,
                )
              : undefined
          const summary = details?.tags?.find((tag) => tag.name === 'summary')
          return {
            label: entry.name,
            detail: ts.displayPartsToString(summary?.text).trim() || undefined,
            type: COMPLETION_TYPES[entry.kind],
            apply: entry.insertText ?? entry.name,
            boost: -Number(entry.sortText) || 0,
          }
        }),
      }
    },
    /** 返回调用点的参数签名，由 TypeScript 判断当前调用和活动参数。 */
    getSignatureHelp(path: string, position: number): ScriptSignatureHelp | null {
      const help = worker.getEnv().languageService.getSignatureHelpItems(path, position, undefined)
      if (!help) return null
      const item = help.items[help.selectedItemIndex]
      if (!item) return null
      let text = ts.displayPartsToString(item.prefixDisplayParts)
      const separator = ts.displayPartsToString(item.separatorDisplayParts)
      // 剩余参数接受后续所有实参，其高亮始终落在最后一个声明参数上。
      const activeIndex = item.isVariadic
        ? Math.min(help.argumentIndex, item.parameters.length - 1)
        : help.argumentIndex
      let activeParameter: ScriptSignatureHelp['activeParameter'] = null
      item.parameters.forEach((parameter, index) => {
        if (index > 0) text += separator
        const from = text.length
        text += ts.displayPartsToString(parameter.displayParts)
        if (index === activeIndex) activeParameter = { from, to: text.length }
      })
      text += ts.displayPartsToString(item.suffixDisplayParts)
      return { text, activeParameter }
    },
  }
}
