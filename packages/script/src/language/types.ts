/** 序列语法转换的文本与位置契约；所有偏移均使用 UTF-16。 */

import type { VirtualTypeScriptEnvironment } from '@typescript/vfs'
import type { QuickJSLibrary } from '../quickjs/types.js'

/** 在原始源码某一位置插入的编译文本。 */
export interface ScriptInsertion {
  readonly position: number
  readonly text: string
}

/** 源码引用在此处读取当前值，以及对应的虚拟取值位置。 */
export interface ScriptValueRead {
  readonly sourceStart: number
  readonly sourceEnd: number
  readonly generatedPosition: number
}

/** 保留原始源码布局的虚拟文档，供执行器与语言服务共同使用。 */
export interface ScriptConversion {
  readonly code: string
  readonly insertions: readonly ScriptInsertion[]
  readonly valueReads: readonly ScriptValueRead[]
  toGenerated(position: number): number
  toSource(position: number): number
}

/** 一个源码文档的增量语义会话，编译器和编辑器使用独立实例及同一更新流程。 */
export interface ScriptLanguageSession {
  readonly environment: VirtualTypeScriptEnvironment
  readonly source: string
  readonly conversion: ScriptConversion | undefined
  setLibraries(libraries: readonly QuickJSLibrary[]): void
  updateSource(source: string): ScriptConversion
}
