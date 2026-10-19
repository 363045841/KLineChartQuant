/**
 * 脚本编辑器语言服务的输入与查询契约。
 *
 * 这些类型与运行 TypeScript 语言服务的实现同属 AGPL 包，宿主（Apache 的图表包）
 * 只通过动态 import 使用，不把语言服务编译进自身发布物。
 */

import type { createWorker } from '@valtown/codemirror-ts/worker'
import type { TextChange } from 'typescript'

/** 文本半开区间，按 UTF-16 偏移定位。 */
export interface ScriptTextRange {
  readonly from: number
  readonly to: number
}

/** 无禁用的只读展示视图；用于 hover 与签名提示中的代码片段。 */
export interface ScriptCodeView {
  readonly dom: HTMLElement
  update(text: string, emphasis?: ScriptTextRange | null): void
  destroy(): void
}

/** 语言会话中的固定文件路径；Worker 据此装载脚本文档。 */
export { SCRIPT_SOURCE_FILE as SCRIPT_EDITOR_FILE } from '@363045841yyt/klinechart-script/language'

/** TypeScript 返回的签名文本、当前参数范围与展示形式。 */
export interface ScriptSignatureHelp {
  readonly text: string
  readonly activeParameter: ScriptTextRange | null
}

/** 签名提供者：只暴露异步查询，隐藏 Worker 实现。 */
export interface ScriptSignatureProvider {
  getSignatureHelp(path: string, position: number): Promise<ScriptSignatureHelp | null>
}

/** 编辑器对语言服务 Worker 的查询契约。 */
export interface ScriptLanguageWorker extends ReturnType<typeof createWorker> {
  formatDocument(path: string, source: string): TextChange[]
  getSignatureHelp(path: string, position: number): ScriptSignatureHelp | null
}
