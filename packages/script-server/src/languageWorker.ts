/** Worker 中运行 TypeScript 语言服务，补全与诊断复用 CodeMirror 的现成适配。 */

import {
  createScriptLanguageSession,
  currentValueType,
  type ScriptConversion,
  type ScriptLanguageSession,
} from '@363045841yyt/klinechart-script/language'
import type { CompletionResult } from '@codemirror/autocomplete'
import { createWorker } from '@valtown/codemirror-ts/worker'
import ts from 'typescript'
import type { ScriptLanguageWorker, ScriptSignatureHelp } from './types.js'

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
  let session: ScriptLanguageSession
  const worker = createWorker(() => {
    session = createScriptLanguageSession()
    return session.environment
  })
  /** 查询位置统一映射到当前虚拟文档；文档装载前查询属于调用错误，直接失败。 */
  function mapping(): ScriptConversion {
    const { conversion } = session
    if (!conversion) throw new Error('语言会话尚未装载文档')
    return conversion
  }
  return {
    ...worker,
    /** 同步最新草稿后查询，当前文件的位置必须从虚拟文档映射回原文。 */
    getNavigation(path, source, position, kind) {
      session.updateSource(source)
      const service = worker.getEnv().languageService
      const pos = mapping().toGenerated(position)
      const definitions = kind === 'typeDefinition'
        ? service.getTypeDefinitionAtPosition(path, pos)
        : kind === 'implementation'
          ? service.getImplementationAtPosition(path, pos)
          : kind === 'declaration'
            ? declarationsAtPosition(service, path, pos)
            : service.getDefinitionAtPosition(path, pos)
      return (definitions ?? []).map((definition) => {
        const current = definition.fileName === path
        const start = definition.textSpan.start
        const end = start + definition.textSpan.length
        const target = worker.getEnv().getSourceFile(definition.fileName)
        if (!target) throw new Error(`无法读取声明文件：${definition.fileName}`)
        return {
          path: definition.fileName,
          source: current ? source : target.text,
          from: current ? mapping().toSource(start) : start,
          to: current ? mapping().toSource(end) : end,
          current,
        }
      })
    },
    /** 重命名仅修改可编辑的当前原文，拒绝涉及外部文件的部分改名。 */
    renameSymbol(path, source, position, name) {
      session.updateSource(source)
      const service = worker.getEnv().languageService
      const pos = mapping().toGenerated(position)
      const info = service.getRenameInfo(path, pos)
      if (!info.canRename) throw new Error(info.localizedErrorMessage)
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, name)
      if (scanner.scan() !== ts.SyntaxKind.Identifier || scanner.scan() !== ts.SyntaxKind.EndOfFileToken) throw new Error('请输入有效的标识符')
      const locations = service.findRenameLocations(path, pos, false, false, true)
      if (!locations?.length) throw new Error('没有可重命名的位置')
      if (locations.some((location) => location.fileName !== path)) {
        throw new Error('该符号涉及只读声明文件，无法重命名')
      }
      const edits = locations.map((location) => {
        const start = mapping().toSource(location.textSpan.start)
        const end = mapping().toSource(location.textSpan.start + location.textSpan.length)
        return {
          span: { start, length: end - start },
          newText: `${location.prefixText ?? ''}${name}${location.suffixText ?? ''}`,
        }
      })
      // 多个生成位置可能映射到同一原文，去重后按源码顺序应用。
      return edits.filter((edit, index) => edits.findIndex((other) =>
        other.span.start === edit.span.start && other.span.length === edit.span.length) === index)
        .sort((a, b) => a.span.start - b.span.start)
    },
    /** 格式化原始脚本，查询后恢复语义文档，避免把序列转换代码写入草稿。 */
    formatDocument(path, source) {
      const env = worker.getEnv()
      const previous = env.getSourceFile(path)?.text
      if (previous === undefined) throw new Error('语言会话尚未装载文档')
      env.updateFile(path, source)
      try {
        return env.languageService.getFormattingEditsForDocument(path, {
          indentSize: 2,
          tabSize: 2,
          convertTabsToSpaces: true,
          newLineCharacter: '\n',
          insertSpaceAfterCommaDelimiter: true,
          insertSpaceAfterSemicolonInForStatements: true,
          insertSpaceBeforeAndAfterBinaryOperators: true,
          insertSpaceAfterKeywordsInControlFlowStatements: true,
          insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
          semicolons: ts.SemicolonPreference.Remove,
        })
      } finally {
        env.updateFile(path, previous)
      }
    },
    /** 文档更新完全交给共享语义会话，Worker 仅适配编辑器协议。 */
    updateFile(input: { path: string; code: string }) {
      session.updateSource(input.code)
    },
    /** 类型检查虚拟文档，错误范围仍指向原文，保留全部真实诊断。 */
    getLints(input) {
      return worker.getLints(input).map((diagnostic) => ({
        ...diagnostic,
        from: mapping().toSource(diagnostic.from),
        to: mapping().toSource(diagnostic.to),
      }))
    },
    /** 悬浮提示使用转换后的推导类型，显示范围和本文件定义位置映射回原文。 */
    getHover(input) {
      const hover = worker.getHover({
        ...input,
        pos: mapping().toGenerated(input.pos),
      })
      if (!hover) return hover
      const program = worker.getEnv().languageService.getProgram()
      if (!program) throw new Error('语言服务尚未创建脚本类型程序')
      const start = mapping().toSource(hover.start)
      const end = mapping().toSource(hover.end)
      const valueType = currentValueType(program, input.path, start, end, mapping())
      return {
        ...hover,
        start,
        end,
        quickInfo: hover.quickInfo
          ? {
              ...hover.quickInfo,
              displayParts: valueType
                ? [
                    { text: session.source.slice(start, end), kind: 'text' },
                    { text: ': ', kind: 'punctuation' },
                    { text: valueType, kind: 'keyword' },
                  ]
                : hover.quickInfo.displayParts,
              textSpan: { start, length: end - start },
            }
          : undefined,
        typeDef: hover.typeDef?.map((definition) => {
          if (definition.fileName !== input.path) return definition
          const start = mapping().toSource(definition.textSpan.start)
          return {
            ...definition,
            textSpan: {
              start,
              length:
                mapping().toSource(definition.textSpan.start + definition.textSpan.length) - start,
            },
          }
        }),
      }
    },
    /** 传递语言服务的完整候选，避免现成适配的旧白名单过滤脚本全局和 JS 关键字。 */
    async getAutocompletion({
      path,
      context,
    }: Parameters<ScriptLanguageWorker['getAutocompletion']>[0]): Promise<CompletionResult | null> {
      const env = worker.getEnv()
      const text = session.source
      const position = mapping().toGenerated(context.pos)
      const word = text.slice(0, context.pos).match(/[\w$]*$/)?.[0] ?? ''
      if (!context.explicit && !word && text[context.pos - 1] !== '.') return null
      const result = env.languageService.getCompletionsAtPosition(path, position, {
        includeCompletionsForModuleExports: false,
        includeCompletionsWithInsertText: true,
      })
      if (!result) return null
      return {
        from: result.optionalReplacementSpan
          ? mapping().toSource(result.optionalReplacementSpan.start)
          : context.pos - word.length,
        options: result.entries.map((entry) => {
          // 成员和函数才查询注释，避免为关键字、普通变量逐项解析详情。
          const details =
            result.isMemberCompletion ||
            entry.kind === ts.ScriptElementKind.functionElement ||
            entry.kind === ts.ScriptElementKind.localFunctionElement
              ? env.languageService.getCompletionEntryDetails(
                  path,
                  position,
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
      const help = worker
        .getEnv()
        .languageService.getSignatureHelpItems(path, mapping().toGenerated(position), undefined)
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

/** 声明查询停在当前符号（包括别名）的声明，定义查询则由 TS 继续解析别名。 */
function declarationsAtPosition(service: ts.LanguageService, path: string, position: number) {
  const program = service.getProgram()
  const file = program?.getSourceFile(path)
  if (!program || !file) return []
  /** 找到光标所在的最内层语法节点。 */
  function nodeAt(node: ts.Node): ts.Node {
    return ts.forEachChild(node, (child) => child.getStart(file) <= position && position < child.end ? nodeAt(child) : undefined) ?? node
  }
  const symbol = program.getTypeChecker().getSymbolAtLocation(nodeAt(file))
  return (symbol?.declarations ?? []).map((declaration) => {
    const node = ts.getNameOfDeclaration(declaration) ?? declaration
    return { fileName: node.getSourceFile().fileName, textSpan: { start: node.getStart(), length: node.getWidth() } }
  })
}
