/** 唯一的脚本编译入口；执行模块不得导入本文件。 */
import {
  analyzeScriptDependency,
  requiresFullReplay,
} from '../../quickjs/impl/analyzeDependency.js'
import { builtinLibraries } from '../../quickjs/impl/builtinLibraries.js'
import { compileScript } from '../../quickjs/impl/compileScript.js'
import type { QuickJSLibrary } from '../../quickjs/types.js'
import type { CompiledScriptSources } from '../types.js'

/** 编译脚本及外部依赖；内置库直接使用构建时生成的执行源码。 */
export function compileSources(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): CompiledScriptSources {
  const analysisLibraries: QuickJSLibrary[] = [
    ...builtinLibraries.map(({ name, source: librarySource }) => ({
      name,
      source: librarySource,
    })),
    ...libraries,
  ]
  return {
    source: compileScript(source, libraries),
    libraries: [
      ...builtinLibraries.map(({ name, source: librarySource }) => ({
        name,
        source: librarySource,
      })),
      ...libraries.map((library) => ({
        name: library.name,
        source: `(() => {\n${compileScript(library.source, libraries)}\n})();`,
      })),
    ],
    dependency: analyzeScriptDependency(source, analysisLibraries),
    replayOnUpdate: requiresFullReplay(source, analysisLibraries),
  }
}
