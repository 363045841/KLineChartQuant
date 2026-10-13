/** Worker 中运行 TypeScript 语言服务，补全与诊断复用 CodeMirror 的现成适配。 */
import type { CompletionResult } from '@codemirror/autocomplete'
import { createWorker } from '@valtown/codemirror-ts/worker'
import ts from 'typescript'
import type { ScriptLanguageWorker } from '../types.js'
import { createScriptTypeEnvironment, updateScriptParameters } from './typeEnvironment.js'

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
        options: result.entries.map((entry) => ({
          label: entry.name,
          type: entry.kind,
          apply: entry.insertText ?? entry.name,
          boost: -Number(entry.sortText) || 0,
        })),
      }
    },
    /** 返回调用点的参数签名，由 TypeScript 判断当前调用和活动参数。 */
    getSignatureHelp(path: string, position: number): string | null {
      const help = worker.getEnv().languageService.getSignatureHelpItems(path, position, undefined)
      if (!help) return null
      const item = help.items[help.selectedItemIndex]
      if (!item) return null
      return (
        ts.displayPartsToString(item.prefixDisplayParts) +
        item.parameters
          .map((parameter) => ts.displayPartsToString(parameter.displayParts))
          .join(ts.displayPartsToString(item.separatorDisplayParts)) +
        ts.displayPartsToString(item.suffixDisplayParts)
      )
    },
  }
}
